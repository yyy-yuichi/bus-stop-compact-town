import type { ShoppingFeature } from './types';
import { applyFacilityCurrent } from './facilityFreshness.ts';
import type { RegistryReview } from './facilityRegistry.ts';

/** Evidence scope is deliberately independent of a facility's operating status. */
export interface FacilityAuditReview {
  status: 'limited_support' | 'unresolved';
  checked_at: string;
  accepted_type: string | null;
  summary: string;
  scope: string;
  sources: { title: string; url: string }[];
  limits: string[];
}
interface ExpectedFacility {
  name: string; category: string; source_ids: string[]; geometry: ShoppingFeature['geometry'];
}
export interface FacilityAuditData {
  schema_version: 1;
  checked_at: string;
  edition: string;
  provenance: { canonical_sha256: string; original_count: number };
  counts: { reviewed: number; limited_support: number; unresolved: number; recovered_registry: number };
  recovered_verifications: { id: string; expected: ExpectedFacility; changes: Record<string, string>; review: RegistryReview }[];
  reviews: { id: string; expected: ExpectedFacility; review: FacilityAuditReview }[];
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const validDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
export function publicEvidenceUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    const privateHosts = ['drive.google.com', 'docs.google.com', 'chatgpt.com', 'oaiusercontent.com', 'blob.core.windows.net', 'localhost'];
    return ['https:', 'http:'].includes(u.protocol) && !!host && !u.username && !u.password &&
      !privateHosts.some(h => host === h || host.endsWith('.' + h)) && !host.endsWith('.local') && !host.includes(':') &&
      !/^(0\.|127\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) &&
      ![...u.searchParams.keys()].some(k => /^(?:access_token|token|key|secret|signature|sig|auth|authorization)$|^x-amz-/i.test(k));
  } catch { return false; }
}
export function validateAuditReview(r: FacilityAuditReview, checkedAt: string): void {
  if (!r || !['limited_support', 'unresolved'].includes(r.status) || !validDate(r.checked_at) || r.checked_at > checkedAt ||
      !text(r.summary) || !text(r.scope) || !Array.isArray(r.limits) || !r.limits.length || r.limits.some(v => !text(v)) ||
      !Array.isArray(r.sources) || r.sources.some(s => !s || !text(s.title) || !publicEvidenceUrl(s.url)) ||
      (r.accepted_type !== null && !text(r.accepted_type)) || (r.status === 'unresolved' && r.accepted_type !== null)) {
    throw Error('Invalid scoped facility audit review');
  }
}
export function applyFacilityAudit(base: ShoppingFeature[], value: unknown): ShoppingFeature[] {
  const data = value as FacilityAuditData;
  if (!data || data.schema_version !== 1 || !validDate(data.checked_at) || !text(data.edition) ||
      !/^[a-f0-9]{64}$/.test(data.provenance?.canonical_sha256) || data.provenance.original_count !== 7764 ||
      !Array.isArray(data.reviews) || !Array.isArray(data.recovered_verifications) || !data.counts) throw Error('Invalid facility audit data');
  const byId = new Map(base.map(f => [String(f.id), f]));
  if (byId.size !== base.length) throw Error('Duplicate facility ID');
  const auditIds = new Set<string>();
  const recoveryIds = new Set(data.recovered_verifications.map(r => r.id));
  if (recoveryIds.size !== data.recovered_verifications.length) throw Error('Duplicate recovered verification');
  for (const r of data.recovered_verifications) {
    const before = byId.get(r.id);
    if (!before || before.properties.registry_review || before.properties.freshness_review || before.properties.audit_review || Object.keys(r.changes).length) throw Error('Recovered verification overwrites a prior decision');
  }
  const recovered = applyFacilityCurrent(base, { schema_version: 1, checked_at: data.checked_at, updates: [], additions: [], verifications: data.recovered_verifications });
  const reviews = new Map<string, FacilityAuditReview>();
  for (const item of data.reviews) {
    const before = byId.get(item?.id), expected = item?.expected;
    if (!before || auditIds.has(item.id) || recoveryIds.has(item.id) || before.properties.registry_review || before.properties.freshness_review || before.properties.audit_review ||
        !expected || before.properties.name !== expected.name || before.properties.category !== expected.category ||
        !same(before.properties.source_ids, expected.source_ids) || !same(before.geometry, expected.geometry)) throw Error(`Source drift or overlapping audit: ${item?.id}`);
    validateAuditReview(item.review, data.checked_at);
    auditIds.add(item.id); reviews.set(item.id, item.review);
  }
  const supported = data.reviews.filter(r => r.review.status === 'limited_support').length;
  if (data.counts.reviewed !== data.reviews.length || data.counts.limited_support !== supported || data.counts.unresolved !== data.reviews.length - supported || data.counts.recovered_registry !== recoveryIds.size) throw Error('Facility audit counts disagree');
  return recovered.map(f => reviews.has(String(f.id)) ? { ...f, properties: { ...f.properties, audit_review: structuredClone(reviews.get(String(f.id))!) } } : f);
}
export const auditLabel = (review?: FacilityAuditReview) => review ? review.status === 'limited_support' ? '限定範囲の根拠あり' : '未解決' : '';
