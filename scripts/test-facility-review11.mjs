import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyFacilityAudit, validateAuditReview } from '../src/facilityAudit.ts';
import { applyFacilityCurrent, facilityAvailable } from '../src/facilityFreshness.ts';
import { hasMapLocationIssue, isFacilityWalkingCandidate } from '../src/facilityMapLocation.ts';
import { bakedFacilityCandidates, nearbyFacilityCandidates, prepareFacilities, distance } from '../src/bakedWalking.ts';
import { mapFacilities } from '../src/facilityVisibility.ts';
import { searchPlaces } from '../src/placeSearch.ts';

const care = [
  ['civic-KD0000900041', 885.9],
  ['civic-care-3570104848-c0d8ed2640', 128.1],
  ['civic-care-3571501935-6ff00a4724', 5542.1],
  ['civic-care-3577100807-f7b455679e', 93.1],
  ['civic-care-3557180027-5575c06198', 1619.0],
  ['civic-care-3591200062-537d813349', 7180.5],
  ['civic-care-3590600387-b9f6dece36', 1925.9],
];
const unverifiedIds = [...care.slice(0, 6).map(([id]) => id), 'osm-node-7710431649', 'osm-node-5878954963'];
const differentId = care[6][0];
const unflaggedIds = ['osm-node-6514743790', 'osm-way-378279929'];
const targetIds = [...unverifiedIds, differentId, ...unflaggedIds];
const read = file => JSON.parse(fs.readFileSync(`public/data/${file}`, 'utf8'));
const raw = [...read('shopping.geojson').features, ...read('civic-facilities.geojson').features];
const previous = applyFacilityCurrent(raw, read('facility-current.json'));
const audit = read('facility-audit.json');
const facilities = applyFacilityAudit(previous, audit);
const byId = new Map(facilities.map(f => [String(f.id), f]));
const targets = targetIds.map(id => {
  const f = byId.get(id);
  assert(f, `Reviewed target ${id} must still exist`);
  return f;
});
// Deliberately artificial roads pass through each original geometry. These are
// eligibility regression tests, not evidence of real roads or walkable access.
const syntheticCatchment = f => {
  const point = f.geometry.type === 'Point' ? f.geometry.coordinates : f.geometry.coordinates[0][0][0];
  const dx = 10 * 180 / (Math.PI * 6371000 * Math.cos(point[1] * Math.PI / 180));
  const origin = [point[0] - dx, point[1]], end = [point[0] + dx, point[1]];
  return { stopId: 'fixture', budget: 1000, origin, snap: origin, snapGap: 0,
    segments: [{ a: origin, b: end, d1: 0, d2: 20, grade: 0, steps: false }] };
};

test('reviewed 11 retain their nine flags alongside Cellneg and four scoped-support flags', () => {
  assert.equal(raw.length, 7764);
  assert.equal(facilities.length, 8369);
  assert.equal(new Set(facilities.map(f => String(f.id))).size, 8369);
  assert.deepEqual(audit.counts, { reviewed: 2828, limited_support: 1344, unresolved: 1484, recovered_registry: 23 });
  for (const f of targets) {
    assert.equal(f.properties.audit_review.status, 'limited_support');
    assert.equal(f.properties.audit_review.checked_at, '2026-10-08');
    validateAuditReview(f.properties.audit_review, audit.checked_at);
  }
  const flagged = facilities.filter(hasMapLocationIssue);
  assert.deepEqual(flagged.map(f => String(f.id)).sort(), [...unverifiedIds, differentId, 'civic-care-3570106660-61245f957a', 'civic-KD0000900073', 'civic-care-3577100351-2f51378053', 'osm-node-1423657369', 'osm-node-1631278422'].sort());
  for (const id of unverifiedIds) assert.equal(byId.get(id).properties.audit_review.map_location.status, 'unverified');
  assert.equal(byId.get(differentId).properties.audit_review.map_location.status, 'different_from_current');
  for (const id of unflaggedIds) assert.equal(byId.get(id).properties.audit_review.map_location, undefined);
  assert(!facilities.some(f => String(f.id).startsWith('map-location-fixture-')), 'Synthetic position examples must never enter public data');
});

