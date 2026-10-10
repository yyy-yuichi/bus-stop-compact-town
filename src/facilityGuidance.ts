import type { ShoppingFeature } from './types';
import { facilityAvailable } from './facilityFreshness.ts';
import { publicEvidenceUrl } from './facilityAudit.ts';
import { SHOPPING_CATEGORIES, type ShoppingCategory } from './facilityCatalog.ts';

/** A scoped guide decision, separate from original imports and audit status. */
export interface ReferenceFacilityGroup {
  kind: 'original_registration' | 'facility_information';
  id: string;
  member_ids: string[];
  facility_count: 1;
  service_count?: 1;
  note: string;
}
export interface FacilityGuidanceReview {
  decision: 'ready' | 'exclude' | 'hold' | 'reference';
  checked_at: string;
  display: { type: string; place: string; use: string };
  scope: string;
  summary: string;
  location: 'original_supported' | 'old_point' | 'unconfirmed' | 'reference_only';
  sources: { title: string; url: string; scope: string; date_note: string }[];
  /** An inherited restriction with a saved packet locator; never a new positive facility identification. */
  record_basis?: {
    kind: 'inherited_restriction';
    original_id: string;
    packet_library_file_id: string;
    packet_sha256: string;
    json_pointer: string;
    statement: string;
  };
  /** Saved decisions remain distinct from newly read primary facility sources. */
  saved_basis?: {
    kind: 'saved_reference' | 'saved_bounded_guidance' | 'saved_point_exclusion';
    original_id: string;
    packet_library_file_id: string;
    packet_sha256: string;
    json_pointer: string;
    statement: string;
    records: { title: string; source_library_file_id: string; locator: string; quote: string; scope: string; date_note: string }[];
  };
  saved_visit_group?: {
    kind: 'saved_bounded_facility';
    id: string;
    member_ids: string[];
    facility_count: 1;
    note: string;
  };
  /** One supported representative; other original records remain outside walking counts. */
  saved_count_group?: {
    kind: 'saved_representative';
    id: string;
    member_ids: string[];
    facility_count: 1;
    primary_original_id: string;
    count_contribution: 0 | 1;
    note: string;
  };
  limits: string[];
  remaining: string[];
  next_source: { title: string; url?: string } | null;
  presentation_category?: ShoppingCategory;
  visit_purpose?: 'school_contact';
  exclusion_scope?: 'original_record' | 'registered_services' | 'original_location' | 'original_service' | 'named_facility_unit' | 'unsupported_current_use';
  excluded_unit?: string;
  affected_services?: string[];
  reference_group?: ReferenceFacilityGroup;
  shared_destination?: {
    kind: 'current_visit_destination' | 'scoped_park_place';
    id: string;
    expected: { name: string; category: string; source_ids: string[]; geometry: ShoppingFeature['geometry'] };
    source_url: string;
    note: string;
    display_name?: string;
  };
}
export interface FacilityGuidanceData {
  schema_version: 1;
  checked_at: string;
  reviews: {
    id: string;
    expected: { name: string; category: string; source_ids: string[]; services: string[]; geometry: ShoppingFeature['geometry'] };
    review: FacilityGuidanceReview;
  }[];
}
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const ringContains = (p: number[], ring: number[][]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};

