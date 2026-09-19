export const STOP_TARGET = 48;
export const CHOICE_WIDTH = 168;
export const CHOICE_HEIGHT = 80;
const GAP = 8;

export interface DisplayPoint { id: string; x: number; y: number }
export interface DisplayRect { left: number; top: number; right: number; bottom: number }

export function pointRect(point: DisplayPoint, width = STOP_TARGET, height = STOP_TARGET): DisplayRect {
  return { left: point.x - width / 2, top: point.y - height / 2,
    right: point.x + width / 2, bottom: point.y + height / 2 };
}

export function touches(a: DisplayRect, b: DisplayRect, gap = 0): boolean {
  return a.left < b.right + gap && a.right + gap > b.left
    && a.top < b.bottom + gap && a.bottom + gap > b.top;
}

export function contains(outer: DisplayRect, inner: DisplayRect): boolean {
  return inner.left >= outer.left && inner.top >= outer.top
    && inner.right <= outer.right && inner.bottom <= outer.bottom;
}

/** Connected components of colliding square targets, including the selected record. */
export function overlapGroups<T extends DisplayPoint>(points: T[], size = STOP_TARGET): T[][] {
  if (!(size > 0 && Number.isFinite(size))) throw new Error('Invalid marker target');
  if (points.some(p => !p.id || !Number.isFinite(p.x) || !Number.isFinite(p.y))
    || new Set(points.map(p => p.id)).size !== points.length) throw new Error('Invalid display points');
  const parent = points.map((_, i) => i);
  const root = (start: number) => {
    let i = start;
    while (i !== parent[i]) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const cells = new Map<string, number[]>();
  points.forEach((p, i) => {
    const x = Math.floor(p.x / size), y = Math.floor(p.y / size);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const j of cells.get(`${x + dx}:${y + dy}`) || []) {
        const q = points[j];
        if (Math.abs(p.x - q.x) < size && Math.abs(p.y - q.y) < size) parent[root(i)] = root(j);
      }
    }
    const key = `${x}:${y}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(i);
  });
  const groups = new Map<number, T[]>();
  points.forEach((p, i) => {
    const r = root(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(p);
  });
  return [...groups.values()];
}

/** Returns null instead of squeezing overlapping cards into an unsafe viewport. */
export function spiderLayout(origins: DisplayPoint[], view: DisplayRect, obstacles: DisplayRect[] = []): DisplayPoint[] | null {
  if (origins.length < 2 || origins.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const w = view.right - view.left, h = view.bottom - view.top;
  if (!(w > 0 && h > 0) || origins.length * CHOICE_WIDTH * CHOICE_HEIGHT > w * h) return null;
  const xs = origins.map(p => p.x), ys = origins.map(p => p.y);
  if (Math.max(...xs) - Math.min(...xs) > w / 2 || Math.max(...ys) - Math.min(...ys) > h / 2
    || origins.some(p => p.x < view.left || p.x > view.right || p.y < view.top || p.y > view.bottom)) return null;
  const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
  const valid = (positions: DisplayPoint[]) => {
    const rects = positions.map(p => pointRect(p, CHOICE_WIDTH, CHOICE_HEIGHT));
    return rects.every((r, i) => contains(view, r) && !obstacles.some(o => touches(r, o, GAP))
      && !rects.slice(0, i).some(o => touches(r, o, GAP)));
  };
  for (const radius of [104, 144, 188, 240, 300]) {
    const circle = origins.map((p, i) => ({ id: p.id,
      x: cx + radius * Math.cos(-Math.PI / 2 + 2 * Math.PI * i / origins.length),
      y: cy + radius * Math.sin(-Math.PI / 2 + 2 * Math.PI * i / origins.length) }));
    if (valid(circle)) return circle;
  }
  const maxColumns = Math.floor((w + GAP) / (CHOICE_WIDTH + GAP));
  for (let columns = Math.min(maxColumns, origins.length); columns >= 1; columns--) {
    const rows = Math.ceil(origins.length / columns);
    const blockW = columns * (CHOICE_WIDTH + GAP) - GAP;
    const blockH = rows * (CHOICE_HEIGHT + GAP) - GAP;
    if (blockH > h) continue;
    const x = Math.max(view.left, Math.min(cx - blockW / 2, view.right - blockW));
    const y = Math.max(view.top, Math.min(cy - blockH / 2, view.bottom - blockH));
    for (const left of [...new Set([x, view.left, view.right - blockW])]) {
      for (const top of [...new Set([y, view.top, view.bottom - blockH])]) {
        const grid = origins.map((p, i) => ({ id: p.id,
          x: left + CHOICE_WIDTH / 2 + (i % columns) * (CHOICE_WIDTH + GAP),
          y: top + CHOICE_HEIGHT / 2 + Math.floor(i / columns) * (CHOICE_HEIGHT + GAP) }));
        if (valid(grid)) return grid;
      }
    }
  }
  return null;
}
