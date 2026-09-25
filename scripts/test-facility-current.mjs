import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyFacilityCurrent, facilityAvailable, freshnessLabel, validateFreshnessReview, freshnessDateText } from '../src/facilityFreshness.ts';
import { prepareFacilities, nearbyFacilityCandidates, bakedFacilityCandidates } from '../src/bakedWalking.ts';
import { searchPlaces } from '../src/placeSearch.ts';
import { mapFacilities } from '../src/facilityVisibility.ts';
import { SHOPPING_CATEGORIES } from '../src/facilityCatalog.ts';
import { placeLink, readPlaceLink } from '../src/placeLink.ts';

const read = name => JSON.parse(fs.readFileSync(`public/data/${name}`, 'utf8'));
const raw = [...read('shopping.geojson').features, ...read('civic-facilities.geojson').features];
const patch = read('facility-current.json');
const original = JSON.stringify(raw), originalPatch = JSON.stringify(patch);
const current = applyFacilityCurrent(raw, patch);
assert.equal(raw.length, 7764);
assert.equal(current.length, 8065);
assert.equal(patch.updates.length, 41);
assert.equal(patch.additions.length, 301);
assert.equal(JSON.stringify(raw), original, 'Never modify original imports');
assert.equal(JSON.stringify(patch), originalPatch, 'Never mutate the reviewed overlay');
assert.deepEqual(applyFacilityCurrent(raw, patch), current, 'Same inputs yield the same output');
const get = id => current.find(f => f.id === id);
const closed = get('osm-way-475283671'), added = get('official-donki-738');
const oka = get('osm-node-1423658379'), care = get('civic-care-3557280025-a46f56b5db');
const daimar = get('osm-node-2426673962');
for (const before of raw) {
  const after = get(before.id);
  assert.deepEqual(after.geometry, before.geometry);
  assert.deepEqual(after.properties.source_ids, before.properties.source_ids);
  assert.deepEqual(after.properties.registered_details, before.properties.registered_details);
  assert.deepEqual(after.properties.civic_details, before.properties.civic_details);
  if (!patch.updates.some(p => p.id === before.id)) assert.deepEqual(after, before);
}
assert.equal(facilityAvailable(closed), false);
assert.equal(facilityAvailable(daimar), true, 'Scheduled closure is not a completed closure');
assert.equal(freshnessLabel(daimar), '営業終了予定');
const royal = get('osm-way-483625942');
assert.equal(facilityAvailable(royal), false);
assert.equal(royal.properties.freshness_review.effective_at, '2026-08-20');
assert.equal(current.filter(f => f.properties.freshness_review?.status === 'closed').length, 9);
assert.equal(current.filter(f => f.properties.duplicate_of).length, 1);
assert.equal(current.filter(f => !facilityAvailable(f)).length, 10);
assert(!searchPlaces('ロイヤルホスト 山の田', [], current).facilities.some(f => f.id === royal.id));
for (const f of patch.additions) {
  assert(facilityAvailable(f));
  assert(searchPlaces(f.properties.name, [], current).facilities.some(r => r.id === f.id));
  assert.equal(freshnessLabel(f), f.properties.freshness_review.event === 'listed' ? '公式掲載確認' : '開店・掲載確認');
  if (f.properties.freshness_review.event === 'listed') assert.equal(f.properties.freshness_review.effective_at, null);
}
assert.equal(patch.additions.filter(f => f.properties.freshness_review.event === 'listed').length, 286);
const miko = get('osm-way-305954680'), oldWants = get('osm-way-332618123');
assert(!facilityAvailable(miko) && !facilityAvailable(oldWants));
assert.equal(miko.properties.freshness_review.effective_at, '2025-01');
assert.equal(freshnessDateText(miko.properties.freshness_review), '2025-01（年月まで確認）');
assert.equal(oldWants.properties.freshness_review.effective_at, null);
assert(freshnessDateText(oldWants.properties.freshness_review).includes('閉店自体は公式告知で確認'));
assert.equal(get('official-marukyu-kumage').properties.freshness_review.effective_at, '2025-10-30');
assert.equal(get('official-tsuruha-4518').properties.freshness_review.effective_at, '2026-01-28');
assert.equal(get('official-tsuruha-3993').properties.freshness_review.effective_at, '2025-05-21');
assert.equal(get('official-aruk-nagato').properties.freshness_review.effective_at, '2024-03-09');
assert.equal(patch.additions.filter(f => String(f.id).startsWith('official-tsuruha-')).length, 39);
assert(!get('official-tsuruha-2299'), 'A pharmacy co-located with its drugstore is not a second physical store');
assert(get('official-tsuruha-3945').properties.source_ids.includes('official:tsuruha:2299'));
assert(searchPlaces('防府松崎薬局', [], current).facilities.some(f => f.id === 'official-tsuruha-3945'));
assert(!get('official-tsuruha-3889') && !get('official-tsuruha-3905'), 'Prior occupant held; reviewed duplicate uses original IDs instead of a new addition');
assert.equal(current.filter(f => f.properties.category !== 'reference' && facilityAvailable(f)).length, 8001);
for (const f of current.filter(f => !facilityAvailable(f))) {
  assert(!searchPlaces(f.properties.name, [], current).facilities.some(x => x.id === f.id));
  assert(!prepareFacilities(current).some(p => p.facility.id === f.id));
}
for (const change of [
  {date_precision:'month',effective_at:'2025-13'}, {date_precision:'month',effective_at:'2026-10'},
  {date_precision:'month',effective_at:'2025-01-01'}, {date_precision:'unknown',effective_at:'2025-01-01'},
  {date_precision:'day',effective_at:null}, {date_precision:undefined,effective_at:null},
  {date_precision:'unknown',event:'opened',status:'operating',effective_at:null},
  {date_precision:'month',event:'listed',status:'operating',effective_at:null},
  {date_precision:'quarter',effective_at:null}
]) assert.throws(() => validateFreshnessReview({...oldWants.properties.freshness_review,...change},patch.checked_at));
for (const id of ['aeon-hofu', 'sunpark', 'sunlive-kudamatsu', 'osm-way-561705134']) assert(!patch.updates.some(u => u.id === id), 'A tenant event never modifies the containing mall');
assert.equal(oka.properties.category, 'clinic');
assert.equal(care.properties.name, '介護医療院ケアホーム山口');
assert.notDeepEqual(added.geometry, closed.geometry, 'Do not inherit the old store position');
assert.deepEqual(searchPlaces('マックスバリュ防府西', [], current).facilities, []);
assert(searchPlaces('ドンキ 防府', [], current).facilities.some(f => f.id === added.id));
assert(searchPlaces('岡病院', [], current).facilities.some(f => f.id === oka.id), 'Retain old name alias');
const scope = 'test:15', walking = { scope, ids: current.map(f => String(f.id)) };
const mapped = mapFacilities(current, SHOPPING_CATEGORIES.map(c => c.id), null, scope, walking);
assert(!mapped.some(f => f.id === closed.id));
assert(mapped.some(f => f.id === added.id));
assert(mapFacilities(current, ['supermarket'], closed, scope, walking).some(f => f.id === closed.id), 'Historic direct links remain inspectable');
assert.deepEqual(readPlaceLink(new URL(placeLink('https://example.org/', { kind: 'facility', id: closed.id })).hash), { kind: 'facility', id: closed.id });
const prepared = prepareFacilities(current);
assert(!prepared.some(p => p.facility.id === closed.id));
const near = nearbyFacilityCandidates(closed.geometry.coordinates, prepared);
assert(!near.some(c => c.facility.id === closed.id));
assert(near.some(c => c.facility.id === added.id));
const origin = closed.geometry.coordinates;
const catchment = { origin, budget: 1000, segments: [{ a: origin, b: added.geometry.coordinates, d1: 0, d2: 30, grade: 0, steps: false }] };
const walked = bakedFacilityCandidates(catchment, prepared);
assert(!walked.some(c => c.facility.id === closed.id));
assert(walked.some(c => c.facility.id === added.id));

