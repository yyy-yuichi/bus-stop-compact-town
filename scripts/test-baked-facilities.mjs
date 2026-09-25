import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bakedFacilityCandidates, prepareFacilities, parseCatchment, clipCatchment, distance, project, WALKING_METERS_PER_MINUTE } from '../src/bakedWalking.ts';

const x = 180 / (Math.PI * 6371000);
const p = (a, b = 0) => [a * x, b * x];
const point = (id, a, b = 0, category = 'supermarket') => ({ type: 'Feature', id, properties: { name: id, category }, geometry: { type: 'Point', coordinates: p(a, b) } });
const area = (id, polygons) => ({ type: 'Feature', id, properties: { name: id, category: 'mall' }, geometry: { type: 'MultiPolygon', coordinates: polygons.map(rings => rings.map(ring => ring.map(([a, b]) => p(a, b)))) } });
const rectangle = (left, bottom, right, top) => [[left, bottom], [right, bottom], [right, top], [left, top], [left, bottom]];
const catchment = (segments, budget = 1000) => parseCatchment({ v: 1, id: '0_0', budget, origin: [0, 0], snap: [0, 0], gap: 0, seg: segments.map(([a, b, d1, d2]) => [...p(...a), ...p(...b), d1, d2, 0, 0]) });
const line = (d1 = 0, d2 = 200) => catchment([[[0, 0], [200, 0], d1, d2]]);
const join = (c, ...f) => bakedFacilityCandidates(c, prepareFacilities(f));
const near = (actual, expected) => assert(Math.abs(actual - expected) < 0.01, `${actual} != ${expected}`);

// A registered point's nearest road projection: strict 25 m cutoff.
let c = line();
let found = join(c, point('within', 100, 24), point('boundary', 100, 25), point('outside', 100, 26));
assert.deepEqual(found.map(f => f.facility.id), ['boundary', 'within']);
near(found[0].meters, 100); near(found[0].gap, 25);
assert.equal(join(c, point('far-road', 600, 0)).length, 0);

// Costs come from the baked distance field, including slopes/detours, not a radius.
found = join(line(500, 900), point('detour', 100, 0));
near(found[0].meters, 700);
assert.equal(found.filter(f => f.meters <= 10 * WALKING_METERS_PER_MINUTE).length, 0);
assert.equal(found.filter(f => f.meters <= 15 * WALKING_METERS_PER_MINUTE).length, 1);
near(join(line(900, 500), point('reverse', 150, 0))[0].meters, 600);
// Five-decimal source coordinates can collapse a short segment to one point.
near(join(catchment([[[10, 0], [10, 0], 100, 90]]), point('collapsed', 10))[0].meters, 90);

// Long sides, road crossings, and roads inside an area cannot be represented by vertices alone.
const crossingArea = area('crossing', [[rectangle(80, -100, 120, 100)]]);
found = join(c, crossingArea);
near(found[0].meters, 80); near(found[0].gap, 0);
found = join(line(200, 0), crossingArea);
near(found[0].meters, 80); near(found[0].roadPoint[0] / x, 120);
found = join(c, area('contains-road', [[rectangle(-30, -30, 230, 30)]]));
near(found[0].meters, 0); near(found[0].gap, 0);
found = join(c, area('long-side', [[rectangle(-100, 20, 300, 100)]]));
near(found[0].meters, 0); near(found[0].gap, 20);

// A courtyard/hole is not occupied by the building. Separate polygons also count.
const holeRoad = catchment([[[40, 0], [60, 0], 100, 120]]);
assert.equal(join(holeRoad, area('courtyard', [[rectangle(-100, -100, 200, 100), rectangle(0, -60, 100, 60)]])).length, 0);
found = join(c, area('separate-buildings', [[rectangle(500, 500, 600, 600)], [rectangle(90, 10, 110, 30)]]));
near(found[0].meters, 90); near(found[0].gap, 10);

