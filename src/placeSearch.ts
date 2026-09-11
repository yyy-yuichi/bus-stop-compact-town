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
    facilities: facilities.filter(f => matches([f.properties.name, f.properties.city, f.properties.official_address])),
    stops: stops.filter(f => matches([f.properties['name:ja'], f.properties.name, f.properties.operator])),
  };
}
