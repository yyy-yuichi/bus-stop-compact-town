import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { applyFacilityCurrent } from '../src/facilityFreshness.ts';
const dir='data-sources/facility-registry-008e-20260928';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const batch=read(`${dir}/batch.json`), reviews=read(`${dir}/reviews.json`), events=read(`${dir}/updates.json`);
assert.equal(batch.baseline_hash_format,'utf8_lf');
for(const [path,sha] of Object.entries(batch.baseline_sha256)) assert.equal(digest(fs.readFileSync(path,'utf8').replaceAll('\r\n','\n')),sha,'Base facility drift');
const base=Object.keys(batch.baseline_sha256).flatMap(p=>read(p).features), byId=new Map(base.map(f=>[f.id,f]));
const current=read('public/data/facility-current.json'), ids=new Set([...reviews,...events].map(r=>r.id));
assert.equal(ids.size,reviews.length+events.length);
const verIds=new Set(reviews.map(r=>r.id)),eventIds=new Set(events.map(r=>r.id));
const candidateIds=new Set([...reviews,...events,...read(`${dir}/holds.json`)].map(r=>r.id));
assert.equal(candidateIds.size,batch.candidates);
const rest={...current,checked_at:batch.previous_checked_at,updates:current.updates.filter(r=>!candidateIds.has(r.id)),verifications:(current.verifications??[]).filter(r=>!candidateIds.has(r.id))};
assert.equal(digest(JSON.stringify(rest,null,2)+'\n'),batch.previous_overlay_sha256,'Pre-existing overlay drift');
const convert=({id,changes,review,duplicate_of,duplicate_point})=>{const f=byId.get(id);assert(f,'Unknown ID');return{id,expected:{name:f.properties.name,category:f.properties.category,source_ids:f.properties.source_ids,geometry:f.geometry},changes,review,...(duplicate_of!==undefined?{duplicate_of,duplicate_point}:{})};};
const newVer=reviews.map(convert),newEvents=events.map(convert);
// This ongoing pass may gain evidence that changes its own draft decisions; prior completed passes remain hash-bound.

const next={...rest,checked_at:batch.checked_at,updates:[...rest.updates,...newEvents],verifications:[...rest.verifications,...newVer]};
applyFacilityCurrent(base,next);
assert.equal(newVer.filter(x=>(Object.keys(x.changes).length || x.duplicate_of)).length+newEvents.length,batch.corrections);
assert.equal(newVer.filter(x=>!Object.keys(x.changes).length && !x.duplicate_of).length,batch.verified_no_change);
if(process.argv.includes('--apply'))fs.writeFileSync('public/data/facility-current.json',JSON.stringify(next,null,2)+'\n');
console.log(JSON.stringify({reviews:reviews.length,events:events.length,corrections:batch.corrections,no_change:batch.verified_no_change,applied:process.argv.includes('--apply')}));
