import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { applyFacilityCurrent } from '../src/facilityFreshness.ts';
import { applyFacilityAudit } from '../src/facilityAudit.ts';
import { applyFacilityGuidance } from '../src/facilityGuidance.ts';
const read=n=>JSON.parse(fs.readFileSync(`public/data/${n}`));
const features=applyFacilityGuidance(applyFacilityAudit(applyFacilityCurrent([...read('shopping.geojson').features,...read('civic-facilities.geojson').features],read('facility-current.json')),read('facility-audit.json')),read('facility-guidance.json'));
const server=await createServer({server:{middlewareMode:true,watch:null},appType:'custom'}), previous=globalThis.window;
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
try {
 globalThis.window={location:{href:'https://example.org/'}};
 const {default:Drawer}=await server.ssrLoadModule('/src/FacilityDrawer.tsx');
 for(const f of features.filter(f=>f.properties.guide_review)) {
  const r=f.properties.guide_review, html=renderToStaticMarkup(React.createElement(Drawer,{facility:f,onClose(){}}));
  assert(html.indexOf('aria-label="施設の案内確認"')<html.indexOf('元の監査記録・位置の確認履歴'));
  for(const s of [r.display.type,r.display.place,r.display.use,r.scope,r.summary,...r.limits,...r.remaining])assert(html.includes(esc(s)),f.id+': '+s);
  if(r.reference_group){assert(html.includes(esc(r.reference_group.note)));assert(html.includes('元の登録記録2件'));assert(!html.includes('<h3>施設の案内</h3>'));}
  for(const s of r.sources)assert(html.includes(esc(s.url))&&html.includes(esc(s.scope))&&html.includes(esc(s.date_note)));
  if(r.record_basis){assert(html.includes(esc(r.record_basis.statement)));assert(html.includes('保存された既存成果による限定判断'));assert(!html.includes('chatgpt.com/api/library/files/'));}
  if(r.saved_basis){assert(html.includes(esc(r.saved_basis.statement)));assert(html.includes(r.saved_count_group && r.decision==='reference'?'保存された同じ施設の支持（候補は代表記録のみ）':r.saved_basis.kind==='saved_reference'?'保存された判断の参考表示':r.saved_basis.kind==='saved_point_exclusion'?'保存された確認による原点の限定除外':'保存された支持範囲の限定案内'));for(const s of r.saved_basis.records)for(const v of [s.title,s.locator,s.quote,s.scope,s.date_note])assert(html.includes(esc(v)),f.id+': '+v);assert(!html.includes('chatgpt.com/api/library/files/'));}
  if(r.saved_count_group){assert(html.includes(esc(r.saved_count_group.note)));assert(html.includes('同じ施設の案内1施設（元の登録記録2件）'));}
  if(r.saved_visit_group){assert(html.includes(esc(r.saved_visit_group.note)));assert(html.includes('同じ店舗の施設付近案内1施設（元の登録記録2件）'));}
  if(r.exclusion_scope==='registered_services') {
   assert(html.includes('他の登録サービスの利用状態や案内は、この判断だけでは変更しません。'));
   assert(!html.includes('この記録は現役の徒歩候補・施設数・時間と距離の案内に含めません。'));
  }
  if(r.decision==='reference') {
   assert(html.includes(r.saved_count_group?'<h3>同じ施設の案内（代表記録に集約）</h3>':'<h3>資料の範囲で参考表示</h3>'));
   assert(html.includes('参考表示は施設全体の休止・閉鎖を認定するものではありません。'));
   assert(!html.includes('<h3>案内に必要な確認が残っています</h3>'));
   assert(!html.includes('案内対象外の範囲：'));
  }
  assert(html.includes(esc(f.properties.audit_review.summary)));
  if(r.decision==='ready' && f.properties.audit_review?.map_location){
   assert(html.includes('今回の徒歩候補には、上部に示す保存根拠で支持された限定範囲として含めます。'));
   assert(!html.includes('この登録位置は徒歩圏の集計・到達性判定の対象外です。'));
   assert(html.includes(esc(f.properties.audit_review.map_location.note)),'original audit position note retained');
  }
 }
 const {prepareFacilities,nearbyFacilityCandidates,bakedFacilityCandidates}=await import('../src/bakedWalking.ts');
 const {default:BakedList}=await server.ssrLoadModule('/src/BakedFacilityList.tsx');
 const {default:Nearby}=await server.ssrLoadModule('/src/NearbyFacilitiesPanel.tsx');
 const school=features.find(f=>f.id==='osm-node-1423657421'),schoolOrigin=school.geometry.coordinates,schoolPrepared=prepareFacilities([school]),schoolCatchment={stopId:'school-contact',budget:1000,origin:schoolOrigin,snap:schoolOrigin,snapGap:0,segments:[{a:schoolOrigin,b:schoolOrigin,d1:0,d2:0,grade:0,steps:false}]};
 for(const [Component,props] of [[BakedList,{candidates:bakedFacilityCandidates(schoolCatchment,schoolPrepared),group:'all',onGroup(){},minutes:5,state:'ready',retry(){},onFacility(){}}],[Nearby,{origin:schoolOrigin,facilities:[school],state:'ready',retry(){},onFacility(){},scope:'school-contact',onMapFacilities(){}}]]){
  const html=renderToStaticMarkup(React.createElement(Component,props));assert(html.includes('来校・相談先（事前確認）'));assert.equal((html.match(/class="place-row walk-facility-row"/g)??[]).length,1);
 }
 const original=features.find(f=>f.id==='osm-node-1423653891'),current=features.find(f=>f.id==='civic-KD0000500001'),origin=original.geometry.coordinates;
 const pair=[original,current],prepared=prepareFacilities(pair),catchment={stopId:'shared-render',budget:1000,origin,snap:origin,snapGap:0,segments:[{a:origin,b:origin,d1:0,d2:0,grade:0,steps:false}]};
 const combinedWalk=bakedFacilityCandidates(catchment,prepared);assert.equal(combinedWalk.length,1);
 const dx=(origin[0]-current.geometry.coordinates[0])*Math.cos(origin[1]*Math.PI/180),dy=origin[1]-current.geometry.coordinates[1],length=Math.hypot(dx,dy),scale=22/6371000*180/Math.PI;
 const road=[origin[0]+dx/length*scale/Math.cos(origin[1]*Math.PI/180),origin[1]+dy/length*scale];
 const reachableOriginal={...catchment,origin:road,snap:road,segments:[{a:road,b:road,d1:0,d2:0,grade:0,steps:false}]};
 const walk=bakedFacilityCandidates(reachableOriginal,prepared);assert.equal(walk.length,1);assert.equal(walk[0].facility.id,original.id);
 const nearby=nearbyFacilityCandidates(origin,prepared);assert.equal(nearby.length,1);
 for(const [Component,props] of [[BakedList,{candidates:walk,group:'all',onGroup(){},minutes:5,state:'ready',retry(){},onFacility(){}}],[Nearby,{origin,facilities:pair,state:'ready',retry(){},onFacility(){},scope:'shared-render',onMapFacilities(){}}]]) {
   const html=renderToStaticMarkup(React.createElement(Component,props));
   assert(html.includes('現在の来訪先：')&&html.includes('下松市立潮音保育園'));
   assert(html.includes('下松市立香力保育園'),'original name remains visible');
   assert.equal((html.match(/class="place-row walk-facility-row"/g)??[]).length,1,'current destination is counted/listed once');
 }
 console.log('PASS actual walking/nearby list render: two original records retain names and current visitor destination count1');

 for(const [childID,targetID,label,name] of [
   ['osm-way-803645871','osm-node-7517416823','同じ公園の概略案内：','王司神田一丁目公園'],
   ['civic-care-3570700959-f4f4504b81','civic-KD0000900075','現在の来訪先：','プレストガーデン瑞穂デイサービスセンター（通所介護）']
 ]){
   const child=features.find(f=>f.id===childID),target=features.find(f=>f.id===targetID),pair=[child,target],origin=target.geometry.coordinates,prepared=prepareFacilities(pair),catchment={stopId:'new62-render',budget:1000,origin,snap:origin,snapGap:0,segments:[{a:origin,b:origin,d1:0,d2:0,grade:0,steps:false}]};
   for(const [Component,props] of [[BakedList,{candidates:bakedFacilityCandidates(catchment,prepared),group:'all',onGroup(){},minutes:5,state:'ready',retry(){},onFacility(){}}],[Nearby,{origin,facilities:pair,state:'ready',retry(){},onFacility(){},scope:'new62-render',onMapFacilities(){}}]]){
     const html=renderToStaticMarkup(React.createElement(Component,props));assert(html.includes(esc(label)) || html.includes('今回の案内：'));assert(html.includes(esc(name)) || html.includes(esc(target.properties.guide_review.display.type)));assert.equal((html.match(/class="place-row walk-facility-row"/g)??[]).length,1);assert(html.includes(esc(child.properties.name))||html.includes(esc(target.properties.name)));
   }
 }
 console.log('PASS new62 mixed park geometries and care current-name combined lists: one visit unit, raw records retained');

 console.log('PASS guidance drawer: short axes, limits, evidence dates, original audit history');
} finally {globalThis.window=previous;await server.close();}
