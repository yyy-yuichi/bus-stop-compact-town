import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyFacilityCurrent } from '../src/facilityFreshness.ts';
import { applyFacilityAudit } from '../src/facilityAudit.ts';
import { applyFacilityGuidance, guideExcludesOriginal, referenceFacilityGroups } from '../src/facilityGuidance.ts';
import { distinctVisitCandidates } from '../src/facilityGuidance.ts';
import { isFacilityWalkingCandidate } from '../src/facilityMapLocation.ts';
import { categoryOf, SHOPPING_CATEGORIES } from '../src/facilityCatalog.ts';
import { mapFacilities } from '../src/facilityVisibility.ts';
import { nearbyFacilityCandidates, prepareFacilities, bakedFacilityCandidates, WALKING_METERS_PER_MINUTE } from '../src/bakedWalking.ts';
const read = n => JSON.parse(fs.readFileSync(`public/data/${n}`));
const base = applyFacilityAudit(applyFacilityCurrent([...read('shopping.geojson').features, ...read('civic-facilities.geojson').features], read('facility-current.json')), read('facility-audit.json'));
const data = read('facility-guidance.json'), applied = applyFacilityGuidance(base, data);

test('saved reference decisions show traceable quotes without promoting missing facility facts or unverified URLs', () => {
  const id='osm-node-1631267683',f=applied.find(x=>x.id===id),r=f.properties.guide_review;
  assert.equal(r.saved_basis.kind,'saved_reference');assert.equal(r.sources.length,0);assert.equal(r.decision,'reference');assert.equal(isFacilityWalkingCandidate(f),false);assert.equal(r.remaining.length,0);assert.equal(r.next_source,null);
  assert(r.saved_basis.records.some(s=>s.quote.includes('長島1561-1')));
  for(const edit of [r=>delete r.saved_basis,r=>r.saved_basis.original_id='another-id',r=>r.saved_basis.packet_sha256='wrong',r=>r.saved_basis.json_pointer='not-a-packet-pointer',r=>r.saved_basis.records=[],r=>r.saved_basis.records[0].source_library_file_id='https://private.invalid/',r=>r.saved_basis.records[0].quote='',r=>{r.decision='ready';r.location='original_supported';},r=>r.saved_basis.kind='saved_bounded_guidance',r=>r.sources.push({title:'private',url:'https://chatgpt.com/api/library/private',scope:'scope',date_note:'date'})]){
    const d=structuredClone(data);edit(d.reviews.find(x=>x.id===id).review);assert.throws(()=>applyFacilityGuidance(base,d));
  }
});

test('saved store group retains the node representative and separate originals without inventing positions or minutes', () => {
  const node=applied.find(x=>x.id==='osm-node-13651969772'),way=applied.find(x=>x.id==='osm-way-1489413022'),yama=applied.find(x=>x.id==='osm-node-1631266325');
  assert.equal(distinctVisitCandidates([way,node,yama],f=>f).length,2);assert.equal(distinctVisitCandidates([way,node],f=>f)[0].id,node.id);assert.equal(distinctVisitCandidates([way],f=>f)[0].id,way.id);
  for(const f of [node,way,yama]){assert.equal(isFacilityWalkingCandidate(f),true);assert.equal(f.properties.guide_review.saved_basis.kind,'saved_bounded_guidance');assert.deepEqual(f.geometry,base.find(x=>x.id===f.id).geometry);}
  for(const edit of [r=>r.saved_visit_group.facility_count=2,r=>r.saved_visit_group.member_ids.pop(),r=>r.saved_visit_group.id=yama.id,r=>r.saved_basis.kind='saved_reference',r=>r.saved_basis.packet_sha256='invalid']){
    const d=structuredClone(data);edit(d.reviews.find(x=>x.id===way.id).review);assert.throws(()=>applyFacilityGuidance(base,d));
  }
  assert(yama.properties.guide_review.display.type.includes('原記録名'));assert(!yama.properties.guide_review.display.type.includes('旧登録名'));assert(yama.properties.guide_review.display.use.includes('利用前に電話で確認'));
});

test('Hanagoyomi retains the separately located operator shop without renaming or routing the old mall point', () => {
  const f=applied.find(f=>f.id==='osm-node-4002027612'),r=f.properties.guide_review;
  assert.equal(f.properties.name,'花ごよみ');assert.equal(r.decision,'exclude');assert.equal(isFacilityWalkingCandidate(f),false);
  for(const text of ['美里町2-6-16','2018年12月13日','有限会社河本','河本光正','別施設の参考情報'])assert(r.display.use.includes(text),text);
  const s=r.sources.find(s=>s.url==='https://www.karaage-ishin.com/shop');assert(s.scope.includes('旧花ごよみの名称・実閉店日・旧原位置との一致は本文にない'));
  assert.deepEqual(f.geometry,base.find(x=>x.id===f.id).geometry);
});

