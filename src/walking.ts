/** Small distance-only pedestrian graph. No geometric joins across intersecting roads. */
export type Coordinate = [number, number];
type PointLike = { readonly 0: number; readonly 1: number };
export type Edge = [number, number, number, number, number, string];
export interface WalkingGraph {
  version: number; name: string; retrieved_at: string;
  bbox: number[]; core: number[];
  nodes: [number, number, string][]; edges: Edge[];
  pilot_stops: { id: string; name: string; coordinate: Coordinate }[];
  facility_ids: string[];
}
export interface Projection { edge: number; t: number; point: Coordinate; gap: number }
export interface WalkResult {
  graph: WalkingGraph; origin: Coordinate; snap: Projection;
  distances: Float64Array; parents: Int32Array; budget: number;
}
export interface FacilityReach { meters: number; point: Coordinate; path: Coordinate[]; gap: number }

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
export function validateGraph(value: unknown): asserts value is WalkingGraph {
  const g = value as WalkingGraph;
  if (!g || g.version !== 1 || !Array.isArray(g.nodes) || !g.nodes.length || !Array.isArray(g.edges) || !g.edges.length ||
    !Array.isArray(g.pilot_stops) || !Array.isArray(g.facility_ids) || !Array.isArray(g.core) || g.core.length !== 4 ||
    !Array.isArray(g.bbox) || g.bbox.length !== 4 || [...g.core, ...g.bbox].some(x => !Number.isFinite(x))) throw Error('Invalid walking graph');
  for (const n of g.nodes) if (!Array.isArray(n) || !Number.isFinite(n[0]) || !Number.isFinite(n[1]) || Math.abs(n[0]) > 180 || Math.abs(n[1]) > 90) throw Error('Invalid walking node');
  for (const e of g.edges) if (!Array.isArray(e) || !Number.isInteger(e[0]) || !Number.isInteger(e[1]) || !g.nodes[e[0]] || !g.nodes[e[1]] || !Number.isFinite(e[2]) || e[2] <= 0 || ![0, 1].includes(e[3]) || ![0, 1].includes(e[4])) throw Error('Invalid walking edge');
}

class MinHeap {
  items: [number, number][] = [];
  push(node: number, cost: number) {
    const a = this.items; a.push([node, cost]); let i = a.length - 1;
    while (i) { const p = (i - 1) >> 1; if (a[p][1] <= cost) break; [a[i], a[p]] = [a[p], a[i]]; i = p; }
  }
  pop(): [number, number] | undefined {
    const a = this.items; if (!a.length) return;
    const first = a[0], last = a.pop()!;
    if (a.length) { a[0] = last; let i = 0;
      while (true) { let c = i * 2 + 1; if (c >= a.length) break;
        if (c + 1 < a.length && a[c + 1][1] < a[c][1]) c++;
        if (a[i][1] <= a[c][1]) break; [a[i], a[c]] = [a[c], a[i]]; i = c;
      }
    }
    return first;
  }
}

export function calculateWalk(graph: WalkingGraph, origin: Coordinate, budget: number): WalkResult | null {
  if (!Number.isFinite(budget) || budget <= 0) return null;
  let snap: Projection | null = null;
  graph.edges.forEach((e, edge) => {
    const p = project(origin, graph.nodes[e[0]], graph.nodes[e[1]]);
    if (!snap || p.gap < snap.gap) snap = { ...p, edge };
  });
  const s = snap as Projection | null;
  if (!s || s.gap > 30 || s.gap > budget) return null;
  const adjacency: [number, number][][] = graph.nodes.map(() => []);
  for (const [a, b, length, forward, backward] of graph.edges) {
    if (forward) adjacency[a].push([b, length]);
    if (backward) adjacency[b].push([a, length]);
  }
  const distances = new Float64Array(graph.nodes.length).fill(Infinity);
  const parents = new Int32Array(graph.nodes.length).fill(-1);
  const heap = new MinHeap();
  const seed = (node: number, cost: number) => { if (cost < distances[node]) { distances[node] = cost; heap.push(node, cost); } };
  const [a, b, length, forward, backward] = graph.edges[s.edge];
  if (backward || s.t < 1e-10) seed(a, s.gap + s.t * length);
  if (forward || s.t > 1 - 1e-10) seed(b, s.gap + (1 - s.t) * length);
  let next;
  while ((next = heap.pop())) {
    const [node, cost] = next;
    if (cost !== distances[node] || cost > budget) continue;
    for (const [target, length] of adjacency[node]) {
      const candidate = cost + length;
      if (candidate < distances[target] && candidate <= budget) {
        distances[target] = candidate; parents[target] = node; heap.push(target, candidate);
      }
    }
  }
  return { graph, origin, snap: s, distances, parents, budget };
}

