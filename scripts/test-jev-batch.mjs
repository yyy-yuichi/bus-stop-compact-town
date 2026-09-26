import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MODEL, ATTEMPT_RESERVE, runBatch, validateManifest, validateResponse, summarize } from './jev-batch.mjs';

const testRoot=path.resolve('outputs/jev-batch-tests');
fs.mkdirSync(testRoot,{recursive:true});
const directory=()=>fs.mkdtempSync(path.join(testRoot,'run-'));
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const events=dir=>fs.readFileSync(path.join(dir,'journal.ndjson'),'utf8').trim().split('\n').map(JSON.parse);
function manifest(count=2) {
  return {schema:1,model:MODEL,budget_usd:0.05,record_count:count,jobs:Array.from({length:count},(_,i)=>({
    id:`job-${i}`,record_ids:[`record-${i}`],question_records:{question:`record-${i}`},expected:{question:'unknown'},
    request:{model:MODEL,state:{notice:'Fictional test only'},questions:{question:{type:'choice',instructions:'Classify this fictional notice',criteria:{unknown:'Insufficient evidence',closed:'Explicit closure'}}}}
  }))};
}
function answer(request) {
  return {model:MODEL,answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>[id,q.type==='noul'?{type:'noul',noul:0}:{type:'choice',choice:'unknown',confidence:1,probabilities:{unknown:1,closed:0}}])),usage:{input_tokens:100,output_tokens:10}};
}
function client(counter) { return async (_url,options)=>{counter.calls++;return Response.json(answer(JSON.parse(options.body)),{headers:{'x-request-id':`mock-${counter.calls}`}});}; }

test('pause, resume, and third invocation make exactly one request per saved job',async()=>{
  const m=manifest(3),dir=directory(),counter={calls:0},options={apiKey:'not-a-real-secret',fetcher:client(counter)};
  const first=await runBatch(m,dir,{...options,stopAfterJobs:1});
  assert.equal(first.completed_records,1);assert.equal(counter.calls,1);
  const second=await runBatch(m,dir,options);
  assert.equal(second.completed_records,3);assert.equal(second.invocation_skipped_jobs,1);assert.equal(counter.calls,3);
  const third=await runBatch(m,dir,options);
  assert.equal(third.invocation_processed_jobs,0);assert.equal(third.invocation_skipped_jobs,3);assert.equal(counter.calls,3);
  assert.equal(third.control_correct,3);assert.equal(third.completed_questions,3);
  assert.equal(events(dir).filter(e=>e.event==='attempt_started').length,3);
});

test('saved receipt survives a simulated crash before journal commit without re-sending',async()=>{
  const m=manifest(1),dir=directory(),counter={calls:0};
  await assert.rejects(runBatch(m,dir,{fetcher:client(counter),afterReceipt:()=>{throw new Error('simulated crash');}}),/simulated crash/);
  const result=await runBatch(m,dir,{fetcher:client(counter)});
  assert.equal(counter.calls,1);assert.equal(result.completed_records,1);
  assert.equal(events(dir).filter(e=>e.event==='recovered').length,1);
});

test('transport failure is uncertain and blocks an automatic duplicate submission',async()=>{
  const m=manifest(1),dir=directory();let calls=0;
  await assert.rejects(runBatch(m,dir,{fetcher:async()=>{calls++;throw new Error('lost response');}}),/uncertain/);
  await assert.rejects(runBatch(m,dir,{fetcher:async()=>{calls++;}}),/resubmission blocked/);
  assert.equal(calls,1);assert.equal(summarize(m,dir).completed_records,0);
});

test('429 rejection is retried and every attempt consumes the conservative reservation',async()=>{
  const m=manifest(1),dir=directory();let calls=0;
  const result=await runBatch(m,dir,{sleep:async()=>{},fetcher:async(_u,o)=>++calls===1?new Response('',{status:429,headers:{'retry-after':'0'}}):Response.json(answer(JSON.parse(o.body)))});
  assert.equal(calls,2);assert.equal(result.attempts,2);assert.equal(result.conservative_cost_bound_usd,2*ATTEMPT_RESERVE);
});

