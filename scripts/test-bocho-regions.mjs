import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boardingChoices } from '../src/boardingGuide.ts';
import { placeLink, readPlaceLink } from '../src/placeLink.ts';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const study=read('src/data/boarding-guide-study.json');
const walk=read('src/data/boarding-walk-study/index.json');
const stops=study.hub_points.map(s=>({...s,properties:{...s.properties,boarding_guide:study.guides[s.id]}}));
const sources=fs.readdirSync('data-sources/bocho-regions-20260915').filter(f=>/^\d{8}\.json$/.test(f));
assert.equal(sources.length,11);
let count=0;
for(const file of sources){
  const raw=read(`data-sources/bocho-regions-20260915/${file}`);
  const current=raw.generations.filter(g=>g.isCurrent);
  assert.equal(current.length,1);
  for(const pole of current[0].poles){
    const id=`bocho:${raw.busstopId}-${pole.id}`, s=stops.find(s=>s.id===id);
    assert(s); assert.equal(s.properties.name,raw.busstopName);
    assert.equal(s.properties.source_pole_name,pole.name);
    assert.deepEqual(s.geometry.coordinates,[pole.longitude,pole.latitude],'Use each pole, not the parent busstop coordinate');
    assert.deepEqual(walk.stops[id].origin,s.geometry.coordinates);
    assert(!s.properties.boarding_guide.review);
    const place={kind:'boarding',id,minutes:5};
    assert.deepEqual(readPlaceLink(new URL(placeLink('https://example.com/',place)).hash),place);
    count++;
  }
}
assert.equal(count,32);
const id=(bus,pole)=>`bocho:${bus}-${pole}`;
const byId=new Map(stops.map(s=>[s.id,s]));
const north=id('00450730','000000001608'),south=id('00450731','000000001614');
assert.equal(boardingChoices(byId.get(north),stops).length,8);
assert(boardingChoices(byId.get(north),stops).some(s=>s.id===south));
const fourth=boardingChoices(byId.get(north),stops).filter(s=>s.properties.boarding_guide.number==='4');
assert.equal(fourth.length,2,'Official 4 has two source poles; never merge by its number');
assert.notEqual(fourth[0].properties.boarding_guide.summary,fourth[1].properties.boarding_guide.summary);
assert.notEqual(walk.stops[fourth[0].id].file,walk.stops[fourth[1].id].file);
for(const [bus,one,two] of [['00450373','000000000867','000000000868'],['00451320','000000002850','000000002851'],['00450863','000000001900','000000001899']]){
  const a=id(bus,one),b=id(bus,two);
  assert.equal(study.guides[a].number,null,'No invented platform number or up/down label');
  assert.equal(boardingChoices(byId.get(a),stops).length,2);
  assert.notEqual(study.guides[a].summary,study.guides[b].summary);
  assert.notDeepEqual(byId.get(a).geometry.coordinates,byId.get(b).geometry.coordinates);
  assert(walk.stops[a].file && walk.stops[b].file);
  assert.notEqual(walk.stops[a].file,walk.stops[b].file,'Close sources keep their own walking origin');
}
assert.deepEqual(boardingChoices(byId.get(id('00450483','000000001080')),stops).map(s=>s.properties.boarding_guide.number),['1','3','4','5'],'Do not fill missing number 2');
console.log('Five-city extension passed: 32 original poles, explicit group membership, distinct same-number sources, no invented numbering, separate walking origins.');