test('new evidence45 preserves map-only park caveats, care conditions, old points and scoped medical suspension', () => {
  const parkIDs=['osm-way-575456028','osm-way-662566008','osm-way-1112638274','osm-way-733765230','osm-way-662565599','osm-way-978073605','osm-way-803621485','osm-way-999451908'];
  for(const id of parkIDs){const f=applied.find(x=>x.id===id),r=f.properties.guide_review;assert.equal(r.decision,'ready');assert.equal(r.display.type,'公開地図に基づく概略案内');assert(r.scope.includes('自治体による現況確認'));assert.equal(r.sources.length,1);assert(r.sources[0].url.startsWith('https://map.yahoo.co.jp/v3/place/'));assert(r.limits.some(x=>x.includes('経路画面は取得できていない')));}
  for(const id of ['osm-way-662566008','osm-way-978073605'])assert(applied.find(f=>f.id===id).properties.guide_review.limits.some(x=>x.includes('利用状況が変更')));
  const day=applied.find(f=>f.id==='civic-care-3590800482-d5e364fa90').properties.guide_review;for(const t of ['岩国2日常生活圏域全域','南岩国町全域','要支援1・2～要介護5','認知症','共同生活','0827-28-4875'])assert(day.display.use.includes(t),t);
  for(const id of ['osm-way-922754902','osm-way-549732197']){const r=applied.find(f=>f.id===id).properties.guide_review;assert.equal(r.decision,'exclude');assert.equal(r.exclusion_scope,'original_service');assert(r.scope.includes('閉院・全診療終了・別サービスの状態は認定しません'));assert(r.sources[0].url.startsWith('https://kouseikyoku.mhlw.go.jp/'));assert(r.display.use.includes('2026年10月1日現在'));}
  for(const id of ['civic-care-3577300712-d458c4581b','civic-care-3567390020-7c5723a57c','osm-node-1631275461']){const r=applied.find(f=>f.id===id).properties.guide_review;assert.equal(r.exclusion_scope,'original_location');assert(r.display.use.includes(id==='osm-node-1631275461'?'入所支援':'平生'));assert.equal(isFacilityWalkingCandidate(applied.find(f=>f.id===id)),false);}
  const library=applied.find(f=>f.id==='osm-node-1423653975').properties.guide_review;assert.equal(library.decision,'reference');for(const s of ['川棚6895番地1','総合支所2階','10月17日'])assert(library.display.use.includes(s));assert(library.sources.find(s=>s.url.endsWith('10084.pdf')).scope.includes('現在の6895-1'));
  const poplar=applied.find(f=>f.id==='osm-node-13789521881').properties.guide_review;assert(poplar.limits.some(s=>s.includes('両地番・建物を等置せず')));
});

test('approved policy retains eleven references and labels school contact without resolving original factual gaps', () => {
  const ids=['civic-care-3570101828-a307a70ae7','civic-care-3570101752-0b9af889de','osm-node-1631266876','osm-node-1631273584','osm-node-1631267799','osm-node-1631278789','osm-node-1423655596','osm-node-4562133576','osm-node-2684639726','osm-way-897798960','osm-node-2414456143'];
  for(const id of ids){const f=applied.find(x=>x.id===id);assert.equal(f.properties.guide_review.decision,'reference');assert.equal(isFacilityWalkingCandidate(f),false);assert.equal(guideExcludesOriginal(f),false);assert.equal(mapFacilities([f],SHOPPING_CATEGORIES.map(c=>c.id),null,'policy',{scope:'policy',ids:[id]}).length,0);assert.equal(mapFacilities([f],SHOPPING_CATEGORIES.map(c=>c.id),f,'policy',{scope:'policy',ids:[id]}).length,1,'selected original retained');}
  const school=applied.find(x=>x.id==='osm-node-1423657421');assert.equal(school.properties.guide_review.visit_purpose,'school_contact');assert.equal(isFacilityWalkingCandidate(school),true);assert(school.properties.guide_review.scope.includes('元住所1'));assert(school.properties.guide_review.display.use.includes('一般の自由利用は確認していません'));
  for(const edit of [r=>r.visit_purpose='free_access',r=>r.decision='reference',r=>r.location='unconfirmed']){const d=structuredClone(data);edit(d.reviews.find(x=>x.id===school.id).review);assert.throws(()=>applyFacilityGuidance(base,d));}
  const d=structuredClone(data);d.reviews.find(x=>x.id===ids[0]).review.visit_purpose='school_contact';assert.throws(()=>applyFacilityGuidance(base,d));
});

test('guide overlay preserves every original field, geometry, ID, and audit status across all 8369 records', () => {
  const saved = JSON.stringify([base, data]);
  assert.equal(applied.length, 8369); assert.equal(new Set(applied.map(f => f.id)).size, 8369);
  for (let i = 0; i < applied.length; i++) {
    const f = structuredClone(applied[i]); delete f.properties.guide_review;
    assert.deepEqual(f, base[i]);
  }
  assert.equal(JSON.stringify([base, data]), saved);
  const expected = JSON.parse(fs.readFileSync('data-sources/facility-guidance-20261009/md-expected.json'));
  assert.equal(expected.length, 1430);
  for (const row of expected) {
    const r=applied.find(f=>f.id===row.id).properties.guide_review;
    assert.equal(r.decision,row.decision,row.id);
    assert.deepEqual(r.display,row.display,row.id);
    assert.equal(r.exclusion_scope,row.exclusion_scope??undefined,row.id);
    assert.equal(r.excluded_unit,row.excluded_unit??undefined,row.id);
  }
});

