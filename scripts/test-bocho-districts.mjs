import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boardingChoices } from '../src/boardingGuide.ts';
import { placeLink, readPlaceLink } from '../src/placeLink.ts';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const study=read('src/data/boarding-guide-study.json'), walk=read('src/data/boarding-walk-study/index.json');
const points=study.hub_points.map(s=>({...s,properties:{...s.properties,boarding_guide:study.guides[s.id]}}));
const byId=new Map(points.map(s=>[s.id,s]));
const files=fs.readdirSync('data-sources/bocho-districts-20260915').filter(f=>/^\d{8}\.json$/.test(f));
assert.equal(files.length,16);
let count=0;const cities=new Set();
for(const file of files){
 const source=read(`data-sources/bocho-districts-20260915/${file}`);
 const current=source.generations.filter(g=>g.isCurrent);assert.equal(current.length,1);
 const expected=current[0].poles.map(p=>`bocho:${source.busstopId}-${p.id}`).sort();
 for(const pole of current[0].poles){
  const id=`bocho:${source.busstopId}-${pole.id}`,point=byId.get(id),guide=study.guides[id];
  assert(point);cities.add(point.properties.city);
  assert.equal(point.properties.name,source.busstopName);
  assert.equal(point.properties.source_pole_name,pole.name);
  assert.deepEqual(point.geometry.coordinates,[pole.longitude,pole.latitude]);
  assert.deepEqual(walk.stops[id].origin,point.geometry.coordinates,'Each original pole keeps its own walking origin');
  assert.equal(guide.number,null,'Do not invent numbers or an up/down label');
  const choices=boardingChoices(point,points);
  // A single-source stop needs no choice list; multi-source groups use only the explicit source stop.
  if(expected.length>1)assert.deepEqual(choices.map(s=>s.id).sort(),expected);
  const place={kind:'boarding',id,minutes:10};assert.deepEqual(readPlaceLink(new URL(placeLink('https://example.com/',place)).hash),place);
  count++;
 }
}
assert.equal(count,35);assert.equal(cities.size,7);
for(const pole of ['000000003251','000000003255','000000003259']){
 const point=points.find(p=>p.properties.source_id===pole);
 assert.equal(point.properties.boarding_guide.summary,'東萩駅方面');
 const source=read(`data-sources/bocho-districts-20260915/${point.properties.source_busstop_id}.json`);
 const raw=source.generations.find(g=>g.isCurrent).poles.find(p=>p.id===pole);
 assert(raw.courseGroups.every(g=>g.destination==='東萩駅'),'Do not retain a discontinued destination from the old pole label');
}
assert.equal(study.guides['bocho:00451123-000000002438'].summary,'新山口駅・東萩駅方面');
const a=study.guides['bocho:00450608-000000001362'],b=study.guides['bocho:00450608-000000001361'];
assert.match(a.summary,/本町経由/);assert.match(b.summary,/祇園経由/);
assert.notDeepEqual(a.source_coordinates,b.source_coordinates);
for(const stop of ['00450492','00450659']){
 const group=points.filter(p=>p.properties.source_busstop_id===stop);
 const available=group.map(p=>walk.stops[p.id]).filter(w=>w.file);
 assert.equal(new Set(available.map(w=>w.file)).size,available.length,'Nearby poles never borrow another origin file');
}
console.log('Seven-region extension passed: 35 original locations, 16 explicit groups, official directions, separate origins, and shared links.');
