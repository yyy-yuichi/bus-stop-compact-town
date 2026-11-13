import source from './data/hagi-hall-entrance.json';
import { attachBoardingGuides } from './boardingGuide';
import { attachBoardingWalks } from './boardingWalking';
import type { Coordinate } from './bakedWalking';
import type { EntranceCandidate, EntranceRoute } from './entranceRouteStudy';
import { categoryOf } from './facilityCatalog';
import { facilityAvailable } from './facilityFreshness';
import type { BusFeature, ShoppingFeature } from './types';

const enabled = import.meta.env.VITE_HAGI_HALL === '1';
const routes = source.routes.map(route => ({
  ...route, points: route.points as Coordinate[], origin: route.points[0] as Coordinate,
}));

export function addHagiPlatforms(stops: BusFeature[]): BusFeature[] {
  if (!enabled) return stops;
  const additions = routes.flatMap(({ id, stop, name, direction, origin, pole }) => {
    if (stops.some(feature => String(feature.id) === id)) throw Error('Duplicate Hagi platform');
    const feature: BusFeature = {
      type: 'Feature', id, geometry: { type: 'Point', coordinates: origin },
      properties: { name, operator: '防長交通', source_kind: 'boarding-study', location_kind: 'official-source' },
    };
    const loop = stop === '00451665';
    const guided = attachBoardingGuides([feature], {
      version: 1, hub_points: [],
      guides: { [id]: {
        stop_name: `${name}（${direction}）`,
        group_id: `bocho:${stop}`, number: null, role: 'boarding',
        summary: loop ? '東回り（E1）と西回り（W1）の共通の到着場所。' : '降車後の歩行起点を国道沿いの歩道上に図上で設定。',
        directions: [], evidence: 'official-diagram-derived', source_coordinates: origin,
        source_url: `https://transfer-cloud.navitime.biz/bochobus/courses?busstop=${stop}`,
        guide_url: loop ? 'https://www.city.hagi.lg.jp/soshiki/49/1658.html' : 'https://www.bochobus.co.jp/pages/65/',
        guide_label: loop ? '萩市の循環バス案内' : '防長交通の路線別時刻表',
      } },
    });
    const gap = loop ? null : pole === '000000003123' ? 46.9 : 57.2;
    return attachBoardingWalks(guided, {
      version: 1, budget: 1000, snap_limit: 30, stops: { [id]: { origin, gap } },
    }, {});
  });
  return [...stops, ...additions];
}

export function hagiHallCandidate(id: string, coordinate: Coordinate, facilities: ShoppingFeature[]): EntranceCandidate | null {
  if (!enabled) return null;
  const route = routes.find(item => item.id === id && item.origin.every((value, i) => value === coordinate[i]));
  if (!route) return null;
  const facility = facilities.find(item => String(item.id) === source.facilityId);
  if (!facility || !facilityAvailable(facility)) return null;
  const group = categoryOf(facility).group;
  if (!group) return null;
  const end = route.points.at(-1)!;
  const entranceRoute: EntranceRoute = {
    label: source.entrance, endLabel: source.entrance, points: route.points,
    meters: route.meters, startMeters: 0, scope: 'entrance', provisional: false,
    note: `${route.note}図上約${Math.round(route.meters)}m。`,
  };
  return { facility, group, meters: route.meters, roadPoint: end, facilityPoint: end, gap: 0, entranceRoute };
}
