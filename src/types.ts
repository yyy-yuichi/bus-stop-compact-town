import type { Feature, FeatureCollection, Point, MultiPolygon } from 'geojson';

export type LoadState = 'loading' | 'ready' | 'error';
export interface BusProperties {
  name?: string;
  'name:ja'?: string;
  '@id'?: string;
  operator?: string;
  source_kind?: 'national' | 'municipal' | 'osm-pilot';
  source_year?: number;
  source_url?: string;
  source_namespace?: 'hikari' | 'iwakuni';
  source_stop_id?: string;
  source_date?: string;
  city?: string;
  routes?: string[];
  stop_area_id?: string;
  location_kind?: 'representative' | 'official-source' | 'unverified';
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
  category?: 'mall' | 'supermarket' | 'drugstore' | 'convenience' | 'pharmacy' | 'hospital' | 'clinic' | 'post_office' | 'bank' | 'library' | 'townhall' | 'community_centre' | 'reference';
  classification_review?: {
    checked_at: string;
    status: 'corrected' | 'out_of_scope' | 'pending' | 'retained';
    original_category: string;
    note: string;
    evidence_url?: string;
  };
  address?: string;
  website?: string;
  search_names?: string;
  verification_status?: string;
  retrieved_at?: string;
  license?: string;
  source?: string;
}
export type ShoppingFeature = Feature<Point | MultiPolygon, ShoppingProperties>;
export type ShoppingCollection = FeatureCollection<Point | MultiPolygon, ShoppingProperties>;
