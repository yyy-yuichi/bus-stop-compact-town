import type { Feature, FeatureCollection, Point, MultiPolygon } from 'geojson';

export type LoadState = 'loading' | 'ready' | 'error';
export interface BusProperties {
  name?: string;
  'name:ja'?: string;
  '@id'?: string;
  names?: string[];
  operators?: string[];
  routes?: string[];
}
export type BusFeature = Feature<Point, BusProperties>;
export type BusCollection = FeatureCollection<Point, BusProperties> & { timestamp?: string };

export interface ShoppingProperties {
  name: string;
  city: string;
  official_address: string;
  official_url: string;
  geometry_kind: 'building' | 'facility_area' | 'representative_point';
  source_timestamp: string;
  source_ids: string[];
  verified_at: string;
  osm_name?: string;
  location_verification?: string;
  geometry_note?: string;
}
export type ShoppingFeature = Feature<Point | MultiPolygon, ShoppingProperties>;
export type ShoppingCollection = FeatureCollection<Point | MultiPolygon, ShoppingProperties>;
