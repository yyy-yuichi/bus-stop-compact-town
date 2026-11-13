import type { ShoppingFeature } from './types.ts';
import { applyFacilityCurrent } from './facilityFreshness.ts';
import { validateRegistryReview } from './facilityRegistry.ts';

type ReleaseAdditions = {
  schema_version: number;
  checked_at: string;
  civic: ShoppingFeature[];
  stores: ShoppingFeature[];
};

export function applyReleaseFacilityAdditions(
  raw: ShoppingFeature[], current: unknown, value: unknown,
): ShoppingFeature[] {
  const additions = value as ReleaseAdditions;
  const reviews = current as { checked_at?: string; additions?: ShoppingFeature[] } | null;
  if (additions?.schema_version !== 1 || typeof additions.checked_at !== 'string' ||
      !Array.isArray(additions.civic) || !Array.isArray(additions.stores) ||
      typeof reviews?.checked_at !== 'string' || additions.checked_at < reviews.checked_at ||
      !Array.isArray(reviews.additions)) throw Error('Invalid release facility data');

  const sourceIds = new Set(raw.flatMap(f => f.properties.source_ids));
  for (const feature of additions.civic) {
    const p = feature?.properties;
    const r = p?.registry_review;
    const coords = feature?.geometry?.type === 'Point' ? feature.geometry.coordinates : [];
    const medical = p?.verification_status === 'medical_register_listing' &&
      r?.scope === 'medical_register' && ['hospital', 'clinic'].includes(p.category ?? '');
    const civic = p?.verification_status === 'public_register_listing' &&
      r?.scope === 'public_facility_directory' && p.category === 'townhall';
    if (feature?.type !== 'Feature' || typeof feature.id !== 'string' ||
        !/^official-[a-z0-9-]+$/.test(feature.id) || (!medical && !civic) ||
        !p?.city?.trim() || !p.name?.trim() || !p.official_address?.trim() ||
        p.geometry_kind !== 'representative_point' || coords.length !== 2 ||
        !coords.every(Number.isFinite) || coords[0] < 130 || coords[0] > 133 ||
        coords[1] < 33 || coords[1] > 35 || p.duplicate_of !== undefined ||
        !Array.isArray(p.source_ids) || !p.source_ids.length ||
        new Set(p.source_ids).size !== p.source_ids.length ||
        p.source_ids.some(id => !/^official:[a-z0-9:-]+$/.test(id) || sourceIds.has(id)) ||
        !p.location_verification?.trim() || !p.visitor_note?.label || !p.visitor_note.note) {
      throw Error('Invalid civic release addition');
    }
    validateRegistryReview(r!, additions.checked_at);
    if (p.name !== r!.official_name || p.official_address !== r!.official_address ||
        p.verified_at !== r!.checked_at || !r!.sources.some(s => s.url === p.official_url)) {
      throw Error('Civic release addition disagrees with registry evidence');
    }
    p.source_ids.forEach(id => sourceIds.add(id));
  }

  return applyFacilityCurrent([...raw, ...additions.civic], {
    ...reviews,
    checked_at: additions.checked_at,
    additions: [...reviews.additions, ...additions.stores],
  });
}
