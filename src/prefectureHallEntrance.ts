import data from './data/prefecture-hall-routes.json';
import { attachBoardingGuides } from './boardingGuide';
import { attachBoardingWalks } from './boardingWalking';
import type { Coordinate } from './bakedWalking';
import type { EntranceCandidate } from './entranceRouteStudy';
import { categoryOf } from './facilityCatalog';
import { facilityAvailable } from './facilityFreshness';
import type { BusFeature, ShoppingFeature } from './types';

const enabled = import.meta.env.VITE_PREFECTURE_HALLS === '1';
const routes = data.map(route => ({ ...route, points: route.points as Coordinate[] }));
const routesById = new Map(routes.map(route => [route.id, route]));

export function addPrefectureHallPlatforms(stops: BusFeature[]): BusFeature[] {
  if (!enabled) return stops;
  const existing = new Set(stops.map(stop => String(stop.id)));
  const additions = routes.filter(route => !existing.has(route.id)).map(route => {
    const { id, group, name, direction, points, operator, sourceUrl, guideUrl } = route;
    const origin = points[0];
    const stop: BusFeature = {
      type: 'Feature', id, geometry: { type: 'Point', coordinates: origin },
      properties: { name, operator, source_kind: 'boarding-study', location_kind: 'official-source' },
    };
    const guided = attachBoardingGuides([stop], {
      version: 1, hub_points: [],
      guides: { [id]: {
        stop_name: `${name}（${direction}）`, group_id: group, number: null, role: route.role === 'alighting' ? 'alighting' : 'boarding',
        summary: '降車後の歩行起点を歩道上に図上で設定。', directions: [],
        evidence: 'official-diagram-derived', source_coordinates: origin,
        source_url: sourceUrl, guide_url: guideUrl, guide_label: '市役所の庁舎案内',
      } },
    });
    return attachBoardingWalks(guided, {
      version: 1, budget: 1000, snap_limit: 30, stops: { [id]: { origin, gap: null } },
    }, {})[0];
  });
  return [...stops, ...additions];
}

export function prefectureHallCandidate(id: string, origin: Coordinate, facilities: ShoppingFeature[]): EntranceCandidate | null {
  if (!enabled) return null;
  const route = routesById.get(id);
  if (!route) return null;
  const start = route.points[0];
  if (!start.every((value, i) => value === origin[i]) &&
      !route.officialOrigin.every((value, i) => Math.abs(value - origin[i]) < 0.000001)) return null;
  const facility = facilities.find(item => String(item.id) === route.facilityId);
  if (!facility || !facilityAvailable(facility)) return null;
  const group = categoryOf(facility).group;
  if (!group) return null;
  const end = route.points[route.points.length - 1];
  return { facility, group, meters: route.meters, roadPoint: end, facilityPoint: end, gap: 0, entranceRoute: {
    label: route.entrance, endLabel: route.entrance, points: route.points,
    meters: route.meters, startMeters: 0, scope: 'entrance', provisional: false,
    note: `${route.note}図上約${Math.round(route.meters)}m。`,
  } };
}