let rejected = 0;
const reject = mutate => { const invalid = structuredClone(patch); mutate(invalid); assert.throws(() => applyFacilityCurrent(raw, invalid)); rejected++; };
reject(p => p.schema_version = 2);
reject(p => p.checked_at = '2026-02-30');
reject(p => p.updates[0].id = 'missing');
reject(p => p.updates.push(p.updates[0]));
reject(p => p.updates[0].expected.name = 'wrong shop');
reject(p => p.updates[0].expected.geometry.coordinates[0] += 0.001);
reject(p => p.updates[0].expected.source_ids = ['way/1']);
for (const key of ['id', 'geometry', 'source_ids', 'registered_details', 'civic_details', 'verification_status']) reject(p => p.updates[0].changes[key] = 'forbidden');
reject(p => p.updates[0].changes.category = 'invented');
reject(p => p.updates[0].review.effective_at = '2027-01-01');
reject(p => p.updates[0].review.status = 'operating');
reject(p => p.updates[0].review.sources = []);
reject(p => p.updates[0].review.limits = []);
reject(p => p.updates[0].review.sources[0].url = 'javascript:alert(1)');
reject(p => p.updates[0].review.sources[0].url = 'https://user:password@example.org/');
reject(p => p.additions.push(p.additions[0]));
reject(p => p.additions[0].id = closed.id);
reject(p => p.additions[0].properties.source_ids = closed.properties.source_ids);
reject(p => p.additions[0].properties.source_ids.push(p.additions[0].properties.source_ids[0]));
reject(p => p.additions[0].properties.verification_status = 'osm_unverified');
reject(p => p.additions[0].properties.freshness_review.effective_at = '2027-01-01');
reject(p => p.additions[0].properties.official_url = 'https://example.org/unmatched');
reject(p => p.additions[0].geometry.coordinates = [0, 0]);
reject(p => p.additions[0].geometry.coordinates = [131, Number.NaN]);
reject(p => p.additions.find(f => f.properties.freshness_review.event === 'listed').properties.freshness_review.effective_at = p.checked_at);
reject(p => p.additions[0].properties.freshness_review.effective_at = null);
reject(p => p.additions.find(f => f.properties.freshness_review.event === 'listed').properties.freshness_review.status = 'closed');
assert.throws(() => applyFacilityCurrent([...raw, raw[0]], patch));
const pastSchedule = structuredClone(daimar);
pastSchedule.properties.freshness_review.effective_at = '2020-01-01';
assert(facilityAvailable(pastSchedule), 'A past planned date is still unconfirmed');
const loader = fs.readFileSync('src/shoppingData.ts', 'utf8');
assert(loader.includes('data/facility-current.json') && loader.includes('applyFacilityCurrent(collections.flat(), reviews)'));
assert(fs.readFileSync('src/WalkingPanel.tsx', 'utf8').includes('.filter(facilityAvailable)'));
console.log(JSON.stringify({ original_records: raw.length, current_records_including_history: current.length, previous_local_batch_additions: 72, relocation_batch_additions: 4, relocation_followup_additions: 4, cumulative_updates: patch.updates.length, cumulative_additions: patch.additions.length, cumulative_closures: current.filter(f=>f.properties.freshness_review?.status==='closed').length, reviewed_duplicate_records: current.filter(f=>f.properties.duplicate_of).length, invalid_overlays_rejected: rejected, extra_partial_date_rejections: 9, raw_ID_geometry_service_history_preserved: true, search_nearby_walk_map_checks: 'passed' }));
