import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyFacilityCurrent,facilityAvailable} from '../src/facilityFreshness.ts';
const R=p=>JSON.parse(fs.readFileSync(p,'utf8')),d='data-sources/facility-registry-008-20260928';
const rows=R(d+'/reviews.json'),events=R(d+'/updates.json'),batch=R(d+'/batch.json'),holds=R(d+'/holds.json');
const overlay=R('public/data/facility-current.json'),base=['shopping','civic-facilities'].flatMap(n=>R('public/data/'+n+'.geojson').features),byId=new Map(base.map(f=>[f.id,f]));
const ids=new Set(rows.map(r=>r.id)), eventIds=new Set(events.map(r=>r.id));
test('008 keeps accepted, corrected and held facility IDs disjoint and complete',()=>{
 const all=[...rows,...events,...holds];assert.equal(new Set(all.map(r=>r.id)).size,all.length);assert.equal(all.length,batch.candidates);
 assert.equal(rows.filter(r=>Object.keys(r.changes).length).length+events.length,batch.corrections);
 assert.equal(rows.filter(r=>!Object.keys(r.changes).length).length,batch.verified_no_change);
 assert.equal(holds.length,batch.held);assert(holds.every(r=>r.next));
 for(const r of R('data-sources/facility-registry-20260927/reviews.json'))assert(!ids.has(r.id)&&!eventIds.has(r.id));
});
test('008 retains all original coordinates, source IDs, earlier decisions and unreviewed facilities',()=>{
 const before=new Map(applyFacilityCurrent(base,{...overlay,updates:overlay.updates.filter(r=>!eventIds.has(r.id)),verifications:overlay.verifications.filter(r=>!ids.has(r.id))}).map(f=>[f.id,f]));
 for(const f of applyFacilityCurrent(base,overlay)){
  const old=before.get(f.id);assert.deepEqual(f.geometry,old.geometry);assert.deepEqual(f.properties.source_ids,old.properties.source_ids);
  if(!eventIds.has(f.id)){assert.equal(facilityAvailable(f),facilityAvailable(old));assert.deepEqual(f.properties.freshness_review,old.properties.freshness_review);}
  if(!ids.has(f.id)&&!eventIds.has(f.id))assert.deepEqual(f,old);
 }
 for(const r of rows){const v=overlay.verifications.find(x=>x.id===r.id);assert(v);assert.deepEqual(v.review,r.review);assert.deepEqual(v.changes,r.changes);assert.deepEqual(r.evidence.baseline_geometry,byId.get(r.id).geometry);assert.deepEqual(r.evidence.source_ids,byId.get(r.id).properties.source_ids);}
 for(const r of events){const v=overlay.updates.find(x=>x.id===r.id);assert(v);assert.deepEqual(v.review,r.review);}
});
test('medical checks use current insurance records and unique facility points, not map viewport centers',()=>{
 for(const r of rows.filter(r=>r.review.scope==='medical_register')){
  const e=r.evidence,p=e.facility_report,s=e.insurance_registry;
  assert.equal(s.status,'現存');assert.equal(s.source_as_of,'2026-09-01');assert.equal(r.review.registry_id,`${s.kind}:${s.number}`);
  assert(p.distance_m<=50&&p.shared_coordinate_count===1);assert.equal(r.review.official_address,s.address);
  assert(r.review.sources.some(x=>x.url===p.source_url&&x.sha256===p.source_sha256));
  if(r.changes.name){assert(e.history_note);assert(r.review.sources.length>=3);}
 }
});
test('childcare changes preserve separate co-located services and explicit closure evidence',()=>{
 for(const r of rows.filter(r=>r.review.scope==='childcare_register')){
  assert(!Object.hasOwn(r.review,'effective_at'));assert(r.review.services.length);
  if(r.evidence.bridge)assert(r.evidence.bridge.distance_m<=50);
 }
 const protectedUnit='civic-KD0000500019';assert(holds.some(r=>r.id===protectedUnit));assert(!ids.has(protectedUnit));
 for(const id of ['civic-KD0000500044','civic-KD0000500045'])assert.deepEqual(rows.find(r=>r.id===id).changes,{});
 const closed=events.find(r=>r.id==='osm-node-1423654496');assert.equal(closed.review.effective_at,'2022-03-31');assert.match(closed.evidence.row.status_note,/廃園/);assert.equal(closed.review.status,'closed');
});
test('school scope uses unambiguous current codes and exact municipal address joins',()=>{
 const schools=rows.filter(r=>r.review.scope==='school_register');assert.equal(new Set(schools.map(r=>r.review.registry_id)).size,schools.length);
 for(const r of schools){const e=r.evidence;assert.equal(r.review.registry_id,e.mext.number);assert.equal(e.mext.source_as_of,'2026-05-01');assert(e.municipal.distance_m<=50);assert(!e.municipal.address.includes('[sanitize]'));assert.deepEqual(r.changes,{});assert.equal(r.review.sources.length,2);}
});
