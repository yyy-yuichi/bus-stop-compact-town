import { categoryOf, FACILITY_GROUPS } from './facilityCatalog.ts';
import { detailText } from './facilityDetails.ts';
import { facilityAvailable } from './facilityFreshness.ts';
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
  const boardingSearch = stops.some(stop => !!stop.properties.boarding_guide);
  const stopRank = (stop: BusFeature) => {
    if (!boardingSearch) return 0;
    const name = normalizeSearch(stop.properties.boarding_guide?.stop_name || stop.properties['name:ja'] || stop.properties.name || '').replace(/\s/g, '');
    const title = name + (stop.properties.boarding_guide?.number ? `${stop.properties.boarding_guide.number}のりば` : '');
    return (name === terms.join('') || title === terms.join('') ? 4 : terms.every(term => title.includes(term)) ? 2 : 0) + Number(!!stop.properties.boarding_guide);
  };
  return {
    facilities: facilities.filter(f => facilityAvailable(f) && matches([f.properties.name, f.properties.city, f.properties.official_address, f.properties.address, f.properties.search_names, categoryOf(f).name, FACILITY_GROUPS.find(g => g.id === categoryOf(f).group)?.name, ...(f.properties.registered_details?.brand ?? []), ...(f.properties.registered_details?.branch ?? []), ...(f.properties.registered_details?.cuisine ?? []).map(v => detailText('cuisine', v)), ...(f.properties.registered_details?.service ?? []).map(v => detailText('service', v))])),
    stops: stops.filter(f => matches([f.properties.boarding_guide?.stop_name, f.properties['name:ja'], f.properties.name, f.properties.operator, f.properties.city,
      f.properties.boarding_guide?.number ? `${f.properties.boarding_guide.number}のりば` : undefined,
      f.properties.boarding_guide?.summary])).sort((a, b) => stopRank(b) - stopRank(a)),
  };
}
