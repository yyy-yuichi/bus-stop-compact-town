import source from './data/hikari-hall-entrance.json';
import schoolWalk from './data/hikari-hall-00450266-000000003683-walk.json?url';
import { attachBoardingGuides } from './boardingGuide';
import { attachBoardingWalks } from './boardingWalking';
import type { Coordinate } from './bakedWalking';
import type { EntranceCandidate, EntranceRoute } from './entranceRouteStudy';
import { categoryOf } from './facilityCatalog';
import { facilityAvailable } from './facilityFreshness';
import type { BusFeature, ShoppingFeature } from './types';

const enabled = import.meta.env.VITE_HIKARI_HALL === '1';
const name = '光市役所前';
const operatorStop = '00450266';
const ordinaryWalk = {
  'bocho:00450266-000000000628': { gap: 46.6 },
  'bocho:00450266-000000000629': { gap: 47.7 },
  'bocho:00450266-000000003683': { url: schoolWalk },
};
const destinations: Record<keyof typeof ordinaryWalk, string> = {
  'bocho:00450266-000000000628': '徳山駅・光駅・光総合病院行き',
  'bocho:00450266-000000000629': '柳井駅・室積公園口行き',
  'bocho:00450266-000000003683': '光高校下経由の柳井駅・室積公園口行き、光高校下行き',
};
const routes = source.routes.map(route => ({
  ...route,
  origin: (route.id.startsWith('hikari:') ? route.operatorCoordinate : route.points[0]) as Coordinate,
}));

export function addHikariPlatforms(stops: BusFeature[]): BusFeature[] {
  if (!enabled) return stops;
  const municipal = stops.map(stop => {
    const guide = stop.properties.boarding_guide;
    if (stop.id !== 'hikari:14_03' || !guide?.roadside_review) return stop;
    return { ...stop, properties: { ...stop.properties, boarding_guide: {
      ...guide, roadside_review: { ...guide.roadside_review,
        walking_notice: 'ぐるりんバス右回りの降車地点から市役所正面玄関まで案内します。周辺施設の徒歩圏は未計算です。',
      },
    } } };
  });
  return [...municipal, ...routes.filter(route => route.id.startsWith('bocho:')).flatMap(({ id, direction, origin }) => {
    if (stops.some(stop => String(stop.id) === id)) throw Error('Duplicate Hikari platform');
    const feature: BusFeature = {
      type: 'Feature', id,
      geometry: { type: 'Point', coordinates: origin },
      properties: { name, operator: '防長交通', source_kind: 'boarding-study', location_kind: 'official-source' },
    };
    const key = id as keyof typeof ordinaryWalk;
    const guided = attachBoardingGuides([feature], {
      version: 1, hub_points: [],
      guides: { [id]: {
        stop_name: `${name}（${direction}）`,
        group_id: `bocho:${operatorStop}`, number: null, role: 'boarding',
        summary: `${destinations[key]}。降車後の歩行起点を歩道上に図上で設定。`,
        directions: [], evidence: 'official-diagram-derived', source_coordinates: origin,
        source_url: `https://transfer-cloud.navitime.biz/bochobus/courses?busstop=${operatorStop}`,
        guide_url: 'https://www.city.hikari.lg.jp/soshiki/11/kokyokotsu/1/1/9452.html',
        guide_label: '光市の路線バス案内',
      } },
    });
    const file = id.replaceAll(':', '-') + '.json';
    const walk = ordinaryWalk[key];
    const entry = 'url' in walk ? { origin, file } : { origin, gap: walk.gap };
    return attachBoardingWalks(guided, {
      version: 1, budget: 1000, snap_limit: 30, stops: { [id]: entry },
    }, 'url' in walk ? { [file]: walk.url } : {});
  })];
}

export function hikariHallCandidate(id: string, coordinate: Coordinate, facilities: ShoppingFeature[]): EntranceCandidate | null {
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
    note: `${route.note}図上約${Math.round(route.meters)}m。`,
  };
  return { facility, group, meters: route.meters, roadPoint: end, facilityPoint: end, gap: 0, entranceRoute };
}
