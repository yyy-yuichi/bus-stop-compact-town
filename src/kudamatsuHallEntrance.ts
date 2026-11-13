import source from './data/kudamatsu-hall-entrance.json';
import walkUrl from './data/kudamatsu-hall-walk.json?url';
import { attachBoardingGuides } from './boardingGuide';
import { attachBoardingWalks } from './boardingWalking';
import type { Coordinate } from './bakedWalking';
import type { EntranceCandidate, EntranceRoute } from './entranceRouteStudy';
import { categoryOf } from './facilityCatalog';
import { facilityAvailable } from './facilityFreshness';
import type { BusFeature, ShoppingFeature } from './types';

const enabled = import.meta.env.VITE_KUDAMATSU_HALL === '1';
const operatorStop = '00450204';
const name = '下松市役所前';
const { stopId } = source;
const points = source.points as Coordinate[];
const origin = points[0];

export function addKudamatsuPlatform(stops: BusFeature[]): BusFeature[] {
  if (!enabled) return stops;
  if (stops.some(stop => String(stop.id) === stopId)) throw Error('Duplicate Kudamatsu platform');
  const feature: BusFeature = {
    type: 'Feature', id: stopId,
    geometry: { type: 'Point', coordinates: origin },
    properties: { name, operator: '防長交通', source_kind: 'boarding-study', location_kind: 'official-source' },
  };
  const guided = attachBoardingGuides([feature], {
    version: 1, hub_points: [],
    guides: { [stopId]: {
      stop_name: name, group_id: `bocho:${operatorStop}`, number: '2', role: 'boarding',
      summary: '熊毛・東陽小学校前・下松高校入口方面。庁舎側の歩道に降車位置を図上で設定。',
      directions: [], evidence: 'official-diagram-derived', source_coordinates: origin,
      source_url: `https://transfer-cloud.navitime.biz/bochobus/courses?busstop=${operatorStop}`,
      guide_url: 'https://www.bochobus.co.jp/pages/295?b_id=3440&detail=1&r_id=2022',
      guide_label: '防長交通の時刻表・乗り場案内',
    } },
  });
  const file = stopId.replaceAll(':', '-') + '.json';
  return [...stops, ...attachBoardingWalks(guided, {
    version: 1, budget: 1000, snap_limit: 30, stops: { [stopId]: { origin, file } },
  }, { [file]: walkUrl })];
}

export function kudamatsuHallCandidate(id: string, coordinate: Coordinate, facilities: ShoppingFeature[]): EntranceCandidate | null {
  if (!enabled || id !== stopId || !origin.every((value, i) => value === coordinate[i])) return null;
  const facility = facilities.find(item => String(item.id) === source.facilityId);
  if (!facility || !facilityAvailable(facility)) return null;
  const group = categoryOf(facility).group;
  if (!group) return null;
  const end = points.at(-1)!;
  const entranceRoute: EntranceRoute = {
    label: source.entrance, endLabel: source.entrance, points,
    meters: source.meters, startMeters: 0, scope: 'entrance', provisional: false,
    note: `②の庁舎側歩道から敷地内の通路を通り、正面玄関へ。図上約${Math.round(source.meters)}m。`,
  };
  return { facility, group, meters: source.meters, roadPoint: end, facilityPoint: end, gap: 0, entranceRoute };
}