test('ready/hold/excluded/reference decisions reach the actual map, nearby, and baked candidate calculations', () => {
  for (const item of data.reviews) {
    const f = applied.find(f => f.id === item.id), r = item.review;
    const partial = r.exclusion_scope === 'registered_services' && item.expected.services.some(s => !r.affected_services.includes(s));
    const ready = r.decision === 'ready' || (partial && isFacilityWalkingCandidate(base.find(x => x.id === item.id)));
    const counted = ready && categoryOf(f).id !== 'reference';
    assert.equal(isFacilityWalkingCandidate(f), ready, item.id);
    const visible = mapFacilities([f], SHOPPING_CATEGORIES.map(c => c.id), null, 'test', { scope: 'test', ids: [item.id] });
    assert.equal(visible.length, Number(counted), item.id);
    const prepared = prepareFacilities([f]);
    const origin = f.geometry.type === 'Point' ? f.geometry.coordinates : f.geometry.coordinates[0][0][0];
    assert.equal(nearbyFacilityCandidates(origin, prepared).length, Number(counted), item.id);
    const catchment = {stopId:'guide-fixture',budget:1000,origin,snap:origin,snapGap:0,segments:[{a:origin,b:origin,d1:0,d2:0,grade:0,steps:false}]};
    assert.equal(bakedFacilityCandidates(catchment, prepared).length, Number(counted), item.id);
  }
  const play = applied.find(f => f.id === 'osm-node-1631266097');
  assert.equal(play.properties.category, 'social_facility'); assert.equal(categoryOf(play).id, 'playground');
  const reference = applied.find(f => f.id === 'osm-node-2303175267');
  assert.equal(reference.properties.category, 'reference');
  assert.equal(categoryOf(reference).id, 'reference');
  assert.equal(reference.properties.guide_review.decision, 'ready');
  assert.equal(prepareFacilities([reference]).length, 0, 'supported reference guidance does not reclassify the facility or enter walking counts');
  const parkOnly=applied.find(f=>f.id==='osm-node-1631273560');
  assert.equal(parkOnly.properties.category,'social_facility');
  assert.deepEqual(parkOnly.properties.registered_details.service,['assisted_living']);
  assert.equal(categoryOf(parkOnly).id,'playground');
  assert.equal(isFacilityWalkingCandidate(parkOnly),true);
  assert(parkOnly.properties.guide_review.display.use.includes('介護サービス数には含めません'));
});

test('saved care references preserve other registered services while keeping the original position out of walking candidates', () => {
  for (const [id, affected, unaffected] of [
    ['civic-care-3560890000-2daa52346d', ['訪問看護'], '居宅介護支援']
  ]) {
    const f = applied.find(x => x.id === id), original = base.find(x => x.id === id);
    assert.equal(f.properties.guide_review.decision, 'reference');
    assert.equal(f.properties.guide_review.saved_basis.kind, 'saved_reference');
    assert(f.properties.guide_review.display.use.includes(affected[0]));
    assert(f.properties.guide_review.display.use.includes(unaffected));
    assert(f.properties.registered_details.service.includes(unaffected));
    assert.deepEqual(f.properties.registered_details, original.properties.registered_details);
    assert.equal(guideExcludesOriginal(f), false);
    assert.equal(isFacilityWalkingCandidate(f), false);
  }
  for (const id of ['civic-care-3570500417-f6da0d8bae','civic-care-3570500391-0792906ffe']) {
    const f=applied.find(x=>x.id===id),r=f.properties.guide_review;
    assert.equal(r.decision,'reference');assert.equal(guideExcludesOriginal(f),false);assert.equal(isFacilityWalkingCandidate(f),false);
    assert.deepEqual(f.properties.registered_details,base.find(x=>x.id===id).properties.registered_details);
    assert(r.display.use.includes(id==='civic-care-3570500417-f6da0d8bae'?'訪問介護の存続':'指定廃止'));
    assert(r.sources.every(s=>s.url.startsWith('https://www.pref.yamaguchi.lg.jp/')));
  }
});

test('scoped references neither promote walking nor exclude the original facility', () => {
  const references=data.reviews.filter(x=>x.review.decision==='reference');
  assert.equal(references.length,832);
  for(const item of references) {
    const f=applied.find(f=>f.id===item.id);
    assert.equal(guideExcludesOriginal(f),false,item.id);
    assert.equal(isFacilityWalkingCandidate(f),false,item.id);
    assert.equal(nearbyFacilityCandidates(f.geometry.coordinates,prepareFacilities([f])).length,0,item.id);
    assert.equal(item.review.exclusion_scope,undefined);
    assert.equal(item.review.excluded_unit,undefined);
    assert.equal(item.review.remaining.length,0);
    assert.equal(item.review.next_source,null);
    assert(['reference_only','old_point'].includes(item.review.location));
    assert.deepEqual(f.properties.audit_review,base.find(x=>x.id===item.id).properties.audit_review);
  }
});

