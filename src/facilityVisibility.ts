import type { ShoppingFeature } from './types';
import type { ShoppingCategory } from './shoppingData';

export interface WalkFacilities { scope: string; ids: string[] }

export function mapFacilities(features: ShoppingFeature[], categories: ShoppingCategory[], selectedFacility: ShoppingFeature | null, scope: string, walking: WalkFacilities | null): ShoppingFeature[] {
  const ids = new Set(scope && walking?.scope === scope ? walking.ids : []);
  const visible = features.filter(f => ids.has(String(f.id)) && f.properties.category !== 'reference' && categories.includes(f.properties.category || 'mall'));
  if (selectedFacility && !visible.some(f => String(f.id) === String(selectedFacility.id))) visible.push(selectedFacility);
  return visible;
}
