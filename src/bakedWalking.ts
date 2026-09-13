/** Reads pre-baked walking catchments (Task 3's bake). No client-side routing. */
import type { ShoppingFeature } from './types';
export type Coordinate = [number, number];
type PointLike = { readonly 0: number; readonly 1: number };

export function distance(a: PointLike, b: PointLike): number {
  const dy = (b[1] - a[1]) * Math.PI / 180;
  const dx = (b[0] - a[0]) * Math.PI / 180 * Math.cos((a[1] + b[1]) * Math.PI / 360);
  return Math.hypot(dx, dy) * 6371000;
}
export function interpolate(a: PointLike, b: PointLike, t: number): Coordinate {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
export function project(p: Coordinate, a: PointLike, b: PointLike): { t: number; point: Coordinate; gap: number } {
  const scale = Math.cos(p[1] * Math.PI / 180);
  const dx = (b[0] - a[0]) * scale, dy = b[1] - a[1];
  const denominator = dx * dx + dy * dy;
  const t = denominator ? Math.max(0, Math.min(1, ((p[0] - a[0]) * scale * dx + (p[1] - a[1]) * dy) / denominator)) : 0;
  const point = interpolate(a, b, t);
  return { t, point, gap: distance(p, point) };
}

export interface Segment { a: Coordinate; b: Coordinate; d1: number; d2: number; grade: number; steps: boolean }
export interface Catchment {
  stopId: string; budget: number; origin: Coordinate; snap: Coordinate; snapGap: number; segments: Segment[];
}

const ID = /^-?\d+(\.\d+)?_-?\d+(\.\d+)?$/;

/** IDは座標由来。URLに使うので、想定の形以外は弾く。 */
export function catchmentFile(stopId: string): string {
  if (!ID.test(stopId)) throw Error(`Invalid stop id: ${stopId}`);
  return stopId + '.json';
}

/**
 * 徒歩圏（143MB）だけ配信元を切り替えられる。VITE_WALK_DATA_URLが未設定なら
 * これまで通りBASE_URL（public/data/walk、ローカルではwork/walkへのシンボリック
 * リンク）から返す。設定時はそのオリジンから直接fetchする（R2など。
 * docs/WALK-DATA-R2.md参照）。末尾の`/`有無はどちらでも動くよう吸収する。
 */
export function walkDataBaseUrl(): string {
  const override = import.meta.env.VITE_WALK_DATA_URL;
  if (!override) return `${import.meta.env.BASE_URL}data/walk/`;
  return override.endsWith('/') ? override : `${override}/`;
}

const coordinate = (value: unknown): Coordinate => {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(n => Number.isFinite(n)) ||
    Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) throw Error('Invalid coordinate');
  return [value[0], value[1]];
};

/** 焼き込み側の [lon1, lat1, lon2, lat2, d1, d2, grade, steps] 1行を1セグメントにする。 */
const segmentRow = (row: unknown): Segment => {
  if (!Array.isArray(row) || row.length !== 8 || !row.every(n => Number.isFinite(n))) throw Error('Invalid segment');
  const [lon1, lat1, lon2, lat2, d1, d2, grade, steps] = row as number[];
  if (d1 < 0 || d2 < 0 || (steps !== 0 && steps !== 1)) throw Error('Invalid segment distances or steps');
  return { a: coordinate([lon1, lat1]), b: coordinate([lon2, lat2]), d1, d2, grade, steps: steps === 1 };
};

export function parseCatchment(value: unknown): Catchment {
  const fc = value as { v?: number; id?: string; budget?: number; origin?: unknown; snap?: unknown; gap?: number; seg?: unknown[] };
  if (!fc || fc.v !== 1 || typeof fc.id !== 'string' || !fc.id || !Number.isFinite(fc.budget) ||
    (fc.budget as number) <= 0 || !Number.isFinite(fc.gap) || (fc.gap as number) < 0 || !Array.isArray(fc.seg)) throw Error('Invalid catchment');
  const origin = coordinate(fc.origin);
  const snap = coordinate(fc.snap);
  const segments = fc.seg.map(segmentRow);
  if (!segments.length || segments.some(s => Math.max(s.d1, s.d2) > (fc.budget as number) + 1e-6)) throw Error('Invalid catchment');
  return { stopId: fc.id, budget: fc.budget as number, origin, snap, snapGap: fc.gap as number, segments };
}

