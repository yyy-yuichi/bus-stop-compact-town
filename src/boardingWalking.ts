import type { BusFeature } from './types';

export interface BoardingWalkIndex {
  version: number;
  budget: number;
  snap_limit: number;
  stops: Record<string, { origin: number[]; file?: string; gap?: number | null }>;
}
export interface BoardingWalkSource { id: string; url?: string; gap?: number | null }

/** The walking origin must be the selected original point, never a namesake. */
export function attachBoardingWalks(stops: BusFeature[], index: BoardingWalkIndex, urls: Record<string, string>): BusFeature[] {
  if (index.version !== 1 || index.budget !== 1000 || index.snap_limit !== 30) throw Error('Invalid boarding walk index');
  const found = new Set<string>();
  const result = stops.map(stop => {
    const id = String(stop.id);
    const entry = index.stops[id];
    if (!entry) return stop;
    if (!stop.properties.boarding_guide || stop.properties.boarding_guide.review || stop.properties.boarding_guide.assignment_hold || entry.origin.length !== 2 ||
        !entry.origin.every((n, i) => Number.isFinite(n) && n === stop.geometry.coordinates[i])) throw Error('Boarding walk origin mismatch');
    if (entry.file && (!/^((?:hikari|iwakuni|sentetsu)-[\w.-]+|node-\d+|bocho-\d{8}-\d{12}|jr-chugoku-\d+ \d+|ube-official-map-[A-Za-z0-9_-]+-\d+)\.json$/.test(entry.file) ||
      entry.file !== `${id.replaceAll(':', '-').replaceAll('/', '-')}.json` || !urls[entry.file])) throw Error('Missing boarding walk file');
    if (!entry.file && (entry.gap !== null && !(typeof entry.gap === 'number' && Number.isFinite(entry.gap) && entry.gap >= 0))) throw Error('Invalid boarding walk gap');
    found.add(id);
    return { ...stop, properties: { ...stop.properties, boarding_walk: { id, ...(entry.file ? { url: urls[entry.file] } : { gap: entry.gap }) } } };
  });
  if (Object.keys(index.stops).some(id => !found.has(id))) throw Error('Missing boarding walk origin');
  return result;
}
