import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nationalCatalog, pilotCatalog } from '../src/stopCatalog.ts';
const read = name => JSON.parse(fs.readFileSync(`public/data/${name}`, 'utf8'));
const national = read('review-national.geojson');
const before = JSON.stringify(national);
const catalog = nationalCatalog(national);
assert.equal(catalog.features.length, 4418);
assert.equal(JSON.stringify(national), before, 'Original data must remain intact');
for (const [i, stop] of catalog.features.entries()) {
  assert.deepEqual(stop.geometry, national.features[i].geometry);
  assert.equal(stop.properties.stop_area_id, stop.id);
  assert.equal(stop.properties.location_kind, 'representative');
  assert.equal(stop.properties.source_kind, 'national');
}
assert.throws(() => nationalCatalog({ ...national, features: [national.features[0], national.features[0]] }));
const osm = read('bus_stop.geojson');
const graph = read('walking-onoda.json');
const pilot = pilotCatalog(osm, graph.pilot_stops.map(s => s.id));
assert.equal(pilot.features.length, 7);
assert.equal(pilot.features[0].id, graph.pilot_stops[0].id, 'Start at the intended pilot stop');
for (const stop of pilot.features) {
  assert.equal(stop.properties.stop_area_id, undefined, 'No unverified national/OSM association');
  assert.equal(stop.properties.source_kind, 'osm-pilot');
  assert.deepEqual(stop.geometry, osm.features.find(f => f.id === stop.id).geometry);
  assert(!catalog.features.some(f => f.id === stop.id));
}
assert.throws(() => pilotCatalog(osm, ['node/does-not-exist']));
console.log('Stop catalog: 4418 representatives; 7 unchanged independent pilot origins; invalid IDs rejected.');
