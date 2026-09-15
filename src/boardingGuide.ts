import type { BusFeature } from './types';

export interface BoardingGuide {
  stop_name?: string;
  group_id: string;
  number: string | null;
  role: 'boarding' | 'alighting';
  summary: string;
  directions: { route: string; text: string; next_stops: string[] }[];
  source_url: string;
  guide_url: string;
  guide_label?: string;
  data_notice?: string;
  source_origin_label?: string;
  cross_source_reference?: string;
  evidence: 'stop-sequence' | 'official-diagram-and-osm' | 'official-platform-coordinate' | 'official-diagram-derived';
  review?: { method: string; search_radius_m: number; questions: string[]; precision_notice: string };
  source_coordinates: number[];
  location_description?: string;
  previous_candidate_ids?: string[];
  assignment_hold?: { number: string; reason: string };
  roadside_review?: { status: 'hold' | 'confirmed'; direction_status: 'source-sequence-checked'; reason: string; walking_notice: string };
}
export interface BoardingStudy {
  version: number;
  guides: Record<string, BoardingGuide>;
  hub_points: BusFeature[];
}

/** Relate metadata by original ID and exact source coordinate; never spatially join. */
export function attachBoardingGuides(stops: BusFeature[], data: BoardingStudy): BusFeature[] {
  if (data.version !== 1 || !data.guides || !Array.isArray(data.hub_points)) throw Error('Invalid boarding study');
  const all = [...stops, ...data.hub_points];
  if (new Set(all.map(s => String(s.id))).size !== all.length) throw Error('Duplicate boarding source ID');
  const found = new Set<string>();
  const result = all.map(stop => {
    const id = String(stop.id);
    const guide = data.guides[id];
    if (!guide) return stop;
    if (guide.assignment_hold && (guide.number !== null || !guide.assignment_hold.reason || !guide.assignment_hold.number)) throw Error('Invalid held boarding assignment');
    if (!guide.summary || !guide.group_id || !['boarding', 'alighting'].includes(guide.role) ||
      (guide.number !== null && !/^(?:\d+[A-Z]?|南[A-Z]|[ABC])$/.test(guide.number)) ||
      !Array.isArray(guide.directions) || guide.source_coordinates.length !== 2 ||
      !guide.source_coordinates.every((value, i) => Number.isFinite(value) && value === stop.geometry.coordinates[i])) throw Error('Boarding source mismatch');
    found.add(id);
    return { ...stop, properties: { ...stop.properties, boarding_guide: guide } };
  });
  if (Object.keys(data.guides).some(id => !found.has(id))) throw Error('Missing boarding source');
  const aliases = new Set<string>();
  for (const guide of Object.values(data.guides)) for (const id of guide.previous_candidate_ids ?? []) {
    if (!/^review:(ube-chuo|ube-shinkawa|tokuyama)-\d+$/.test(id) || aliases.has(id) || all.some(s => String(s.id) === id)) throw Error('Invalid boarding alias');
    aliases.add(id);
  }
  return result;
}

/** Only reviewed ID transitions may resolve old candidate links. */
export function findBoardingStop(stops: BusFeature[], id: string): BusFeature | undefined {
  return stops.find(s => String(s.id || s.properties['@id']) === id)
    ?? stops.find(s => s.properties.boarding_guide?.previous_candidate_ids?.includes(id));
}

export function boardingTitle(stop: BusFeature): string {
  const name = stop.properties.boarding_guide?.stop_name || stop.properties['name:ja'] || stop.properties.name || '名称未登録';
  const guide = stop.properties.boarding_guide;
  return name + (guide?.number ? ` ${guide.number}のりば` : guide?.role === 'alighting' ? ' 降車専用' : '') + (guide?.assignment_hold ? '（番号対応未確認）' : guide?.review ? '（位置候補）' : '');
}

/** Derived review pins never replace an original record or acquire a catchment. */
export function attachLocationReviews(stops: BusFeature[], data: { version: number; points: BusFeature[] }): BusFeature[] {
  if (data.version !== 1 || !Array.isArray(data.points)) throw Error('Invalid location reviews');
  const ids = new Set(stops.map(s => String(s.id)));
  for (const stop of stops) for (const alias of stop.properties.boarding_guide?.previous_candidate_ids ?? []) ids.add(alias);
  for (const point of data.points) {
    const id = String(point.id), guide = point.properties.boarding_guide;
    if (!/^review:(ube-chuo|ube-shinkawa|tokuyama)-\d+$/.test(id) || ids.has(id) ||
      point.properties.boarding_walk || point.properties.source_kind !== 'boarding-study' ||
      guide?.evidence !== 'official-diagram-derived' || !guide.review?.questions.length ||
      !(guide.review.search_radius_m > 0 && guide.review.search_radius_m <= 100) ||
      point.geometry.coordinates.length !== 2 || !point.geometry.coordinates.every((n, i) => Number.isFinite(n) && n === guide.source_coordinates[i])) throw Error('Invalid review origin');
    ids.add(id);
  }
  return [...stops, ...data.points];
}

export function boardingChoices(stop: BusFeature, stops: BusFeature[]): BusFeature[] {
  const group = stop.properties.boarding_guide?.group_id;
  return group ? stops.filter(s => s.properties.boarding_guide?.group_id === group) : [];
}

/** Choice membership is the reviewed source group, independent of pixel overlap. */
export function hasOverlappingChoice(stop: BusFeature, stops: BusFeature[], project: (s: BusFeature) => { x: number; y: number }): boolean {
  const p = project(stop);
  return boardingChoices(stop, stops).some(other => {
    if (other.id === stop.id) return false;
    const q = project(other);
    return Math.hypot(p.x-q.x, p.y-q.y) < 36;
  });
}
