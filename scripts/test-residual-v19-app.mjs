import assert from 'node:assert/strict';
import fs from 'node:fs';
import {attachBoardingGuides,boardingChoices} from '../src/boardingGuide.ts';
import {attachBoardingWalks} from '../src/boardingWalking.ts';
import {municipalCatalog,nationalCatalog} from '../src/stopCatalog.ts';
import {placeLink,readPlaceLink} from '../src/placeLink.ts';
import {parseCatchment,prepareFacilities,bakedFacilityCandidates,clipCatchment,WALKING_METERS_PER_MINUTE} from '../src/bakedWalking.ts';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const dir='data-sources/sentetsu-v19-20260915';
const study=read('src/data/boarding-guide-study.json'),index=read('src/data/boarding-walk-study/index.json');
const raw=[...nationalCatalog(read('public/data/review-national.geojson')).features,...municipalCatalog(read('public/data/review-stops.geojson'),read('public/data/review-routes.json'))];
const stops=attachBoardingGuides(raw,study);
const urls=Object.fromEntries(Object.values(index.stops).filter(e=>e.file).map(e=>[e.file,`/assets/${encodeURIComponent(e.file)}`]));
const attached=attachBoardingWalks(stops,index,urls),byId=new Map(attached.map(p=>[p.id,p]));
const facilities=prepareFacilities([...read('public/data/shopping.geojson').features,...read('public/data/civic-facilities.geojson').features]);
const baseline=parseCatchment(read(`${dir}/baseline-nishigawara.json`));
const baselineFacilityCount=bakedFacilityCandidates(baseline,facilities).filter(p=>p.meters<=1000).length;assert.equal(baselineFacilityCount,44);
const results=[];
for(const id of read(`${dir}/confirmed-walking-targets.json`)){
 const p=byId.get(id),entry=index.stops[id];assert(p&&entry,id);assert.deepEqual(entry.origin,p.geometry.coordinates);
 const place={kind:'boarding',id,minutes:15};assert.deepEqual(readPlaceLink(new URL(placeLink('https://yamaguchi-bus-stop-compact-town.yyy-yuichi.chatgpt.site/',place)).hash),place);
 if(!entry.file){assert(entry.gap===null||entry.gap>30);results.push({id,state:'未計算',gap_m:entry.gap});continue;}
 const c=parseCatchment(read(`src/data/boarding-walk-study/${entry.file}`));assert.equal(c.stopId,id);assert.deepEqual(c.origin,entry.origin);assert(c.snapGap<=30);
 const candidates=bakedFacilityCandidates(c,facilities);
 const counts=[5,10,15].map(m=>{
  const clipped=clipCatchment(c,m*WALKING_METERS_PER_MINUTE);assert(clipped.segments.every(s=>Math.max(s.d1,s.d2)<=clipped.budget));
  return candidates.filter(p=>p.meters<=clipped.budget).length;
 });
 assert(counts[0]<=counts[1]&&counts[1]<=counts[2]);results.push({id,state:counts[2]?'計算済み・施設あり':'計算済み・施設0件',counts_5_10_15:counts,gap_m:c.snapGap});
}
const operations=[];
for(const id of ['sentetsu:S16_01','sentetsu:S13_02']){
 const p=byId.get(id),choices=boardingChoices(p,attached);assert(choices.length>=2);assert(choices.every(c=>byId.has(c.id)));
 operations.push({id,summary:p.properties.boarding_guide.summary,choices:choices.map(c=>({id:c.id,origin:c.geometry.coordinates,summary:c.properties.boarding_guide.summary}))});
}
for(const id of read(`${dir}/confirmed-walking-targets.json`)) assert.equal(study.guides[id].source_origin_label,'船木鉄道公式せんナビ');
const bad=structuredClone(index),newId=read(`${dir}/confirmed-walking-targets.json`).find(id=>index.stops[id].file);
bad.stops[newId].origin=[0,0];assert.throws(()=>attachBoardingWalks(stops,bad,urls),/origin mismatch/);
assert.equal(readPlaceLink('#kind=boarding&id=sentetsu%3A..%2Fsecret'),null);
const evidence={baseline_15min_facilities:baselineFacilityCount,new_walking_results:results,representative_function_operations:operations,browser_ui_checked:false,note:'アプリ関数の検証であり、ブラウザー操作確認ではない。'};
fs.writeFileSync(`${dir}/application-verification.json`,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({new_points:results.length,calculated:results.filter(r=>r.state!=='未計算').length,uncomputed:results.filter(r=>r.state==='未計算').length,operations:operations.length}));
