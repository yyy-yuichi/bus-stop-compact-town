import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clusterStops, stopCellSize } from '../src/stopClusters.ts';
import { mapFacilities } from '../src/facilityVisibility.ts';
import { nationalCatalog, municipalCatalog } from '../src/stopCatalog.ts';

const read = name => JSON.parse(fs.readFileSync(`public/data/${name}`, 'utf8'));
const stops = [...nationalCatalog(read('review-national.geojson')).features, ...municipalCatalog(read('review-stops.geojson'), read('review-routes.json'))];
const original = JSON.stringify(stops);
const projected = zoom => stops.map(stop => {
  const [lon, lat] = stop.geometry.coordinates;
  const scale = 256 * 2 ** zoom;
  const sin = Math.sin(lat * Math.PI / 180);
  return { stop, x: (lon + 180) / 360 * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
});
const counts = {};
for (const zoom of [8, 9, 9.25, 10, 11, 12, 13, 14, 17]) {
  const groups = clusterStops(projected(zoom), stopCellSize(zoom));
  counts[zoom] = groups.length;
  const ids = groups.flatMap(g => g.stops.map(s => s.id));
  assert.equal(ids.length, 5325);
  assert.equal(new Set(ids).size, 5325, 'No source registration may disappear or be duplicated');
  for (const g of groups) assert(Number.isFinite(g.x) && Number.isFinite(g.y));
  if (zoom < 14) for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
    assert(Math.hypot(groups[i].x - groups[j].x, groups[i].y - groups[j].y) >= stopCellSize(zoom) * 0.72, 'Badges must not overlap');
  }
  if (zoom >= 14) assert(groups.every(g => g.stops.length === 1));
}
assert(counts[9] < 60, 'County overview must avoid a dense marker carpet');
assert(counts[13] > counts[9]);
assert.equal(JSON.stringify(stops), original, 'Display clustering must never mutate source coordinates or IDs');
const coincident = [{stop: stops[0], x: -1, y: -1}, {stop: stops[1], x: -1, y: -1}];
assert.equal(clusterStops(coincident, 96)[0].stops.length, 2);
assert.equal(clusterStops(coincident, 0).length, 2, 'Identical coordinates remain separate registrations when expanded');
const boundary = [{stop: stops[0], x: -0.01, y: 0}, {stop: stops[1], x: 0, y: 0}];
assert.equal(clusterStops(boundary, 96)[0].stops.length, 2, 'Merge close points across a cell boundary');

const facilities = read('shopping.geojson').features;
const allCategories = ['mall', 'supermarket', 'drugstore', 'convenience', 'pharmacy', 'hospital', 'clinic', 'post_office', 'bank', 'library', 'townhall', 'community_centre'];
const chosen = facilities.find(f => f.properties.category === 'supermarket');
const reference = facilities.find(f => f.properties.category === 'reference');
const walking = {scope: 'stop-a:15', ids: [String(chosen.id), String(reference.id)]};
assert.deepEqual(mapFacilities(facilities, allCategories, null, '', walking), []);
assert.deepEqual(mapFacilities(facilities, allCategories, null, 'stop-b:15', walking), []);
assert.deepEqual(mapFacilities(facilities, allCategories, null, 'stop-a:5', walking), [], 'Old time-budget results must not flash on the new selection');
assert.deepEqual(mapFacilities(facilities, allCategories, null, 'stop-a:15', null), []);
assert.deepEqual(mapFacilities(facilities, allCategories, null, 'stop-a:15', walking), [chosen]);
assert.deepEqual(mapFacilities(facilities, ['hospital'], null, 'stop-a:15', walking), []);
assert.deepEqual(mapFacilities(facilities, [], reference, '', null), [reference], 'Search and old facility links must still open their selected record');
const neighbor = facilities.find(f => f.id !== chosen.id && allCategories.includes(f.properties.category));
const twoCandidates = { scope: 'stop-a:15', ids: [String(chosen.id), String(neighbor.id)] };
const expectedNeighbors = facilities.filter(f => twoCandidates.ids.includes(String(f.id)));
assert.deepEqual(mapFacilities(facilities, allCategories, chosen, 'stop-a:15', twoCandidates), expectedNeighbors, 'Opening facility details must retain nearby walking candidates without duplicating the chosen facility');
assert.deepEqual(mapFacilities(facilities, [], chosen, 'stop-a:15', twoCandidates), [chosen], 'Category filtering must still apply to the other candidates');
assert.deepEqual(mapFacilities(facilities, allCategories, chosen, 'stop-b:15', twoCandidates), [chosen], 'A selected facility must not revive a previous stop catchment');
assert.deepEqual(mapFacilities(facilities, allCategories, chosen, 'stop-a:5', twoCandidates), [chosen], 'A selected facility must not revive a previous time budget');
console.log(JSON.stringify({registrations: stops.length, clustersByZoom: counts, facilityScopeChecks: 'passed'}));