export function applyFacilityGuidance(base: ShoppingFeature[], value: unknown): ShoppingFeature[] {
  const data = value as FacilityGuidanceData;
  if (!data || data.schema_version !== 1 || !date(data.checked_at) || !Array.isArray(data.reviews)) throw Error('Invalid facility guidance data');
  const byId = new Map(base.map(f => [String(f.id), f]));
  if (byId.size !== base.length) throw Error('Duplicate base facility ID');
  const reviews = new Map<string, FacilityGuidanceReview>();
  for (const item of data.reviews) {
    const f = byId.get(item?.id), e = item?.expected, r = item?.review;
    if (!f || !e || reviews.has(item.id) || f.properties.guide_review || f.properties.name !== e.name ||
        f.properties.category !== e.category || !same(f.properties.source_ids, e.source_ids) ||
        !same(f.properties.registered_details?.service ?? [], e.services) || !same(f.geometry, e.geometry)) throw Error(`Guidance source drift or duplicate: ${item?.id}`);
    if (!r || !['ready', 'exclude', 'hold', 'reference'].includes(r.decision) || !date(r.checked_at) || r.checked_at > data.checked_at ||
        !r.display || ![r.display.type, r.display.place, r.display.use, r.scope, r.summary].every(text) ||
        !['original_supported', 'old_point', 'unconfirmed', 'reference_only'].includes(r.location) ||
        !Array.isArray(r.sources) || (!r.sources.length && r.record_basis === undefined && r.saved_basis === undefined) || r.sources.some(s => !s || !text(s.title) || !publicEvidenceUrl(s.url) || !text(s.scope) || !text(s.date_note)) ||
        new Set(r.sources.map(s => s.url)).size !== r.sources.length ||
        !Array.isArray(r.limits) || !r.limits.length || !r.limits.every(text) || !Array.isArray(r.remaining) || !r.remaining.every(text) ||
        (r.next_source !== null && (!r.next_source || !text(r.next_source.title) || (r.next_source.url !== undefined && !publicEvidenceUrl(r.next_source.url)))) ||
        (r.presentation_category !== undefined && !SHOPPING_CATEGORIES.some(c => c.id === r.presentation_category))) throw Error(`Invalid scoped guidance: ${item.id}`);
    if (r.decision === 'ready' && (r.location !== 'original_supported' || r.remaining.length || r.next_source !== null || r.exclusion_scope !== undefined || r.affected_services !== undefined || r.excluded_unit !== undefined)) throw Error('Ready guidance needs supported original location');
    if (r.visit_purpose !== undefined && (r.visit_purpose !== 'school_contact' || r.decision !== 'ready' || r.location !== 'original_supported' || e.category !== 'school')) throw Error('School contact guidance needs a supported school record');
    if (r.decision === 'hold' && (r.location !== 'unconfirmed' || !r.remaining.length || r.exclusion_scope !== undefined || r.affected_services !== undefined || r.excluded_unit !== undefined)) throw Error('Held guidance needs a remaining check');
    if (r.decision === 'reference' && (!['reference_only', 'old_point'].includes(r.location) || r.remaining.length || r.next_source !== null || r.exclusion_scope !== undefined || r.affected_services !== undefined || r.excluded_unit !== undefined || r.presentation_category !== undefined)) throw Error('Reference guidance cannot assert walking eligibility or service exclusion');
    if (r.decision === 'exclude') {
      if (r.location !== 'old_point' || !['original_record', 'registered_services', 'original_location', 'original_service', 'named_facility_unit', 'unsupported_current_use'].includes(r.exclusion_scope ?? '') || r.remaining.length || r.next_source !== null) throw Error('Invalid original-record exclusion');
      if (['original_location', 'original_service', 'named_facility_unit', 'unsupported_current_use'].includes(r.exclusion_scope ?? '') && !text(r.excluded_unit)) throw Error('Scoped exclusion needs a named unit');
      if (r.exclusion_scope === 'registered_services') {
        if (!Array.isArray(r.affected_services) || !r.affected_services.length || new Set(r.affected_services).size !== r.affected_services.length || r.affected_services.some(s => !e.services.includes(s))) throw Error('Exclusion exceeds original service scope');
      } else if (r.affected_services !== undefined) throw Error('Original-record exclusion cannot imply other service scope');
    }
    if (r.record_basis !== undefined) {
      const b = r.record_basis;
      if (r.decision !== 'exclude' || !['original_location', 'named_facility_unit'].includes(r.exclusion_scope ?? '') ||
          b?.kind !== 'inherited_restriction' || b.original_id !== item.id ||
          !/^libfile_[0-9a-f]{32}$/.test(b.packet_library_file_id ?? '') || !/^[0-9a-f]{64}$/.test(b.packet_sha256 ?? '') ||
          !/^\/(rows|records)\/\d+\//.test(b.json_pointer ?? '') || !text(b.statement)) {
        throw Error('Saved record basis is limited to an inherited original-point or named-unit restriction');
      }
    }
    if (r.saved_basis !== undefined) {
      const b = r.saved_basis;
      if (!b || b.original_id !== item.id ||
          !((b.kind === 'saved_reference' && r.decision === 'reference') || (b.kind === 'saved_bounded_guidance' && r.decision === 'ready') ||
            (b.kind === 'saved_point_exclusion' && r.decision === 'exclude' && r.exclusion_scope === 'original_location')) ||
          !/^libfile_[0-9a-f]{32}$/.test(b.packet_library_file_id ?? '') || !/^[0-9a-f]{64}$/.test(b.packet_sha256 ?? '') ||
          !(/^\/records\/\d+\//.test(b.json_pointer ?? '') ||
            (b.kind === 'saved_bounded_guidance' && b.json_pointer === '/source_evidence' && b.records?.length === 1 &&
              b.records[0].source_library_file_id === b.packet_library_file_id && b.records[0].locator === b.json_pointer)) || !text(b.statement) ||
          !Array.isArray(b.records) || !b.records.length || b.records.some(s => !s ||
            !/^libfile_[0-9a-f]{32}$/.test(s.source_library_file_id ?? '') || ![s.title, s.locator, s.quote, s.scope, s.date_note].every(text)) ||
          new Set(b.records.map(s => `${s.source_library_file_id}:${s.locator}`)).size !== b.records.length) {
        throw Error('Saved basis needs matching original identity, packet locator and an explicit reference or bounded guidance scope');
      }
    }
    if (r.saved_count_group !== undefined) {
      const g = r.saved_count_group;
      const primary = data.reviews.find(x => x.id === g?.primary_original_id)?.review;
      const primaryGroup = primary?.saved_count_group;
      const groupIdentity = (v: NonNullable<FacilityGuidanceReview['saved_count_group']>) =>
        [v.kind, v.id, v.member_ids, v.facility_count, v.primary_original_id, v.note];
      if (g?.kind !== 'saved_representative' || g.id !== g.primary_original_id || !text(g.id) || !text(g.note) ||
          g.facility_count !== 1 || !Array.isArray(g.member_ids) || g.member_ids.length < 2 ||
          new Set(g.member_ids).size !== g.member_ids.length || !g.member_ids.includes(item.id) || !g.member_ids.includes(g.id) ||
          r.shared_destination || r.saved_visit_group || r.reference_group || !r.saved_basis ||
          primary?.decision !== 'ready' || primary.saved_basis?.kind !== 'saved_bounded_guidance' || !primaryGroup ||
          !same(groupIdentity(g), groupIdentity(primaryGroup)) || primaryGroup.count_contribution !== 1 ||
          (item.id === g.id ? r.decision !== 'ready' || g.count_contribution !== 1 : r.decision !== 'reference' || g.count_contribution !== 0) ||
          g.member_ids.some(id => {
            const member = byId.get(id), other = data.reviews.find(x => x.id === id)?.review;
            if (!member || member.geometry.type !== 'Point' || f.geometry.type !== 'Point' || !other ||
                member.properties.category !== f.properties.category ||
                (id === g.id && !facilityAvailable(member))) return true;
            const og = other.saved_count_group;
            if (og) return !same(groupIdentity(g), groupIdentity(og)) ||
              !other.sources.some(s => r.sources.some(t => s.url === t.url)) ||
              other.saved_basis?.packet_library_file_id !== r.saved_basis?.packet_library_file_id ||
              other.saved_basis?.packet_sha256 !== r.saved_basis?.packet_sha256 ||
              (id === g.id ? other.decision !== 'ready' || og.count_contribution !== 1 : other.decision !== 'reference' || og.count_contribution !== 0);
            const oldGroup = other.reference_group;
            return other.decision !== 'reference' || oldGroup?.kind !== 'original_registration' ||
              oldGroup.id !== g.id || !same(oldGroup.member_ids, g.member_ids) || oldGroup.facility_count !== 1 || oldGroup.service_count !== 1;
          })) throw Error('Saved count group needs one supported representative and retained nonwalking originals');
    }
    if (r.saved_visit_group !== undefined) {
      const g = r.saved_visit_group;
      if (r.decision !== 'ready' || r.saved_basis?.kind !== 'saved_bounded_guidance' || r.shared_destination || r.reference_group ||
          g?.kind !== 'saved_bounded_facility' || !text(g.id) || !text(g.note) || g.facility_count !== 1 ||
          !Array.isArray(g.member_ids) || g.member_ids.length < 2 || new Set(g.member_ids).size !== g.member_ids.length ||
          !g.member_ids.includes(item.id) || !g.member_ids.includes(g.id) || g.member_ids.some(id => {
            const member = byId.get(id), other = data.reviews.find(x => x.id === id)?.review;
            return !member || member.geometry.type !== 'Point' || f.geometry.type !== 'Point' ||
              member.properties.name !== f.properties.name || member.properties.category !== f.properties.category ||
              !same(member.properties.registered_details?.service ?? [], f.properties.registered_details?.service ?? []) ||
              !facilityAvailable(member) || other?.decision !== 'ready' || other.saved_basis?.kind !== 'saved_bounded_guidance' ||
              other.saved_basis.packet_library_file_id !== r.saved_basis?.packet_library_file_id || other.saved_basis.packet_sha256 !== r.saved_basis?.packet_sha256 ||
              other.shared_destination || !same(other.saved_visit_group, g);
          })) throw Error('Saved visit group needs matching supported originals and the same saved facility decision');
    }
    if (r.shared_destination !== undefined) {
      const d = r.shared_destination, target = byId.get(d?.id), e = d?.expected;
      const targetReview = data.reviews.find(x => x.id === d?.id)?.review;
      const parkPair = d?.kind === 'scoped_park_place' && target && f.geometry.type === 'MultiPolygon' && target.geometry.type === 'Point' &&
        ['park', 'playground'].includes(f.properties.category ?? '') && ['park', 'playground'].includes(target.properties.category ?? '') &&
        f.properties.name === target.properties.name && targetReview?.sources.some(s => s.url === d.source_url) &&
        f.geometry.coordinates.some(polygon => ringContains(target.geometry.coordinates as number[], polygon[0]) && !polygon.slice(1).some(hole => ringContains(target.geometry.coordinates as number[], hole)));
      const currentPair = d?.kind === 'current_visit_destination' && target && f.geometry.type === 'Point' && target.geometry.type === 'Point' && target.properties.category === f.properties.category;
      if (r.decision !== 'ready' || (!currentPair && !parkPair) || !text(d.id) || d.id === item.id ||
          !target || !e || !facilityAvailable(target) || target.properties.name !== e.name ||
          target.properties.category !== e.category || !same(target.properties.source_ids, e.source_ids) || !same(target.geometry, e.geometry) ||
          !text(d.note) || !publicEvidenceUrl(d.source_url) || !r.sources.some(s => s.url === d.source_url) ||
          (targetReview && (targetReview.decision !== 'ready' || targetReview.location !== 'original_supported' || targetReview.shared_destination))) {
        throw Error('Invalid shared current visit destination');
      }
      if (d.display_name !== undefined && (!text(d.display_name) || targetReview?.display.type !== d.display_name || r.display.type !== d.display_name)) throw Error('Shared visit name needs matching supported target guidance');
    }
    if (r.reference_group !== undefined) {
      const g = r.reference_group;
      if (r.decision !== 'reference' || r.shared_destination !== undefined ||
          !['original_registration', 'facility_information'].includes(g?.kind) ||
          !text(g.id) || !text(g.note) || g.facility_count !== 1 ||
          (g.kind === 'original_registration' ? g.service_count !== 1 : g.service_count !== undefined) ||
          !Array.isArray(g.member_ids) || g.member_ids.length < 2 ||
          new Set(g.member_ids).size !== g.member_ids.length ||
          !g.member_ids.includes(item.id) || !g.member_ids.includes(g.id) ||
          g.member_ids.some(id => {
            if (!byId.has(id)) return true;
            const other = data.reviews.find(x => x.id === id)?.review;
            if (same(other?.reference_group, g)) return false;
            const supported = other?.saved_count_group;
            return g.kind !== 'original_registration' || other?.decision !== 'ready' || other.saved_basis?.kind !== 'saved_bounded_guidance' ||
              supported?.kind !== 'saved_representative' || supported.id !== g.id || supported.primary_original_id !== id ||
              supported.count_contribution !== 1 || supported.facility_count !== 1 || !same(supported.member_ids, g.member_ids);
          })) {
        throw Error('Invalid reference-only facility group');
      }
    }
    reviews.set(item.id, r);
  }
  return base.map(f => reviews.has(String(f.id)) ? { ...f, properties: { ...f.properties, guide_review: reviews.get(String(f.id)) } } : f);
}

