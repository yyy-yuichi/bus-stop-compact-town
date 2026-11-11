import data from './data/entrance-route-study.json' with { type: 'json' };
import { distance, interpolate, WALKING_METERS_PER_MINUTE } from './bakedWalking.ts';
import type { BakedFacilityCandidate, Catchment, Coordinate } from './bakedWalking.ts';

export type EntranceStudyMode = 'current' | 'confirmed' | 'alternative' | 'detour';
export interface EntranceRoute {
  label: string;
  points: Coordinate[];
  meters: number;
  startMeters: number;
  scope: 'entrance' | 'outdoor';
  note: string;
  provisional: boolean;
  startLabel?: string;
}
export interface EntrancePair {
  facilityId: string;
  currentMeters: number;
  currentRoadPoint: Coordinate;
  primary: EntranceRoute;
  alternative?: EntranceRoute;
  detour?: EntranceRoute;
}
export interface EntranceOrigin { origin: Coordinate; stopName: string; pairs: EntrancePair[] }
export interface EntranceCandidate extends BakedFacilityCandidate { entranceRoute?: EntranceRoute }

const origins = (data as unknown as { version: number; origins: Record<string, EntranceOrigin> }).origins;
export const displayStudyMinutes = (meters: number) => Math.max(1, Math.ceil(meters / WALKING_METERS_PER_MINUTE));

/** The saved national origin is the scope. Names and nearby boarding points do not match it. */
export function entranceStudyFor(catchment: Pick<Catchment, 'stopId' | 'origin'>): EntranceOrigin | null {
  const source = origins[catchment.stopId];
  return source && distance(source.origin, catchment.origin) < 0.01 ? source : null;
}

/** National catalogs keep more precision than their five-decimal catchment IDs. */
export function entranceInputFor(stopId: string, origin: Coordinate): EntranceOrigin | null {
  const rounded: Coordinate = [Number(origin[0].toFixed(5)), Number(origin[1].toFixed(5))];
  if (stopId !== `${rounded[0]}_${rounded[1]}`) return null;
  return entranceStudyFor({ stopId, origin: rounded });
}

export function selectedEntranceRoute(pair: EntrancePair, mode: EntranceStudyMode): EntranceRoute {
  if (mode === 'alternative' && pair.alternative) return pair.alternative;
  if (mode === 'detour' && pair.detour) return pair.detour;
  return pair.primary;
}

export function applyEntranceStudy(candidates: BakedFacilityCandidate[], source: EntranceOrigin | null, mode: EntranceStudyMode) {
  const mismatches: string[] = [];
  if (!source) return { candidates: candidates as EntranceCandidate[], mismatches };
  const pairs = new Map(source.pairs.map(pair => [pair.facilityId, pair]));
  const seen = new Set<string>();
  const result: EntranceCandidate[] = candidates.map(candidate => {
    const id = String(candidate.facility.id);
    const pair = pairs.get(id);
    if (!pair) return candidate;
    seen.add(id);
    if (Math.abs(pair.currentMeters - candidate.meters) > 0.01 || distance(pair.currentRoadPoint, candidate.roadPoint) > 0.01) {
      mismatches.push(id);
      return candidate;
    }
    if (mode === 'current') return candidate;
    const entranceRoute = selectedEntranceRoute(pair, mode);
    return { ...candidate, meters: entranceRoute.meters, entranceRoute };
  });
  for (const id of pairs.keys()) if (!seen.has(id)) mismatches.push(id);
  result.sort((a, b) => a.meters - b.meters || String(a.facility.id).localeCompare(String(b.facility.id)));
  return { candidates: result, mismatches };
}

/** Clip the saved route using its own cumulative cost, including the upstream road cost. */
export function entranceRouteWithin(route: EntranceRoute, budget: number): Coordinate[] {
  if (budget <= route.startMeters) return [];
  const points = [route.points[0]];
  let cost = route.startMeters;
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i];
    const length = distance(a, b);
    if (cost + length > budget) {
      if (length > 0) points.push(interpolate(a, b, (budget - cost) / length));
      break;
    }
    points.push(b);
    cost += length;
  }
  return points;
}
