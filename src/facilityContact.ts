import type { ShoppingFeature, ShoppingProperties } from './types';

export interface DispensingContact {
  phone: string;
  source: { title: string; url: string; retrieved_at: string; updated_at: null };
  identity: { registry_id: string; source_url: string; source_as_of: string };
}
interface ContactOverlay {
  schema_version: 1;
  checked_at: string;
  contacts: {
    id: string;
    expected: { name: string; city: string; address: string; official_address: string; category: string; source_ids: string[]; geometry: ShoppingFeature['geometry'] };
    contact: DispensingContact;
  }[];
}
const approved = new Map([
  ['official-mcc-20001805', 'mhlw-iryou:5:355827'],
  ['official-mcc-20001806', 'mhlw-iryou:5:3551135'],
  ['official-mcc-20001807', 'mhlw-iryou:5:3551094'],
  ['official-mcc-20001808', 'mhlw-iryou:5:355831'],
]);
const nationalSource = 'https://www.mhlw.go.jp/content/11121000/05_pharmacy_20260601.csv.zip';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const date = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: unknown, allowed: string[]) => record(v) && same(Object.keys(v).sort(), [...allowed].sort());
const https = (s: unknown) => { try { const u = new URL(String(s)); return typeof s === 'string' && u.protocol === 'https:' && !!u.hostname && !u.username && !u.password && !u.hash; } catch { return false; } };
function hasPhone(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasPhone);
  if (!record(value)) return false;
  return Object.entries(value).some(([key, val]) => /(?:^|[:_])(?:phone|telephone|tel)$/i.test(key) ||
    (key === 'label' && typeof val === 'string' && /電話|phone|telephone/i.test(val)) || hasPhone(val));
}

/** Supplement four existing records atomically; never rewrite original contact or location data. */
export function applyFacilityContacts(base: ShoppingFeature[], value: unknown): ShoppingFeature[] {
  const data = value as ContactOverlay;
  if (!keys(data, ['schema_version', 'checked_at', 'contacts']) || data.schema_version !== 1 || !date(data.checked_at) ||
      !Array.isArray(data.contacts) || data.contacts.length !== approved.size) throw Error('Invalid contact overlay');
  const byId = new Map(base.map(f => [String(f.id), f]));
  if (byId.size !== base.length) throw Error('Duplicate base contact facility ID');
  const contacts = new Map<string, DispensingContact>();
  for (const item of data.contacts) {
    if (!keys(item, ['id', 'expected', 'contact']) || !approved.has(item.id) || contacts.has(item.id) || !byId.has(item.id)) throw Error('Unknown or duplicate contact facility ID');
    const before = byId.get(item.id)!, p = before.properties, e = item.expected, c = item.contact;
    if (!keys(e, ['name', 'city', 'address', 'official_address', 'category', 'source_ids', 'geometry']) ||
        e.name !== p.name || e.city !== p.city || e.address !== p.address || e.official_address !== p.official_address ||
        e.category !== p.category || !same(e.source_ids, p.source_ids) || !same(e.geometry, before.geometry)) throw Error('Contact source drift');
    if (Object.hasOwn(p, 'dispensing_contact') || hasPhone(p)) throw Error('Existing phone conflicts with contact supplement');
    if (p.category !== 'pharmacy' || p.verification_status !== 'official_current_listing' ||
        !keys(c, ['phone', 'source', 'identity']) || typeof c.phone !== 'string' || !/^0[1-9]\d{1,3}-\d{1,4}-\d{4}$/.test(c.phone) || c.phone.replaceAll('-', '').length !== 10 ||
        !keys(c.source, ['title', 'url', 'retrieved_at', 'updated_at']) || typeof c.source.title !== 'string' || !c.source.title.trim() ||
        !https(c.source.url) || c.source.url !== p.official_url || c.source.url !== `https://www.matsukiyococokara-online.com/map/?kid=${item.id.slice('official-mcc-'.length)}` ||
        !date(c.source.retrieved_at) || c.source.retrieved_at > data.checked_at || c.source.updated_at !== null ||
        !keys(c.identity, ['registry_id', 'source_url', 'source_as_of']) || c.identity.registry_id !== approved.get(item.id) ||
        !https(c.identity.source_url) || c.identity.source_url !== nationalSource || c.identity.source_as_of !== '2026-06-01' ||
        c.identity.source_as_of > c.source.retrieved_at) throw Error('Invalid dispensing contact evidence');
    contacts.set(item.id, structuredClone(c));
  }
  return base.map(f => contacts.has(String(f.id)) ? { ...f, properties: { ...f.properties, dispensing_contact: contacts.get(String(f.id))! } } : f);
}

export function dispensingContactReview(contact: DispensingContact | undefined): ShoppingProperties['purpose_review'] {
  if (!contact) return undefined;
  return {
    checked_at: contact.source.retrieved_at, source_url: contact.source.url, source_title: contact.source.title,
    additional_sources: [{ title: '国の薬局資料（2026-06-01基準・同定情報）', url: contact.identity.source_url }],
    facts: [
      { label: '調剤電話（運営者掲載）', value: contact.phone },
      { label: '国資料の同定情報（2026-06-01基準）', value: contact.identity.registry_id },
    ],
    gaps: [
      '運営者本文の「調剤 電話」欄を補足しています。一般店舗電話とは区別した調剤の連絡先で、元データの電話欄を補完・変更したものではありません',
      '運営者の元資料に更新日の表示がありません。取得日を資料の更新日として扱っていません',
      '国番号との接続は2026-06-01基準の同定情報で、新しい時点の確認には数えていません',
      'この補足は座標・測地系・入口・徒歩到達性・当日の調剤受付可否の確認ではありません',
    ],
  };
}
