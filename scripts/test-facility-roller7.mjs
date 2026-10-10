import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {applyFacilityAudit} from '../src/facilityAudit.ts';
import {applyFacilityCurrent, facilityAvailable, facilityChangeReview} from '../src/facilityFreshness.ts';
import {isFacilityWalkingCandidate} from '../src/facilityMapLocation.ts';
import {bakedFacilityCandidates, nearbyFacilityCandidates, prepareFacilities, distance} from '../src/bakedWalking.ts';
import {mapFacilities} from '../src/facilityVisibility.ts';
import {searchPlaces} from '../src/placeSearch.ts';

const read=n=>JSON.parse(fs.readFileSync(`public/data/${n}`,'utf8'));
const raw=['shopping.geojson','civic-facilities.geojson'].flatMap(n=>read(n).features);
const data=read('facility-audit.json'), current=applyFacilityAudit(applyFacilityCurrent(raw,read('facility-current.json')),data);
const original=new Map(raw.map(f=>[f.id,f])), now=new Map(current.map(f=>[f.id,f]));
const koyo='osm-node-1631273323', hama='osm-node-2749691198', yamagin='osm-node-4622018949', obayama='osm-way-1034652211', saikyo='osm-node-4628681410', family='osm-node-4605758989', maruki='osm-node-2420817189';
const ids=[koyo,hama,yamagin,obayama,saikyo,family,maruki], operatorIds=[yamagin,saikyo,family];

test('seven original units and raw fields stay exact; successor care, restaurant and retail supports do not create operating events',()=>{
  assert.deepEqual(data.counts,{reviewed:2828,limited_support:1365,unresolved:1463,recovered_registry:23});
  assert.equal(data.checked_at,'2026-10-09');
  for(const id of ids){const f=now.get(id), copy=structuredClone(f);delete copy.properties.audit_review;assert.deepEqual(copy,original.get(id));assert.equal(f.properties.audit_review.status,'limited_support');assert.equal(f.properties.audit_review.checked_at,'2026-10-09');assert.equal(facilityAvailable(f),true);assert.equal(facilityChangeReview(f),undefined);assert.equal(new Set(f.properties.audit_review.sources.map(s=>new URL(s.url).href)).size,f.properties.audit_review.sources.length);}
  assert.deepEqual(now.get(koyo).properties.registered_details.service,['assisted_living']);
  assert.deepEqual(now.get(hama).properties.registered_details.cuisine,['sushi']);
  for(const id of [yamagin,obayama,saikyo,family,maruki])assert.equal(Object.hasOwn(now.get(id).properties,'registered_details'),false);
  assert.equal(now.get(maruki).properties.address,'');assert.equal(now.get(maruki).properties.official_address,'');
  assert.equal(now.get(maruki).properties.audit_review.map_location.current_location,undefined);
  assert.equal(now.get(hama).properties.audit_review.map_location.current_location,undefined);
  for(const id of ['osm-node-11288510351','osm-node-2749473375'])assert.equal(now.get(id).properties.audit_review.status,'unresolved');
});

test('seven unverified old points stay out of walking and nearby counts while direct selection and search retain original identities',()=>{
  for(const id of ids){const f=now.get(id),[lon,lat]=f.geometry.coordinates,dx=10*180/(Math.PI*6371000*Math.cos(lat*Math.PI/180));
    const origin=[lon-dx,lat],end=[lon+dx,lat],c={stopId:'roller7',budget:1000,origin,snap:origin,snapGap:0,segments:[{a:origin,b:end,d1:0,d2:20,grade:0,steps:false}]};
    const legacy=structuredClone(f);delete legacy.properties.audit_review;
    assert.equal(bakedFacilityCandidates(c,prepareFacilities([legacy])).length,1);assert.equal(nearbyFacilityCandidates(origin,prepareFacilities([legacy])).length,1);
    assert.equal(bakedFacilityCandidates(c,prepareFacilities([f])).length,0);assert.equal(nearbyFacilityCandidates(origin,prepareFacilities([f])).length,0);assert.equal(isFacilityWalkingCandidate(f),false);
    assert.equal(searchPlaces(f.properties.name,[],[f]).facilities.length,1);
    const scope='roller7';assert.deepEqual(mapFacilities([f],[f.properties.category],null,scope,{scope,ids:[id]}),[]);
    assert.deepEqual(mapFacilities([f],[f.properties.category],f,scope,{scope,ids:[id]})[0].geometry,original.get(id).geometry);
  }
});

