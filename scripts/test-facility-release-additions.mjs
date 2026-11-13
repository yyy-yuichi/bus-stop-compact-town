import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyReleaseFacilityAdditions } from '../src/facilityReleaseAdditions.ts';
import { applyFacilityAudit } from '../src/facilityAudit.ts';
import { applyFacilityContacts } from '../src/facilityContact.ts';
import { applyFacilityGuidance } from '../src/facilityGuidance.ts';
import { isFacilityWalkingCandidate } from '../src/facilityMapLocation.ts';

const read = name => JSON.parse(fs.readFileSync(`public/data/${name}`, 'utf8'));
const raw = ['shopping.geojson', 'civic-facilities.geojson'].flatMap(name => read(name).features);
const reviews = read('facility-current.json');
const additions = read('facility-release-additions.json');
const result = applyFacilityGuidance(applyFacilityContacts(applyFacilityAudit(
  applyReleaseFacilityAdditions(raw, reviews, additions), read('facility-audit.json')),
read('facility-contacts.json')), read('facility-guidance.json'));
const ids = new Map(result.map(f => [f.id, f]));
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
