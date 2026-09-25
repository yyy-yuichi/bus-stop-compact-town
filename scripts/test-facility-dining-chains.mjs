import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hash} from './jev-batch.mjs';
import {namedShopPoint,addDiningBatch} from './facility-dining-chains-lib.mjs';
import {applyFacilityCurrent} from '../src/facilityFreshness.ts';
import {searchPlaces} from '../src/placeSearch.ts';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),pub='data-sources/facility-dining-chains-20260925';
const rows=read(pub+'/adoptions.json'),inputs=read(pub+'/review-inputs.json'),summary=read(pub+'/adoption-summary.json'),reviews=read(pub+'/article-reviews.json'),current=read('public/data/facility-current.json');
const historical={...current,updates:current.updates.slice(0,summary.cumulative_updates),additions:current.additions.slice(0,summary.cumulative_additions)};
const base=['shopping.geojson','civic-facilities.geojson'].flatMap(f=>read('public/data/'+f).features),applied=applyFacilityCurrent(base,current),get=id=>applied.find(f=>f.id===id);
test('branch parsing ignores address-centre coordinates and rejects conflicting or wrong shops',()=>{
 const spec=rows.point_reviews[0].spec,j={code:spec.code,name:spec.name,addressName:spec.address,lat:'33.977647',lon:'131.177153',detailAddress:{coord:{lat:122318427,lon:472236379}}};
 const snippet=x=>'var spotDetailBean = '+JSON.stringify(x)+';';
 const r={url:spec.url,final_url:spec.url,status:200,html:snippet(j)+'\n'+snippet(j)};
 assert.deepEqual(namedShopPoint(r,spec),[131.177153,33.977647]);
 for(const change of [{code:'other'},{name:'松屋 別店'},{addressName:'別住所'},{lat:'122318427'}])assert.throws(()=>namedShopPoint({...r,html:snippet({...j,...change})},spec));
 assert.throws(()=>namedShopPoint({...r,html:snippet(j)+'\n'+snippet({...j,lon:'131.17'})},spec));
 assert.throws(()=>namedShopPoint({...r,final_url:'https://example.com/'},spec));
 assert.throws(()=>namedShopPoint({...r,html:'var centre = '+JSON.stringify(j)+';'},spec));
});
test('batch preserves all prior adoptions and replay rejects changed facts',()=>{
 const prior={...historical,updates:historical.updates.filter(r=>!rows.updates.some(x=>x.id===r.id)),additions:historical.additions.filter(r=>!rows.additions.some(x=>x.id===r.id))};
 assert.equal(hash(prior),summary.before_overlay_hash);assert.equal(hash(historical),summary.after_overlay_hash);
 assert.equal(hash(rows),summary.adoptions_hash);assert.equal(hash(inputs),summary.inputs_hash);
 const replay=addDiningBatch(current,rows);assert.equal(replay.added,0);assert.equal(replay.updated,0);assert.deepEqual(replay.overlay,current);
 const bad=structuredClone(rows);bad.updates[0].changes.address='異なる住所';assert.throws(()=>addDiningBatch(current,bad));
 assert.equal(summary.extra_jev_requests,0);assert.equal(summary.jev_remaining.records,975);
});
test('existing hama ID stays intact and co-located brands are one searchable facility',()=>{
 const before=base.find(f=>f.id==='osm-way-1463857376'),after=get(before.id);
 assert.deepEqual(after.geometry,before.geometry);assert.deepEqual(after.properties.source_ids,before.properties.source_ids);
 assert.equal(after.properties.name,'はま寿司 新下関店');assert.equal(after.properties.address,'山口県下関市秋根西町二丁目8-25');
 assert.equal(rows.additions.length,4);assert(!rows.additions.some(r=>r.properties.name.includes('はま寿司')));
 for(const [q,id] of [['松のや 山陽小野田店','official-matsuya-2122'],['松のや 新山口駅前店','official-matsuya-2276']])assert(searchPlaces(q,[],applied).facilities.some(f=>f.id===id));
 assert.equal(get('official-matsuya-2276').properties.address,'山口県山口市小郡黄金町13番39号');
 assert.equal(get('official-yoshinoya-062592').properties.address,'山口県宇部市昭和町２丁目６７３－５');
 for(const row of rows.additions){assert.equal(row.properties.freshness_review.effective_at,null);assert.equal(row.properties.freshness_review.event,'listed');}
 assert(get('official-sushiro-2516').properties.freshness_review.limits.some(t=>t.includes('2022')&&t.includes('2026')));
 const priorApplied=applyFacilityCurrent(base,{...historical,updates:historical.updates.filter(r=>!rows.updates.some(x=>x.id===r.id)),additions:historical.additions.filter(r=>!rows.additions.some(x=>x.id===r.id))});
 for(const p of rows.point_reviews)for(const n of p.compared_candidates)if(n.id!==before.id)assert.deepEqual(get(n.id),priorApplied.find(f=>f.id===n.id));
});
test('nine articles retain nine unresolved opening reports and four resolved listing duplicates',()=>{
 assert.equal(reviews.length,9);const events=reviews.flatMap(r=>r.events);assert.equal(events.length,18);
 assert.equal(events.filter(e=>e.disposition==='hold').length,9);assert.equal(events.filter(e=>e.disposition==='duplicate').length,4);
 assert(events.every(e=>e.effective_at===null));
 for(const e of events.filter(e=>e.disposition==='duplicate'))assert(e.duplicate_of.endsWith(':current'));
 assert.equal(summary.closed_records,7);assert.equal(summary.changes_this_batch.updates,1);
});
