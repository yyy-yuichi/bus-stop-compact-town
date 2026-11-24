import { publicEvidenceUrl } from './facilityAudit.ts';
import { SHOPPING_CATEGORIES, type ShoppingCategory } from './facilityCatalog.ts';
import type { ShoppingFeature } from './types';

type FacilityGroup = { representative: string; kind: 'duplicate' | 'site' };
export interface FacilityPresentation {
  originalName: string;
  note: string;
  sources: { title: string; url: string }[];
  category?: ShoppingCategory;
  group?: FacilityGroup;
  related?: { id: string; name: string };
  excludeWalking?: true;
}

type Entry = {
  id: string;
  expected: Pick<ShoppingFeature['properties'], 'name' | 'category' | 'source_ids'> & { geometry: ShoppingFeature['geometry'] };
  name: string;
  aliases?: string;
} & Pick<FacilityPresentation, 'note' | 'sources' | 'category' | 'group' | 'excludeWalking'>;

const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Apply reviewed labels after the original records and earlier reviews have been checked. */
export function applyFacilityPresentation(facilities: ShoppingFeature[], release: unknown): ShoppingFeature[] {
  const entries = (release as { presentation?: Entry[] })?.presentation;
  if (entries === undefined) return facilities;
  if (!Array.isArray(entries)) throw Error('Invalid facility presentation');
  const byId = new Map(facilities.map(f => [String(f.id), f]));
  const rows = new Map<string, Entry>();
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    const original = byId.get(entry?.id), e = entry?.expected;
    if (!original || !e || rows.has(entry.id) || original.properties.duplicate_of || original.properties.release_presentation ||
        original.properties.name !== e.name || original.properties.category !== e.category ||
        !equal(original.properties.source_ids, e.source_ids) || !equal(original.geometry, e.geometry)) {
      throw Error(`Facility presentation source drift or overlap: ${entry?.id}`);
    }
    if (!text(entry.name) || !text(entry.note) || (entry.aliases !== undefined && !text(entry.aliases)) ||
        (entry.category !== undefined && !SHOPPING_CATEGORIES.some(c => c.id === entry.category)) ||
        (entry.excludeWalking !== undefined && entry.excludeWalking !== true) ||
        !Array.isArray(entry.sources) || !entry.sources.length ||
        entry.sources.some(s => !s || !text(s.title) || !publicEvidenceUrl(s.url))) throw Error(`Invalid facility presentation: ${entry.id}`);
    if (entry.group !== undefined) {
      const group = entry.group;
      if (!group || !text(group.representative) || !['duplicate', 'site'].includes(group.kind)) throw Error('Invalid facility group');
      const members = groups.get(group.representative) ?? [];
      members.push(entry);
      groups.set(group.representative, members);
    }
    rows.set(entry.id, entry);
  }
  for (const [id, members] of groups) {
    if (members.length !== 2 || !members.some(m => m.id === id) ||
        !members.every(m => m.group?.kind === members[0].group?.kind) ||
        (members[0].group?.kind === 'duplicate' && members[0].name !== members[1].name)) throw Error(`Invalid facility group: ${id}`);
  }
  return facilities.map(facility => {
    const row = rows.get(String(facility.id));
    if (!row) return facility;
    const original = facility.properties;
    const other = row.group && groups.get(row.group.representative)?.find(m => m.id !== row.id);
    const related = other && { id: other.id, name: other.name };
    const searchNames = [original.search_names, original.name, row.aliases].filter(Boolean).join(' ');
    return { ...facility, properties: {
      ...original, name: row.name, search_names: searchNames,
      release_presentation: { originalName: original.name, note: row.note, sources: structuredClone(row.sources),
        category: row.category, group: row.group && { ...row.group }, related, excludeWalking: row.excludeWalking },
    } };
  });
}

/** A specific hall query can select that hall; broad queries show one result for the site. */
export function distinctFacilitySearchResults(matches: ShoppingFeature[]): ShoppingFeature[] {
  const ids = new Set(matches.map(f => String(f.id)));
  return matches.filter(f => {
    const representative = f.properties.release_presentation?.group?.representative;
    return !representative || representative === String(f.id) || !ids.has(representative);
  });
}
