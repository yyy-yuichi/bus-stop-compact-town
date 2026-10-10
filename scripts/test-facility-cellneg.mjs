import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import test from 'node:test';
import { applyFacilityCurrent, facilityAvailable } from '../src/facilityFreshness.ts';
import { applyFacilityAudit, validateAuditReview } from '../src/facilityAudit.ts';
import { applyFacilityContacts } from '../src/facilityContact.ts';
import { hasMapLocationIssue, isFacilityWalkingCandidate } from '../src/facilityMapLocation.ts';
import { bakedFacilityCandidates, nearbyFacilityCandidates, prepareFacilities, distance } from '../src/bakedWalking.ts';
import { mapFacilities } from '../src/facilityVisibility.ts';
import { searchPlaces } from '../src/placeSearch.ts';
const read = name => JSON.parse(fs.readFileSync(`public/data/${name}`, 'utf8'));
const id = 'civic-care-3570106660-61245f957a';
const raw = [...read('shopping.geojson').features, ...read('civic-facilities.geojson').features];
const original = raw.find(f => f.id === id), audit = read('facility-audit.json');
const facilities = applyFacilityContacts(applyFacilityAudit(applyFacilityCurrent(raw, read('facility-current.json')), audit), read('facility-contacts.json'));
const f = facilities.find(f => f.id === id), r = f.properties.audit_review;
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;

test('actual Cellneg record supports one review while retaining its exact original feature and global population', () => {
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(canonical(original))).digest('hex'), 'ce139a2cd5633e103030aea046b7f077fd1db303b06d9f0593d038efa0a44731');
  assert.equal(facilities.length, 8369); assert.equal(new Set(facilities.map(f => f.id)).size, 8369);
  assert.deepEqual(audit.counts, { reviewed: 2828, limited_support: 1365, unresolved: 1463, recovered_registry: 23 });
  const restored = structuredClone(f); delete restored.properties.audit_review;
  assert.deepEqual(restored, original);
  assert.equal(r.status, 'limited_support'); assert.equal(r.checked_at, '2026-10-08');
  validateAuditReview(r, audit.checked_at);
  assert.equal(f.properties.official_address, ''); assert.equal(f.properties.address, '下関市本町2－11－11');
  assert.equal(f.properties.freshness_review, undefined);
  assert.deepEqual(f.properties.registered_details.phone, ['083-242-1017']);
  assert.equal(facilities.filter(f => f.properties.dispensing_contact).length, 4);
});

test('separate previously known point and evidence dates do not become a new original destination or relocation claim', () => {
  const l = r.map_location;
  assert.equal(l.status, 'unverified'); assert.equal(l.reason, undefined);
  assert(l.note.includes('281.950m'));
  assert.deepEqual(l.current_location.coordinates, [130.94686501055907, 33.96374805719864]);
  assert.deepEqual(f.geometry, { type: 'Point', coordinates: [130.949921, 33.963676] });
  assert.equal(l.current_location.distance_from_original_m, 281.95);
  assert(Math.abs(distance(f.geometry.coordinates, l.current_location.coordinates) - 281.95) < .01);
  assert.equal(l.current_location.source.as_of, '2026-06-30');
  assert.equal(l.current_location.source.published_at, '2026-07-09');
  assert.equal(l.current_location.source.retrieved_at, undefined, 'A national raw retrieval date was not supplied');
  assert(r.scope.includes('2026-09-30取得の保存exact行で単独基準日なし'));
  for (const text of ['floor=1', '県全CSVの今回再取得や全行再ハッシュはしていません', 'Google宮田町7', '移転の実施・発効日', '新物理施設数へ加算しません']) assert(r.limits.some(s => s.includes(text)));
  assert(r.summary.includes('新同定・新取得点は各0'));
});

test('actual original point is excluded from all walking candidate modes but remains searchable and selectable', () => {
  const point = f.geometry.coordinates, dx = 10 * 180 / (Math.PI * 6371000 * Math.cos(point[1] * Math.PI / 180));
  const origin = [point[0] - dx, point[1]], end = [point[0] + dx, point[1]];
  const c = { stopId: 'cellneg-test', budget: 1000, origin, snap: origin, snapGap: 0, segments: [{ a: origin, b: end, d1: 0, d2: 20, grade: 0, steps: false }] };
  const beforeFlag = structuredClone(f); delete beforeFlag.properties.audit_review.map_location;
  assert.equal(bakedFacilityCandidates(c, prepareFacilities([beforeFlag])).length, 1);
  assert.equal(nearbyFacilityCandidates(origin, prepareFacilities([beforeFlag])).length, 1);
  assert(isFacilityWalkingCandidate(beforeFlag));
  assert.equal(bakedFacilityCandidates(c, prepareFacilities([f])).length, 0);
  assert.equal(nearbyFacilityCandidates(origin, prepareFacilities([f])).length, 0);
  assert(!isFacilityWalkingCandidate(f) && hasMapLocationIssue(f) && facilityAvailable(f));
  assert(searchPlaces(f.properties.name, [], [f]).facilities.some(found => found.id === id));
  const scope = 'cellneg-test:5', walking = { scope, ids: [id] };
  assert.equal(mapFacilities([f], ['social_facility'], null, scope, walking).length, 0);
  assert.deepEqual(mapFacilities([f], ['social_facility'], f, scope, walking)[0].geometry, original.geometry);
});

test('old sources and titles are retained with exactly two new links and no duplicated national URL', () => {
  assert.equal(r.sources.length, 4); assert.equal(new Set(r.sources.map(s => s.url)).size, 4);
  assert.deepEqual(r.sources.slice(0, 2), [
    { title: '原登録元の介護事業所資料（2024-02・現在営業は未認定）', url: 'https://yamaguchi-opendata.jp/ckan/dataset/care_service' },
    { title: '同番号・同名の居宅介護支援報告（2026-06末・原地点対応は保留）', url: 'https://www.mhlw.go.jp/content/12300000/jigyosho_430_all_20260709180740.csv' },
  ]);
  const pref = new URL(r.sources[2].url);
  assert.deepEqual([...pref.searchParams.keys()], ['minasi', 'city', 'od']);
  assert.equal(pref.searchParams.get('city'), '35201'); assert.equal(pref.searchParams.get('od'), '1');
});
