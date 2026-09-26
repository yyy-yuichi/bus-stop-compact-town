import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { htmlText,normalize,municipalityIndex,facilityRows,articleRows,matchArticles,packArticles,csv } from './facility-bulk-lib.mjs';
import { validateManifest,runBatch,hash,MODEL } from './jev-batch.mjs';
const rect=(city,x)=>({properties:{N03_001:'山口県',N03_004:city},geometry:{type:'Polygon',coordinates:[[[x,0],[x+1,0],[x+1,1],[x,1],[x,0]]]}});
const bounds=municipalityIndex([rect('宇部市',0),rect('下関市',2)]);
const feature=(id,name,x=0.5)=>({id,properties:{name,category:'restaurant',city:''},geometry:{type:'Point',coordinates:[x,0.5]}});
const articles=()=>articleRows([{key:'a',source:'test',source_class:'secondary_news',link:'https://example.test/a',title:{rendered:'【宇部市】「山のパン」が閉店'},content:{rendered:'<p>山のパンが閉店予定です。</p>'},date:'2026-09-01'}],bounds.cities);
test('HTML entities, scripts and line breaks preserve text but not instructions/executable markup',()=>{
  assert.equal(htmlText('<p>A&amp;B&#x3000;</p><script>hidden</script><p>C</p>'),'A&B　\n C');
  assert.equal(normalize(' Ａ・Ｂ '),'ab');
});
test('municipality routing and original input are preserved',()=>{
  const input=[feature('a','山のパン')],before=JSON.stringify(input),rows=facilityRows(input,{updates:[],additions:[]},bounds);
  assert.equal(rows[0].city,'宇部市');assert.equal(JSON.stringify(input),before);assert.equal(rows[0].operator_class,'unverified');
});
test('same name elsewhere is an explicit conflict, not identity',()=>{
  const f=facilityRows([feature('a','山のパン',2.5)],{updates:[],additions:[]},bounds),a=articles();matchArticles(a,f);
  assert.equal(a[0].match_status,'municipality_conflict');assert.equal(a[0].identity_confirmed,false);assert.equal(f[0].event_articles.length,0);
});
test('unique candidate, ambiguous duplicate and unlisted possibilities remain distinct',()=>{
  for(const n of [0,1,2]) {const f=facilityRows(Array.from({length:n},(_,i)=>feature(String(i),'山のパン')),{updates:[],additions:[]},bounds),a=articles();matchArticles(a,f);assert.equal(a[0].match_status,['no_name_candidate','one_name_candidate','multiple_name_candidates'][n]);assert.equal(a[0].identity_confirmed,false);}
});
test('generic chain names do not match every branch',()=>{
  const f=facilityRows([feature('a','ローソン')],{updates:[],additions:[]},bounds),a=articles();a[0].title='宇部市 ローソン中央店 開店';matchArticles(a,f);assert.equal(a[0].candidate_facilities.length,0);
});
test('overlay keeps original name searchable without changing raw records',()=>{
  const input=[feature('a','山のパン')],f=facilityRows(input,{updates:[{id:'a',changes:{name:'新しいパン'},review:{status:'operating',event:'renamed'}}],additions:[]},bounds),a=articles();matchArticles(a,f);assert.equal(a[0].candidate_facilities[0].id,'a');assert.equal(input[0].properties.name,'山のパン');
});
test('unknown city stays unknown rather than inventing a location',()=>{assert.deepEqual(bounds.locate([10,10]),[]);});
test('tenant opening and university landmark are not closures/openings of the containing facility',()=>{
  const f=facilityRows([feature('mall','ゆめタウン宇部'),feature('school','山口大学')],{updates:[],additions:[]},bounds);
  const a=articleRows([{key:'x',title:{rendered:'【開店】鰻の成瀬 ゆめタウン宇部店'},content:{rendered:'宇部市のお店'},link:'https://example.test/x'},{key:'y',title:{rendered:'【閉店】文栄堂 山口大学前店'},content:{rendered:'山口県のお店'},link:'https://example.test/y'}],bounds.cities);
  matchArticles(a,f);assert(a.every(v=>v.candidate_facilities.length===0));assert(a.every(v=>v.context_mentions.length===1));assert(f.every(v=>v.event_articles.length===0));
});
test('CSV text cannot turn into a formula',()=>{assert.match(csv([{value:'=1+1'}],['value']),/"'=1\+1"/);});
test('batch packing covers every input exactly once and is deterministic',()=>{
  const a=Array.from({length:1186},(_,i)=>({...articles()[0],key:`a-${i}`,body:'閉店の記事です。'.repeat(300)})),m=packArticles(a),other=packArticles([...a].reverse());
  assert.equal(hash(m),hash(other));assert.equal(validateManifest(m,{recordLimit:3000,budgetLimit:1}).records,1186);assert.equal(new Set(m.jobs.flatMap(j=>j.record_ids)).size,1186);assert(m.jobs.every(j=>Buffer.byteLength(JSON.stringify(j.request))<=44000));
  assert.throws(()=>validateManifest(m),/Budget|count/);
});
test('bulk API call is blocked without scope approval, or if approval hash changed',async()=>{
  const m=packArticles(articles());let calls=0;const fetcher=async()=>{calls++;};
  await assert.rejects(runBatch(m,'outputs/facility-bulk-tests-denied',{fetcher}),/Budget/);
  await assert.rejects(runBatch(m,'outputs/facility-bulk-tests-denied',{fetcher,authorization:{status:'approved',manifest_hash:'wrong',user_instruction:'test',max_records:3000,budget_usd:1}}),/authorization/);
  assert.equal(calls,0);
});
test('approved bulk mock resumes without duplicate billing',async()=>{
  const m=packArticles(articles());fs.mkdirSync('outputs/facility-bulk-tests',{recursive:true});const dir=fs.mkdtempSync('outputs/facility-bulk-tests/run-');let calls=0;
  const options={authorization:{status:'approved',manifest_hash:hash(m),user_instruction:'mock test only',max_records:3000,budget_usd:1},fetcher:async(_u,o)=>{calls++;const r=JSON.parse(o.body);return Response.json({model:MODEL,usage:{input_tokens:100,output_tokens:50},answers:Object.fromEntries(Object.entries(r.questions).map(([k,q])=>[k,{type:'choice',choice:'unclear',confidence:1,probabilities:Object.fromEntries(Object.keys(q.criteria).map(c=>[c,c==='unclear'?1:0]))}]))});}};
  await runBatch(m,dir,options);await runBatch(m,dir,options);assert.equal(calls,1);
});