/** 各セグメントの内部は距離が線形なので、補間するだけで正確に切れる。 */
export function reachableLines(catchment: Catchment, budget: number): Coordinate[][] {
  const lines: Coordinate[][] = [];
  for (const { a, b, d1, d2 } of catchment.segments) {
    if (d1 > budget && d2 > budget) continue;
    if (d1 <= budget && d2 <= budget) { lines.push([a, b]); continue; }
    const t = (budget - d1) / (d2 - d1);
    lines.push(d1 <= budget ? [a, interpolate(a, b, t)] : [interpolate(a, b, t), b]);
  }
  return lines;
}

/** Keep the baked distance scale when changing the displayed walking time. */
export function clipCatchment(catchment: Catchment, budget: number): Catchment {
  if (!Number.isFinite(budget) || budget <= 0) throw Error('Invalid walking budget');
  const limit = Math.min(budget, catchment.budget);
  const segments: Segment[] = [];
  for (const s of catchment.segments) {
    if (s.d1 > limit && s.d2 > limit) continue;
    if (s.d1 <= limit && s.d2 <= limit) { segments.push(s); continue; }
    const point = interpolate(s.a, s.b, (limit - s.d1) / (s.d2 - s.d1));
    segments.push(s.d1 <= limit ? { ...s, b: point, d2: limit } : { ...s, a: point, d1: limit });
  }
  return { ...catchment, budget: limit, segments };
}

export const FACILITY_ROAD_GAP_M = 25;
export const WALKING_METERS_PER_MINUTE = 4000 / 60;
export type FacilityGroup = 'shopping' | 'medical' | 'services';
export interface BakedFacilityCandidate {
  facility: ShoppingFeature;
  group: FacilityGroup;
  /** Slope-adjusted distance to the nearby road, not a verified entrance. */
  meters: number;
  roadPoint: Coordinate;
  facilityPoint: Coordinate;
  gap: number;
}
type Bounds = [number, number, number, number];
interface PreparedFacility {
  facility: ShoppingFeature; group: FacilityGroup; bounds: Bounds;
  point?: Coordinate; polygons: Coordinate[][][];
}

function boundsOf(points: Coordinate[]): Bounds {
  const b: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
  return b;
}
function nearbyBounds(a: Bounds, b: Bounds, latitude: number): boolean {
  const dy = FACILITY_ROAD_GAP_M / 110000;
  const dx = dy / Math.max(0.01, Math.cos(latitude * Math.PI / 180));
  return a[0] <= b[2] + dx && a[2] >= b[0] - dx && a[1] <= b[3] + dy && a[3] >= b[1] - dy;
}

