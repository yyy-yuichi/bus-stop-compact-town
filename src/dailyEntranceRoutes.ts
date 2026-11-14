import source from './data/daily-entrance-routes.json';
import { distance, type Coordinate } from './bakedWalking';
import type { EntranceCandidate } from './entranceRouteStudy';
import { categoryOf } from './facilityCatalog';
import { facilityAvailable } from './facilityFreshness';
import { attachBoardingGuides } from './boardingGuide';
import { attachBoardingWalks } from './boardingWalking';
import type { BusFeature, ShoppingFeature } from './types';

const hikariId = 'bocho:00450261-000000000617';
const enabled = import.meta.env.VITE_DAILY_ENTRANCE_ROUTES === '1';

export function addDailyEntrancePlatforms(stops: BusFeature[]): BusFeature[] {
  if (!enabled || stops.some(stop => stop.id === hikariId)) return stops;
  const route = source.routes.find(item => item.originId === hikariId);
  if (!route) return stops;
  const origin = route.points[0] as Coordinate;
  const platform: BusFeature = {
    type: 'Feature', id: hikariId, geometry: { type: 'Point', coordinates: origin },
    properties: { name: '光駅', operator: '防長交通', source_kind: 'boarding-study', location_kind: 'official-source' },
  };
  const guided = attachBoardingGuides([platform], {
    version: 1, hub_points: [],
    guides: { [hikariId]: {
      stop_name: '光駅（防長交通・柳井方面）', group_id: 'bocho:00450261', number: null, role: 'boarding',
      summary: '柳井方面の途中停車便で降りる、南口ロータリーの駅舎側です。',
      directions: [], evidence: 'official-diagram-derived', source_coordinates: origin,
      source_url: 'https://transfer-cloud.navitime.biz/bochobus/courses?busstop=00450261',
      guide_url: 'https://www.city.hikari.lg.jp/soshiki/11/kokyokotsu/1/1/9452.html',
      guide_label: '光市の路線バス案内',
    } },
  });
  return [...stops, ...attachBoardingWalks(guided, {
    version: 1, budget: 1000, snap_limit: 30, stops: { [hikariId]: { origin, gap: null } },
  }, {})];
}

export function dailyEntranceCandidate(id: string, origin: Coordinate, facilities: ShoppingFeature[]): EntranceCandidate | null {
  if (!enabled) return null;
  const route = source.routes.find(item => item.originId === id);
  if (!route) return null;
  const points = route.points as Coordinate[];
  if (!points[0].every((value, i) => value === origin[i])) return null;
  const facility = facilities.find(item => String(item.id) === route.facilityId);
  if (!facility || !facilityAvailable(facility)) return null;
  const group = categoryOf(facility).group;
  if (!group) return null;
  const segmentCosts = points.slice(1).map((point, i) =>
    distance(points[i], point) * Math.exp(3.5 * Math.abs((route.gradesPercent?.[i] ?? 0) / 100)));
  const meters = segmentCosts.reduce((total, cost) => total + cost, 0);
  const end = points[points.length - 1];
  return {
    facility, group, meters, roadPoint: end, facilityPoint: end, gap: 0,
    entranceRoute: {
      label: route.entrance, endLabel: route.entrance, points, meters, startMeters: 0,
      scope: 'entrance', provisional: false, note: route.note,
      ...(route.gradesPercent ? { segmentCosts } : {}),
    },
  };
}