test('service exclusion cannot terminate a different co-located service or a separate original ID', () => {
  const template = structuredClone(applied.find(f => f.id === 'civic-care-3571300338-23371d1908'));
  template.properties.guide_review.exclusion_scope = 'registered_services';
  delete template.properties.guide_review.excluded_unit;
  const [service, other] = template.properties.registered_details.service;
  template.properties.guide_review.affected_services = [service];
  assert.equal(guideExcludesOriginal(template), false);
  template.properties.guide_review.affected_services = [service, other];
  assert.equal(guideExcludesOriginal(template), true);
  const colocated = {...template,id:'different-original-id',properties:{...template.properties}};delete colocated.properties.guide_review;
  assert.equal(guideExcludesOriginal(colocated), false);
});

test('point and service restrictions retain current guidance without asserting whole-site closure', () => {
  for (const item of data.reviews.filter(x=>['original_location','original_service'].includes(x.review.exclusion_scope))) {
    const f=applied.find(f=>f.id===item.id);
    assert.equal(isFacilityWalkingCandidate(f),false,item.id);
    assert(item.review.display.use.trim()&&item.review.display.place.trim());
    assert(item.review.scope.includes(item.review.exclusion_scope==='original_location'?'施設・事業全体':'別サービス'));
    assert.deepEqual(f.properties.freshness_review,base.find(x=>x.id===item.id).properties.freshness_review);
    assert.deepEqual(f.properties.audit_review,base.find(x=>x.id===item.id).properties.audit_review);
    const other={...f,id:'another-id',properties:{...f.properties}};delete other.properties.guide_review;
    assert.equal(guideExcludesOriginal(other),false);
  }
});

test('source drift, duplicate IDs, failed scope and private URLs fail closed', () => {
  const mutate = edit => {const d=structuredClone(data);edit(d);assert.throws(()=>applyFacilityGuidance(base,d));};
  mutate(d=>d.reviews.push(d.reviews[0]));
  mutate(d=>d.reviews[0].expected.geometry.coordinates[0]+=0.1);
  mutate(d=>d.reviews[0].review.sources[0].url='https://chatgpt.com/api/library/private');
  mutate(d=>{const r=d.reviews.find(r=>r.review.decision==='ready').review;r.location='unconfirmed';});
  mutate(d=>{const r=d.reviews.find(r=>r.id==='civic-care-3571300338-23371d1908').review;r.exclusion_scope='registered_services';r.affected_services=['未確認の別サービス'];});
  mutate(d=>{const r=d.reviews.find(r=>r.review.exclusion_scope==='original_location').review;delete r.excluded_unit;});
  mutate(d=>{const r=d.reviews.find(r=>r.review.decision==='reference').review;r.location='original_supported';});
  mutate(d=>{const r=d.reviews.find(r=>r.review.decision==='reference').review;r.exclusion_scope='original_record';});
  mutate(d=>{const r=d.reviews.find(r=>r.review.decision==='reference').review;r.presentation_category='restaurant';});
  mutate(d=>{const r=d.reviews.find(r=>r.review.decision==='reference').review;r.remaining=['未確認を資料支持へ混入'];});
});


test('explicit current visitor destinations count once and retain the closest reachable original geometry', () => {
  const original=applied.find(f=>f.id==='osm-node-1423653891'),current=applied.find(f=>f.id==='civic-KD0000500001'),other=applied.find(f=>f.id==='civic-KD0000500006');
  assert.equal(original.properties.name,'下松市立香力保育園');assert.equal(current.properties.name,'下松市立潮音保育園');
  assert.equal(original.properties.duplicate_of,undefined);assert.equal(current.properties.duplicate_of,undefined);
  assert.equal(original.properties.guide_review.shared_destination.id,String(current.id));
  const o=original.geometry.coordinates,c=current.geometry.coordinates;
  const candidates=nearbyFacilityCandidates(o,prepareFacilities([current,original]));assert.equal(candidates.length,1);assert.equal(candidates[0].facility.id,original.id);assert.equal(candidates[0].meters,0);
  assert.equal(nearbyFacilityCandidates(o,prepareFacilities([current,original]),4).length,1,'closer original remains usable even when canonical representative lies outside the radius');
  assert.equal(nearbyFacilityCandidates(c,prepareFacilities([current,original]))[0].facility.id,current.id);
  const unmarked={...current,id:'unmarked-colocated-record',properties:{...current.properties}};delete unmarked.properties.guide_review;
  assert.equal(nearbyFacilityCandidates(o,prepareFacilities([current,original,other,unmarked])).length,3,'only explicit shared current destinations are counted once');
  assert.equal(mapFacilities([original,current,other],SHOPPING_CATEGORIES.map(c=>c.id),null,'shared',{scope:'shared',ids:[String(original.id),String(current.id),String(other.id)]}).length,2);
  assert(mapFacilities([original,current],SHOPPING_CATEGORIES.map(c=>c.id),current,'shared',{scope:'shared',ids:[String(original.id),String(current.id)]}).some(f=>f.id===current.id),'directly selected original record stays accessible');
  const dx=(o[0]-c[0])*Math.cos(o[1]*Math.PI/180),dy=o[1]-c[1],length=Math.hypot(dx,dy),scale=22/6371000*180/Math.PI;
  const road=[o[0]+dx/length*scale/Math.cos(o[1]*Math.PI/180),o[1]+dy/length*scale];
  for(const minutes of [5,10,15])for(const offset of [-.01,0,.01]){
    const cost=minutes*WALKING_METERS_PER_MINUTE+offset,catchment={stopId:'shared-boundary',budget:1100,origin:road,snap:road,snapGap:0,segments:[{a:road,b:road,d1:cost,d2:cost,grade:0,steps:false}]};
    const separateOriginal=bakedFacilityCandidates(catchment,prepareFacilities([original])),separateCurrent=bakedFacilityCandidates(catchment,prepareFacilities([current])),together=bakedFacilityCandidates(catchment,prepareFacilities([current,original]));
    assert.equal(separateOriginal.length,1);assert.equal(separateCurrent.length,0,'current representative is beyond the 25m road join while original is reachable');assert.equal(together.length,1);assert.equal(together[0].facility.id,original.id);assert.deepEqual(together[0].facilityPoint,o);assert.equal(together[0].meters<=minutes*WALKING_METERS_PER_MINUTE,offset<=0);
  }
  const saved=JSON.stringify(base);assert.deepEqual(applied.find(f=>f.id===current.id),base.find(f=>f.id===current.id));assert.equal(JSON.stringify(base),saved);
});

