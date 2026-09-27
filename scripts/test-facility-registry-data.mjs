import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyFacilityCurrent,facilityAvailable} from '../src/facilityFreshness.ts';
const R=p=>JSON.parse(fs.readFileSync(p,'utf8')),d='data-sources/facility-registry-20260927',rows=R(d+'/reviews.json'),batch=R(d+'/batch.json'),overlay=R('public/data/facility-current.json');
const base=['shopping','civic-facilities'].flatMap(n=>R('public/data/'+n+'.geojson').features), byId=new Map(base.map(f=>[f.id,f]));
const norm=s=>s.normalize('NFKC').replace(/\s/g,''),address=s=>norm(s).replace(/^山口県/,'').replace(/[‐‑‒–—―−ーｰ－]/g,'-');
test('care evidence covers every original service at the exact registered number and full address',()=>{
 for(const r of rows.filter(r=>r.review.scope==='care_service_registry')){
  const before=byId.get(r.id),sources=r.evidence.rows;
  assert.equal(r.review.registry_id,r.id.split('-')[2]);
  for(const s of sources){
   assert.equal(s.number,r.review.registry_id);assert.equal(address(s.address),address(before.properties.address));
   assert(r.review.sources.some(x=>x.url===s.source_url&&x.sha256===s.source_sha256));
   assert(s.expiry_dates.every(x=>!x||x.replaceAll('/','-')>='2026-09-27'));
   assert(s.designation_dates.every(x=>!x||x.replaceAll('/','-')<='2026-09-27'));
  }
  assert.deepEqual(r.review.services,before.properties.registered_details.service);
  assert(r.review.services.every(s=>sources.some(x=>norm(x.service)===norm(s))));
  assert(sources.some(s=>norm(s.name)===norm(r.review.official_name)));
  if(r.changes.name){
   assert(sources.every(s=>before.properties.registered_details.phone.some(x=>norm(x)===norm(s.phone))));
   assert(sources.every(s=>before.properties.registered_details.operator.some(x=>norm(x)===norm(s.operator))));
  }else assert.equal(norm(r.review.official_name),norm(before.properties.name));
 }
});
test('registry adoption changes no geometry, source identity, availability or event history',()=>{
 const before=new Map(applyFacilityCurrent(base,{...overlay,verifications:[]}).map(f=>[f.id,f]));
 const current=applyFacilityCurrent(base,overlay),ids=new Set(rows.map(r=>r.id));
 for(const f of current){const old=before.get(f.id);assert.deepEqual(f.geometry,old.geometry);assert.deepEqual(f.properties.source_ids,old.properties.source_ids);assert.equal(facilityAvailable(f),facilityAvailable(old));assert.deepEqual(f.properties.freshness_review,old.properties.freshness_review);if(!ids.has(f.id))assert.deepEqual(f,old);}
 for(const r of rows){const v=overlay.verifications.find(x=>x.id===r.id);assert(v);assert.deepEqual(v.review,r.review);assert.deepEqual(v.changes,r.changes);}
});
test('scoped confirmations, corrections and held cases have separate, non-overlapping counts',()=>{
 assert.equal(rows.length,1982);assert.equal(rows.filter(r=>Object.keys(r.changes).length).length,31);assert.equal(rows.filter(r=>!Object.keys(r.changes).length).length,1951);
 assert.equal(rows.filter(r=>r.review.scope==='care_service_registry').length,1973);
 assert.equal(batch.care_verified+batch.care_held,batch.care_baseline);assert.equal(batch.source_index.reduce((a,r)=>a+r.rows,0),6969);
 const held=R(d+'/holds.json').care;assert.equal(held.length,480);assert(held.every(r=>!rows.some(a=>a.id===r.id)));
 const summary=R('data-sources/facility-progress-20260925/progress-summary.json');assert.equal(summary.baseline.registry_verified,1982);assert.equal(summary.baseline.registry_corrected,31);assert.equal(summary.baseline.verified_no_change_attested_in_this_ledger,1951);
 assert.equal(summary.article_events.articles_completed,101);assert.equal(summary.article_events.articles_partially_reviewed,216);assert.equal(summary.article_events.articles_pending,869);
});
test('school corrections retain independently matched school codes and exclude duplicate official IDs',()=>{
 for(const r of rows.filter(r=>r.review.scope==='school_register')){const s=r.evidence.school;assert(s.map_update_candidate);assert.equal(s.school_code,r.review.registry_id);assert.deepEqual(s.duplicate_existing_ids,[]);assert.equal(s.existing_id,r.id);assert.deepEqual(s.original_geometry,byId.get(r.id).geometry);assert.equal(r.review.source_as_of,'2026-05-01');assert(!r.review.services.length);}
});