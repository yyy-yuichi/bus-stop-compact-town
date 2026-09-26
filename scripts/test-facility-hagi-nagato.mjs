import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hash} from './jev-batch.mjs';
import {namedEmbed,addHagiBatch} from './facility-hagi-nagato-lib.mjs';
import {applyFacilityCurrent,facilityAvailable} from '../src/facilityFreshness.ts';
import {SHOPPING_CATEGORIES,categoryOf} from '../src/facilityCatalog.ts';
import {facilityIconMarkup} from '../src/facilityIcons.ts';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),pub='data-sources/facility-hagi-nagato-20260925';
const rows=read(pub+'/adoptions.json'),inputs=read(pub+'/review-inputs.json'),summary=read(pub+'/adoption-summary.json'),reviews=read(pub+'/article-reviews.json'),current=read('public/data/facility-current.json');
const historical={ ...current, checked_at: '2026-09-25', updates: current.updates.slice(0,summary.cumulative_updates),additions:current.additions.slice(0,summary.cumulative_additions)};
const base=['shopping.geojson','civic-facilities.geojson'].flatMap(f=>read('public/data/'+f).features),applied=applyFacilityCurrent(base,current);
const get=id=>applied.find(f=>f.id===id);
test('map selection rejects a viewport, wrong branch, wrong address and repeated marker',()=>{
 const cid='0x354367c002451787:0x34946c3e75b66813',name='SOIL Nagatoyumoto';
 const marker='["'+cid+'","山口県長門市深川湯本2257 SOIL Nagatoyumoto",[34.3283563,131.1722825],"378"]';
 const r={status:200,url:'https://maps.google.com/maps?q=SOIL',final_url:'https://www.google.com/maps/embed?origin=mfe',html:'viewport=[34.3042678,133.0818306]'+marker};
 assert.deepEqual(namedEmbed(r,cid,name,'2257'),[131.1722825,34.3283563]);
 assert.throws(()=>namedEmbed({...r,html:'viewport=[34.3042678,133.0818306]'},cid,name,'2257'));
 assert.throws(()=>namedEmbed({...r,html:marker.replace(name,'SOIL Setoda')},cid,name,'2257'));
 assert.throws(()=>namedEmbed(r,cid,name,'9999'));
 assert.throws(()=>namedEmbed({...r,html:marker+marker},cid,name,'2257'));
 assert.throws(()=>namedEmbed({...r,final_url:'https://example.com/maps/embed'},cid,name,'2257'));
});
test('all previous records survive and a replay cannot replace an adopted fact',()=>{
 const prior={...historical,additions:historical.additions.filter(f=>!rows.additions.some(a=>a.id===f.id))};
 assert.equal(hash(prior),summary.before_overlay_hash);
 assert.equal(hash(historical),summary.after_overlay_hash);
 assert.equal(hash(rows),summary.adoptions_hash);assert.equal(hash(inputs),summary.inputs_hash);
 const replay=addHagiBatch(current,rows.additions);assert.equal(replay.added,0);assert.deepEqual(replay.overlay,current);
 const changed=structuredClone(rows.additions);changed[0].geometry.coordinates[0]+=0.01;
 assert.throws(()=>addHagiBatch(current,changed));
 assert.equal(summary.extra_jev_requests,0);assert.equal(summary.jev_remaining.records,975);
});
test('verified new facilities have distinct identities from nearby stores and old branches',()=>{
 for(const p of rows.point_reviews)for(const near of p.compared_candidates){
   const prior=base.find(f=>f.id===near.id)??historical.additions.find(f=>f.id===near.id);
   assert.deepEqual(get(near.id),prior);
 }
 assert.equal(get('official-juntendo-hagi-274').properties.freshness_review.effective_at,'2024-11-20');
 assert.equal(get('official-hacchi-hagi').properties.freshness_review.effective_at,'2024-10-29');
 for(const r of rows.additions.filter(r=>!['official-juntendo-hagi-274','official-hacchi-hagi'].includes(r.id))){
  assert.equal(r.properties.freshness_review.event,'listed');assert.equal(r.properties.freshness_review.effective_at,null);assert(facilityAvailable(get(r.id)));
 }
 assert(get('official-komeri-power-nagato-1054').properties.freshness_review.limits.some(t=>t.includes('2012')));
 assert.deepEqual(get('official-soil-nagatoyumoto').geometry.coordinates,[131.1722825,34.3283563]);
 assert.equal(get('osm-way-561529898').properties.name,'アトラス萩');
 assert(inputs.targets.every(t=>t.matching_existing_ids.length===0));
});
test('new categories remain selectable, named and render a map icon',()=>{
 for(const category of ['home_center','repair','hotel']){
  assert(SHOPPING_CATEGORIES.some(c=>c.id===category));
  const f=rows.additions.find(f=>f.properties.category===category);assert(f);
  assert.equal(categoryOf(f).id,category);assert(facilityIconMarkup(category).includes('<path'));
 }
});
test('all 12 articles inventory 20 events and keep eight unresolved matters explicit',()=>{
 assert.equal(reviews.length,12);const events=reviews.flatMap(r=>r.events);assert.equal(events.length,20);
 assert.equal(events.filter(e=>e.disposition==='hold').length,8);
 assert(events.filter(e=>e.disposition==='hold').every(e=>e.effective_at===null));
 assert.equal(reviews.find(r=>r.article_key==='kaiten-513641').events.length,3);
 assert.equal(events.find(e=>e.event_id==='kaiten-540611:date').event_type,'temporary_change');
 assert.equal(events.find(e=>e.event_id==='kaiten-506694:closure').effective_at,null);
 for(const key of ['kaiten-547780','kaiten-558326'])assert.deepEqual(reviews.find(r=>r.article_key===key).events[0].facility_ids,[]);
 assert.equal(summary.closed_records,7);assert.equal(summary.changes_this_batch.updates,0);
});