test('shared current visitor destination rejects identity drift, missing evidence, unsafe targets and chains', () => {
  const mutate=edit=>{const d=structuredClone(data);edit(d,d.reviews.find(x=>x.id==='osm-node-1423653891'));assert.throws(()=>applyFacilityGuidance(base,d));};
  mutate((d,x)=>x.review.shared_destination.kind='same_original_facility');
  mutate((d,x)=>x.review.shared_destination.id=x.id);
  mutate((d,x)=>x.review.shared_destination.id='missing-original-ID');
  mutate((d,x)=>x.review.shared_destination.expected.name+='x');
  mutate((d,x)=>x.review.shared_destination.expected.geometry.coordinates[0]+=.01);
  mutate((d,x)=>x.review.shared_destination.source_url='https://example.org/unattributed');
  mutate((d,x)=>x.review.shared_destination.note='');
  mutate((d,x)=>{x.review.decision='hold';x.review.location='unconfirmed';x.review.remaining=['未確定'];});
  const d=structuredClone(data),x=d.reviews.find(x=>x.id==='osm-node-1423653891'),current=base.find(f=>f.id==='civic-KD0000500001');
  const e={name:current.properties.name,category:current.properties.category,source_ids:current.properties.source_ids,services:current.properties.registered_details?.service??[],geometry:current.geometry};
  const row={id:String(current.id),expected:e,review:structuredClone(x.review)};row.review.shared_destination={...row.review.shared_destination,id:x.id,expected:x.expected};d.reviews.push(row);assert.throws(()=>applyFacilityGuidance(base,d),'chained/cyclic destination mappings rejected');
  const changed=structuredClone(base);changed.find(f=>f.id===current.id).properties.duplicate_of='another-record';assert.throws(()=>applyFacilityGuidance(changed,data),'unavailable target cannot anchor a shared visit count');
});


test('old point restrictions retain current Kuga hours/phone and Towa phone; OSM history does not assert current use', () => {
  const kuga=applied.find(f=>f.id==='osm-node-1423654107').properties.guide_review;
  for(const text of ['久賀996-1','平日14–18時','長期休暇8–18時','0820-72-1597'])assert(kuga.display.use.includes(text),text);
  const towa=applied.find(f=>f.id==='osm-node-1423654562').properties.guide_review;
  for(const text of ['平野417-11','0820-78-0629','公式図書館案内'])assert(towa.display.use.includes(text),text);
  for(const id of ['osm-node-1423654107','osm-node-1423654562']){
    const f=applied.find(f=>f.id===id);assert.equal(isFacilityWalkingCandidate(f),false);
    const history=f.properties.guide_review.sources.filter(s=>s.url.includes('openstreetmap.org')&&s.url.includes('/history'));
    assert(history.every(s=>s.title.includes('元の登録履歴')&&s.scope.includes('確認根拠には使いません')));
  }
});


test('Heguri original area preserves west-name/east-phone/east-district ambiguity and east-school teaching', () => {
 const f=applied.find(f=>f.id==='osm-way-1511032737'),r=f.properties.guide_review;
 for(const s of ['西校名','東校電話','東地区側','混在','未解消','平郡東小学校','授業実施記録'])assert(r.display.use.includes(s),s);
 assert.equal(isFacilityWalkingCandidate(f),false);assert.equal(f.geometry.type,'MultiPolygon');
});


