import type { ShoppingFeature } from './types';
import { facilityAvailable } from './facilityFreshness.ts';
import { guideExcludesOriginal } from './facilityGuidance.ts';

/** An explicit review of the original geometry, independent of identity evidence. */
export interface FacilityMapLocation {
  status: 'unverified' | 'different_from_current';
  note: string;
  /** A separately evidenced point; never replaces or routes from the original geometry. */
  current_location?: {
    point_role?: 'operator_designated_destination';
    coordinates: [number, number];
    source: {
      title: string;
      url: string;
      as_of?: string;
      published_at?: string;
      retrieved_at?: string;
    };
    distance_from_original_m?: number;
  };
}

export const mapLocationLabel = (location?: FacilityMapLocation): string => !location ? '' :
  location.status === 'different_from_current' ? '地図の位置は未確認（現施設点と異なります）' : '地図の位置は未確認';

export const hasMapLocationIssue = (facility: ShoppingFeature): boolean =>
  ['unverified', 'different_from_current'].includes(facility.properties.audit_review?.map_location?.status ?? '');

/** Legacy records keep their existing eligibility; no inference from status or distance. */
export const isFacilityWalkingCandidate = (facility: ShoppingFeature): boolean => {
  if (!facilityAvailable(facility) || guideExcludesOriginal(facility) || ['hold', 'reference'].includes(facility.properties.guide_review?.decision ?? '')) return false;
  if (facility.properties.guide_review?.decision === 'ready') return facility.properties.guide_review.location === 'original_supported';
  return !hasMapLocationIssue(facility);
};

export const mapLocationExclusionNote = '地図の位置が未確認・現施設点と異なる記録は、施設数と時間・距離の案内から除外しています。施設検索で確認できます。';
