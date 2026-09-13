import type { ShoppingFeature } from './types';
import type { ShoppingCategory } from './shoppingData';

export interface WalkFacilities { scope: string; ids: string[] }

export function mapFacilities(features: ShoppingFeature[], categories: ShoppingCategory[], selectedFacility: ShoppingFeature | null, scope: string, walking: WalkFacilities | null): ShoppingFeature[] {
  if (selectedFacility) return [selectedFacility];
  if (!scope || walking?.scope !== scope) return [];
  const ids = new Set(walking.ids);
  return features.filter(f => ids.has(String(f.id)) && f.properties.category !== 'reference' && categories.includes(f.properties.category || 'mall'));
}
