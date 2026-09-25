import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hash} from './jev-batch.mjs';
import {gorpRestaurant, embeddedNamedPoint, placeNamedPoint, caption, adoptShunanBatch} from './facility-shunan-oz-lib.mjs';
import {applyFacilityCurrent,facilityAvailable} from '../src/facilityFreshness.ts';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const pub='data-sources/facility-shunan-oz-20260925', rows=read(pub+'/adoptions.json'), summary=read(pub+'/adoption-summary.json'), inputs=read(pub+'/review-inputs.json'), reviews=read(pub+'/article-reviews.json'), overlay=read('public/data/facility-current.json');
const raw=['shopping.geojson','civic-facilities.geojson'].flatMap(f=>read('public/data/'+f).features);

test('official JSON-LD requires the same restaurant, city and URL',()=>{
 const restaurant={'@type':'Restaurant',name:'洋食酒場 ITTOKU',url:'https://ya55808.gorp.jp/',address:{addressRegion:'山口県',addressLocality:'周南市',streetAddress:'平和通2-23'},geo:{longitude:131.807025,latitude:34.050136}};
 const make=r=>({status:200,url:restaurant.url,html:JSON.stringify({data_attribute:{json_ld:JSON.stringify({'@graph':[r]})}})});
 assert.deepEqual(gorpRestaurant(make(restaurant),restaurant.name).coordinates,[131.807025,34.050136]);
 assert.throws(()=>gorpRestaurant(make({...restaurant,url:'https://another.example/'}),restaurant.name));
 assert.throws(()=>gorpRestaurant(make({...restaurant,name:'別の店'}),restaurant.name));
 assert.throws(()=>gorpRestaurant(make({...restaurant,address:{...restaurant.address,addressLocality:'下松市'}}),restaurant.name));
});

test('official embed rejects viewport, other shop and duplicate marker',()=>{
 const cid='0x3544e6beb6096653:0x94391da6a6a3a5b1';
 const marker=`["${cid}","山口県周南市鼓海 拉麺 徳ちゃん",[34.0216939,131.8249726],"10680600592883361201"]`;
 const r={status:200,url:'https://www.google.com/maps/embed?pb=observed',html:'center=[34.021698,131.822397676]'+marker};
 assert.deepEqual(embeddedNamedPoint(r,cid,'拉麺 徳ちゃん'),[131.8249726,34.0216939]);
 assert.throws(()=>embeddedNamedPoint({...r,html:'center=[34.021698,131.822397676]'},cid,'拉麺 徳ちゃん'));
 assert.throws(()=>embeddedNamedPoint(r,cid,'別の店'));
 assert.throws(()=>embeddedNamedPoint({...r,html:r.html+marker},cid,'拉麺 徳ちゃん'));
});

test('place URL coordinates must agree with a named CID marker; URL text alone is insufficient',()=>{
 const cid='0x3544e7ad64bce933:0x62514faf955cea64', name='甘味処しづくや';
 const r={status:200,url:`https://www.google.com/maps/place/${encodeURIComponent(name)}/@34.1,131.9,17z/data=!3d34.0506127!4d131.8041195`,html:`["${cid}","甘味処 しづくや",null,null,null,null,null,[null,null,34.0506127,131.8041195]]`};
 assert.deepEqual(placeNamedPoint(r,name,cid),[131.8041195,34.0506127]);
 assert.throws(()=>placeNamedPoint({...r,html:''},name,cid));
 assert.throws(()=>placeNamedPoint({...r,html:r.html.replace('34.0506127','34.1')},name,cid));
 assert.throws(()=>placeNamedPoint({...r,url:r.url.split('/data=')[0]},name,cid));
 assert.throws(()=>placeNamedPoint(r,name,'0x1:0x2'));
});

test('a public post caption is required rather than an empty profile or login page',()=>{
 assert(caption({status:200,html:'<meta name="description" content="店名 on August 7, 2026: 8/15閉店 &amp; 感謝">'}).includes('8/15閉店 & 感謝'));
 assert.throws(()=>caption({status:200,html:'<title>Instagram</title>'}));
 assert.throws(()=>caption({status:403,html:'<meta name="description" content="text">'}));
});

