import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {applyFacilityCurrent,facilityAvailable} from '../src/facilityFreshness.ts';import {validateRegistryReview} from '../src/facilityRegistry.ts';
const dir='data-sources/facility-registry-008e-20260928',read=p=>JSON.parse(fs.readFileSync(p,'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
const rows=read(`${dir}/reviews.json`),events=read(`${dir}/updates.json`),holds=read(`${dir}/holds.json`),batch=read(`${dir}/batch.json`),overlay=read('public/data/facility-current.json');
const base=Object.keys(batch.baseline_sha256).flatMap(p=>read(p).features),byId=new Map(base.map(f=>[f.id,f]));
const allIds=new Set([...rows,...events,...holds].map(r=>r.id)),reviewIds=new Set(rows.map(r=>r.id)),eventIds=new Set(events.map(r=>r.id));
const before={...overlay,checked_at:batch.previous_checked_at,updates:overlay.updates.filter(r=>!allIds.has(r.id)),verifications:overlay.verifications.filter(r=>!allIds.has(r.id))};
test('008e partitions all 3504 remaining IDs and preserves every previous decision and original source',()=>{
 assert.equal(allIds.size,3504);assert.equal(rows.length+events.length+holds.length,3504);assert([...allIds].every(id=>byId.has(id)));assert.equal(sha(JSON.stringify(before,null,2)+'\n'),batch.previous_overlay_sha256);assert.equal(before.updates.length+before.verifications.length,4260);
 for(const [path,h]of Object.entries(batch.baseline_sha256))assert.equal(sha(fs.readFileSync(path,'utf8').replaceAll('\r\n','\n')),h);
 const old=new Map(applyFacilityCurrent(base,before).map(f=>[f.id,f]));
 for(const f of applyFacilityCurrent(base,overlay)){const prior=old.get(f.id);assert.deepEqual(f.geometry,prior.geometry);assert.deepEqual(f.properties.source_ids,prior.properties.source_ids);assert.deepEqual(f.properties.registered_details,prior.properties.registered_details);assert.deepEqual(f.properties.civic_details,prior.properties.civic_details);if(!reviewIds.has(f.id)&&!eventIds.has(f.id))assert.deepEqual(f,prior);}
});
test('008e counts reviewed duplicates as corrections and leaves unresolved records explicitly held',()=>{
 assert.equal(batch.corrections,events.length+rows.filter(r=>Object.keys(r.changes).length||r.duplicate_of).length);assert.equal(batch.verified_no_change,rows.filter(r=>!Object.keys(r.changes).length&&!r.duplicate_of).length);assert.equal(batch.duplicate_records,rows.filter(r=>r.duplicate_of).length);assert.equal(batch.held,holds.length);assert(holds.every(h=>h.reasons.length&&h.next));assert.equal(batch.all_remaining_objective_complete,false);
 const current=new Map(applyFacilityCurrent(base,overlay).map(f=>[f.id,f]));
 for(const r of [...rows,...events]){assert.deepEqual(r.evidence.baseline_geometry,byId.get(r.id).geometry);assert.deepEqual(r.evidence.source_ids,byId.get(r.id).properties.source_ids);const saved=(eventIds.has(r.id)?overlay.updates:overlay.verifications).find(v=>v.id===r.id);assert.deepEqual(saved.review,r.review);assert.deepEqual(saved.changes,r.changes);if(r.duplicate_of){assert.equal(current.get(r.id).properties.duplicate_of,r.duplicate_of);assert(!facilityAvailable(current.get(r.id)));assert(facilityAvailable(current.get(r.duplicate_of)));assert.equal(current.get(r.id).properties.freshness_review,undefined);}}
 for(const r of rows){validateRegistryReview(r.review,batch.checked_at);assert(!Object.hasOwn(r.review,'effective_at'));}
});