/** Count explicit groups of reference information independently of current visit candidates. */
export function referenceFacilityGroups(reviews: (FacilityGuidanceReview | undefined)[]): ReferenceFacilityGroup[] {
  const groups = new Map<string, ReferenceFacilityGroup>();
  for (const r of reviews) {
    if (r?.decision === 'reference' && r.reference_group) {
      const g = r.reference_group;
      groups.set(`${g.kind}:${g.id}`, g);
    }
  }
  return [...groups.values()];
}

export function guideExcludesOriginal(f: ShoppingFeature): boolean {
  const r = f.properties.guide_review;
  return r?.decision === 'exclude' && (['original_record', 'original_location', 'original_service', 'named_facility_unit', 'unsupported_current_use'].includes(r.exclusion_scope ?? '') ||
    (r.exclusion_scope === 'registered_services' && (f.properties.registered_details?.service ?? []).every(s => r.affected_services?.includes(s))));
}

/** Keep saved group representatives when available; other shared destinations keep the first sorted reachable candidate.
 * Original IDs, names and geometries remain independently accessible. No proximity deduplication.
 */
export function distinctVisitCandidates<T>(items: T[], facility: (item: T) => ShoppingFeature): T[] {
  const seen = new Set<string>();
  const savedRepresentatives = new Set(items.flatMap(item => {
    const f = facility(item), g = f.properties.guide_review?.saved_visit_group;
    return g && g.id === String(f.id) ? [g.id] : [];
  }));
  return items.filter(item => {
    const f = facility(item), group = f.properties.guide_review?.saved_visit_group;
    if (group && savedRepresentatives.has(group.id) && String(f.id) !== group.id) return false;
    const key = group?.id ?? f.properties.guide_review?.shared_destination?.id ?? String(f.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