/** Clip each directed edge at the distance budget, including a start in its interior. */
export function reachableLines(result: WalkResult, budget: number): Coordinate[][] {
  const { graph, distances: d, snap } = result;
  const lines: Coordinate[][] = [];
  graph.edges.forEach(([a, b, length, forward, backward], edge) => {
    const intervals: [number, number][] = [];
    if (forward && d[a] < budget) intervals.push([0, Math.min(1, (budget - d[a]) / length)]);
    if (backward && d[b] < budget) intervals.push([Math.max(0, 1 - (budget - d[b]) / length), 1]);
    if (edge === snap.edge && snap.gap < budget) {
      if (forward) intervals.push([snap.t, Math.min(1, snap.t + (budget - snap.gap) / length)]);
      if (backward) intervals.push([Math.max(0, snap.t - (budget - snap.gap) / length), snap.t]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const interval of intervals) {
      const prev = merged.at(-1);
      if (prev && interval[0] <= prev[1]) prev[1] = Math.max(prev[1], interval[1]);
      else merged.push([...interval]);
    }
    for (const [lo, hi] of merged) if (hi - lo > 1e-8) lines.push([interpolate(graph.nodes[a], graph.nodes[b], lo), interpolate(graph.nodes[a], graph.nodes[b], hi)]);
  });
  return lines;
}

function pathTo(result: WalkResult, node: number, target: Coordinate): Coordinate[] {
  const tail: Coordinate[] = []; let current = node;
  while (current >= 0) { const p = result.graph.nodes[current]; tail.push([p[0], p[1]]); current = result.parents[current]; }
  return [result.origin, result.snap.point, ...tail.reverse(), target];
}

/** Candidate = a reachable road point within 25 m of the footprint, NOT a verified entrance. */
export function reachFacility(result: WalkResult, outlines: Coordinate[][]): FacilityReach | null {
  let best: FacilityReach | null = null;
  const { graph, distances: d, snap } = result;
  graph.edges.forEach(([a, b, length, forward, backward], edge) => {
    const pa = graph.nodes[a], pb = graph.nodes[b];
    const projections: ReturnType<typeof project>[] = [];
    for (const ring of outlines) for (let i = 0; i < ring.length; i++) {
      const p = ring[i]; projections.push(project(p, pa, pb));
      // Also project road ends onto the footprint so long walls are represented.
      if (i) {
        for (const [end, t] of [[pa, 0], [pb, 1]] as const) {
          const q = project([end[0], end[1]], ring[i - 1], p);
          projections.push({ t, point: [end[0], end[1]], gap: q.gap });
        }
      }
    }
    for (const p of projections) {
      if (p.gap > 25) continue;
      const choices = [
        { cost: forward ? d[a] + p.t * length : Infinity, node: a },
        { cost: backward ? d[b] + (1 - p.t) * length : Infinity, node: b },
      ];
      if (edge === snap.edge && ((p.t >= snap.t && forward) || (p.t <= snap.t && backward))) choices.push({ cost: snap.gap + Math.abs(p.t - snap.t) * length, node: -1 });
      for (const { cost, node } of choices) {
        if (cost <= result.budget && (!best || cost < best.meters)) best = {
          meters: cost, point: p.point, gap: p.gap,
          path: node < 0 ? [result.origin, snap.point, p.point] : pathTo(result, node, p.point),
        };
      }
    }
  });
  return best;
}

export function inPilot(graph: WalkingGraph, id: string): boolean { return graph.pilot_stops.some(s => s.id === id); }
