import data from './data/boarding-walk-study/index.json';
import { attachBoardingWalks } from './boardingWalking';
import type { BoardingWalkIndex } from './boardingWalking';
import type { BusFeature } from './types';

// Keep the v14 computation in source history, but never ship it as an A catchment.
const assets = import.meta.glob(['./data/boarding-walk-study/*.json', '!./data/boarding-walk-study/node-6924153238.json'], { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const urls = Object.fromEntries(Object.entries(assets).map(([path, url]) => [path.split('/').pop()!, url]));
export function attachStudyWalks(stops: BusFeature[]): BusFeature[] {
  return attachBoardingWalks(stops, data as BoardingWalkIndex, urls);
}
