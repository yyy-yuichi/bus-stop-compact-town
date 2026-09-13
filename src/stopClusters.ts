import type { BusFeature } from './types';

export interface ProjectedStop { stop: BusFeature; x: number; y: number }
export interface StopCluster { stops: BusFeature[]; x: number; y: number }

/** Presentation only: source records and coordinates are never combined or rewritten. */
export function clusterStops(points: ProjectedStop[], cellSize: number): StopCluster[] {
  if (cellSize <= 0) return points.map(({ stop, x, y }) => ({ stops: [stop], x, y }));
  const cells = new Map<string, StopCluster>();
  for (const { stop, x, y } of points) {
    // World pixels keep membership stable while panning.
    const key = `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;
    const cell = cells.get(key);
    if (cell) { cell.stops.push(stop); cell.x += x; cell.y += y; }
    else cells.set(key, { stops: [stop], x, y });
  }
  let clusters = [...cells.values()].map(cell => ({ ...cell, x: cell.x / cell.stops.length, y: cell.y / cell.stops.length }));
  // Neighboring cells can put two average positions almost on top of each other.
  // Merge nearby badges until each has room, using a spatial index per pass.
  const spacing = cellSize * 0.72;
  let changed = true;
  while (changed) {
    changed = false;
    const index = new Map<string, Set<StopCluster>>();
    const next: StopCluster[] = [];
    const key = (x: number, y: number) => `${Math.floor(x / spacing)}:${Math.floor(y / spacing)}`;
    for (const cluster of clusters) {
      const gx = Math.floor(cluster.x / spacing), gy = Math.floor(cluster.y / spacing);
      let closest: StopCluster | undefined;
      let gap = spacing;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const other of index.get(`${gx + dx}:${gy + dy}`) || []) {
          const distance = Math.hypot(other.x - cluster.x, other.y - cluster.y);
          if (distance < gap) { closest = other; gap = distance; }
        }
      }
      if (closest) {
        index.get(key(closest.x, closest.y))?.delete(closest);
        const a = closest.stops.length, b = cluster.stops.length;
        closest.x = (closest.x * a + cluster.x * b) / (a + b);
        closest.y = (closest.y * a + cluster.y * b) / (a + b);
        closest.stops.push(...cluster.stops);
        changed = true;
      } else { closest = cluster; next.push(cluster); }
      const bucket = key(closest.x, closest.y);
      if (!index.has(bucket)) index.set(bucket, new Set());
      index.get(bucket)!.add(closest);
    }
    clusters = next;
  }
  return clusters;
}

export function stopCellSize(zoom: number): number {
  return zoom < 11 ? 96 : zoom < 12 ? 76 : zoom < 14 ? 60 : 0;
}
