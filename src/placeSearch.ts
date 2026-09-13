import { categoryOf, FACILITY_GROUPS } from './facilityCatalog.ts';
import { detailText } from './facilityDetails.ts';
import type { BusFeature, ShoppingFeature } from './types';

export function normalizeSearch(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, character => String.fromCharCode(character.charCodeAt(0) - 0x60));
}

export function searchPlaces(query: string, stops: BusFeature[], facilities: ShoppingFeature[]) {
  const terms = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
  const matches = (parts: (string | undefined)[]) => {
    const text = normalizeSearch(parts.filter(Boolean).join(' ')).replace(/\s/g, '');
    return terms.length > 0 && terms.every(term => text.includes(term));
  };
  return {
    facilities: facilities.filter(f => matches([f.properties.name, f.properties.city, f.properties.official_address, f.properties.address, f.properties.search_names, categoryOf(f).name, FACILITY_GROUPS.find(g => g.id === categoryOf(f).group)?.name, ...(f.properties.registered_details?.brand ?? []), ...(f.properties.registered_details?.branch ?? []), ...(f.properties.registered_details?.cuisine ?? []).map(v => detailText('cuisine', v)), ...(f.properties.registered_details?.service ?? []).map(v => detailText('service', v))])),
    stops: stops.filter(f => matches([f.properties['name:ja'], f.properties.name, f.properties.operator, f.properties.city])),
  };
}
