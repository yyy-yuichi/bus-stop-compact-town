import type { BusCollection, BusFeature } from './types';
import type { FeatureCollection, Point } from 'geojson';

// Individual boarding locations are independent records. Never infer them from
// the national representative point or attach an OSM point by proximity alone.
export interface BoardingPoint {
  id: string;
  stop_area_id: string;
  name: string;
  coordinates: [number, number];
  direction: string | null;
  source_url: string;
  source_id: string;
  license: string;
  verified_at: string;
}


interface MunicipalProperties {
  name: string; source_namespace: 'hikari' | 'iwakuni'; source_stop_id: string;
  route_ids: string[]; source_url: string; source_date: string; license: string;
  publication_status: string; stale_route_warning: boolean;
}
export type MunicipalCollection = FeatureCollection<Point, MunicipalProperties>;
export type MunicipalRoute = { id: string; name: string };

/** Keep the city's source IDs and coordinates separate from national origins. */
export function municipalCatalog(data: MunicipalCollection, routes: MunicipalRoute[]): BusFeature[] {
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length || !Array.isArray(routes)) throw Error('Invalid municipal collection');
  const routeNames = new Map(routes.map(r => [r.id, r.name]));
  const ids = new Set<string>();
  return data.features.map(f => {
    const p = f.properties;
    const id = String(f.id ?? '');
    if (!/^(hikari|iwakuni):[a-zA-Z0-9_.-]{1,100}$/.test(id) || ids.has(id) ||
      id !== `${p.source_namespace}:${p.source_stop_id}` || p.publication_status !== 'ready-as-separate-source-layer' ||
      p.stale_route_warning || p.license !== 'CC-BY-4.0' || !p.name ||
      !Array.isArray(p.route_ids) || p.route_ids.some(routeId => !routeNames.has(routeId)) ||
      f.geometry?.type !== 'Point' || f.geometry.coordinates.length !== 2 || !f.geometry.coordinates.every(Number.isFinite) ||
      Math.abs(f.geometry.coordinates[0]) > 180 || Math.abs(f.geometry.coordinates[1]) > 90) throw Error('Invalid municipal stop');
    ids.add(id);
    return { ...f, properties: { ...p, source_kind: 'municipal', location_kind: 'official-source',
      city: p.source_namespace === 'hikari' ? '光市' : '岩国市', routes: p.route_ids.map(routeId => routeNames.get(routeId)!) } };
  });
}

/** Nearby origins are navigation choices, never a catchment for this city point. */
export function nearbyNationalStops(origin: BusFeature, stops: BusFeature[], unreachable: Record<string, number | null> | null, maxMeters = 300) {
  const radians = Math.PI / 180;
  const [lon, lat] = origin.geometry.coordinates;
  const seen = new Set<string>();
  return stops.filter(stop => stop.properties.source_kind === 'national').map(stop => {
    const [x, y] = stop.geometry.coordinates;
    const a = Math.sin((y - lat) * radians / 2) ** 2 + Math.cos(lat * radians) * Math.cos(y * radians) * Math.sin((x - lon) * radians / 2) ** 2;
    return { stop, meters: 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))), catchmentId: nationalCatchmentId(stop) };
  }).filter(({ meters, catchmentId }) => meters <= maxMeters && !Object.hasOwn(unreachable ?? {}, catchmentId))
    .sort((a, b) => a.meters - b.meters || String(a.stop.id).localeCompare(String(b.stop.id)))
    .filter(({ catchmentId }) => { if (seen.has(catchmentId)) return false; seen.add(catchmentId); return true; }).slice(0, 3);
}

/** Same P11-22_35 source coordinates as the bake; this is not an OSM proximity join.
 * Keep every original-row ID in the map. Coincident source rows share a catchment.
 */
export function nationalCatchmentId(stop: BusFeature): string {
  if (stop.properties.source_kind !== 'national' || stop.properties.source_year !== 2022 ||
      !/^mlit-p11-22-35:\d+$/.test(String(stop.id)) || stop.geometry.type !== 'Point' ||
      stop.geometry.coordinates.length !== 2 || !stop.geometry.coordinates.every(Number.isFinite)) throw Error('Invalid national origin');
  const [lon, lat] = stop.geometry.coordinates;
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) throw Error('Invalid national coordinate');
  return `${Number(lon.toFixed(5))}_${Number(lat.toFixed(5))}`;
}

export function nationalCatalog(data: BusCollection): BusCollection {
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length) throw Error('Invalid national collection');
  const ids = new Set<string>();
  const features: BusFeature[] = data.features.map(f => {
    const id = String(f.id ?? '');
    if (!/^mlit-p11-22-35:\d+$/.test(id) || ids.has(id) || f.properties.source_year !== 2022 ||
      f.geometry?.type !== 'Point' || f.geometry.coordinates.length !== 2 || !f.geometry.coordinates.every(Number.isFinite)) throw Error('Invalid national stop');
    ids.add(id);
    return { ...f, properties: { ...f.properties, stop_area_id: id, location_kind: 'representative', source_kind: 'national' } };
  });
  return { ...data, features, timestamp: '2022年度版（概ね2022年8月時点）' };
}

export function pilotCatalog(data: BusCollection, ids: string[]): BusCollection {
  const source = new Map(data.features.map(f => [String(f.id || f.properties['@id']), f]));
  const features = ids.map(id => source.get(id));
  if (new Set(ids).size !== ids.length || features.some(f => !f)) throw Error('Missing pilot stops');
  return { ...data, features: (features as BusFeature[]).map(f => ({ ...f, properties: { ...f.properties, source_kind: 'osm-pilot', location_kind: 'unverified' } })) };
}
