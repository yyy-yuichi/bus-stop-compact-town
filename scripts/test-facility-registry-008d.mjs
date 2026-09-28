import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {applyFacilityCurrent,facilityAvailable,freshnessLabel} from '../src/facilityFreshness.ts';
import {validateRegistryReview} from '../src/facilityRegistry.ts';
const dir='data-sources/facility-registry-008d-20260928',read=p=>JSON.parse(fs.readFileSync(p,'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
const rows=read(`${dir}/reviews.json`),events=read(`${dir}/updates.json`),holds=read(`${dir}/holds.json`),batch=read(`${dir}/batch.json`),overlay=read('public/data/facility-current.json');
const base=Object.keys(batch.baseline_sha256).flatMap(p=>read(p).features),byId=new Map(base.map(f=>[f.id,f]));
const ids=new Set(rows.map(r=>r.id)),eventIds=new Set(events.map(r=>r.id)),candidateIds=new Set([...rows,...events,...holds].map(r=>r.id));
test('008d partitions the 3665 remaining records and preserves the 4099-record historical overlay',()=>{
 assert.equal(rows.length+events.length+holds.length,3665);assert.equal(candidateIds.size,3665);assert([...candidateIds].every(id=>byId.has(id)));
 const previous={...overlay,checked_at:batch.previous_checked_at,updates:overlay.updates.filter(r=>!candidateIds.has(r.id)),verifications:overlay.verifications.filter(r=>!candidateIds.has(r.id))};
 assert.equal(previous.updates.length+previous.verifications.length,4099);assert.equal(sha(JSON.stringify(previous,null,2)+'\n'),batch.previous_overlay_sha256);
 assert.equal(batch.baseline_hash_format,'utf8_lf');for(const [p,h] of Object.entries(batch.baseline_sha256))assert.equal(sha(fs.readFileSync(p,'utf8').replaceAll('\r\n','\n')),h);
 assert.equal(rows.filter(x=>Object.keys(x.changes).length).length+events.length,batch.corrections);assert.equal(rows.filter(x=>!Object.keys(x.changes).length).length,batch.verified_no_change);assert.equal(holds.length,batch.held);assert(holds.every(h=>h.reasons.length&&h.next));
});
test('008d retains every original geometry, source ID, service detail, prior review and unrelated record',()=>{
 const before={...overlay,updates:overlay.updates.filter(r=>!eventIds.has(r.id)),verifications:overlay.verifications.filter(r=>!ids.has(r.id))};
 const old=new Map(applyFacilityCurrent(base,before).map(f=>[f.id,f]));
 for(const f of applyFacilityCurrent(base,overlay)){
  const prior=old.get(f.id);assert.deepEqual(f.geometry,prior.geometry);assert.deepEqual(f.properties.source_ids,prior.properties.source_ids);assert.deepEqual(f.properties.registered_details,prior.properties.registered_details);assert.deepEqual(f.properties.civic_details,prior.properties.civic_details);
  if(!ids.has(f.id)&&!eventIds.has(f.id))assert.deepEqual(f,prior);
  if(!eventIds.has(f.id))assert.equal(facilityAvailable(f),facilityAvailable(prior));
 }
 for(const r of [...rows,...events]){const f=byId.get(r.id);assert.deepEqual(r.evidence.baseline_geometry,f.geometry);assert.deepEqual(r.evidence.source_ids,f.properties.source_ids);const saved=(eventIds.has(r.id)?overlay.updates:overlay.verifications).find(v=>v.id===r.id);assert.deepEqual(saved.changes,r.changes);assert.deepEqual(saved.review,r.review);}
});
test('008d separates care designation scope, school date precision and new postal address evidence',()=>{
 const current=new Map(applyFacilityCurrent(base,overlay).map(f=>[f.id,f]));
 const care=events.filter(x=>x.review.scope==='registered_care_services');assert(care.length>0);
 for(const x of care){assert.equal(x.evidence.number_printed_in_event_pdf,false);assert.equal(x.evidence.facility_wide_closure_claimed,false);assert.deepEqual([...x.review.affected_services].sort(),[...new Set(byId.get(x.id).properties.registered_details.service)].sort());assert.equal(x.evidence.later_same_address_events.length,0);assert.equal(x.evidence.september_active_rows.length,0);assert(!facilityAvailable(current.get(x.id)));assert(!freshnessLabel(current.get(x.id)).includes('閉店'));}
 const closedSchools=events.filter(x=>['school','childcare'].includes(byId.get(x.id).properties.category));assert(closedSchools.some(x=>x.review.date_precision==='unknown'));assert(closedSchools.some(x=>x.review.date_precision==='month'));for(const x of closedSchools)if(x.review.date_precision==='unknown')assert.equal(x.review.effective_at,null);
 assert(events.some(x=>x.id==='osm-node-1423654009'));
 for(const id of ['osm-node-1423660584','osm-way-977491468','osm-node-13789521881'])assert(holds.some(x=>x.id===id));
 for(const x of rows){validateRegistryReview(x.review,batch.checked_at);assert(!Object.hasOwn(x.review,'effective_at'));}
 assert(rows.some(x=>x.review.scope==='care_publication_list'));
});
