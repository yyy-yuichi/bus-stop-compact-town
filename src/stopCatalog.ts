import type { BusCollection, BusFeature } from './types';

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

export const NATIONAL_ATTRIBUTION = '<a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P11-2022.html">国土数値情報・バス停留所2022</a>を加工 / <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>';

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