test('saved support restores one representative per facility while retaining secondary original points', () => {
 const pairs=[['civic-KD0000900012','civic-care-3570701130-bd7d0c4b47'],['osm-node-10648332009','osm-node-5603040322']];
 for(const [a,b] of pairs){
  const first=applied.find(f=>f.id===a),second=applied.find(f=>f.id===b),pair=[first,second];
  assert.equal(isFacilityWalkingCandidate(first),true);assert.equal(isFacilityWalkingCandidate(second),false);
  for(const selected of [[first],[second],pair,pair.slice().reverse()]){
   assert.equal(prepareFacilities(selected).length,selected.length,'spatial preparation preserves originals; candidate filtering is checked below');
   assert.equal(nearbyFacilityCandidates(first.geometry.coordinates,prepareFacilities(selected)).length,selected.includes(first)?1:0);
  }
  const group=first.properties.guide_review.saved_count_group;
  assert.equal(group.facility_count,1);assert.equal(group.primary_original_id,first.id);assert.equal(group.count_contribution,1);assert.deepEqual(group.member_ids,[a,b]);
  for(const f of pair){assert.equal(guideExcludesOriginal(f),false);assert.equal(f.properties.guide_review.shared_destination,undefined);assert.deepEqual(f.geometry,base.find(x=>x.id===f.id).geometry);}
 }
 const county=applied.find(f=>f.id===pairs[0][1]).properties.guide_review;
 assert.equal(county.reference_group.kind,'original_registration');assert.equal(county.reference_group.service_count,1);assert.equal(county.saved_count_group,undefined);
 const secondary=applied.find(f=>f.id===pairs[1][1]).properties.guide_review;
 assert.equal(secondary.saved_count_group.count_contribution,0);assert.equal(secondary.saved_basis.kind,'saved_reference');assert(secondary.display.use.includes('70席'));
 const aboku=applied.find(f=>f.id==='osm-node-1631278052');assert.equal(isFacilityWalkingCandidate(aboku),true);assert.deepEqual(aboku.properties.registered_details.service,['group_home']);assert(aboku.properties.guide_review.scope.includes('旧属性の継承は認定していません'));
 const yamanoi=applied.find(f=>f.id==='osm-node-5885225935');assert.equal(isFacilityWalkingCandidate(yamanoi),true);assert.equal(prepareFacilities([yamanoi]).length,1);assert(yamanoi.properties.guide_review.summary.includes('1施設・掲載活動2件'));assert.equal(yamanoi.properties.guide_review.saved_basis.json_pointer,'/source_evidence');
});

test('saved representative groups reject second candidates, unrelated originals, conflicting packet support and count inflation', () => {
 const mutate=edit=>{const d=structuredClone(data);edit(d,d.reviews.find(x=>x.id==='civic-KD0000900012'));assert.throws(()=>applyFacilityGuidance(base,d));};
 mutate((d,x)=>x.review.saved_count_group.kind='current_visit_destination');
 mutate((d,x)=>x.review.saved_count_group.facility_count=2);
 mutate((d,x)=>x.review.saved_count_group.member_ids.push('unrelated-original-id'));
 mutate((d,x)=>x.review.saved_count_group.member_ids.push(x.id));
 mutate((d,x)=>x.review.saved_count_group.member_ids=[x.id]);
 mutate((d,x)=>x.review.saved_count_group.note='');
 mutate((d,x)=>x.review.saved_count_group.count_contribution=0);
 mutate((d,x)=>{d.reviews.find(x=>x.id==='civic-care-3570701130-bd7d0c4b47').review.reference_group.service_count=2;});
 mutate((d,x)=>{const r=d.reviews.find(x=>x.id==='civic-care-3570701130-bd7d0c4b47').review;r.decision='ready';r.location='original_supported';});
 mutate((d,x)=>{d.reviews.find(x=>x.id==='osm-node-5603040322').review.saved_count_group.count_contribution=1;});
 mutate((d,x)=>{d.reviews.find(x=>x.id==='osm-node-5603040322').review.saved_basis.packet_sha256='0'.repeat(64);});
 mutate((d,x)=>{const r=d.reviews.find(x=>x.id==='osm-node-5603040322').review;r.decision='ready';r.location='original_supported';r.saved_basis.kind='saved_bounded_guidance';});
 mutate((d,x)=>{d.reviews.find(x=>x.id==='osm-node-5885225935').review.saved_basis.json_pointer='/invented';});
});

test('remaining62 keeps saved map-field scope, undeveloped park portions, current care conditions and golf location gaps', () => {
  const ids=['osm-way-733766858','osm-way-554587947'];
  for(const id of ids){const r=applied.find(f=>f.id===id).properties.guide_review;assert.equal(r.decision,'ready');assert(r.limits.some(s=>s.includes('整備済・未整備')));assert(r.limits.some(s=>s.includes('区域全体の利用可能性へ拡張しません')));}
  const savedParks=data.reviews.filter(x=>x.review.display.type==='保存された公開地図の施設欄に基づく概略案内');
  assert.equal(savedParks.length,50);
  for(const {review:r} of savedParks){assert(r.scope.includes('管理者の公式確認'));assert(r.sources.some(s=>s.date_note.includes('元AX/DOM原本は今回未再読')));assert(r.limits.some(s=>s.includes('個別遊具の稼働')));}
  const golf=applied.find(f=>f.id==='osm-way-317613467').properties.guide_review;
  assert.equal(golf.decision,'reference');assert.equal(golf.exclusion_scope,undefined);assert(golf.scope.includes('無料一般公園'));assert(golf.limits.some(s=>s.includes('平田456')&&s.includes('平田448')));assert(golf.display.use.includes('ネット予約停止は営業閉鎖ではない'));
  for(const id of ['osm-node-1631274576','osm-node-3728528325']){const f=applied.find(f=>f.id===id);assert.equal(f.properties.guide_review.exclusion_scope,'original_location');assert.equal(isFacilityWalkingCandidate(f),false);assert(f.properties.guide_review.display.use.includes(id==='osm-node-1631274576'?'来巻944':'河内1070'));}
  const miyuki=applied.find(f=>f.id==='osm-node-1631266269').properties.guide_review;
  assert.equal(miyuki.presentation_category,'playground');assert(miyuki.limits.some(s=>s.includes('695-3')&&s.includes('695-9')));assert(miyuki.sources.some(s=>s.scope.includes('列順が崩れた')));
  const body=applied.find(f=>f.id==='osm-node-1631277626').properties.guide_review;
  assert(body.limits.some(s=>s.includes('3301-1')&&s.includes('3201-8')));
});