test('budget guard stops before a retry would exceed its reservation',async()=>{
  const m=manifest(1);m.budget_usd=ATTEMPT_RESERVE;
  const dir=directory();let calls=0;
  await assert.rejects(runBatch(m,dir,{sleep:async()=>{},fetcher:async()=>{calls++;return new Response('',{status:529});}}),/budget guard/);
  assert.equal(calls,1);
});

test('missing answers never become an adopted receipt and block automatic replay',async()=>{
  const m=manifest(1),dir=directory();let calls=0;
  const fetcher=async()=>{calls++;return Response.json({model:MODEL,answers:{},usage:{input_tokens:20,output_tokens:0}});};
  await assert.rejects(runBatch(m,dir,{fetcher}),/Invalid or incomplete/);
  assert.equal(fs.existsSync(path.join(dir,'job-0.json')),false);
  await assert.rejects(runBatch(m,dir,{fetcher}),/resubmission blocked/);assert.equal(calls,1);
});

test('extra answer IDs and malformed probabilities are rejected',()=>{
  const request=manifest(1).jobs[0].request,r=answer(request);
  r.answers.extra=r.answers.question;assert.throws(()=>validateResponse(request,r),/IDs mismatch/);
  delete r.answers.extra;r.answers.question.probabilities.closed=0.5;
  assert.throws(()=>validateResponse(request,r),/distribution/);
});

test('changed manifest cannot reuse an existing run',async()=>{
  const m=manifest(1),dir=directory(),counter={calls:0};
  await runBatch(m,dir,{fetcher:client(counter)});
  const changed=structuredClone(m);changed.jobs[0].request.state.notice='Changed input';
  await assert.rejects(runBatch(changed,dir,{fetcher:client(counter)}),/Manifest changed/);assert.equal(counter.calls,1);
});

test('altered receipt cannot be silently reused',async()=>{
  const m=manifest(1),dir=directory(),counter={calls:0};
  await runBatch(m,dir,{fetcher:client(counter)});
  const file=path.join(dir,'job-0.json'),receipt=read(file);receipt.wall_ms++;
  fs.writeFileSync(file,JSON.stringify(receipt));
  await assert.rejects(runBatch(m,dir,{fetcher:client(counter)}),/receipt changed/);
  assert.throws(()=>summarize(m,dir),/altered result/);assert.equal(counter.calls,1);
});

test('manifest approval and identity limits are checked before any request',()=>{
  assert.throws(()=>validateManifest(manifest(101)),/Record count/);
  const m=manifest();m.budget_usd=0.051;assert.throws(()=>validateManifest(m),/Budget/);
  m.budget_usd=.05;m.jobs[1].id=m.jobs[0].id;assert.throws(()=>validateManifest(m),/job ID/);
  m.jobs[1].id='job-1';m.jobs[1].record_ids=['record-0'];assert.throws(()=>validateManifest(m),/record ID/);
});

test('another live process lock prevents concurrent execution',async()=>{
  const m=manifest(1),dir=directory();fs.writeFileSync(path.join(dir,'runner.lock'),JSON.stringify({pid:process.pid}));
  await assert.rejects(runBatch(m,dir,{fetcher:async()=>assert.fail('must not send')}),/Another worker/);
});

test('unexpected credential echo is not persisted',async()=>{
  const m=manifest(1),dir=directory(),secret='fake-sensitive-marker';
  await assert.rejects(runBatch(m,dir,{apiKey:secret,fetcher:async(_u,o)=>Response.json({...answer(JSON.parse(o.body)),extra:secret})}),/credential echo/);
  assert.equal(fs.existsSync(path.join(dir,'job-0.json')),false);
  assert.equal(fs.readFileSync(path.join(dir,'journal.ndjson'),'utf8').includes(secret),false);
});
