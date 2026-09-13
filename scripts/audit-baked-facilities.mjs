import fs from 'node:fs';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseCatchment, prepareFacilities, bakedFacilityCandidates, WALKING_METERS_PER_MINUTE } from '../src/bakedWalking.ts';

const root = 'data-sources/walking-facilities-20260913';
const cases = JSON.parse(fs.readFileSync(`${root}/cases.json`, 'utf8'));
const facilities = JSON.parse(fs.readFileSync('public/data/shopping.geojson', 'utf8')).features;
const prepared = prepareFacilities(facilities);
const stops = JSON.parse(fs.readFileSync('public/data/review-national.geojson', 'utf8')).features;
const results = [];
for (const test of cases) {
  const bytes = fs.readFileSync(`${root}/catchments/${test.catchment}.json`);
  const catchment = parseCatchment(JSON.parse(bytes));
  const stop = stops.find(s => s.id === test.id);
  if (!stop || stop.properties.name !== test.name || catchment.stopId !== test.catchment) throw Error(`Mismatched source: ${test.id}`);
  const started = performance.now();
  const candidates = bakedFacilityCandidates(catchment, prepared);
  const elapsedMs = performance.now() - started;
  const bands = [5,10,15].map(minutes => ({ minutes, total: candidates.filter(f => f.meters <= minutes * WALKING_METERS_PER_MINUTE).length,
    shopping: candidates.filter(f => f.group === 'shopping' && f.meters <= minutes * WALKING_METERS_PER_MINUTE).length,
    medical: candidates.filter(f => f.group === 'medical' && f.meters <= minutes * WALKING_METERS_PER_MINUTE).length }));
  const result = { ...test, catchment_sha256: crypto.createHash('sha256').update(bytes).digest('hex'), segments: catchment.segments.length,
    elapsed_ms: Math.round(elapsedMs * 100) / 100, bands, candidates: candidates.map(f => ({ id: f.facility.id, name: f.facility.properties.name,
      category: f.facility.properties.category, geometry: f.facility.geometry.type, group: f.group, road_minutes: f.meters / WALKING_METERS_PER_MINUTE,
      road_distance: f.meters, straight_gap: f.gap, road_point: f.roadPoint, facility_point: f.facilityPoint })) };
  results.push(result);
  console.log(JSON.stringify({ name: test.name, elapsed_ms: result.elapsed_ms, bands, candidates: result.candidates.map(f => ({ id:f.id,name:f.name,group:f.group,minutes:Math.round(f.road_minutes*10)/10,gap:Math.round(f.straight_gap*10)/10 })) }));
}
fs.writeFileSync(`${root}/audit.json`, JSON.stringify({ method: 'Nearest point/area boundary on each reachable baked road segment, gap <= 25 m; lowest matching baked cost; not a verified entrance route.', source_records: facilities.length, eligible_records: prepared.length, results }, null, 2)+'\n');
