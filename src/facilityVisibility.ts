import { distinctVisitCandidates } from './facilityGuidance.ts';
import type { ShoppingFeature } from './types';
import type { ShoppingCategory } from './shoppingData';
import { isFacilityWalkingCandidate } from './facilityMapLocation.ts';
import { categoryOf } from './facilityCatalog.ts';

export interface WalkFacilities { scope: string; ids: string[] }

export function mapFacilities(features: ShoppingFeature[], categories: ShoppingCategory[], selectedFacility: ShoppingFeature | null, scope: string, walking: WalkFacilities | null): ShoppingFeature[] {
  const ids = new Set(scope && walking?.scope === scope ? walking.ids : []);
  const visible = distinctVisitCandidates(features.filter(f => isFacilityWalkingCandidate(f) && ids.has(String(f.id)) && categoryOf(f).id !== 'reference' && categories.includes(categoryOf(f).id)), f => f);
  if (selectedFacility && !visible.some(f => String(f.id) === String(selectedFacility.id))) visible.push(selectedFacility);
  return visible;
}
