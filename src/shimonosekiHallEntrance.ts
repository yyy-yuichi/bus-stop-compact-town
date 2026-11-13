import source from './data/shimonoseki-hall-entrance.json';
import type { Coordinate } from './bakedWalking';
import type { EntranceCandidate, EntranceRoute } from './entranceRouteStudy';
import { categoryOf } from './facilityCatalog';
import { facilityAvailable } from './facilityFreshness';
import type { ShoppingFeature } from './types';

export function shimonosekiHallCandidate(id: string, origin: Coordinate, facilities: ShoppingFeature[]): EntranceCandidate | null {
  const points = source.points as Coordinate[];
  if (import.meta.env.VITE_SHIMONOSEKI_HALL !== '1' || id !== source.stopId ||
      !points[0].every((value, i) => value === origin[i])) return null;
  const facility = facilities.find(item => String(item.id) === source.facilityId);
  if (!facility || !facilityAvailable(facility)) return null;
  const group = categoryOf(facility).group;
  if (!group) return null;
  const end = points.at(-1)!;
  const entranceRoute: EntranceRoute = {
    label: source.entrance, endLabel: source.entrance, points,
    meters: source.meters, startMeters: 0, scope: 'entrance', provisional: false,
    note: `高尾線63番・唐戸行きの降車位置から歩道を進み、竹崎・園田線の横断歩道を渡って本庁舎西棟の正面玄関へ。図上約${Math.round(source.meters)}m。`,
  };
  return { facility, group, meters: source.meters, roadPoint: end, facilityPoint: end, gap: 0, entranceRoute };
}
