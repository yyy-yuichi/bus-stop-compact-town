import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFacilityCurrent,facilityAvailable} from '../src/facilityFreshness.ts';
const point=[131.5,34.1], source={title:'施設固有の公式位置・一覧',url:'https://example.org/facility/123',sha256:'a'.repeat(64)};
const review={scope:'post_office_directory',checked_at:'2026-09-28',source_as_of:'2026-09-28',source_date_kind:'retrieved',registry_id:'official:123',official_name:'同じ施設',official_address:'山口県山口市一丁目1-1',services:['郵便','貯金'],summary:'同じ公式施設番号と全サービス・所在地を確認。',sources:[source],limits:['当日の利用可否は未確認。']};
const square=(radius=.0005)=>[[131.5-radius,34.1-radius],[131.5+radius,34.1-radius],[131.5+radius,34.1+radius],[131.5-radius,34.1+radius],[131.5-radius,34.1-radius]];
function fixture(){
 const base=[{type:'Feature',id:'node',geometry:{type:'Point',coordinates:point},properties:{name:'同じ施設',category:'post_office',source_ids:['node/1']}},{type:'Feature',id:'way',geometry:{type:'Polygon',coordinates:[square()]},properties:{name:'同じ施設の敷地',category:'post_office',source_ids:['way/1']}}];
 const verifications=base.map(f=>({id:f.id,expected:{name:f.properties.name,category:f.properties.category,source_ids:f.properties.source_ids,geometry:f.geometry},changes:{},review:structuredClone(review)}));
 Object.assign(verifications[1],{duplicate_of:'node',duplicate_point:{coordinates:point,source_url:source.url,source_sha256:source.sha256}});
 return {base,overlay:{schema_version:1,checked_at:'2026-09-28',updates:[],additions:[],verifications}};
}
test('a reviewed registry point and polygon share one candidate without losing either source record',()=>{
 const {base,overlay}=fixture(),before=structuredClone(base),result=applyFacilityCurrent(base,overlay);
 assert.deepEqual(base,before);assert.equal(result.length,2);assert(facilityAvailable(result[0]));assert(!facilityAvailable(result[1]));assert.equal(result[1].properties.duplicate_of,'node');
 assert.equal(result[1].properties.freshness_review,undefined);assert.deepEqual(result.map(x=>x.geometry),base.map(x=>x.geometry));assert.deepEqual(result.map(x=>x.properties.source_ids),base.map(x=>x.properties.source_ids));
});
test('registry duplicate identities reject co-located distinct services, missing evidence, self references and chains',()=>{
 for(const mutate of [
  o=>o.verifications[1].review.registry_id='official:other',
  o=>o.verifications[1].review.official_address='別住所',
  o=>o.verifications[1].review.official_name='別施設',
  o=>o.verifications[1].review.services=['郵便'],
  o=>o.verifications[1].review.scope='operator_directory',
  o=>o.verifications[1].review.sources[0].sha256='b'.repeat(64),
  o=>o.verifications[1].duplicate_point.source_url='https://example.org/viewport',
  o=>delete o.verifications[1].duplicate_point,
  o=>delete o.verifications[1].duplicate_of,
  o=>o.verifications[1].duplicate_of='way',
  o=>o.verifications[1].duplicate_of='missing',
  o=>Object.assign(o.verifications[0],{duplicate_of:'way',duplicate_point:o.verifications[1].duplicate_point}),
  o=>o.verifications[1].duplicate_point.coordinates=[NaN,34.1],
  o=>o.verifications[1].duplicate_point.coordinates=[135,34.1],
 ]){const {base,overlay}=fixture();mutate(overlay);assert.throws(()=>applyFacilityCurrent(base,overlay));}
});
test('official point must be inside the reviewed polygon excluding holes and within 50 metres of each point',()=>{
 for(const geometry of [
  {type:'Polygon',coordinates:[square(),square(.0001)]},
  {type:'MultiPolygon',coordinates:[[square(),square(.0001)]]},
  {type:'Point',coordinates:[131.51,34.1]},
 ]){const {base,overlay}=fixture();base[1].geometry=geometry;overlay.verifications[1].expected.geometry=geometry;assert.throws(()=>applyFacilityCurrent(base,overlay),/same reviewed site/);}
 const {base,overlay}=fixture();base[1].geometry={type:'MultiPolygon',coordinates:[[square()]]};overlay.verifications[1].expected.geometry=base[1].geometry;assert(!facilityAvailable(applyFacilityCurrent(base,overlay)[1]));
});
