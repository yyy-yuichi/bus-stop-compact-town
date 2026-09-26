import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {hash} from './jev-batch.mjs';import {applyFacilityCurrent,facilityAvailable,freshnessLabel,freshnessDateText} from '../src/facilityFreshness.ts';import {searchPlaces} from '../src/placeSearch.ts';import {prepareFacilities,nearbyFacilityCandidates} from '../src/bakedWalking.ts';import {mapFacilities} from '../src/facilityVisibility.ts';import {SHOPPING_CATEGORIES} from '../src/facilityCatalog.ts';import {readPlaceLink} from '../src/placeLink.ts';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),base=['shopping.geojson','civic-facilities.geojson'].flatMap(n=>read('public/data/'+n).features),overlay=read('public/data/facility-current.json'),batch=read('data-sources/facility-wants-corrections-20260925/batch.json'),evidence=read('data-sources/facility-wants-corrections-20260925/adoption-evidence.json');
const current=applyFacilityCurrent(base,overlay),get=id=>current.find(f=>f.id===id),canonical='osm-node-9472242519',alias='osm-way-1027461546',lady='osm-way-370584528',ouchi='osm-way-465881161';
test('reviewed duplicate is one candidate in search, map and nearby walking while both original records survive',()=>{
 assert.equal(current.filter(f=>f.properties.duplicate_of).length,1);assert.equal(get(alias).properties.duplicate_of,canonical);
 assert(facilityAvailable(get(canonical)));assert(!facilityAvailable(get(alias)));assert.equal(get(alias).properties.freshness_review.status,'operating');assert.equal(freshnessLabel(get(alias)),'公式掲載確認');
 const results=searchPlaces('ウォンツ 宇部亀浦店',[],current).facilities;
 assert.deepEqual(results.filter(f=>f.properties.category==='drugstore').map(f=>f.id),[canonical]);assert(results.some(f=>f.id==='official-watts-7607'),'Co-located Watts remains a distinct service');
 const scope='wants-test',walking={scope,ids:[canonical,alias]},categories=SHOPPING_CATEGORIES.map(c=>c.id);
 assert.deepEqual(mapFacilities(current,categories,null,scope,walking).map(f=>f.id),[canonical]);
 const prepared=prepareFacilities(current);assert(prepared.some(p=>p.facility.id===canonical));assert(!prepared.some(p=>p.facility.id===alias));
 const near=nearbyFacilityCandidates(get(alias).geometry.coordinates,prepared);assert(near.some(p=>p.facility.id===canonical));assert(!near.some(p=>p.facility.id===alias));
 for(const id of [canonical,alias]){const original=base.find(f=>f.id===id);assert.deepEqual(get(id).geometry,original.geometry);assert.deepEqual(get(id).properties.source_ids,original.properties.source_ids);assert.deepEqual(get(id).properties.registered_details,original.properties.registered_details);}
 assert(mapFacilities(current,categories,get(alias),scope,walking).some(f=>f.id===alias),'Old direct link remains inspectable');
 assert.deepEqual(readPlaceLink('#kind=facility&id='+canonical),{kind:'facility',id:canonical});
});
test('invalid duplicate targets, chains, mismatched identities and evidence are rejected',()=>{
 for(const change of [
  o=>o.additions[0].properties.duplicate_of=canonical,
  o=>o.updates.find(u=>u.id===alias).duplicate_of='missing',
  o=>o.updates.find(u=>u.id===alias).duplicate_of=alias,
  o=>o.updates.find(u=>u.id===alias).duplicate_of=null,
  o=>o.updates.find(u=>u.id===canonical).duplicate_of=alias,
  o=>o.updates.find(u=>u.id===alias).changes.name='別の店舗',
  o=>o.updates.find(u=>u.id===alias).changes.category='supermarket',
  o=>o.updates.find(u=>u.id===canonical).review.sources=[{title:'別店舗',url:'https://example.org/other'}],
  o=>Object.assign(o.updates.find(u=>u.id===canonical).review,{status:'closed',event:'closed',date_precision:'unknown'})
 ]){const o=structuredClone(overlay);change(o);assert.throws(()=>applyFacilityCurrent(base,o));}
 const b=structuredClone(base),o=structuredClone(overlay);b.find(f=>f.id===alias).geometry.coordinates[0]+=0.001;o.updates.find(u=>u.id===alias).expected.geometry=b.find(f=>f.id===alias).geometry;assert.throws(()=>applyFacilityCurrent(b,o),/same reviewed site/);
});
test('historical Lady closure date is not the later Wants notice date; Ouchi notice does not invent an effective date',()=>{
 assert.equal(get(lady).properties.freshness_review.effective_at,'2018-05-16');assert(!facilityAvailable(get(lady)));
 assert.equal(get(ouchi).properties.freshness_review.effective_at,null);assert.equal(freshnessDateText(get(ouchi).properties.freshness_review),'未確認（閉店自体は公式告知で確認）');
 assert.equal(get(ouchi).properties.category,'reference');assert(!searchPlaces('山口大内御堀店',[],current).facilities.some(f=>f.id===ouchi));
 assert(!searchPlaces('くすりのレデイ 宇部店',[],current).facilities.some(f=>f.id===lady));assert(!prepareFacilities(current).some(p=>[lady,ouchi].includes(p.facility.id)));
});
test('uncertain predecessors, current Numa 1-chome, and containing shopping centres are unchanged',()=>{
 for(const id of ['osm-way-562664551','osm-node-4021837791','osm-node-3951221858','osm-node-3951221857']){assert.deepEqual(get(id),base.find(f=>f.id===id));assert(!batch.updates.some(u=>u.id===id));}
 assert(facilityAvailable(get('official-tsuruha-3888')));assert.equal(get('official-tsuruha-10049').geometry.coordinates[0],131.33282355062036);
 assert.equal(evidence.cases.filter(c=>c.status==='resolved').length,4);assert.equal(evidence.cases.filter(c=>c.status==='map_action').length,3);
 const numa=evidence.cases.find(c=>c.case_id==='reconcile:wants-closed-ube-numa');assert.equal(numa.nearest[0].id,'osm-way-562664551');assert(numa.nearest.find(c=>c.id==='official-tsuruha-3888').distance_m>400);
});
test('adopted changes preserve the preceding overlay and bind public evidence without requiring private page receipts',()=>{
 assert.equal(hash(batch),evidence.batch_hash);assert.equal(hash(read('data-sources/facility-wants-corrections-20260925/pdf-row-review.json')),evidence.pdf_review_hash);
 const before={ ...overlay, checked_at: '2026-09-25', updates: overlay.updates.slice(0,26),additions:overlay.additions.slice(0,172)},after={ ...overlay, checked_at: '2026-09-25', updates: overlay.updates.slice(0,30),additions:overlay.additions.slice(0,172)};
 assert.equal(hash(before),evidence.before_overlay_hash);assert.equal(hash(after),evidence.after_overlay_hash);assert.deepEqual(after.updates.slice(26),batch.updates);assert.equal(evidence.extra_jev_requests,0);
 assert.equal(current.filter(f=>f.properties.freshness_review?.status==='closed').length,15);assert.equal(current.filter(f=>f.properties.duplicate_of).length,1);
});
