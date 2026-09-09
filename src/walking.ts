/** Reads pre-baked walking catchments (Task 3's bake). No client-side routing. */
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
  return stopId + '.geojson';
}

const coordinate = (value: unknown): Coordinate => {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(n => Number.isFinite(n)) ||
    Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) throw Error('Invalid coordinate');
  return [value[0], value[1]];
};

export function parseCatchment(value: unknown): Catchment {
  const fc = value as { type?: string; stop_id?: string; budget?: number; features?: unknown[] };
  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features) ||
    typeof fc.stop_id !== 'string' || !Number.isFinite(fc.budget)) throw Error('Invalid catchment');
  let origin: Coordinate | null = null, snap: Coordinate | null = null, snapGap = 0;
  const segments: Segment[] = [];
  for (const raw of fc.features) {
    const f = raw as { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } };
    const role = f?.properties?.role;
    if (role === 'stop') origin = coordinate(f.geometry?.coordinates);
    else if (role === 'snap') {
      const line = f.geometry?.coordinates as unknown[];
      if (!Array.isArray(line) || line.length !== 2) throw Error('Invalid snap');
      snap = coordinate(line[1]);
      snapGap = Number(f.properties?.gap) || 0;
    } else if (role === 'segment') {
      const line = f.geometry?.coordinates as unknown[];
      if (!Array.isArray(line) || line.length !== 2) throw Error('Invalid segment');
      const { d1, d2, grade, steps } = f.properties as Record<string, unknown>;
      if (!Number.isFinite(d1) || !Number.isFinite(d2) || !Number.isFinite(grade)) throw Error('Invalid segment');
      segments.push({ a: coordinate(line[0]), b: coordinate(line[1]),
        d1: d1 as number, d2: d2 as number, grade: grade as number, steps: steps === true });
    }
  }
  if (!origin || !snap || !segments.length) throw Error('Invalid catchment');
  return { stopId: fc.stop_id, budget: fc.budget as number, origin, snap, snapGap, segments };
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
