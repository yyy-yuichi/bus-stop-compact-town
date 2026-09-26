import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {halowsBatchPoint} from './facility-halows-lib.mjs';import {hash} from './jev-batch.mjs';import {applyFacilityCurrent,facilityAvailable} from '../src/facilityFreshness.ts';import {searchPlaces} from '../src/placeSearch.ts';import {prepareFacilities} from '../src/bakedWalking.ts';
const R=p=>JSON.parse(fs.readFileSync(p,'utf8')),p='data-sources/facility-halows-20260925',specs=R(p+'/store-specs.json'),inputs=R(p+'/reviewed-inputs.json'),batch=R(p+'/batch.json'),e=R(p+'/adoption-evidence.json'),overlay=R('public/data/facility-current.json'),base=['shopping','civic-facilities'].flatMap(n=>R('public/data/'+n+'.geojson').features),current=applyFacilityCurrent(base,overlay);
test('each official branch binds identity to its own destination; neighbouring markers and viewport-only URLs are rejected',()=>{
 for(const s of specs){const input=inputs.find(x=>x.id===s.id);assert.deepEqual(halowsBatchPoint(input,s),s.point);
  const mutations=[r=>r.url+='wrong',r=>r.heading='他店舗',r=>r.address='山口県別住所',r=>r.status=404,r=>r.map_url='https://www.google.com/maps?ll='+s.point[1]+','+s.point[0],r=>r.map_url=r.map_url.replace('https:','http:')];
  if(s.cid)mutations.push(r=>r.marker.cid='0x1:0x2',r=>r.marker.label='同じ住所の別店舗',r=>r.marker.point=[131,34],r=>delete r.marker);
  else mutations.push(r=>r.map_url=r.map_url.replace('q=','ll='),r=>r.map_url=r.map_url.replace('131.2118217','131.2126966'));
  for(const mutate of mutations){const bad=structuredClone(input);mutate(bad);assert.throws(()=>halowsBatchPoint(bad,s));}
 }
});
test('six separate tenants are discoverable without duplicating already listed McDonalds, Autobacs or the supermarket container',()=>{
 assert.equal(batch.additions.length,6);assert.equal(new Set(batch.additions.map(f=>f.id)).size,6);
 for(const f of batch.additions){assert.deepEqual(current.find(x=>x.id===f.id),f);assert(facilityAvailable(f));assert(searchPlaces(f.properties.name,[],current).facilities.some(x=>x.id===f.id));assert(prepareFacilities(current).some(x=>x.facility.id===f.id));assert.equal(f.properties.freshness_review.effective_at,null);}
 for(const id of ['official-mcdonalds-35538','official-autobacs-380064','official-halows-nishikiwa','official-tsuruha-10049'])assert.equal(current.filter(f=>f.id===id).length,1);
 const before={ ...overlay, checked_at: '2026-09-25', updates: overlay.updates.slice(0,30),additions:overlay.additions.slice(0,173)},after={...before,additions:[...before.additions,...batch.additions]};
 assert.equal(hash(before),e.before_overlay_hash);assert.equal(hash(after),e.after_overlay_hash);assert.equal(hash(batch),e.batch_hash);assert.equal(hash(inputs),e.inputs_hash);
 assert.deepEqual(current.find(f=>f.id==='osm-way-477623030'),base.find(f=>f.id==='osm-way-477623030'));
 assert.deepEqual(current.find(f=>f.id==='official-tsuruha-10049').geometry.coordinates,[131.33282355062036,33.958665617333054]);
});
test('thirteen complete inventories preserve unnamed works, disputed tenant status and dates as distinct issues',()=>{
 const rows=R(p+'/article-reviews.json'),all=R('data-sources/facility-progress-20260925/article-event-reviews.json');assert.equal(rows.length,13);
 for(const row of rows){assert(row.inventory_complete);assert.deepEqual(all.find(a=>a.article_key===row.article_key),row);}
 const r=rows.find(a=>a.article_key==='ube-81111');assert.equal(r.events.length,11);assert(r.events.some(e=>e.event_id.endsWith('quickcut-current')&&e.disposition==='hold'));
 const c=R('data-sources/facility-workboard-20260925/store-cases.json');assert.equal(c.find(c=>c.case_id==='case:quickcut-halows-ube').status,'map_action');assert.equal(c.find(c=>c.case_id==='case:laundry-halows-nishikiwa').status,'map_action');
 assert.equal(c.find(c=>c.case_id==='case:halows-ube-2026-construction').status,'watch');assert.equal(c.find(c=>c.case_id==='facility:official-halows-131').status,'supplemental');
 assert.equal(e.extra_jev_requests,0);
});
