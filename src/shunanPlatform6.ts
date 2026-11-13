import platform6 from './data/shunan-platform6-route.json';
import walkUrl6 from './data/shunan-platform6-walk.json?url';
import platform1 from './data/shunan-platform1-route.json';
import walkUrl1 from './data/shunan-platform1-walk.json?url';
import { attachBoardingGuides } from './boardingGuide';
import { attachBoardingWalks } from './boardingWalking';
import type { Coordinate } from './bakedWalking';
import type { EntranceCandidate, EntranceRoute } from './entranceRouteStudy';
import { categoryOf } from './facilityCatalog';
import { facilityAvailable } from './facilityFreshness';
import type { BusFeature, ShoppingFeature } from './types';

const name = '周南市役所前';
const platforms = [
  { enabled: import.meta.env.VITE_SHUNAN_PLATFORM6 === '1', operatorStop: '00450003', number: '6',
    source: platform6, walkUrl: walkUrl6, summary: '徳山駅から国道2号・バイパス方面。岐山通の市役所側。',
    note: '6番のりばから岐山通の庁舎側歩道を北へ進み、北入口へ。図上約87m。' },
  { enabled: import.meta.env.VITE_SHUNAN_PLATFORM1 === '1', operatorStop: '00450004', number: '1',
    source: platform1, walkUrl: walkUrl1, summary: '新南陽方面から徳山駅方面。県道下松新南陽線の市役所側。',
    note: '1番のりばから横断歩道で庁舎西側の市道を渡り、西側・北側の歩道を回って北入口へ。図上約290m。' },
].filter(platform => platform.enabled).map(platform => ({
  ...platform, stopId: `bocho:${platform.operatorStop}-${platform.source.stop.platformId}`,
  origin: platform.source.stop.coordinate as Coordinate,
}));

export function addShunanPlatforms(stops: BusFeature[]): BusFeature[] {
  if (!platforms.length) return stops;
  return [...stops, ...platforms.flatMap(platform => {
    if (stops.some(stop => String(stop.id) === platform.stopId)) throw Error('Duplicate Shunan platform');
    return makePlatform(platform);
  })];
}

function makePlatform({ stopId, origin, operatorStop, number, walkUrl, summary }: typeof platforms[number]): BusFeature[] {
  const feature: BusFeature = {
    type: 'Feature', id: stopId,
    geometry: { type: 'Point', coordinates: origin },
    properties: { name, operator: '防長交通', source_kind: 'boarding-study', location_kind: 'official-source' },
  };
  const guided = attachBoardingGuides([feature], {
    version: 1, hub_points: [],
    guides: { [stopId]: {
      stop_name: name, group_id: `bocho:${operatorStop}`, number, role: 'boarding', summary,
      directions: [], evidence: 'official-platform-coordinate', source_coordinates: origin,
      source_url: `https://transfer-cloud.navitime.biz/bochobus/courses?busstop=${operatorStop}`,
      guide_url: 'https://www.bochobus.co.jp/files/libs/8184/202512121929199411.pdf',
      guide_label: '防長交通の乗り場案内図',
    } },
  });
  const file = stopId.replaceAll(':', '-') + '.json';
  return attachBoardingWalks(guided, {
    version: 1, budget: 1000, snap_limit: 30, stops: { [stopId]: { origin, file } },
  }, { [file]: walkUrl });
}

export function shunanEntranceCandidate(id: string, coordinate: Coordinate, facilities: ShoppingFeature[]): EntranceCandidate | null {
  const platform = platforms.find(({ stopId, origin }) => id === stopId && origin.every((value, i) => coordinate[i] === value));
  if (!platform) return null;
  const { source, note } = platform;
  const facility = facilities.find(feature => String(feature.id) === source.facility.id);
  if (!facility || !facilityAvailable(facility)) return null;
  const group = categoryOf(facility).group;
  if (!group) return null;
  const points = source.geometry.coordinates as Coordinate[];
  const end = points.at(-1)!;
  const entranceRoute: EntranceRoute = {
    label: source.facility.entrance, endLabel: source.facility.entrance,
    points, meters: source.meters, startMeters: 0, scope: 'entrance', provisional: false,
    note,
  };
  return { facility, group, meters: source.meters, roadPoint: end, facilityPoint: end, gap: 0, entranceRoute };
}
