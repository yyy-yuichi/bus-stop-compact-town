import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { validateRegistryReview } from '../src/facilityRegistry.ts';
import { validateFreshnessReview, applyFacilityCurrent, facilityAvailable, freshnessLabel, freshnessDateText } from '../src/facilityFreshness.ts';
const registry = {scope:'public_facility_directory',checked_at:'2026-09-28',source_as_of:'2026-09-28',source_date_kind:'retrieved',registry_id:'city:library',official_name:'市立図書館',official_address:'山口県山口市中園町7-7',services:['図書館'],summary:'市の公式一覧への掲載を照合。',sources:[{title:'市の公式施設一覧',url:'https://www.city.yamaguchi.lg.jp/',sha256:'a'.repeat(64)}],limits:['当日の利用可否は未確認。']};
const suspended = {status:'temporarily_closed',event:'temporary_closure',effective_at:'2018-07-09',checked_at:'2026-09-28',date_precision:'day',summary:'公式告知と現行台帳で一時休止を確認。',sources:[{title:'公式一時休止告知',url:'https://www.post.japanpost.jp/'}],limits:['廃止とは区別。']};
const feature = {type:'Feature',id:'fixture',geometry:{type:'Point',coordinates:[132.00422,34.126681]},properties:{name:'川越郵便局',category:'post_office',source_ids:['node/fixture']}};

test('retrieval dates stay labeled, allow archived source days, reject future dates and require source hashes',()=>{
 for(const scope of ['public_facility_directory','post_office_directory','operator_directory','pharmacy_register','welfare_register','food_business_register'])validateRegistryReview({...registry,scope},'2026-09-28');
 for(const patch of [{source_date_kind:'publication'}, {source_as_of:'2026-09-29'}, {source_as_of:'2026-02-30'}, {services:[]}])assert.throws(()=>validateRegistryReview({...registry,...patch},'2026-09-28'));
 assert.throws(()=>validateRegistryReview({...registry,sources:[{title:'link',url:'https://example.org/'}]},'2026-09-28'));
 validateRegistryReview({...registry,source_as_of:'2026-09-27'},'2026-09-28');
 validateRegistryReview({...registry,source_date_kind:'as_of',source_as_of:'2026-04-01'},'2026-09-28');
});

test('temporary closures keep their precision and reject future or permanent-closure mismatches',()=>{
 validateFreshnessReview(suspended,'2026-09-28');
 validateFreshnessReview({...suspended,effective_at:null,date_precision:'unknown'},'2026-09-28');
 validateFreshnessReview({...suspended,effective_at:'2018-07',date_precision:'month'},'2026-09-28');
 for(const patch of [{effective_at:'2026-09-29'}, {effective_at:'2026-10',date_precision:'month'}, {status:'closed'}, {event:'closed'}, {effective_at:'2018-07-09',date_precision:'unknown'}])assert.throws(()=>validateFreshnessReview({...suspended,...patch},'2026-09-28'));
});

test('temporary closure suppresses candidates while preserving the original facility and distinct reopening state',()=>{
 const expected={name:feature.properties.name,category:feature.properties.category,geometry:feature.geometry,source_ids:feature.properties.source_ids};
 const overlay={schema_version:1,checked_at:'2026-09-28',updates:[{id:'fixture',expected,changes:{},review:suspended}],additions:[]};
 const [closed]=applyFacilityCurrent([feature],overlay);assert(!facilityAvailable(closed));assert.equal(freshnessLabel(closed),'一時休止確認');assert.deepEqual(closed.geometry,feature.geometry);assert.deepEqual(closed.properties.source_ids,feature.properties.source_ids);assert(!feature.properties.freshness_review);
 const [reopened]=applyFacilityCurrent([feature],{...overlay,updates:[{...overlay.updates[0],review:{...suspended,status:'operating',event:'listed',effective_at:null,date_precision:'unknown'}}]});assert(facilityAvailable(reopened));
 const school={...closed,properties:{...closed.properties,category:'school'}};assert.equal(freshnessLabel(school),'休校確認');
 const library={...closed,properties:{...closed.properties,category:'library',freshness_review:{...suspended,status:'closed',event:'closed',effective_at:null,date_precision:'unknown'}}};assert.equal(freshnessLabel(library),'閉館確認');assert.equal(freshnessDateText(library.properties.freshness_review,'library'),'未確認（閉館状態を確認）');
});

test('directory and temporary closure render without inventing publication, opening or permanent closure dates',async()=>{
 const server=await createServer({server:{middlewareMode:true,watch:null},appType:'custom'});
 try{
  const {default:Registry}=await server.ssrLoadModule('/src/FacilityRegistryDetails.tsx');
  const {default:Freshness}=await server.ssrLoadModule('/src/FacilityFreshnessDetails.tsx');
  const html=renderToStaticMarkup(React.createElement(Registry,{review:registry}));assert(html.includes('公式施設一覧の掲載確認')&&html.includes('資料閲覧日'));assert(!html.includes('資料基準日')&&!html.includes('開店日'));
  const old=renderToStaticMarkup(React.createElement(Registry,{review:{...registry,source_date_kind:'as_of',source_as_of:'2026-02-20'}}));assert(old.includes('資料基準日')&&!old.includes('資料閲覧日'));
  const temp=renderToStaticMarkup(React.createElement(Freshness,{facility:{...feature,properties:{...feature.properties,freshness_review:suspended}}}));assert(temp.includes('一時休止確認')&&temp.includes('一時休止開始日：2018-07-09')&&temp.includes('通常の検索'));assert(!temp.includes('閉店確認'));
  const school=renderToStaticMarkup(React.createElement(Freshness,{facility:{...feature,properties:{...feature.properties,category:'school',freshness_review:{...suspended,effective_at:null,date_precision:'unknown'}}}}));assert(school.includes('休校確認')&&school.includes('休校開始日'));assert(!school.includes('：null')&&!school.includes('閉校日'));
 }finally{await server.close();}
});


test('current medical registration can confirm hospital-to-clinic reclassification without inventing an event date',()=>{
 const hospital={...feature,properties:{...feature.properties,name:'旧病院',category:'hospital'}};
 const expected={name:hospital.properties.name,category:'hospital',geometry:hospital.geometry,source_ids:hospital.properties.source_ids};
 const review={...registry,scope:'medical_register',official_name:'現診療所',services:['診療所']};
 const item={id:'fixture',expected,changes:{name:'現診療所',category:'clinic'},review};
 const overlay={schema_version:1,checked_at:'2026-09-28',updates:[],verifications:[item],additions:[]};
 const [clinic]=applyFacilityCurrent([hospital],overlay);
 assert.equal(clinic.properties.category,'clinic');assert.equal(clinic.properties.name,'現診療所');assert(!clinic.properties.freshness_review);assert(facilityAvailable(clinic));assert.deepEqual(clinic.geometry,hospital.geometry);
 for(const category of ['pharmacy','hospital','invalid'])assert.throws(()=>applyFacilityCurrent([hospital],{...overlay,verifications:[{...item,changes:{category}}]}),/Forbidden registry category transition/);
 assert.throws(()=>applyFacilityCurrent([hospital],{...overlay,verifications:[{...item,review:{...review,scope:'operator_directory'}}]}),/Forbidden registry category transition/);
});
