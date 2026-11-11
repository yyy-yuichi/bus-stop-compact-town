import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boardingChoices } from '../src/boardingGuide.ts';
import { placeLink, readPlaceLink } from '../src/placeLink.ts';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const study=read('src/data/boarding-guide-study.json'), walk=read('src/data/boarding-walk-study/index.json');
const points=study.hub_points.map(s=>({...s,properties:{...s.properties,boarding_guide:study.guides[s.id]}}));
const byId=new Map(points.map(s=>[s.id,s]));
// Reviewed alighting-side origins remain separate from the operator's original poles.
// Membership is grounded in the saved audit's exact original pole ID, not proximity.
const adopted = {
 '00450662': { id:'walk-adopted:132.2092_33.94747:1', origin:[132.209184,33.947567] },
 '00450671': { id:'walk-adopted:132.26029_33.94945:1', origin:[132.26037,33.949369] },
 '00451512': { id:'walk-adopted:131.18491_34.3708:1', origin:[131.184782,34.370868] },
};
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
  assert.deepEqual(choices.filter(s=>s.properties.boarding_guide.evidence==='official-platform-coordinate').map(s=>s.id).sort(),expected,'Preserve every original official pole and exclude unrelated official IDs');
  const extra=adopted[source.busstopId];
  assert.deepEqual(choices.map(s=>s.id).sort(),[...expected,...(extra?[extra.id]:[])].sort(),'Only the three audited independent origins may extend their exact source group');
  const place={kind:'boarding',id,minutes:10};assert.deepEqual(readPlaceLink(new URL(placeLink('https://example.com/',place)).hash),place);
  count++;
 }
}
assert.equal(count,35);assert.equal(cities.size,7);
for(const [sourceId,extra] of Object.entries(adopted)){
 const point=byId.get(extra.id),guide=study.guides[extra.id],entry=walk.stops[extra.id];
 assert(point);assert.equal(guide.evidence,'reviewed-walk-origin');
 assert.equal(guide.group_id,`hub:bocho-${sourceId}`);assert.equal(guide.number,null);
 assert.deepEqual(point.geometry.coordinates,extra.origin);
 assert.deepEqual(guide.source_coordinates,extra.origin);assert.deepEqual(entry.origin,extra.origin);
 assert.match(guide.data_notice,/事業者の登録座標とは位置が異なります/);
 const raw=read(`src/data/boarding-walk-study/${entry.file}`);
 assert.equal(raw.id,extra.id);assert.deepEqual(raw.origin,extra.origin);
 for(const original of points.filter(p=>p.properties.source_busstop_id===sourceId)){
  assert.notEqual(walk.stops[original.id].file,entry.file,'Never replace an official pole file with the reviewed independent origin');
 }
}
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
