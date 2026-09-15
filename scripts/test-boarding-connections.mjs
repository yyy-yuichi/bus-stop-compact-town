import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boardingChoices } from '../src/boardingGuide.ts';
import { parseCatchment } from '../src/bakedWalking.ts';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const study = read('src/data/boarding-guide-study.json');
const index = read('src/data/boarding-walk-study/index.json');
const points = study.hub_points.map(s => ({...s, properties:{...s.properties, boarding_guide:study.guides[s.id]}}));
const byId = new Map(points.map(s => [s.id,s]));
let added=0;
for (const bus of ['00450085','00450031','00451189']) {
  const source=read(`data-sources/boarding-connections-20260915/${bus}.json`);
  const poles=source.generations.find(g=>g.isCurrent).poles;
  const expected=poles.map(p=>`bocho:${bus}-${p.id}`).sort();
  for (const pole of poles) {
    const id=`bocho:${bus}-${pole.id}`, point=byId.get(id);
    assert(point);
    assert.deepEqual(point.geometry.coordinates,[pole.longitude,pole.latitude]);
    assert.equal(point.properties.source_pole_name,pole.name);
    assert.equal(study.guides[id].number,null);
    assert.deepEqual(boardingChoices(point,points).map(p=>p.id).sort(),expected);
    assert.deepEqual(index.stops[id].origin,point.geometry.coordinates);
    added++;
  }
}
assert.equal(added,8);
assert.equal(study.guides['bocho:00451189-000000002589'].summary,'広島バスセンター方面');
assert.equal(study.guides['bocho:00451189-000000002586'].summary,'県庁・宮野・仁保方面');
assert.notDeepEqual(index.stops['bocho:00451189-000000002589'].origin,index.stops['bocho:00451189-000000002586'].origin);
for(const id of ['bocho:00450541-000000001218','bocho:00450536-000000001209','bocho:00450536-000000001208']) {
  const entry=index.stops[id];
  assert(entry.file,`${id}: the source area must now have a calculated catchment`);
  const catchment=parseCatchment(read(`src/data/boarding-walk-study/${entry.file}`));
  assert.equal(catchment.stopId,id);
  assert.deepEqual(catchment.origin,study.guides[id].source_coordinates);
  assert(catchment.snapGap<=30);
}
console.log('Boarding connections passed: southern catchments, 8 original platform registrations, directions and separate groups.');