test('operator points have explicit roles and distances; historical plans, permit dates and address differences remain bounded',()=>{
  for(const id of operatorIds){const f=now.get(id),l=f.properties.audit_review.map_location.current_location;assert.equal(l.point_role,'operator_designated_destination');assert(!Object.hasOwn(l,'qualified_role'));assert(Math.abs(distance(f.geometry.coordinates,l.coordinates)-l.distance_from_original_m)<0.02);assert.equal(l.source.retrieved_at,'2026-10-08');assert.equal(l.source.as_of,undefined);assert(f.properties.audit_review.sources.some(s=>s.url===l.source.url&&s.title===l.source.title));}
  const s=now.get(saikyo).properties.audit_review;assert(s.sources.some(s=>s.title.includes('移転計画')));assert(s.sources.some(s=>s.title.includes('実施済み記録')));assert(s.limits.some(x=>x.includes('現在/終了案は未支持')));
  const f=now.get(family).properties.audit_review;assert(f.limits.some(x=>x.includes('FutureObjectDate1')));
  const m=now.get(maruki).properties.audit_review;assert(m.summary.includes('270.28m'));assert(m.summary.includes('1605-1')&&m.summary.includes('2-11-18'));assert(m.sources.some(s=>s.url.endsWith('/127068.html')));assert(!m.sources.some(s=>s.url.endsWith('/71623.pdf')));
  const h=now.get(hama).properties.audit_review;assert.equal(h.sources.filter(s=>new URL(s.url).href===new URL('https://hamazushi.net/店舗案内/').href).length,1);
});

test('actual drawers expose limited care succession, address and point differences, current-index caveat and operator point roles outside folds',async()=>{
  const server=await createServer({cacheDir:'/tmp/udc-roller7-unit-cache',server:{middlewareMode:true,watch:null},appType:'custom'});const saved=globalThis.window;
  try{globalThis.window={location:{href:'https://example.org/'}};const {default:Drawer}=await server.ssrLoadModule('/src/FacilityDrawer.tsx');
    const visible=id=>renderToStaticMarkup(React.createElement(Drawer,{facility:now.get(id),onClose(){}})).replace(/<details\b[^>]*>[\s\S]*?<\/details>/g,'');
    for(const id of ids){const h=visible(id);assert(h.includes('限定範囲の根拠あり'));assert(h.includes('地図の位置は未確認'));assert(!h.includes('aria-label="施設の変更確認"'));}
    for(const t of ['旧市委託デイ事業の廃止','通所生活介護','入所本体へ統合せず','assisted_living'])assert(visible(koyo).includes(t));
    for(const t of ['1605-1','2-11-18','270.28m','現在の施設点又は徒歩利用点として採用しません','2026-02-24'])assert(visible(maruki).includes(t));
    for(const t of ['2026年9月9日','小羽山4区集会所','Maps閉業表示を実閉所の証明として扱わず'])assert(visible(obayama).includes(t));
    for(const id of operatorIds){assert(visible(id).includes('運営者が指定する目的点'));assert(!visible(id).includes('照合した現施設点'));}
    assert(visible(saikyo).includes('2010移転計画と2011実施済み回顧は区別'));
    assert(visible(hama).includes('許可記載を実営業の証明にはせず'));
  }finally{if(saved===undefined)delete globalThis.window;else globalThis.window=saved;await server.close();}
});