test('new batch preserves every prior overlay record and replay cannot silently replace facts',()=>{
 const historical={...overlay,updates:overlay.updates.slice(0,summary.cumulative_updates),additions:overlay.additions.slice(0,summary.cumulative_additions)};
 const prior={...historical,updates:historical.updates.filter(r=>r.id!==rows.update.id),additions:historical.additions.filter(r=>!rows.additions.some(a=>a.id===r.id))};
 assert.equal(hash(prior),summary.before_overlay_hash);
 assert.equal(hash(historical),summary.after_overlay_hash);
 assert.equal(hash(rows),summary.adoptions_hash);assert.equal(hash(inputs),summary.inputs_hash);
 const replay=adoptShunanBatch(overlay,rows.additions,rows.update);
 assert.deepEqual(replay.overlay,overlay);assert.equal(replay.newAdditions,0);assert.equal(replay.newUpdates,0);
 const drift=structuredClone(rows.additions);drift[0].geometry.coordinates[0]+=0.01;
 assert.throws(()=>adoptShunanBatch(overlay,drift,rows.update));
 const changed=structuredClone(rows.update);changed.review.effective_at='2026-08-16';
 assert.throws(()=>adoptShunanBatch(overlay,rows.additions,changed));
 assert.equal(summary.extra_jev_requests,0);assert.equal(summary.jev_remaining.records,975);
});

test('former Juicy identity stays closed while successor and nearby dentist retain distinct identities',()=>{
 const current=applyFacilityCurrent(raw,overlay),get=id=>current.find(f=>f.id===id),old=raw.find(f=>f.id===rows.update.id);
 const closed=get(old.id),shizqu=get('official-shizquya-tokuyama-deck');
 assert(!facilityAvailable(closed));assert.equal(closed.properties.freshness_review.effective_at,'2026-08-15');
 assert.deepEqual(closed.geometry,old.geometry);assert.deepEqual(closed.properties.source_ids,old.properties.source_ids);
 assert(closed.properties.name.includes('ジューシー'));assert.notDeepEqual(shizqu.geometry,closed.geometry);
 assert(facilityAvailable(shizqu));assert.equal(shizqu.properties.freshness_review.effective_at,null);
 assert.deepEqual(get('osm-node-3812569257'),raw.find(f=>f.id==='osm-node-3812569257'));
 assert.equal(get('official-tokuchan-kokai').properties.freshness_review.event,'listed');
 assert.equal(get('official-tokuchan-kokai').properties.address,'山口県周南市鼓海1丁目324-18');
 assert(!overlay.additions.some(f=>f.properties.address?.includes('飯島町')));
});

test('aggregate articles inventory every closure and unresolved opening or relocation remain held',()=>{
 assert.equal(reviews.length,24);
 assert.equal(reviews.find(r=>r.article_key==='shunan-119996').events.length,5);
 assert.equal(reviews.find(r=>r.article_key==='shunan-119510').events.length,2);
 assert.equal(reviews.find(r=>r.article_key==='ube-83212').events.length,2);
 assert.equal(reviews.find(r=>r.article_key==='shunan-100787').events.length,3);
 const held=reviews.flatMap(r=>r.events).filter(e=>e.disposition==='hold');
 assert.deepEqual(held.map(e=>e.event_id),['shunan-119965:shizqu-opening','shunan-119994:tokuchan-iijima']);
 assert(held.every(e=>e.effective_at===null));
 for(const target of inputs.targets.filter(r=>r.id!=='torachan'))assert.deepEqual(target.matching_existing_ids,[]);
 assert(inputs.targets.find(r=>r.id==='shoji').excluded_similar_names.every(r=>r.category==='social_facility'));
 assert.equal(reviews.find(r=>r.article_key==='shunan-119313').events[0].effective_at,null);
 assert.equal(reviews.find(r=>r.article_key==='shunan-120037').events[0].effective_at,null);
});
