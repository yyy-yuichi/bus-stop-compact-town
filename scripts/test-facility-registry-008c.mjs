import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {applyFacilityCurrent,facilityAvailable,freshnessLabel} from '../src/facilityFreshness.ts';
import {validateRegistryReview} from '../src/facilityRegistry.ts';
const dir='data-sources/facility-registry-008c-20260928',read=p=>JSON.parse(fs.readFileSync(p,'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
const rows=read(`${dir}/reviews.json`),events=read(`${dir}/updates.json`),holds=read(`${dir}/holds.json`),batch=read(`${dir}/batch.json`),overlay=read('public/data/facility-current.json');
const base=Object.keys(batch.baseline_sha256).flatMap(p=>read(p).features),byId=new Map(base.map(f=>[f.id,f]));
const ids=new Set(rows.map(r=>r.id)),eventIds=new Set(events.map(r=>r.id)),candidateIds=new Set([...rows,...events,...holds].map(r=>r.id));
test('008c partitions the 3779 remaining records and preserves the 3985-record historical overlay',()=>{
 assert.equal(rows.length+events.length+holds.length,3779);assert.equal(candidateIds.size,3779);assert([...candidateIds].every(id=>byId.has(id)));
 const previous={...overlay,checked_at:batch.previous_checked_at,updates:overlay.updates.filter(r=>!candidateIds.has(r.id)),verifications:overlay.verifications.filter(r=>!candidateIds.has(r.id))};
 assert.equal(previous.updates.length+previous.verifications.length,3985);assert.equal(sha(JSON.stringify(previous,null,2)+'\n'),batch.previous_overlay_sha256);
 assert.equal(batch.baseline_hash_format,'utf8_lf');for(const [p,h] of Object.entries(batch.baseline_sha256))assert.equal(sha(fs.readFileSync(p,'utf8').replaceAll('\r\n','\n')),h);
 assert.equal(rows.filter(x=>Object.keys(x.changes).length).length+events.length,batch.corrections);assert.equal(rows.filter(x=>!Object.keys(x.changes).length).length,batch.verified_no_change);assert.equal(holds.length,batch.held);assert(holds.every(h=>h.reasons.length&&h.next));
});
test('008c retains every original geometry, source ID, service detail, prior review and unrelated record',()=>{
 const before={...overlay,updates:overlay.updates.filter(r=>!eventIds.has(r.id)),verifications:overlay.verifications.filter(r=>!ids.has(r.id))};
 const old=new Map(applyFacilityCurrent(base,before).map(f=>[f.id,f]));
 for(const f of applyFacilityCurrent(base,overlay)){
  const prior=old.get(f.id);assert.deepEqual(f.geometry,prior.geometry);assert.deepEqual(f.properties.source_ids,prior.properties.source_ids);assert.deepEqual(f.properties.registered_details,prior.properties.registered_details);assert.deepEqual(f.properties.civic_details,prior.properties.civic_details);
  if(!ids.has(f.id)&&!eventIds.has(f.id))assert.deepEqual(f,prior);
  if(!eventIds.has(f.id))assert.equal(facilityAvailable(f),facilityAvailable(prior));
 }
 for(const r of [...rows,...events]){const f=byId.get(r.id);assert.deepEqual(r.evidence.baseline_geometry,f.geometry);assert.deepEqual(r.evidence.source_ids,f.properties.source_ids);const saved=(eventIds.has(r.id)?overlay.updates:overlay.verifications).find(v=>v.id===r.id);assert.deepEqual(saved.changes,r.changes);assert.deepEqual(saved.review,r.review);}
});
test('008c keeps medical identity changes separate from suspension and kindergarten closure dates',()=>{
 const current=new Map(applyFacilityCurrent(base,overlay).map(f=>[f.id,f]));
 const medical=rows.filter(x=>x.review.scope==='medical_register'&&Object.keys(x.changes).length);assert.equal(medical.length,6);assert.equal(medical.filter(x=>x.changes.category==='clinic').length,3);
 for(const r of medical){assert(!r.review.effective_at);assert(facilityAvailable(current.get(r.id)));}
 const suspended=events.find(x=>x.id==='osm-node-4623459002');assert.equal(suspended.review.status,'temporarily_closed');assert.equal(suspended.review.effective_at,null);assert.equal(suspended.review.date_precision,'unknown');
 const children=events.filter(x=>byId.get(x.id).properties.category==='childcare');assert.equal(children.length,3);for(const x of children){assert.equal(x.review.status,'closed');assert.equal(freshnessLabel(current.get(x.id)),'閉園確認');}
 assert.equal(events.find(x=>x.id==='osm-node-1423661484').review.effective_at,'2026-03-31');
 for(const x of events){assert(!facilityAvailable(current.get(x.id)));if(x.review.date_precision==='unknown')assert.equal(x.review.effective_at,null);else assert(x.review.effective_at<=batch.checked_at);}
});
test('008c only publishes bounded reviews and retains specific evidence gaps',()=>{
 for(const x of rows){validateRegistryReview(x.review,batch.checked_at);assert(!Object.hasOwn(x.review,'effective_at'));assert(x.review.sources.every(s=>s.url.startsWith('https://')&&/^[a-f0-9]{64}$/.test(s.sha256)));}
 assert(holds.some(x=>x.id==='osm-node-13789521881'&&x.reasons.includes('official_store_address_and_embedded_named_point_address_conflict')));
 assert(holds.some(x=>x.reasons.includes('newer_precise_P14_location_conflicts_with_original_geometry')));
 for(const id of ['civic-KD0000900021','osm-node-1631265930','osm-node-1631266177'])assert(holds.some(x=>x.id===id));
 assert.equal(batch.root_hold_overrides,10);
 for(const id of ["osm-node-13059079557", "osm-node-1423654631", "osm-node-1423655037", "osm-node-1423658285", "osm-node-1423659681", "osm-node-1423659743", "osm-node-1423661231", "osm-node-1423661666", "osm-node-1423661675", "osm-node-1423654009"]){assert(holds.some(x=>x.id===id));assert(!ids.has(id)&&!eventIds.has(id));}
 assert(!fs.readFileSync(`${dir}/reviews.json`,'utf8').includes('"raw_row"'));assert(!fs.readFileSync(`${dir}/reviews.json`,'utf8').includes('"raw_record"'));
});