test('explicit park Node/Way and current care visit groups count once while selected raw records and separate services stay accessible', () => {
  const pairs=[['osm-way-803645871','osm-node-7517416823'],['civic-care-3570700959-f4f4504b81','civic-KD0000900075']];
  for(const [childID,targetID] of pairs){
    const child=applied.find(f=>f.id===childID),target=applied.find(f=>f.id===targetID),pair=[child,target],o=target.geometry.coordinates,prepared=prepareFacilities(pair);
    assert.equal(child.properties.guide_review.shared_destination.id,targetID);
    assert.equal(nearbyFacilityCandidates(o,prepared).length,1);
    assert.equal(nearbyFacilityCandidates(o,prepareFacilities([child])).length,1);
    assert.equal(nearbyFacilityCandidates(o,prepareFacilities([target])).length,1);
    assert.equal(mapFacilities(pair,SHOPPING_CATEGORIES.map(c=>c.id),null,'new-group',{scope:'new-group',ids:pairs.flat()}).length,1);
    for(const f of pair){assert.deepEqual(f.geometry,base.find(x=>x.id===f.id).geometry);assert(mapFacilities(pair,SHOPPING_CATEGORIES.map(c=>c.id),f,'new-group',{scope:'new-group',ids:pairs.flat()}).some(x=>x.id===f.id));}
    for(const minutes of [5,10,15])for(const offset of [-.01,0,.01]){
      const cost=minutes*WALKING_METERS_PER_MINUTE+offset,c={stopId:'new-group-boundary',budget:1100,origin:o,snap:o,snapGap:0,segments:[{a:o,b:o,d1:cost,d2:cost,grade:0,steps:false}]},got=bakedFacilityCandidates(c,prepared),singles=pair.flatMap(f=>bakedFacilityCandidates(c,prepareFacilities([f]))).sort((a,b)=>a.meters-b.meters);
      assert.equal(got.length,1);assert.equal(got[0].meters,singles[0].meters);assert.deepEqual(got[0].facilityPoint,singles[0].facilityPoint);assert.equal(got[0].meters<=minutes*WALKING_METERS_PER_MINUTE,offset<=0);
    }
  }
  const careIDs=['civic-care-3570700959-f4f4504b81','civic-KD0000900075','civic-care-3570700975-1cb0ce21b9'],care=careIDs.map(id=>applied.find(f=>f.id===id));
  assert.equal(nearbyFacilityCandidates(care[0].geometry.coordinates,prepareFacilities(care)).length,2);
  assert.equal(care[2].properties.guide_review.shared_destination,undefined,'visit care stays separate from day care');
  const d=care[0].properties.guide_review.shared_destination;assert.equal(d.display_name,'プレストガーデン瑞穂デイサービスセンター（通所介護）');
});

test('scoped park grouping rejects outside points, holes, unsupported evidence and name/category/target drift', () => {
  const ID='osm-way-803645871',targetID='osm-node-7517416823';
  const mutate=(edit,editBase=()=>{})=>{const b=structuredClone(base),d=structuredClone(data),child=d.reviews.find(x=>x.id===ID),target=d.reviews.find(x=>x.id===targetID);edit(d,child,target,b);editBase(b,d,child,target);assert.throws(()=>applyFacilityGuidance(b,d));};
  mutate((d,c)=>c.review.shared_destination.kind='current_visit_destination');
  mutate((d,c)=>c.review.shared_destination.source_url='https://example.org/unattributed');
  mutate((d,c,t)=>t.review.sources.forEach(s=>s.url='https://example.org/another-source'));
  mutate((d,c,t)=>t.review.shared_destination={...c.review.shared_destination,id:ID,expected:c.expected});
  mutate((d,c)=>c.review.shared_destination.expected.name+='別');
  mutate((d,c)=>c.review.shared_destination.display_name='別の現在名');
  mutate((d,c,t,b)=>{const f=b.find(x=>x.id===targetID);f.geometry.coordinates=[130,33];t.expected.geometry=f.geometry;c.review.shared_destination.expected.geometry=f.geometry;});
  mutate((d,c,t,b)=>{const f=b.find(x=>x.id===ID),p=t.expected.geometry.coordinates,dx=.00001;f.geometry.coordinates[0].push([[p[0]-dx,p[1]-dx],[p[0]+dx,p[1]-dx],[p[0]+dx,p[1]+dx],[p[0]-dx,p[1]+dx],[p[0]-dx,p[1]-dx]]);c.expected.geometry=f.geometry;});
  mutate((d,c,t,b)=>{const f=b.find(x=>x.id===targetID);f.properties.category='restaurant';t.expected.category='restaurant';c.review.shared_destination.expected.category='restaurant';});
  mutate((d,c,t,b)=>{const f=b.find(x=>x.id===targetID);f.properties.name+='別';t.expected.name=f.properties.name;c.review.shared_destination.expected.name=f.properties.name;});
});

