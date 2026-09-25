import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {facilityIconMarkup} from '../src/facilityIcons.ts';
import {hash} from './jev-batch.mjs';import {autobacsPoint} from './facility-konankaiten-lib.mjs';import {applyFacilityCurrent,facilityAvailable} from '../src/facilityFreshness.ts';import {categoryOf} from '../src/facilityCatalog.ts';import {searchPlaces} from '../src/placeSearch.ts';import {prepareFacilities} from '../src/bakedWalking.ts';import {mapFacilities} from '../src/facilityVisibility.ts';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),pub='data-sources/facility-konankaiten-20260925',inputs=read(pub+'/reviewed-inputs.json'),evidence=read(pub+'/adoption-evidence.json'),batch=read(pub+'/batch.json'),overlay=read('public/data/facility-current.json');
const base=['shopping.geojson','civic-facilities.geojson'].flatMap(n=>read('public/data/'+n).features),current=applyFacilityCurrent(base,overlay),id='official-autobacs-380064',get=id=>current.find(f=>f.id===id);
test('branch-labelled map destination is tied to the official address and does not accept a viewport alone',()=>{
 assert.deepEqual(autobacsPoint(inputs.store),[131.2117328,33.97646774]);
 for(const change of [r=>r.retail_id='380001',r=>r.ld_identity.name='別店舗',r=>r.ld_identity.address.streetAddress='大字妻崎開作846-1',r=>r.url+='1',r=>r.rows=['住所\t別住所'],r=>r.map_src=r.map_src.replace('オートバックス宇部厚南,',''),r=>r.map_src=r.map_src.replace('q=オートバックス宇部厚南','q=ハローズ'),r=>r.map_src=r.map_src.replace('ll=33.97646774,131.2117328','ll=34,132'),r=>r.map_src=r.map_src.replaceAll('131.2117328','139.7'),r=>r.map_src=r.map_src.replace('https:','http:')]){
 const bad=structuredClone(inputs.store);change(bad);assert.throws(()=>autobacsPoint(bad));
 }
});
test('new car-service category reaches map, search and walking without changing co-located stores or uncertain closures',()=>{
 const f=get(id);assert.equal(categoryOf(f).name,'カー用品・整備');assert.equal(categoryOf(f).group,'services');assert(facilityIconMarkup('car_service').includes('<path'));assert(facilityAvailable(f));
 assert(searchPlaces('オートバックス 宇部厚南',[],current).facilities.some(x=>x.id===id));assert(prepareFacilities(current).some(x=>x.facility.id===id));
 const walking={scope:'konan',ids:[id]};assert.deepEqual(mapFacilities(current,['car_service'],null,'konan',walking).map(x=>x.id),[id]);
 assert.equal(mapFacilities(current,['repair'],null,'konan',walking).length,0);
 for(const old of ['osm-way-477623030','osm-way-465881162','osm-way-1236531275'])assert.deepEqual(get(old),base.find(f=>f.id===old));
 assert(facilityAvailable(get('official-mcdonalds-35538')));
 const historical={...overlay,updates:overlay.updates.slice(0,30),additions:overlay.additions.slice(0,172)};
 assert.equal(hash(historical),evidence.before_overlay_hash);
 const after={...historical,additions:[...historical.additions,...batch.additions]};assert.equal(hash(after),evidence.after_overlay_hash);
 assert.deepEqual(after.additions.at(-1),f);assert.equal(hash(batch),evidence.batch_hash);assert.equal(hash(inputs),evidence.reviewed_inputs_hash);
});
test('relocation listing and actual opening date remain separate in articles and the workboard',()=>{
 const r=get(id).properties.freshness_review;assert.equal(r.event,'listed');assert.equal(r.effective_at,null);assert(r.limits.some(s=>s.includes('予定日')));
 const es=read('data-sources/facility-progress-20260925/article-event-reviews.json').find(a=>a.article_key==='ube-81345').events;
 assert.equal(es.find(e=>e.event_id.endsWith(':autobacs-relocation')).disposition,'reflected_addition');
 assert.equal(es.find(e=>e.event_id.endsWith(':autobacs-opening-date')).disposition,'hold');
 assert.equal(es.find(e=>e.event_id.endsWith(':old-site-successor')).disposition,'hold');
 const c=read('data-sources/facility-workboard-20260925/store-cases.json').find(c=>c.case_id==='case:autobacs-ube-konan');assert.equal(c.status,'supplemental');assert(c.issues.some(i=>i.impact==='resolved'));assert(c.issues.some(i=>i.impact==='supplemental'));
 assert.equal(evidence.extra_jev_requests,0);assert.equal(evidence.cases.filter(c=>c.status==='map_action').length,3);
});
