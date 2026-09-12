import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nationalCatalog, nationalCatchmentId, pilotCatalog } from '../src/stopCatalog.ts';
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
// Every displayed original row must still refer to its exact P11 source record.
// Rounded coordinates select an already-baked field, without replacing map IDs.
const source = JSON.parse(fs.readFileSync('raw_data/P11-22_35.geojson', 'utf8')).features;
const baked = read('baked-bus-stops.geojson');
const bakedIds = new Set(baked.features.map(f => f.id));
const mapped = new Set();
assert.equal(source.length, catalog.features.length);
for (const [i, stop] of catalog.features.entries()) {
  assert.equal(stop.id, `mlit-p11-22-35:${i + 1}`);
  assert.deepEqual(stop.geometry, source[i].geometry);
  assert.equal(stop.properties.name, source[i].properties.P11_001);
  const id = nationalCatchmentId(stop);
  assert(bakedIds.has(id), `${stop.id}: missing baked origin ${id}`);
  mapped.add(id);
}
assert.equal(mapped.size, 3946);
assert.deepEqual(mapped, bakedIds);
for (const stop of pilot.features) assert.throws(() => nationalCatchmentId(stop), 'Never join an OSM stop by proximity');
const unreachable = read('walk-unreachable.json').stops;
assert.equal(Object.keys(unreachable).length, 289);
assert(Object.keys(unreachable).every(id => bakedIds.has(id)));
console.log('Stop catalog: 4418 original rows map to 3946 baked origins; 289 unconnected origins; 7 unchanged independent OSM pilots.');