test('next55 separates sixteen organization outcomes from facility gaps and preserves narrow practical exclusions', () => {
 const work=['osm-way-616961177','osm-way-1032786836','osm-way-922754880','osm-way-922754881','osm-way-922756656','osm-way-618128806','osm-way-616961200','osm-way-617313889','osm-node-4674657021','osm-node-1631266054','civic-care-3570103865-f8b03949d6','civic-care-3570105357-81eef2c269','civic-care-3577800083-744a448ab2','osm-node-1631278938','osm-node-1631278950','osm-node-1631279343'];
 for(const id of work){const f=applied.find(f=>f.id===id),r=f.properties.guide_review;assert(['hold','reference'].includes(r.decision));assert.equal(isFacilityWalkingCandidate(f),false);assert.equal(guideExcludesOriginal(f),false);assert(r.scope.includes('成果整理という作業の終了'));}
 const conflict=applied.find(f=>f.id===work[11]).properties.guide_review;assert.equal(conflict.decision,'reference');for(const s of ['6275-1','4040-1','3767-1'])assert(conflict.display.use.includes(s)||conflict.limits.some(x=>x.includes(s)));assert(conflict.sources.some(s=>s.url.includes('kaigo.pref.yamaguchi')));assert(conflict.sources.some(s=>s.url.includes('mhlw.go.jp')));
 const planned=applied.find(f=>f.id===work[12]).properties.guide_review;assert(planned.limits.some(s=>s.includes('予定の経過だけで休止実施を認定しません')));
 const wrong=applied.find(f=>f.id===work[15]).properties.guide_review;assert(wrong.limits.some(s=>s.includes('6279.9m')));assert.equal(wrong.decision,'hold');
 const bank=applied.find(f=>f.id==='osm-node-3985566258').properties.guide_review;assert.equal(bank.exclusion_scope,'original_service');assert(bank.excluded_unit.includes('銀行窓口'));assert(bank.limits.some(s=>s.includes('ATMの利用状態')&&s.includes('変更しません')));
 for(const id of ['osm-node-1631265262','osm-node-1631267979']){const r=applied.find(f=>f.id===id).properties.guide_review;assert.equal(r.exclusion_scope,'original_service');assert(r.limits.some(s=>s.includes('更新時点')&&s.includes('廃止実施日ではありません')));}
 const ishi=applied.find(f=>f.id==='osm-node-1631265326').properties.guide_review;assert(ishi.display.use.includes('一般受付が「✕」'));assert(ishi.display.use.includes('一般の相談受付可能な窓口として案内しません'));
 const heki=applied.find(f=>f.id==='civic-care-3591100080-9bed585aa0').properties.guide_review;assert(heki.display.use.includes('要支援２から要介護５で認知症'));assert(heki.display.use.includes('GHと住宅型を区別'));
 for(const id of ['osm-node-1423659605','osm-node-1423657594']){const r=applied.find(f=>f.id===id).properties.guide_review;assert.equal(r.exclusion_scope,'named_facility_unit');assert(r.limits.some(s=>s.includes('恒久廃止')&&s.includes('現在も休止中と新認定しません')));}
 for(const id of ['osm-node-1631271827','osm-node-1631275261'])assert.equal(categoryOf(applied.find(f=>f.id===id)).id,'community_centre');
 const kuka=applied.find(f=>f.id==='osm-node-1631267844');assert.equal(categoryOf(kuka).id,'park');assert.equal(kuka.properties.category,'park');assert.deepEqual(kuka.properties.registered_details.service,['assisted_living']);assert(kuka.properties.guide_review.limits.some(s=>s.includes('現在の介護サービス提供')));
});

test('saved inherited record restrictions can omit public URLs without becoming positive identification or a fabricated citation', () => {
 for(const id of ['osm-node-1631278811','osm-way-145660765']){
  const f=applied.find(f=>f.id===id),r=f.properties.guide_review;assert.equal(r.record_basis.original_id,id);assert.equal(isFacilityWalkingCandidate(f),false);
  const savedOnly=structuredClone(data);savedOnly.reviews.find(x=>x.id===id).review.sources=[];assert.doesNotThrow(()=>applyFacilityGuidance(base,savedOnly));
  for(const edit of [r=>delete r.record_basis,r=>r.record_basis.original_id='another-original-id',r=>r.record_basis.packet_sha256='x',r=>r.record_basis.packet_library_file_id='https://example.org/',r=>r.record_basis.json_pointer='wrong',r=>r.record_basis.statement='',r=>r.record_basis.kind='primary_current_source',r=>{r.decision='ready';r.location='original_supported';delete r.exclusion_scope;delete r.excluded_unit;},r=>{r.decision='hold';r.location='unconfirmed';r.remaining=['still unresolved'];delete r.exclusion_scope;delete r.excluded_unit;},r=>r.sources.push({title:'private',url:'https://chatgpt.com/api/library/files/libfile_fake/download',scope:'scope',date_note:'date'})]){
   const d=structuredClone(savedOnly);edit(d.reviews.find(x=>x.id===id).review);assert.throws(()=>applyFacilityGuidance(base,d));
  }
 }
});
