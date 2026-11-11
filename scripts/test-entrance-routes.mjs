import assert from 'node:assert/strict';
import fs from 'node:fs';
import { entranceInputFor, entranceStudyFor, applyEntranceStudy, displayStudyMinutes, entranceRouteWithin } from '../src/entranceRouteStudy.ts';
import { parseCatchment, prepareFacilities, bakedFacilityCandidates, WALKING_METERS_PER_MINUTE } from '../src/bakedWalking.ts';
import { applyFacilityCurrent } from '../src/facilityFreshness.ts';
import { applyFacilityAudit } from '../src/facilityAudit.ts';
import { applyFacilityContacts } from '../src/facilityContact.ts';
import { applyFacilityGuidance } from '../src/facilityGuidance.ts';
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const source = read('src/data/entrance-route-study.json');
const catalog = read('public/data/review-national.geojson').features;
const data = name => read(`public/data/${name}`);
const facilities = applyFacilityGuidance(applyFacilityContacts(applyFacilityAudit(applyFacilityCurrent(
  ['shopping.geojson', 'civic-facilities.geojson'].flatMap(name => data(name).features), data('facility-current.json')),
  data('facility-audit.json')), data('facility-contacts.json')), data('facility-guidance.json'));
const prepared = prepareFacilities(facilities);
let selected = 0, outside = 0, pairs = 0, indoor = 0, provisional = 0;
const counts = [0, 0, 0];
for (const feature of catalog) {
  const origin = feature.geometry.coordinates;
  const id = origin.map(value => Number(value.toFixed(5))).join('_');
  if (Object.hasOwn(source.origins, id)) {
    assert.ok(entranceInputFor(id, origin)); selected++;
  } else { assert.equal(entranceInputFor(id, origin), null); outside++; }
}
assert.equal(selected, 24); assert.equal(outside, 4394);
for (const [id, origin] of Object.entries(source.origins)) {
  const raw = parseCatchment(read(`public/data/entrance-walk/${id}.json`));
  assert.ok(entranceStudyFor(raw));
  assert.equal(entranceInputFor(`boarding:${id}`, origin.origin), null);
  assert.equal(entranceInputFor(id, [origin.origin[0] + 0.001, origin.origin[1]]), null);
  assert.equal(entranceStudyFor({ ...raw, origin: [raw.origin[0] + 0.000001, raw.origin[1]] }), null);
  const base = bakedFacilityCandidates(raw, prepared);
  const result = applyEntranceStudy(base, entranceStudyFor(raw), 'confirmed');
  assert.deepEqual(result.mismatches, []);
  const affected = new Set(origin.pairs.map(pair => pair.facilityId));
  for (const item of result.candidates) {
    if (!affected.has(String(item.facility.id))) {
      assert.deepEqual(item, base.find(before => before.facility.id === item.facility.id)); continue;
    }
    assert.ok(item.entranceRoute); pairs++;
    indoor += Number(item.entranceRoute.scope === 'outdoor');
    provisional += Number(item.entranceRoute.provisional);
    [5, 10, 15].forEach((minutes, i) => counts[i] += Number(item.meters <= minutes * WALKING_METERS_PER_MINUTE));
    assert.equal(displayStudyMinutes(item.meters), Math.ceil(item.meters / WALKING_METERS_PER_MINUTE));
    assert.deepEqual(entranceRouteWithin(item.entranceRoute, item.entranceRoute.startMeters), []);
  }
  const drifted = base.map(candidate => affected.has(String(candidate.facility.id)) ? { ...candidate, meters: candidate.meters + 1 } : candidate);
  const held = applyEntranceStudy(drifted, origin, 'confirmed');
  assert.equal(held.mismatches.length, affected.size);
  assert.ok(held.candidates.every(candidate => candidate.entranceRoute === undefined));
  if (id === '130.94718_33.99507') {
    assert.deepEqual([5, 10, 15].map(minutes => result.candidates.filter(row => row.meters <= minutes * WALKING_METERS_PER_MINUTE).length), [0, 11, 19]);
    const parks = new Map(result.candidates.map(row => [String(row.facility.id), displayStudyMinutes(row.meters)]));
    for (const [facilityId, expected] of [['osm-way-1112639043', 10], ['osm-way-733766509', 8], ['osm-way-733766130', 9], ['osm-way-733766091', 11]]) assert.equal(parks.get(facilityId), expected);
  }
}
assert.equal(pairs, 26); assert.equal(indoor, 4); assert.equal(provisional, 1);
assert.deepEqual(counts, [4, 19, 26]);
console.log(JSON.stringify({ nationalPins: selected, otherNationalPinsRejected: outside, origins: Object.keys(source.origins).length, pairs, indoor, provisional, counts }));
