import assert from 'node:assert/strict';
import fs from 'node:fs';
import { attachBoardingGuides, boardingChoices, boardingTitle } from '../src/boardingGuide.ts';
import { attachBoardingWalks } from '../src/boardingWalking.ts';
import { parseCatchment, prepareFacilities, bakedFacilityCandidates, WALKING_METERS_PER_MINUTE } from '../src/bakedWalking.ts';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const study = read('src/data/boarding-guide-study.json');
const index = read('src/data/boarding-walk-study/index.json');
const original = new Map(read('public/data/bus_stop.geojson').features.map(f => [f.id, f]));
const ledger = read('data-sources/sanden-hubs-20260915/locations.json');
const expected = {
  'node/4495510084': ['新下関駅', '1', 4], 'node/4495510080': ['新下関駅', '2', 4],
  'node/4495510081': ['新下関駅', '3', 4], 'node/4495510083': ['新下関駅', '4', 4],
  'node/2582068065': ['小月駅', '1', 3], 'node/2582068069': ['小月駅', '2', 3],
  'node/1353503115': ['小月駅', '3', 3], 'node/6924153238': ['長府駅', 'A', 3],
  'node/3500214608': ['長府駅前', 'B', 3], 'node/3500214607': ['長府駅前', 'C', 3],
};
const subset = {version: 1, guides: Object.fromEntries(Object.keys(expected).map(id => [id, study.guides[id]])),
  hub_points: study.hub_points.filter(p => expected[p.id])};
const stops = attachBoardingGuides([], subset);
assert.equal(stops.length, 10);
assert.equal(ledger.length, 10);
const facilities = prepareFacilities([...read('public/data/shopping.geojson').features, ...read('public/data/civic-facilities.geojson').features]);
const counts = {};
for (const stop of stops) {
  const [name, number, choices] = expected[stop.id];
  assert.equal(boardingTitle(stop), stop.id === 'node/6924153238' ? '長府駅（番号対応未確認）' : `${name} ${number}のりば`);
  assert.deepEqual(stop.geometry, original.get(stop.id).geometry);
  assert.equal(boardingChoices(stop, stops).length, choices);
  assert.equal(stop.properties.location_kind, 'unverified');
  const entry = index.stops[stop.id];
  if (stop.id === 'node/6924153238') {
    assert.equal(stop.properties.boarding_guide.number, null);
    assert(stop.properties.boarding_guide.assignment_hold);
    assert.equal(entry, undefined);
    counts[stop.id] = {assignment_hold: true};
    continue;
  }
  assert.deepEqual(entry.origin, stop.geometry.coordinates);
  if (entry.file) {
    const c = parseCatchment(read(`src/data/boarding-walk-study/${entry.file}`));
    assert.equal(c.stopId, stop.id);
    assert.deepEqual(c.origin, entry.origin);
    assert(c.snapGap <= 30);
    const candidates = bakedFacilityCandidates(c, facilities);
    counts[stop.id] = {minutes: [5, 10, 15].map(m => candidates.filter(p => p.meters <= m * WALKING_METERS_PER_MINUTE).length), snap_gap: c.snapGap};
  } else {
    assert(entry.gap > 30);
    counts[stop.id] = {uncalculated: true, gap: entry.gap};
  }
}
assert(!study.guides['node/6924153239'], 'Unnumbered northern Chofu point must not inherit A');
const heldId = 'node/6924153238';
assert.equal(study.guides[heldId].number, null);
const heldIndex = {version: 1, budget: 1000, snap_limit: 30, stops: {
  [heldId]: {origin: study.guides[heldId].source_coordinates, file: 'node-6924153238.json'},
}};
assert.throws(() => attachBoardingWalks(stops, heldIndex, {'node-6924153238.json': '/old.json'}), /origin mismatch/,
  'Even an accidentally restored v14 entry must not attach a catchment to an unconfirmed assignment');
assert.equal(original.get('node/6924153239').properties.name, '長府駅');
for (const value of ['D', 'AA', '1<script>']) {
  const invalid = structuredClone(subset);
  invalid.guides['node/6924153238'].number = value;
  assert.throws(() => attachBoardingGuides([], invalid));
}
if (fs.existsSync('work/sanden-hubs-20260915')) fs.writeFileSync('work/sanden-hubs-20260915/facility-counts.json', JSON.stringify(counts, null, 2));
console.log(JSON.stringify(counts));
