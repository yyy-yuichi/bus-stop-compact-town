import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';
import {hash} from './jev-batch.mjs';import {secondStreetStore} from './facility-successors-lib.mjs';
const R=f=>JSON.parse(fs.readFileSync(f,'utf8')),p='data-sources/facility-secondstreet-20260925',e=R(p+'/adoption-evidence.json'),rows=R(p+'/reviewed-stores.json'),overlay=R('public/data/facility-current.json'),reviews=R(p+'/article-reviews.json');
test('county directory adds eleven branches once and leaves twelve distinct branch IDs',()=>{
 assert.equal(rows.length,11);assert.equal(new Set(e.directory_ids).size,12);assert.equal(new Set(rows.map(r=>r.id)).size,11);
 for(const r of rows){const f=overlay.additions.find(f=>f.id===r.id);assert.deepEqual(f.geometry.coordinates,r.coordinates);assert.equal(f.properties.official_address,r.address);assert.equal(f.properties.freshness_review.effective_at,null);assert(f.properties.freshness_review.sources.some(s=>s.url===r.url));}
 assert.equal(overlay.additions.filter(f=>f.id==='official-secondstreet-31983').length,1);
 const checkpoint={...overlay,updates:overlay.updates.slice(0,30),additions:overlay.additions.slice(0,190)};
 assert.equal(hash(checkpoint),e.after_overlay_hash);assert.equal(hash({...checkpoint,additions:checkpoint.additions.slice(0,179)}),e.before_overlay_hash);
 assert(overlay.additions.find(f=>f.id==='official-secondstreet-32241').properties.freshness_review.limits.some(s=>s.includes('西館')));
});
test('directions parser refuses an outside-prefecture address, outside-region point and ambiguous destinations',()=>{
 const r={status:200,url:'https://www.2ndstreet.jp/shop/details?shopsId=32092',html:'<title>セカンドストリート 宇部新川店｜案内</title><dt>住所</dt><dd>山口県宇部市島3丁目3番8号</dd><a href="https://www.google.com/maps/dir//33.96097,131.24290">経路</a>'};
 assert.equal(secondStreetStore(r).city,'宇部市');
 for(const html of [r.html.replace('山口県宇部市','福岡県福岡市'),r.html.replace('131.24290','139.2'),r.html+r.html.slice(r.html.indexOf('<a '))])assert.throws(()=>secondStreetStore({...r,html}));
});
test('all seven article inventories retain predecessor, opening, prebuying and temporary-pause events',()=>{
 assert.equal(reviews.length,7);const events=reviews.flatMap(r=>r.events);assert.equal(events.length,25);assert.equal(events.filter(e=>e.disposition==='hold').length,15);
 assert(events.some(e=>e.event_type==='relocation'&&e.disposition==='hold'));assert(events.some(e=>e.event_id==='ube-81621:preopening-pause'));
 const b=events.find(e=>e.event_id==='shunan-119477:bigwood-closure');assert.equal(b.disposition,'verified_no_change');assert.deepEqual(b.facility_ids,[]);assert.equal(b.effective_at,null);
 assert.deepEqual(e.corrected_ids,[]);assert.equal(e.extra_jev_requests,0);
});