test('all 11 preserve original IDs, names, addresses, geometry, classification and operational meanings', () => {
  for (const f of targets) {
    const original = raw.find(old => String(old.id) === String(f.id));
    assert(original);
    assert.equal(f.id, original.id);
    assert.deepEqual(f.geometry, original.geometry);
    const { audit_review, ...unchangedProperties } = f.properties;
    assert.deepEqual(unchangedProperties, original.properties);
    assert.equal(facilityAvailable(f), facilityAvailable(original));
    assert.equal(f.properties.official_address, '', 'Current evidence must not silently fill the originally empty official address');
    assert.equal(f.properties.freshness_review, undefined, 'Scoped identity/location evidence must not create an operational event');
    assert.equal(audit_review.status, 'limited_support');
  }
  for (const id of ['osm-node-7710431649', 'osm-node-5878954963', 'osm-way-378279929']) assert.equal(byId.get(id).properties.address, '');
});

test('all nine flagged original geometries are excluded from baked, nearby and pilot candidate eligibility', () => {
  for (const id of [...unverifiedIds, differentId]) {
    const f = byId.get(id), c = syntheticCatchment(f);
    const beforeFlag = structuredClone(f);
    delete beforeFlag.properties.audit_review.map_location;
    assert.equal(bakedFacilityCandidates(c, prepareFacilities([beforeFlag])).length, 1, `${id}: artificial old-position road must qualify before the explicit flag`);
    assert.equal(nearbyFacilityCandidates(c.origin, prepareFacilities([beforeFlag])).length, 1);
    assert.equal(bakedFacilityCandidates(c, prepareFacilities([f])).length, 0, `${id}: no original-point baked candidate`);
    assert.equal(nearbyFacilityCandidates(c.origin, prepareFacilities([f])).length, 0, `${id}: no original-point nearby candidate`);
    assert(!isFacilityWalkingCandidate(f), `${id}: no original-point pilot candidate`);
  }
});

test('the two unflagged reviewed records keep prior candidate behavior', () => {
  for (const id of unflaggedIds) {
    const f = byId.get(id), c = syntheticCatchment(f);
    assert(isFacilityWalkingCandidate(f));
    assert.equal(bakedFacilityCandidates(c, prepareFacilities([f])).length, 1, `${id}: a new review must not blanket-exclude the record`);
    assert.equal(nearbyFacilityCandidates(c.origin, prepareFacilities([f])).length, 1);
  }
});

test('seven care evidence points and dates remain separate from the original walking destinations', () => {
  for (const [i, [id, meters]] of care.entries()) {
    const f = byId.get(id), location = f.properties.audit_review.map_location;
    assert(location.current_location, `${id}: separate official-point evidence must be retained`);
    assert.notDeepEqual(location.current_location.coordinates, f.geometry.coordinates);
    assert.equal(location.current_location.distance_from_original_m, meters);
    assert(Math.abs(distance(f.geometry.coordinates, location.current_location.coordinates) - meters) < 0.2, `${id}: recorded distance must agree with the separate points`);
    assert.equal(location.current_location.source.retrieved_at, '2026-10-08');
    if (i < 6) {
      assert.equal(location.current_location.source.as_of, '2026-06-30');
      assert(location.current_location.source.title.includes('07-09'));
      assert.equal(location.status, 'unverified', 'Even a large distance alone must not become a relocation finding');
    } else {
      assert.equal(location.current_location.source.as_of, undefined);
      assert.equal(location.current_location.source.published_at, undefined, 'An undisplayed update date must not be invented');
      assert(JSON.stringify(f.properties.audit_review).includes('2026-09-01'), 'The stated event date remains separate from retrieval');
    }
  }
});

test('all reviewed records stay searchable and deliberately selectable with their original geometry', () => {
  const scope = 'review11-test:15';
  const walking = { scope, ids: targetIds };
  const categories = ['social_facility', 'community_centre', 'sports_centre'];
  assert.deepEqual(mapFacilities(targets, categories, null, scope, walking).map(f => String(f.id)).sort(), [...unflaggedIds].sort());
  for (const f of targets) {
    assert(searchPlaces(f.properties.name, [], targets).facilities.some(found => found.id === f.id));
    const selected = mapFacilities(targets, categories, f, scope, walking).find(found => found.id === f.id);
    assert(selected);
    assert.deepEqual(selected.geometry, f.geometry);
  }
});