// Preserve IDs, separate medical/shopping, and exclude all reference records.
found = join(c, point('shop', 70, 0, 'drugstore'), point('medical', 80, 0, 'pharmacy'), point('reference', 10, 0, 'reference'));
assert.deepEqual(found.map(f => [f.facility.id, f.group]), [['shop', 'shopping'], ['medical', 'medical']]);
for (const category of ['post_office','bank','library','townhall','community_centre']) {
  assert.equal(join(c,point(category,50,0,category))[0].group,'services');
}
for (const [category,group] of Object.entries({ restaurant:'eating',cafe:'eating',fast_food:'eating',bar:'eating',bakery:'shopping',food_shop:'shopping',dentist:'medical',childcare:'education',school:'education',college:'education',park:'leisure',playground:'leisure',sports_centre:'leisure',social_facility:'welfare',laundry:'services',hairdresser:'services' })) {
  assert.equal(join(c,point(category,50,0,category))[0].group,group);
}
const schoolArea = structuredClone(crossingArea); schoolArea.properties.category = 'school';
near(join(c,schoolArea)[0].meters,80);
assert.equal(join(c).length, 0);
assert.equal(bakedFacilityCandidates({ ...c, segments: [] }, prepareFacilities([point('empty', 10)])).length, 0);

// Switching minutes clips both directions without changing the baked color/distance scale.
const forward = clipCatchment(line(0, 1000), 5 * WALKING_METERS_PER_MINUTE);
near(forward.segments[0].d2, 1000 / 3); near(forward.segments[0].b[0] / x, 200 / 3);
const reverse = clipCatchment(line(1000, 0), 10 * WALKING_METERS_PER_MINUTE);
near(reverse.segments[0].d1, 2000 / 3); near(reverse.segments[0].a[0] / x, 200 / 3);
assert.equal(clipCatchment(line(500, 900), 100).segments.length, 0);
assert.equal(clipCatchment(c, 2000).budget, 1000);
for (const budget of [0, -1, NaN, Infinity]) assert.throws(() => clipCatchment(c, budget));
assert.equal(c.segments[0].d2, 200, 'Never modify received data');

// Real records and R2 samples, checked independently against the serialized distance field.
const fixtureRoot = 'data-sources/walking-facilities-20260913';
const cases = [
  ...JSON.parse(fs.readFileSync(`${fixtureRoot}/cases.json`, 'utf8')).map(test => ({ ...test, fixture: `${fixtureRoot}/catchments/${test.catchment}.json` })),
  { name: '北河内駅（国の起点）', catchment: '132.06421_34.17587', expectedCounts: [0, 0, 0], fixture: 'data-sources/regional-map-20260913/132.06421_34.17587.json' },
  { name: '光駅（国の起点）', catchment: '131.91505_33.97351', expectedCounts: [2, 3, 6], fixture: 'data-sources/regional-map-20260913/131.91505_33.97351.json' },
];
const facilities = ['shopping', 'civic-facilities'].flatMap(name => JSON.parse(fs.readFileSync(`public/data/${name}.geojson`, 'utf8')).features);
const prepared = prepareFacilities(facilities);
assert.equal(prepared.length, 7708);
for (const test of cases) {
  c = parseCatchment(JSON.parse(fs.readFileSync(test.fixture, 'utf8')));
  found = bakedFacilityCandidates(c, prepared);
  assert.equal(c.stopId, test.catchment);
  const sets = [5, 10, 15].map(minutes => new Set(found.filter(f => f.meters <= minutes * WALKING_METERS_PER_MINUTE).map(f => f.facility.id)));
  assert([...sets[0]].every(id => sets[1].has(id)) && [...sets[1]].every(id => sets[2].has(id)), `${test.name}: time sets must nest`);
  assert.equal(new Set(found.map(f => f.facility.id)).size, found.length, 'One row per source record');
  for (const f of found) {
    assert(f.gap <= 25.000001 && f.meters >= 0 && f.meters <= c.budget);
    near(distance(f.roadPoint, f.facilityPoint), f.gap);
    assert(c.segments.some(s => {
      const q = project(f.roadPoint, s.a, s.b);
      const cost = s.a[0] === s.b[0] && s.a[1] === s.b[1] ? Math.min(s.d1, s.d2) : s.d1 + (s.d2 - s.d1) * q.t;
      return q.gap < 0.01 && Math.abs(cost - f.meters) < 0.01;
    }), `${test.name}/${f.facility.id}: cost must match a real baked road`);
  }
  const originalIds = new Set(facilities.slice(0,1135).map(f=>f.id));
  const old = found.filter(f=>originalIds.has(f.facility.id));
  assert.deepEqual([5,10,15].map(minutes=>old.filter(f=>f.meters<=minutes*WALKING_METERS_PER_MINUTE).length),test.expectedCounts,`${test.name}: original facility results changed`);
}
console.log(`Baked facility checks passed: points, 25 m cutoff, slope/detour costs, polygons/holes/crossings, groups, clipping, and ${cases.length} real locations.`);
