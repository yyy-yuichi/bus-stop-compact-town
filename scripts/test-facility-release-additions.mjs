import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyReleaseFacilityAdditions, applyReleaseTemporaryClosures } from '../src/facilityReleaseAdditions.ts';
import { applyFacilityAudit } from '../src/facilityAudit.ts';
import { applyFacilityContacts } from '../src/facilityContact.ts';
import { applyFacilityGuidance } from '../src/facilityGuidance.ts';
import { isFacilityWalkingCandidate } from '../src/facilityMapLocation.ts';
import { applyFacilityPresentation } from '../src/facilityPresentation.ts';
import { searchPlaces } from '../src/placeSearch.ts';
import { categoryOf } from '../src/facilityCatalog.ts';

const read = name => JSON.parse(fs.readFileSync(`public/data/${name}`, 'utf8'));
const raw = ['shopping.geojson', 'civic-facilities.geojson'].flatMap(name => read(name).features);
const reviews = read('facility-current.json');
const additions = read('facility-release-additions.json');
const audited = applyFacilityAudit(applyReleaseFacilityAdditions(raw, reviews, additions), read('facility-audit.json'));
const result = applyFacilityGuidance(applyFacilityContacts(applyReleaseTemporaryClosures(audited, additions),
  read('facility-contacts.json')), read('facility-guidance.json'));
const ids = new Map(result.map(f => [f.id, f]));
const presented = applyFacilityPresentation(result, additions);
const changes = new Map(additions.presentation.map(row => [row.id, row]));
assert.equal(changes.size, 26);
assert.deepEqual(presented.map(f => f.id), result.map(f => f.id));
for (const f of presented) {
  const original = ids.get(f.id);
  if (!changes.has(f.id)) assert.equal(f, original);
  else {
    assert.equal(f.geometry, original.geometry);
    assert.equal(f.properties.guide_review, original.properties.guide_review);
    assert.equal(f.properties.source_ids, original.properties.source_ids);
    assert.equal(f.properties.duplicate_of, original.properties.duplicate_of);
  }
}
const find = query => searchPlaces(query, [], presented).facilities;
const halls = new Set(['fuji-yamaguchi', 'osm-node-4098812296']);
assert.deepEqual(find('フジグラン山口').filter(f => halls.has(f.id)).map(f => f.id), ['fuji-yamaguchi']);
assert.deepEqual(find('フジグラン山口 食品館').map(f => f.id), ['osm-node-4098812296']);
assert.deepEqual(find('フジグラン山口 生活館').map(f => f.id), ['fuji-yamaguchi']);
assert.equal(categoryOf(presented.find(f => f.id === 'osm-node-4355096689')).id, 'mall');
assert.equal(categoryOf(presented.find(f => f.id === 'osm-node-4355083195')).id, 'supermarket');
assert(!isFacilityWalkingCandidate(presented.find(f => f.id === 'osm-node-13154614556')));
assert.deepEqual(find('おみやげ街道 新山口新幹線改札内店').map(f => f.id), ['osm-node-13154614556']);
for (const row of changes.values()) {
  if (row.group?.kind !== 'duplicate' || row.id !== row.group.representative) continue;
  const group = [...changes.values()].filter(other => other.group?.representative === row.id);
  assert.deepEqual(find(row.name).filter(f => group.some(g => g.id === f.id)).map(f => f.id), [row.id]);
}
const badGroup = structuredClone(additions);
badGroup.presentation[0].group.representative = 'unrelated';
assert.throws(() => applyFacilityPresentation(result, badGroup), /Invalid facility group/);
const badShape = structuredClone(additions);
badShape.presentation[0].expected.geometry.coordinates = [];
assert.throws(() => applyFacilityPresentation(result, badShape), /source drift/);
for (const id of ['osm-way-477623025', 'osm-node-9472329369']) {
  const before = audited.find(f => f.id === id);
  const after = ids.get(id);
  assert.deepEqual(after.geometry, before.geometry);
  assert.deepEqual(after.properties.audit_review, before.properties.audit_review);
  assert.equal(after.properties.freshness_review.event, 'temporary_closure');
  assert(!isFacilityWalkingCandidate(after));
}
const drifted = structuredClone(additions);
drifted.temporary_closures[0].expected.name += '別店舗';
assert.throws(() => applyReleaseTemporaryClosures(audited, drifted), /Source drift/);
assert.equal(ids.size, result.length);
assert(additions.civic.length && additions.stores.length);
for (const feature of [...additions.civic, ...additions.stores]) {
  assert.deepEqual(ids.get(feature.id), feature);
  assert(isFacilityWalkingCandidate(ids.get(feature.id)));
}
const duplicate = { ...additions, civic: [...additions.civic, additions.civic[0]] };
assert.throws(() => applyReleaseFacilityAdditions(raw, reviews, duplicate), /Invalid civic release addition/);
const misplaced = structuredClone(additions);
misplaced.civic[0].geometry.coordinates[0] = 0;
assert.throws(() => applyReleaseFacilityAdditions(raw, reviews, misplaced), /Invalid civic release addition/);
const wrongName = structuredClone(additions);
wrongName.civic[0].properties.name += '別施設';
assert.throws(() => applyReleaseFacilityAdditions(raw, reviews, wrongName), /disagrees with registry evidence/);
console.log(`Release facilities verified: ${additions.civic.length} civic, ${additions.stores.length} stores, ${result.length} total.`);
