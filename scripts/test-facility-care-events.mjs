import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFacilityCurrent,validateFreshnessReview,facilityAvailable,freshnessLabel,freshnessDateText} from '../src/facilityFreshness.ts';
const original={type:'Feature',id:'care-test',geometry:{type:'Point',coordinates:[131.5,34.1]},properties:{name:'検証用介護事業所',category:'social_facility',source_ids:['public:test:1'],registered_details:{service:['訪問介護','居宅介護支援']}}};
const review={status:'closed',event:'closed',scope:'registered_care_services',affected_services:['居宅介護支援','訪問介護'],checked_at:'2026-09-28',effective_at:'2026-03-31',date_precision:'day',summary:'元記録の全掲載介護サービスの指定廃止。',sources:[{title:'指定廃止事業所一覧',url:'https://www.pref.yamaguchi.lg.jp/'}],limits:['建物や併設事業の閉鎖を意味しません。']};
function overlay(r=review,f=original){return{schema_version:1,checked_at:'2026-09-28',additions:[],updates:[{id:f.id,expected:{name:f.properties.name,category:f.properties.category,source_ids:f.properties.source_ids,geometry:f.geometry},changes:{},review:r}]};}
test('care designation events cover every original service and preserve original evidence',()=>{
 const result=applyFacilityCurrent([original],overlay())[0];assert(!facilityAvailable(result));assert.equal(freshnessLabel(result),'掲載介護サービスの指定廃止');assert.deepEqual(result.geometry,original.geometry);assert.deepEqual(result.properties.registered_details,original.properties.registered_details);
 assert.throws(()=>applyFacilityCurrent([original],overlay({...review,affected_services:['訪問介護']})),/every original/);
 assert.throws(()=>applyFacilityCurrent([original],overlay({...review,affected_services:[...review.affected_services,'通所介護']})),/every original/);
 const retail={...original,properties:{...original.properties,category:'supermarket'}};assert.throws(()=>applyFacilityCurrent([retail],overlay(review,retail)),/every original/);
 const renamed=overlay();renamed.updates[0].changes.name='他事業';assert.throws(()=>applyFacilityCurrent([original],renamed),/every original/);
});
test('care scope cannot be used for openings, unsupported scopes, empty or duplicate services',()=>{
 for(const r of [{...review,status:'operating',event:'opened'},{...review,scope:'building'},{...review,scope:undefined},{...review,affected_services:[]},{...review,affected_services:['訪問介護','訪問介護']}])assert.throws(()=>validateFreshnessReview(r,'2026-09-28'),/scope/);
 const suspended={...review,status:'temporarily_closed',event:'temporary_closure',effective_at:null,date_precision:'unknown'};const f=applyFacilityCurrent([original],overlay(suspended))[0];assert.equal(freshnessLabel(f),'掲載介護サービスの休止');assert(!freshnessDateText(suspended).includes('閉店'));assert(!facilityAvailable(f));
 const unknown={...review,effective_at:null,date_precision:'unknown'};assert.equal(freshnessDateText(unknown),'未確認（掲載介護サービスの指定廃止を確認）');
});
