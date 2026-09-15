import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { attachBoardingGuides, boardingChoices } from '../src/boardingGuide.ts';
import { attachBoardingWalks } from '../src/boardingWalking.ts';
import { municipalCatalog, nationalCatalog } from '../src/stopCatalog.ts';
import { parseCatchment, prepareFacilities, bakedFacilityCandidates, clipCatchment, WALKING_METERS_PER_MINUTE } from '../src/bakedWalking.ts';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const base=p=>execFileSync('git',['show',`ddbca496227ae6b40af0ed921b422c0b42056bba:${p}`],{maxBuffer:32*1024*1024});
const iwakuni=process.argv.includes('--iwakuni');
const dir=`data-sources/${iwakuni?'iwakuni':'hikari'}-directed-20260915`;
const ledger=read(`${dir}/ledger.json`),points=ledger.pairs.flatMap(p=>p.points),ids=new Set(points.map(p=>p.id));
assert.equal(ledger.pairs.length,iwakuni?5:66);assert.equal(ids.size,ledger.pairs.length*2);
const confirmed=p=>p.status==='机上確認済み';
assert.equal(ledger.summary.confirmed_pairs,ledger.pairs.filter(p=>p.status==='確認済み').length);
assert.equal(ledger.summary.held_pairs,ledger.pairs.filter(p=>p.status==='保留').length);
assert.equal(ledger.summary.confirmed_pairs+ledger.summary.held_pairs,ledger.pairs.length);
assert.equal(ledger.summary.confirmed_points,points.filter(confirmed).length);
const study=read('src/data/boarding-guide-study.json'),old=JSON.parse(base('src/data/boarding-guide-study.json'));
assert.deepEqual(study.hub_points,old.hub_points);assert.deepEqual(study.unlocated,old.unlocated);
const changedIds=new Set(['hikari','iwakuni'].flatMap(region=>{
 const path=`data-sources/${region}-directed-20260915/ledger.json`;
 return fs.existsSync(path)?read(path).pairs.flatMap(p=>p.points.map(p=>p.id)):[];
}));
for(const [id,g] of Object.entries(old.guides))if(!changedIds.has(id))assert.deepEqual(study.guides[id],g,id);
const index=read('src/data/boarding-walk-study/index.json');
assert.deepEqual(index,JSON.parse(base('src/data/boarding-walk-study/index.json')));
let preserved=0;
for(const f of fs.readdirSync('src/data/boarding-walk-study').filter(f=>f.endsWith('.json')&&f!=='index.json')){
 const path=`src/data/boarding-walk-study/${f}`;assert.deepEqual(fs.readFileSync(path),base(path),path);preserved++;
}
let occurrences=0;
for(const pair of ledger.pairs){
 assert.equal(pair.status==='確認済み',pair.points.every(confirmed));
 for(const p of pair.points){
  assert.deepEqual(study.guides[p.id].source_coordinates,p.original_coordinates);
  assert.deepEqual(study.guides[p.id].source_coordinates,old.guides[p.id].source_coordinates);
  assert.equal(study.guides[p.id].number,old.guides[p.id].number);
  assert.equal(study.guides[p.id].roadside_review.status,confirmed(p)?'confirmed':'hold');
  assert.equal(confirmed(p),p.occurrences.length>0&&p.occurrences.every(e=>e.status==='整合'));
  for(const e of p.occurrences){
   occurrences++;assert(e.trip_ids.length>0);
   if(e.status!=='整合')continue;
   const i=e.interval;
   assert(i.previous_s_m<i.current_s_m&&i.current_s_m<i.next_s_m);
   assert(e.previous_stop_id&&e.next_stop_id&&i.shape_coordinates.length>=2);
   assert.equal(i.alternative_traversals.length,0);
   assert(e.signed_left_m>=3&&e.local_turn_deg<=20&&e.alignment>=.85&&e.local_shape_road_fit_m<=12);
   assert(i.stop_shape_distance_m<=30&&e.point_road_distance_m<=30);
   assert.equal(e.competing_roads.length,0);
   // Independent sign check: road direction follows this occurrence's selected travel.
   const sx=111320*Math.cos(34*Math.PI/180),sy=111320;
   const [a,b]=e.road_segment;let dx=(b[0]-a[0])*sx,dy=(b[1]-a[1])*sy;
   const tx=(e.travel_to[0]-e.travel_from[0])*sx,ty=(e.travel_to[1]-e.travel_from[1])*sy;
   if(dx*tx+dy*ty<0){dx=-dx;dy=-dy;}
   const px=(p.original_coordinates[0]-e.road_projection[0])*sx,py=(p.original_coordinates[1]-e.road_projection[1])*sy;
   const signed=(dx*py-dy*px)/Math.hypot(dx,dy);
   assert(Math.abs(signed-e.signed_left_m)<.002,`${p.id}: independent signed side`);
   assert(-signed<0,'Reversing travel must reverse the road side');
  }
 }
}
if(!iwakuni){
const loop=points.filter(p=>['hikari:2_01','hikari:2_02'].includes(p.id)).map(p=>p.occurrences.find(e=>e.shape_id==='111'));
assert.equal(loop.length,2);assert(loop.every(Boolean));
assert(Math.abs(loop[0].interval.current_s_m-loop[1].interval.current_s_m)>1000);
assert(Math.cos((loop[0].heading_deg-loop[1].heading_deg)*Math.PI/180)<-.9);
}
const raw=[...nationalCatalog(read('public/data/review-national.geojson')).features,...municipalCatalog(read('public/data/review-stops.geojson'),read('public/data/review-routes.json'))];
const stops=attachBoardingGuides(raw,study);
const urls=Object.fromEntries(Object.values(index.stops).filter(e=>e.file).map(e=>[e.file,`/assets/${e.file}`]));
const attached=attachBoardingWalks(stops,index,urls);
const facilities=prepareFacilities([...read('public/data/shopping.geojson').features,...read('public/data/civic-facilities.geojson').features]);
const results=[];
for(const p of points.filter(confirmed)){
 const stop=attached.find(s=>s.id===p.id);assert(stop);assert.deepEqual(stop.geometry.coordinates,p.original_coordinates);
 const entry=index.stops[p.id];assert.deepEqual(entry.origin,p.original_coordinates);
 if(!entry.file){assert(entry.gap>30);results.push({id:p.id,status:'not-computed',gap:entry.gap});continue;}
 const c=parseCatchment(read(`src/data/boarding-walk-study/${entry.file}`));
 assert.equal(c.stopId,p.id);assert.deepEqual(c.origin,p.original_coordinates);assert(c.snapGap<=30);
 const candidates=bakedFacilityCandidates(c,facilities);
 const counts=[5,10,15].map(m=>{
  const clipped=clipCatchment(c,m*WALKING_METERS_PER_MINUTE);
  assert(clipped.segments.every(s=>Math.max(s.d1,s.d2)<=clipped.budget));
  return candidates.filter(x=>x.meters<=m*WALKING_METERS_PER_MINUTE).length;
 });
 assert(counts[0]<=counts[1]&&counts[1]<=counts[2]);
 results.push({id:p.id,status:'existing-original-point-calculation',counts_5_10_15:counts});
}
const operations=[];
for(const name of (iwakuni?['南岩国駅','寿橋']:['木園','土井','小周防Ｂ','西河原'])){
 const pair=ledger.pairs.find(p=>p.name===name);
 for(const p of pair.points){
  const stop=attached.find(s=>s.id===p.id),choices=boardingChoices(stop,attached);
  assert.deepEqual(new Set(choices.map(x=>x.id)),new Set(pair.points.map(x=>x.id)));
  operations.push({name,id:p.id,choices:choices.map(x=>x.id),summary:study.guides[p.id].summary,position_status:p.status,...results.find(x=>x.id===p.id)});
 }
}
const evidence={summary:ledger.summary,occurrences_checked:occurrences,unchanged_catchment_files:preserved,unrelated_guides_unchanged:true,original_coordinates_and_numbers_unchanged:true,loop_occurrence_regression:iwakuni?'covered by Hikari same-script test':'passed',walking_results:results,representative_application_operations:operations,browser_ui_checked:false,browser_blocker:'Cloud Chrome managed preview navigation failed: net::ERR_BLOCKED_BY_CLIENT. No live-site browser verification performed.'};
fs.writeFileSync(`${dir}/verification.json`,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({...evidence,walking_results:results.length,representative_application_operations:operations.length}));
