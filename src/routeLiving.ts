export interface RouteStop { id: string; name: string; coordinate: [number, number]; platformCode: string }
export interface RouteCall { id: string; sequence: number; arrival: string; departure: string; pickup: number; dropoff: number; headsign: string; sourceArrival?: string; sourceDeparture?: string }
export interface RouteTrip { id: string; serviceId: string; direction: number; start: string; operation: string; stops: RouteCall[]; officialExcludedDates: string[] }
export interface RouteGroup { name: string; outboundId: string; returnId: string; number: number }
export interface RouteStudy {
  id: string; title: string; checkedAt: string; sampleDate: string;
  feedStart: string; feedEnd: string; feedVersion: string; reviewDue: string;
  publisher: string; operator: string; adultFare: number; sourceUrl: string; officialUrl: string; pdfUrl: string; routeMapUrl: string; sourceSha256: string;
  groups: RouteGroup[]; stops: RouteStop[]; trips: RouteTrip[]; shape: [number, number][];
  calendar: ({ service_id: string; start_date: string; end_date: string } & Record<string, string>)[];
  exceptions: { service_id: string; date: string; exception_type: string }[];
  mismatches: string[]; limits: string[];
}

export function serviceDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value.replaceAll('-', '') : null;
}

export function validStudyDate(study: RouteStudy, value: string): boolean {
  const date = serviceDate(value);
  return date !== null && date >= study.feedStart && date <= study.feedEnd;
}

export function activeTrips(study: RouteStudy, value: string): RouteTrip[] {
  const date = serviceDate(value);
  if (!date || !validStudyDate(study, value)) return [];
  const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(`${value}T00:00:00Z`).getUTCDay()];
  const active = new Set(study.calendar.filter(c => c.start_date <= date && c.end_date >= date && c[weekday] === '1').map(c => c.service_id));
  // Exceptions can both create a service absent from calendar.txt and remove a regular service.
  for (const e of study.exceptions.filter(e => e.date === date)) {
    if (e.exception_type === '1') active.add(e.service_id);
    if (e.exception_type === '2') active.delete(e.service_id);
  }
  return study.trips.filter(t => active.has(t.serviceId) && !t.officialExcludedDates.includes(date));
}

/** GTFS hours may exceed 24. Preserve them rather than wrapping to another weekday. */
export function timeMinutes(value: string): number {
  if (!/^\d{2,}:[0-5]\d(?::[0-5]\d)?$/.test(value)) return NaN;
  const [h, m, s = 0] = value.split(':').map(Number);
  return h * 60 + m + s / 60;
}
export function clockText(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.floor(minutes % 60)).padStart(2, '0')}`;
}

export interface ShoppingConditions {
  earliest: number; walkingEachWay: number; shopping: number; boardingBuffer: number; returnBy: number; homeWalk: number;
}
export interface ShoppingPlan {
  outward: RouteTrip; inward: RouteTrip; board: RouteCall; arrive: RouteCall; returnBoard: RouteCall; returnArrive: RouteCall;
  shoppingStart: number; shoppingEnd: number; backAtStop: number; boardingWait: number; extraMargin: number; homeArrival: number;
}
/** A timetable feasibility check with explicit user allowances; never a verified walking route. */
export function shoppingPlans(study: RouteStudy, date: string, group: RouteGroup, c: ShoppingConditions): ShoppingPlan[] {
  if (!Object.values(c).every(Number.isFinite) || Object.values(c).some(n => n < 0) || c.shopping <= 0 || c.returnBy > 24 * 60) return [];
  const candidates: ShoppingPlan[] = [];
  const trips = activeTrips(study, date);
  for (const outward of trips.filter(t => t.direction === 0)) {
    const board = outward.stops.find(s => s.id === group.outboundId && s.pickup === 0);
    const arrive = outward.stops.find(s => s.id === '10_01' && s.dropoff === 0 && board && s.sequence > board.sequence);
    if (!board || !arrive || timeMinutes(board.departure) < c.earliest) continue;
    const shoppingStart = Math.max(timeMinutes(arrive.arrival) + c.walkingEachWay, 7 * 60);
    const shoppingEnd = shoppingStart + c.shopping;
    if (shoppingEnd > 24 * 60) continue;
    const backAtStop = shoppingEnd + c.walkingEachWay;
    for (const inward of trips.filter(t => t.direction === 1)) {
      const returnBoard = inward.stops.find(s => s.id === '10_01' && s.pickup === 0);
      const returnArrive = inward.stops.find(s => s.id === group.returnId && s.dropoff === 0 && returnBoard && s.sequence > returnBoard.sequence);
      if (!returnBoard || !returnArrive) continue;
      const boardingWait = timeMinutes(returnBoard.departure) - backAtStop;
      const homeArrival = timeMinutes(returnArrive.arrival) + c.homeWalk;
      if (boardingWait < c.boardingBuffer || homeArrival > c.returnBy) continue;
      candidates.push({outward,inward,board,arrive,returnBoard,returnArrive,shoppingStart,shoppingEnd,backAtStop,boardingWait,extraMargin:boardingWait-c.boardingBuffer,homeArrival});
    }
  }
  return candidates.sort((a,b) => timeMinutes(a.board.departure)-timeMinutes(b.board.departure) || a.homeArrival-b.homeArrival);
}

export function studyFreshness(study: RouteStudy, today: string): 'current' | 'review-due' | 'expired' {
  const date = serviceDate(today);
  if (!date || date > study.feedEnd || date < study.feedStart) return 'expired';
  return today > study.reviewDue ? 'review-due' : 'current';
}
