import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {applyFacilityCurrent,facilityAvailable} from '../src/facilityFreshness.ts';
import {validateRegistryReview} from '../src/facilityRegistry.ts';
const dir='data-sources/facility-registry-008b-20260928', read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const rows=read(`${dir}/reviews.json`),events=read(`${dir}/updates.json`),holds=read(`${dir}/holds.json`),batch=read(`${dir}/batch.json`),overlay=read('public/data/facility-current.json');
const base=Object.keys(batch.baseline_sha256).flatMap(p=>read(p).features),byId=new Map(base.map(f=>[f.id,f])),ids=new Set(rows.map(r=>r.id)),eventIds=new Set(events.map(r=>r.id));
const sha=b=>createHash('sha256').update(b).digest('hex');

test('008b preserves the prior overlay byte representation and partitions every remaining base ID once',()=>{
 const all=[...rows,...events,...holds];assert.equal(all.length,5033);assert.equal(new Set(all.map(r=>r.id)).size,5033);assert(all.every(r=>byId.has(r.id)));
 const previous={...overlay,checked_at:batch.previous_checked_at,updates:overlay.updates.filter(r=>!eventIds.has(r.id)),verifications:overlay.verifications.filter(r=>!ids.has(r.id))};
 assert.equal(sha(JSON.stringify(previous,null,2)+'\n'),batch.previous_overlay_sha256);assert.equal(previous.updates.length+previous.verifications.length,2731);
 const priorIds=new Set([...previous.updates,...previous.verifications].map(r=>r.id));assert(all.every(r=>!priorIds.has(r.id)));assert.equal(priorIds.size+all.length,base.length);
 for(const [p,h] of Object.entries(batch.baseline_sha256))assert.equal(sha(fs.readFileSync(p)),h);
 assert.equal(rows.filter(r=>Object.keys(r.changes).length).length+events.length,batch.corrections);assert.equal(rows.filter(r=>!Object.keys(r.changes).length).length,batch.verified_no_change);assert.equal(holds.length,batch.held);assert(holds.every(r=>r.reasons.length&&r.next));assert.deepEqual(batch.pending_inputs,[]);
});

test('008b keeps all original geometry, source IDs, service details and untouched records',()=>{
 const before=applyFacilityCurrent(base,{...overlay,updates:overlay.updates.filter(r=>!eventIds.has(r.id)),verifications:overlay.verifications.filter(r=>!ids.has(r.id))});
 const old=new Map(before.map(f=>[f.id,f]));
 for(const f of applyFacilityCurrent(base,overlay)){
  const p=old.get(f.id);assert.deepEqual(f.geometry,p.geometry);assert.deepEqual(f.properties.source_ids,p.properties.source_ids);assert.deepEqual(f.properties.registered_details,p.properties.registered_details);assert.deepEqual(f.properties.civic_details,p.properties.civic_details);
  if(!ids.has(f.id)&&!eventIds.has(f.id))assert.deepEqual(f,p);
  if(!eventIds.has(f.id))assert.equal(facilityAvailable(f),facilityAvailable(p));
 }
 for(const x of [...rows,...events]){assert.deepEqual(x.evidence.baseline_geometry,byId.get(x.id).geometry);assert.deepEqual(x.evidence.source_ids,byId.get(x.id).properties.source_ids);const saved=(eventIds.has(x.id)?overlay.updates:overlay.verifications).find(r=>r.id===x.id);assert.deepEqual(saved.changes,x.changes);assert.deepEqual(saved.review,x.review);}
});

test('008b separates explicit school closure, suspended school, library move and postal temporary closure dates',()=>{
 const school=events.filter(r=>byId.get(r.id).properties.category==='school');assert.equal(school.filter(r=>r.review.status==='closed').length,12);assert.equal(school.filter(r=>r.review.status==='temporarily_closed').length,5);
 for(const r of school.filter(r=>r.review.status==='temporarily_closed')){assert.equal(r.review.effective_at,null);assert.equal(r.review.date_precision,'unknown');assert(r.evidence.suspension_record);}
 const libraries=events.filter(r=>byId.get(r.id).properties.category==='library');assert.equal(libraries.length,4);assert.equal(libraries.find(r=>r.id==='osm-node-1423655665').review.effective_at,'2003-10');assert.equal(libraries.find(r=>r.id==='osm-node-1423655665').review.date_precision,'month');assert.equal(libraries.find(r=>r.id==='osm-node-1423659247').review.effective_at,'2024-03-24');assert.equal(libraries.filter(r=>r.review.effective_at===null).length,2);
 const postal=events.find(r=>r.id==='osm-node-1423656332');assert.equal(postal.review.status,'temporarily_closed');assert.equal(postal.review.effective_at,'2018-07-09');
 for(const id of ['osm-node-3714409928','osm-node-5049891345']){const r=events.find(x=>x.id===id);assert.equal(r.review.effective_at,null);assert.equal(r.review.date_precision,'unknown');}
 assert.equal(events.find(r=>r.id==='osm-node-3714409928').review.status,'temporarily_closed');
 assert.equal(events.find(r=>r.id==='osm-node-13200097026').review.effective_at,'2025-12-06');
 const now=new Map(applyFacilityCurrent(base,overlay).map(f=>[f.id,f]));assert(events.every(r=>!facilityAvailable(now.get(r.id))));
});

test('008b checks evidence scopes, exact feature indexing and retained duplicate holds',()=>{
 for(const r of rows){validateRegistryReview(r.review,batch.checked_at);assert(!Object.hasOwn(r.review,'effective_at'));assert(r.review.sources.every(s=>/^[a-f0-9]{64}$/.test(s.sha256)));}
 for(const r of rows.filter(r=>r.evidence.municipal?.feature_index_base===1))assert.equal(r.evidence.municipal.feature_array_index,r.evidence.municipal.feature_index-1);
 for(const id of ['osm-node-5344701143','osm-way-378114877','osm-way-389344197']){assert(holds.some(r=>r.id===id));assert(!ids.has(id)&&!eventIds.has(id));}
 for(const r of rows.filter(r=>r.review.scope==='operator_directory')){assert.equal(r.review.source_date_kind,'retrieved');assert(r.review.source_as_of<=r.review.checked_at);}
 for(const r of rows.filter(r=>r.review.scope==='welfare_register'))assert.deepEqual(new Set(r.review.services),new Set(r.evidence.matched_pairs.map(p=>p.service)));
 assert(!fs.readFileSync(`${dir}/reviews.json`,'utf8').includes('"raw_row"'));assert(!fs.readFileSync(`${dir}/reviews.json`,'utf8').includes('"raw_record"'));
});
