import type { ShoppingFeature } from './types';
import { SHOPPING_CATEGORIES } from './facilityCatalog.ts';

export interface FreshnessReview {
  status: 'closed' | 'operating' | 'changed' | 'scheduled_change';
  event: 'closed' | 'opened' | 'listed' | 'renamed' | 'service_change' | 'scheduled_closure';
  effective_at: string | null; checked_at: string; summary: string;
  date_precision?: 'day' | 'month' | 'unknown';
  sources: { title: string; url: string }[]; limits: string[];
}
interface CurrentData {
  schema_version: number; checked_at: string;
  updates: { id: string; expected: { name: string; category: string; source_ids: string[]; geometry: ShoppingFeature['geometry'] }; changes: Record<string, string>; review: FreshnessReview }[];
  additions: ShoppingFeature[];
}
const validDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const safeUrl = (s: unknown) => { try { const u = new URL(String(s)); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const categories = new Set<string>(SHOPPING_CATEGORIES.map(c => c.id));
const allowedChanges = new Set(['name', 'category', 'city', 'address', 'search_names']);

export function validateFreshnessReview(r: FreshnessReview, checkedAt: string): void {
  const statusForEvent = { closed: 'closed', opened: 'operating', listed: 'operating', renamed: 'changed', service_change: 'changed', scheduled_closure: 'scheduled_change' };
  if (!r || !Object.hasOwn(statusForEvent, r.event) || statusForEvent[r.event] !== r.status || r.checked_at !== checkedAt || !validDate(r.checked_at) || !r.summary?.trim()) throw Error('Invalid freshness event');
  // A current listing is not evidence of an opening date. Never invent one from a check/publication date.
  const precision = r.date_precision ?? (r.event === 'listed' ? 'unknown' : 'day');
  if (!['day', 'month', 'unknown'].includes(precision)) throw Error('Invalid date precision');
  if (r.event === 'listed') {
    if (precision !== 'unknown' || r.effective_at !== null) throw Error('Invalid listing date');
  } else if (r.event === 'closed' && precision === 'unknown') {
    if (r.effective_at !== null) throw Error('Unknown closure date must be null');
  } else if (r.event === 'closed' && precision === 'month') {
    if (typeof r.effective_at !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.effective_at)) throw Error('Invalid closure month');
  } else if (precision !== 'day' || !validDate(r.effective_at)) throw Error('Invalid freshness event date');
  if (r.event !== 'scheduled_closure' && r.effective_at !== null && r.effective_at > checkedAt) throw Error('Future event cannot be applied as completed');
  if (!Array.isArray(r.sources) || !r.sources.length || r.sources.some(s => !s.title?.trim() || !safeUrl(s.url)) || !Array.isArray(r.limits) || !r.limits.length || r.limits.some(s => typeof s !== 'string' || !s.trim())) throw Error('Missing freshness evidence or limits');
}

/** Apply reviewed changes, preserving the original imports and their identifiers. */
export function applyFacilityCurrent(base: ShoppingFeature[], value: unknown): ShoppingFeature[] {
  const data = value as CurrentData;
  if (!data || data.schema_version !== 1 || !validDate(data.checked_at) || !Array.isArray(data.updates) || !Array.isArray(data.additions)) throw Error('Invalid current facility data');
  const byId = new Map(base.map(f => [String(f.id), f]));
  if (byId.size !== base.length) throw Error('Duplicate base facility ID');
  const updates = new Map<string, ShoppingFeature>(), sourceIds = new Set(base.flatMap(f => f.properties.source_ids));
  for (const item of data.updates) {
    const before = byId.get(item.id), expected = item.expected;
    if (!before || updates.has(item.id) || !expected || before.properties.name !== expected.name || before.properties.category !== expected.category || !same(before.properties.source_ids, expected.source_ids) || !same(before.geometry, expected.geometry)) throw Error(`Source drift or duplicate update: ${item.id}`);
    if (!item.changes || Object.entries(item.changes).some(([k, v]) => !allowedChanges.has(k) || typeof v !== 'string' || !v.trim())) throw Error('Forbidden facility change');
    if (item.changes.category && !categories.has(item.changes.category)) throw Error('Invalid changed category');
    validateFreshnessReview(item.review, data.checked_at);
    updates.set(item.id, { ...before, properties: { ...before.properties, ...item.changes, freshness_review: structuredClone(item.review) } });
  }
  const additions: ShoppingFeature[] = [];
  for (const f of data.additions) {
    const p = f?.properties;
    if (f?.type !== 'Feature' || !/^official-[a-z0-9-]+$/.test(String(f.id)) || byId.has(String(f.id)) || additions.some(a => a.id === f.id) || !p || !p.name?.trim() || !p.city?.trim() || !p.official_address?.trim() || !safeUrl(p.official_url) || !categories.has(p.category ?? '') || p.source !== '店舗公式情報' || p.license !== 'official-published-facts' || p.verification_status !== 'official_current_listing' || p.verified_at !== data.checked_at || p.source_timestamp !== data.checked_at || !p.location_verification?.trim()) throw Error('Invalid official facility addition');
    if (!Array.isArray(p.source_ids) || !p.source_ids.length || p.source_ids.some(id => !/^official:[a-z0-9:-]+$/.test(id) || sourceIds.has(id)) || new Set(p.source_ids).size !== p.source_ids.length) throw Error('Duplicate or invalid new source ID');
    if (f.geometry?.type !== 'Point' || p.geometry_kind !== 'representative_point' || f.geometry.coordinates.length !== 2 || !f.geometry.coordinates.every(Number.isFinite) || f.geometry.coordinates[0] < 130 || f.geometry.coordinates[0] > 133 || f.geometry.coordinates[1] < 33 || f.geometry.coordinates[1] > 35) throw Error('Invalid official position');
    validateFreshnessReview(p.freshness_review!, data.checked_at);
    if (!['opened', 'listed'].includes(p.freshness_review?.event ?? '') || !p.freshness_review!.sources.some(s => s.url === p.official_url)) throw Error('New facility requires current official evidence');
    p.source_ids.forEach(id => sourceIds.add(id)); additions.push(structuredClone(f));
  }
  return [...base.map(f => updates.get(String(f.id)) ?? f), ...additions];
}

/** A scheduled date never silently becomes a confirmed closure. */
export const facilityAvailable = (f: ShoppingFeature) => f.properties.freshness_review?.status !== 'closed';
export function freshnessDateText(r: FreshnessReview): string {
  if (r.event === 'listed') return '未確認（公式の店舗・施設案内を確認して掲載）';
  if (r.event === 'closed' && r.date_precision === 'unknown') return '未確認（閉店自体は公式告知で確認）';
  if (r.event === 'closed' && r.date_precision === 'month') return `${r.effective_at}（年月まで確認）`;
  return r.effective_at ?? '';
}
export function freshnessLabel(f: ShoppingFeature): string {
  const r = f.properties.freshness_review;
  if (!r) return '';
  if (r.event === 'listed') return '公式掲載確認';
  return { closed: '閉店確認', operating: '開店・掲載確認', changed: '名称・種別変更を確認', scheduled_change: '営業終了予定' }[r.status];
}
