import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';
import {hash} from './jev-batch.mjs';import {daisoStore} from './facility-daiso-lib.mjs';
const R=f=>JSON.parse(fs.readFileSync(f,'utf8')),p='data-sources/facility-daiso-20260925',e=R(p+'/adoption-evidence.json'),rows=R(p+'/reviewed-stores.json'),overlay=R('public/data/facility-current.json'),reviews=R(p+'/article-reviews.json');
test('DAISO directory reconciles 48 shops with 47 additions and preserves previous state',()=>{
 assert.equal(rows.length,47);assert.equal(new Set(e.directory_ids).size,48);assert.equal(new Set(rows.map(r=>r.id)).size,47);
 const checkpoint={...overlay,updates:overlay.updates.slice(0,30),additions:overlay.additions.slice(0,237)};
 assert.equal(hash(checkpoint),e.after_overlay_hash);assert.equal(hash({...checkpoint,additions:checkpoint.additions.slice(0,190)}),e.before_overlay_hash);
 for(const r of rows){const f=overlay.additions.find(f=>f.id===r.id);assert.deepEqual(f.geometry.coordinates,r.point);assert.equal(f.properties.city,r.city);assert.equal(f.properties.official_address,r.address);assert.equal(f.properties.freshness_review.effective_at,null);}
 assert.equal(overlay.additions.filter(f=>f.id==='official-daiso-005565').length,1);assert.equal(rows.find(r=>r.id==='official-daiso-008139').city,'平生町');
 assert(e.seamall_host_contains_official_point);const seamall=overlay.additions.find(f=>f.id==='official-daiso-007944');assert(seamall.properties.search_names.includes('THREEPPY'));assert(seamall.properties.search_names.includes('Standard Products'));
 assert.deepEqual(e.corrected_ids,[]);assert.equal(e.extra_jev_requests,0);
});
test('DAISO parser rejects wrong shop ID, viewport-only map, conflicting destination, wrong prefecture and HTTP200 placeholder',()=>{
 const r={status:200,url:'https://www.daiso-sangyo.co.jp/shop/detail/001709',html:'<title>DAISO 山口湯田店 | 店舗検索</title><h2 class="shopSingle-name">DAISO 山口湯田店</h2><dt>住所</dt><dd>山口県山口市葵1丁目259<a href="/shop/map?initid=001709&amp;lon=131.45245&amp;lat=34.16118">地図</a></dd><iframe src="https://www.google.com/maps?q=34.16118,131.45245"></iframe><a href="https://www.google.com/maps/dir//34.16118,131.45245">道順</a>'};
 assert.equal(daisoStore(r).city,'山口市');
 for(const html of [r.html.replace('initid=001709','initid=001710'),r.html.replace('maps?q=','maps?ll='),r.html.replace('dir//34.16118','dir//34.16119'),r.html.replace('山口県山口市','福岡県福岡市'),'<title>店舗名</title>ご指定の店舗は存在しません。'])assert.throws(()=>daisoStore({...r,html}));
});
test('compound-brand and predecessor events remain separate from map counts',()=>{
 assert.equal(reviews.length,3);const events=reviews.flatMap(r=>r.events);assert.equal(events.length,7);assert.equal(events.filter(e=>e.disposition==='hold').length,6);
 const closures=events.filter(e=>e.event_type==='closure');assert.equal(closures.length,3);for(const c of closures){assert.deepEqual(c.facility_ids,[]);assert.equal(c.disposition,'hold');assert.equal(c.effective_at,null);}
 assert(events.some(e=>e.event_id.endsWith('daiso-expansion-date')&&e.event_type==='temporary_change'));
 assert.equal(events.filter(e=>e.disposition==='reflected_addition').length,1);
});
