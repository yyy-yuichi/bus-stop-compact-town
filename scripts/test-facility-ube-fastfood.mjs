import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {hash} from './jev-batch.mjs';import {addDiningBatch} from './facility-dining-chains-lib.mjs';import {mcdPoint,kfcPoint,geometryDistance} from './facility-ube-fastfood-lib.mjs';import {applyFacilityCurrent} from '../src/facilityFreshness.ts';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),pub='data-sources/facility-ube-fastfood-20260925';
const rows=read(pub+'/adoptions.json'),inputs=read(pub+'/review-inputs.json'),summary=read(pub+'/adoption-summary.json'),reviews=read(pub+'/article-reviews.json'),current=read('public/data/facility-current.json');
test('named McDonalds job location rejects wrong branch, address, map and viewport-only data',()=>{
 const spec=rows.point_reviews[0].spec,p=rows.additions[0].geometry.coordinates;
 const j={'@type':'JobPosting',url:spec.jobUrl,identifier:{value:spec.code},hiringOrganization:{name:spec.name},jobLocation:{address:{addressLocality:'宇部市',streetAddress:spec.address},geo:{longitude:p[0],latitude:p[1]}}};
 const receipt=(url,html)=>({url,final_url:url,status:200,html}),script=x=>'<script type="application/ld+json">'+JSON.stringify(x)+'</script>';
 const job=receipt(spec.jobUrl,script(j)),store=receipt(spec.currentUrl,spec.name+spec.currentAddress+spec.phone+' var center_lat = '+p[1]+'; var center_lng = '+p[0]+';');
 assert.deepEqual(mcdPoint(job,store,spec),p);
 for(const change of [x=>x.identifier.value='other',x=>x.jobLocation.address.streetAddress='別住所',x=>x.jobLocation.geo.longitude=139,x=>x.hiringOrganization.name='別店舗']){const bad=structuredClone(j);change(bad);assert.throws(()=>mcdPoint({...job,html:script(bad)},store,spec));}
 assert.throws(()=>mcdPoint({...job,html:store.html},store,spec));
 assert.throws(()=>mcdPoint(job,{...store,html:store.html.replace(String(p[0]),'131.1')},spec));
 assert.throws(()=>mcdPoint({...job,final_url:'https://example.com'},store,spec));
});
test('KFC coordinates belong to the identified tenant, never default Tokyo centre',()=>{
 const url='https://search.kfc.co.jp/points/5063',j={'@type':'Restaurant','@id':url,url,name:'ゆめタウン宇部店',telephone:'0836-39-0205',address:{addressLocality:'宇部市',streetAddress:'黒石北3-4-1'},geo:{longitude:131.206695,latitude:33.984492}};
 const r=x=>({url,final_url:url,status:200,html:'var center = [139.767,35.681];<script type="application/ld+json">'+JSON.stringify(x)+'</script>'});
 assert.deepEqual(kfcPoint(r(j)),[131.206695,33.984492]);assert.throws(()=>kfcPoint(r({...j,name:'他店'})));
 assert.throws(()=>kfcPoint(r({...j,geo:{longitude:139.767,latitude:35.681}})));
});
test('mall polygon is retained in proximity screening and all prior records remain unchanged',()=>{
 assert.equal(geometryDistance([131,34],{type:'MultiPolygon',coordinates:[[[[130.9,33.9],[131.1,33.9],[131.1,34.1],[130.9,34.1],[130.9,33.9]]]]}).distance_m,0);
 const historical={...current,updates:current.updates.slice(0,summary.cumulative_updates),additions:current.additions.slice(0,summary.cumulative_additions)};
 const before={...historical,additions:historical.additions.filter(r=>!rows.additions.some(x=>x.id===r.id))};
 assert.equal(hash(before),summary.before_overlay_hash);assert.equal(hash(historical),summary.after_overlay_hash);
 assert.equal(hash(rows),summary.adoptions_hash);assert.equal(hash(inputs),summary.inputs_hash);
 assert.deepEqual(addDiningBatch(current,rows).overlay,current);assert.equal(addDiningBatch(current,rows).added,0);
 assert(rows.point_reviews.find(p=>p.id==='official-kfc-5063').compared_candidates.some(c=>c.id==='ube'&&c.method==='bounding_box_screen_only'));
 const base=['shopping.geojson','civic-facilities.geojson'].flatMap(f=>read('public/data/'+f).features),old=applyFacilityCurrent(base,before),after=applyFacilityCurrent(base,current);
 for(const f of old)assert.deepEqual(after.find(r=>r.id===f.id),f);
 assert(rows.point_reviews.find(p=>p.id==='official-mcdonalds-35538').compared_candidates.some(c=>c.id==='osm-way-477623030'));
});
test('dates, old-site closure and the Wants position conflict remain unresolved',()=>{
 assert.equal(reviews.length,8);const events=reviews.flatMap(r=>r.events);assert.equal(events.length,21);assert.equal(events.filter(e=>e.disposition==='hold').length,14);
 assert.equal(events.filter(e=>e.disposition==='duplicate').length,4);assert(events.every(e=>e.effective_at===null));
 assert(rows.additions.every(f=>f.properties.freshness_review.event==='listed'&&f.properties.freshness_review.effective_at===null));
 assert.equal(rows.updates.length,0);assert.equal(summary.closed_records,7);
 const conflict=read(pub+'/holds.json').find(h=>h.topic==='wants_halows_nishikiwa_position_conflict');assert(conflict.distance_m>3000);
 assert(events.some(e=>e.event_id==='ube-83311:wants-position'&&e.disposition==='hold'));
 assert.equal(summary.extra_jev_requests,0);
});
