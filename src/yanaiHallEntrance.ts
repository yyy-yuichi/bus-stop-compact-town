import source from './data/yanai-hall-entrance.json';
import stationWalkUrl from './data/yanai-hall-1331-walk.json?url';
import tabuseWalkUrl from './data/yanai-hall-1332-walk.json?url';
import { attachBoardingGuides } from './boardingGuide';
import { attachBoardingWalks } from './boardingWalking';
import type { Coordinate } from './bakedWalking';
import type { EntranceCandidate, EntranceRoute } from './entranceRouteStudy';
import { categoryOf } from './facilityCatalog';
import { facilityAvailable } from './facilityFreshness';
import type { BusFeature, ShoppingFeature } from './types';

const enabled = import.meta.env.VITE_YANAI_HALL === '1';
const operatorStop = '00450594';
const name = '柳井市役所前';
const walkUrls: Record<string, string> = {
  '000000001331': stationWalkUrl,
  '000000001332': tabuseWalkUrl,
};
const routes = source.routes.map(route => ({
  ...route,
  id: `bocho:${operatorStop}-${route.platformId}`,
  origin: route.points[0] as Coordinate,
}));

export function addYanaiPlatforms(stops: BusFeature[]): BusFeature[] {
  if (!enabled) return stops;
  return [...stops, ...routes.flatMap(({ id, origin, direction, platformId }) => {
    if (stops.some(stop => String(stop.id) === id)) throw Error('Duplicate Yanai platform');
    const feature: BusFeature = {
      type: 'Feature', id,
      geometry: { type: 'Point', coordinates: origin },
      properties: { name, operator: '防長交通', source_kind: 'boarding-study', location_kind: 'official-source' },
    };
    const guided = attachBoardingGuides([feature], {
      version: 1, hub_points: [],
      guides: { [id]: {
        stop_name: `${name}（${direction}）`,
        group_id: `bocho:${operatorStop}`, number: null, role: 'boarding',
        summary: `${direction}。降車後の歩行起点は歩道上に図上で設定。`,
        directions: [], evidence: 'official-diagram-derived', source_coordinates: origin,
        source_url: `https://transfer-cloud.navitime.biz/bochobus/courses?busstop=${operatorStop}`,
        guide_url: 'https://www.city-yanai.jp/soshiki/15/timetable.html',
        guide_label: '柳井市の公共交通総合時刻表',
      } },
    });
    const file = id.replaceAll(':', '-') + '.json';
    return attachBoardingWalks(guided, {
      version: 1, budget: 1000, snap_limit: 30, stops: { [id]: { origin, file } },
    }, { [file]: walkUrls[platformId] });
  })];
}

export function yanaiHallCandidate(id: string, coordinate: Coordinate, facilities: ShoppingFeature[]): EntranceCandidate | null {
  if (!enabled) return null;
  const route = routes.find(item => item.id === id && item.origin.every((value, i) => value === coordinate[i]));
  if (!route) return null;
  const facility = facilities.find(item => String(item.id) === source.facilityId);
  if (!facility || !facilityAvailable(facility)) return null;
  const group = categoryOf(facility).group;
  if (!group) return null;
  const points = route.points as Coordinate[];
  const end = points.at(-1)!;
  const entranceRoute: EntranceRoute = {
    label: source.entrance, endLabel: source.entrance, points,
    meters: route.meters, startMeters: 0, scope: 'entrance', provisional: false,
    note: `${route.routeDescription}図上約${Math.round(route.meters)}m。`,
  };
  return { facility, group, meters: route.meters, roadPoint: end, facilityPoint: end, gap: 0, entranceRoute };
}