/** Prepare once; retain source IDs and exclude reference records. */
export function prepareFacilities(facilities: ShoppingFeature[]): PreparedFacility[] {
  return facilities.flatMap(facility => {
    const category = facility.properties.category ?? 'mall';
    const services = ['post_office', 'bank', 'library', 'townhall', 'community_centre'];
    if (!['mall', 'supermarket', 'drugstore', 'convenience', 'hospital', 'clinic', 'pharmacy', ...services].includes(category)) return [];
    const group: FacilityGroup = services.includes(category) ? 'services' : ['hospital', 'clinic', 'pharmacy'].includes(category) ? 'medical' : 'shopping';
    const point = facility.geometry.type === 'Point' ? facility.geometry.coordinates as Coordinate : undefined;
    const polygons = facility.geometry.type === 'MultiPolygon' ? facility.geometry.coordinates as Coordinate[][][] : [];
    const points = point ? [point] : polygons.flat(2);
    if (!points.length || points.some(p => p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return [];
    return [{ facility, group, bounds: boundsOf(points), point, polygons }];
  });
}

function inRing(p: Coordinate, ring: Coordinate[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function inPolygon(p: Coordinate, polygon: Coordinate[][]): boolean {
  return !!polygon[0] && inRing(p, polygon[0]) && !polygon.slice(1).some(hole => inRing(p, hole));
}
function crossing(a: Coordinate, b: Coordinate, c: Coordinate, d: Coordinate): number | null {
  const cross = (x: number, y: number, u: number, v: number) => x * v - y * u;
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
  const denominator = cross(rx, ry, sx, sy);
  if (Math.abs(denominator) < 1e-20) return null;
  const t = cross(c[0] - a[0], c[1] - a[1], sx, sy) / denominator;
  const u = cross(c[0] - a[0], c[1] - a[1], rx, ry) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** Nearest pair on this baked segment; holes and crossing/contained roads matter. */
function nearFacility(segment: Segment, facility: PreparedFacility) {
  const { a, b, d1, d2 } = segment;
  let best: { meters: number; roadPoint: Coordinate; facilityPoint: Coordinate; gap: number } | null = null;
  const consider = (t: number, facilityPoint: Coordinate) => {
    // A rounded, zero-length segment represents both endpoint costs at one place.
    if (a[0] === b[0] && a[1] === b[1]) t = d2 < d1 ? 1 : 0;
    const roadPoint = interpolate(a, b, t);
    const gap = distance(roadPoint, facilityPoint), meters = d1 + (d2 - d1) * t;
    if (!best || gap < best.gap - 1e-6 || (Math.abs(gap - best.gap) <= 1e-6 && meters < best.meters)) best = { meters, roadPoint, facilityPoint, gap };
  };
  if (facility.point) {
    consider(project(facility.point, a, b).t, facility.point);
  } else for (const polygon of facility.polygons) {
    if (inPolygon(a, polygon)) consider(0, a);
    if (inPolygon(b, polygon)) consider(1, b);
    for (const ring of polygon) for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      consider(project(p, a, b).t, p);
      consider(0, project(a, p, q).point);
      consider(1, project(b, p, q).point);
      const t = crossing(a, b, p, q);
      if (t !== null) consider(t, interpolate(a, b, t));
    }
  }
  return best as { meters: number; roadPoint: Coordinate; facilityPoint: Coordinate; gap: number } | null;
}

/**
 * Join only to the baked reachable roads; never infer a route across a gap.
 * Each segment's nearest pair must be within 25 m of the registered point/area.
 * Keep the lowest baked cost of qualifying pairs. Filter this fixed result by
 * minutes, so 5/10/15-minute candidate sets are nested and estimates stay stable.
 */
export function bakedFacilityCandidates(catchment: Catchment, facilities: PreparedFacility[]): BakedFacilityCandidate[] {
  if (!catchment.segments.length) return [];
  const extent = boundsOf(catchment.segments.flatMap(s => [s.a, s.b]));
  const segments = catchment.segments.map(segment => ({ segment, bounds: boundsOf([segment.a, segment.b]) }));
  const candidates: BakedFacilityCandidate[] = [];
  for (const prepared of facilities) {
    if (!nearbyBounds(extent, prepared.bounds, catchment.origin[1])) continue;
    let best: BakedFacilityCandidate | null = null;
    for (const { segment, bounds } of segments) {
      if (!nearbyBounds(bounds, prepared.bounds, catchment.origin[1])) continue;
      const reach = nearFacility(segment, prepared);
      if (!reach || reach.gap > FACILITY_ROAD_GAP_M + 1e-6 || reach.meters > catchment.budget) continue;
      if (!best || reach.meters < best.meters - 1e-6 || (Math.abs(reach.meters - best.meters) <= 1e-6 && reach.gap < best.gap)) {
        best = { facility: prepared.facility, group: prepared.group, ...reach };
      }
    }
    if (best) candidates.push(best);
  }
  return candidates.sort((a, b) => a.meters - b.meters || String(a.facility.id).localeCompare(String(b.facility.id)));
}
