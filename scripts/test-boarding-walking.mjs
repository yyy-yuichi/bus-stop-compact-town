import assert from 'node:assert/strict';
import fs from 'node:fs';
import { attachBoardingGuides } from '../src/boardingGuide.ts';
import { attachBoardingWalks } from '../src/boardingWalking.ts';
import { municipalCatalog, nationalCatalog } from '../src/stopCatalog.ts';
import { parseCatchment, bakedFacilityCandidates, prepareFacilities, clipCatchment, WALKING_METERS_PER_MINUTE } from '../src/bakedWalking.ts';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const study = read('src/data/boarding-guide-study.json');
const index = read('src/data/boarding-walk-study/index.json');
const raw = [...nationalCatalog(read('public/data/review-national.geojson')).features,
  ...municipalCatalog(read('public/data/review-stops.geojson'), read('public/data/review-routes.json'))];
const stops = attachBoardingGuides(raw, study);
const before = JSON.stringify(stops);
const urls = Object.fromEntries(Object.values(index.stops).filter(e => e.file).map(e => [e.file, `/assets/${e.file}`]));
const attached = attachBoardingWalks(stops, index, urls);
assert.equal(JSON.stringify(stops), before, 'Source stops are not mutated');
assert.equal(attached.filter(s => s.properties.boarding_walk).length, Object.keys(index.stops).length);
const facilities = prepareFacilities([...read('public/data/shopping.geojson').features, ...read('public/data/civic-facilities.geojson').features]);
const results = {};
let count = 0;
for (const [id, entry] of Object.entries(index.stops)) {
  assert.deepEqual(entry.origin, study.guides[id].source_coordinates);
  if (!entry.file) {
    assert(entry.gap == null || entry.gap > index.snap_limit, `${id}: Missing catchment needs a recorded connection gap`);
    continue;
  }
  const catchment = parseCatchment(read(`src/data/boarding-walk-study/${entry.file}`));
  assert.equal(catchment.stopId, id);
  assert.deepEqual(catchment.origin, entry.origin);
  assert(catchment.snapGap <= 30);
  for (const minutes of [5, 10, 15]) {
    const clipped = clipCatchment(catchment, minutes * WALKING_METERS_PER_MINUTE);
    assert(clipped.segments.every(s => Math.max(s.d1, s.d2) <= clipped.budget));
  }
  if (study.guides[id].group_id.startsWith('hub:') || id.startsWith('hikari:4_') || study.guides[id].number === '1' || ['hikari:1_01', 'iwakuni:684_01', 'iwakuni:684_02', 'iwakuni:i-438_01', 'iwakuni:i-439_01', 'iwakuni:i-319_01', 'iwakuni:108_01', 'iwakuni:176_01'].includes(id)) {
    const candidates = bakedFacilityCandidates(catchment, facilities);
    results[id] = [5, 10, 15].map(m => candidates.filter(c => c.meters <= m * WALKING_METERS_PER_MINUTE).length);
  }
  count++;
}
for (const id of ['hikari:4_01', 'hikari:4_02', 'hikari:1_01', 'iwakuni:684_01', 'iwakuni:684_02']) {
  assert(index.stops[id].file, `${id} must have its own walking catchment`);
  assert(results[id].every(n => n > 0));
}
assert.notEqual(index.stops['hikari:4_01'].file, index.stops['hikari:4_02'].file);
const wrong = structuredClone(index);
wrong.stops['hikari:4_01'].origin = index.stops['hikari:4_02'].origin;
assert.throws(() => attachBoardingWalks(stops, wrong, urls), /origin mismatch/);
assert.throws(() => attachBoardingWalks(stops, index, {}), /Missing boarding walk file/);
// The original origin must retain the original method's facility membership.
const baselineRaw = read('data-sources/boarding-walking-20260914/national-nishigawara.json');
if (fs.existsSync('work/boarding-walking-20260914/baseline-nishigawara.json')) {
  assert.deepEqual(read('work/boarding-walking-20260914/baseline-nishigawara.json'), baselineRaw, 'Recomputed original catchment exactly matches the published data');
}
if (fs.existsSync('work/regional-boarding-20260914/baseline-nishigawara.json')) {
  assert.deepEqual(read('work/regional-boarding-20260914/baseline-nishigawara.json'), baselineRaw, 'Regional graph retains the original walking method');
}
const baseline = parseCatchment(baselineRaw);
if (fs.existsSync('work/western-hubs-20260914/baseline-nishigawara.json')) assert.deepEqual(read('work/western-hubs-20260914/baseline-nishigawara.json'), baselineRaw);
for (const id of ['node/3640500398','node/3640500395','node/3640500394','node/6282455344','node/6282455343']) {
  assert(index.stops[id].file);
  assert(results[id].every(n => n > 0));
}
for (const id of ['node/3640500397','node/3640500396','node/3640475990']) assert(!index.stops[id]);
assert.notEqual(index.stops['node/3640500395'].file, index.stops['node/3640500394'].file);
const baseCandidates = bakedFacilityCandidates(baseline, facilities);
assert.equal(baseCandidates.filter(c => c.meters <= 1000).length, 44);
console.log(JSON.stringify({ baked: count, original_nishigawara_15min: 44, counts_by_minutes: results }));
