import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadCredential } from './jev-credential.mjs';

export const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const MODEL = 'jev-1.13.0';
export const INPUT_PRICE = 0.042 / 1_000_000;
// Reserve the ENTIRE published per-request context limit before every attempt.
export const ATTEMPT_RESERVE = 65536 * INPUT_PRICE;
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const now = () => new Date().toISOString();

function atomicJSON(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const fd = fs.openSync(temporary, 'wx');
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
}
function append(file, value) {
  const fd = fs.openSync(file, 'a');
  try { fs.writeFileSync(fd, JSON.stringify(value) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function eventsAt(dir) {
  const file = path.join(dir, 'journal.ndjson');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
}
function sameKeys(a, b) { return JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(b).sort()); }
function probability(v) { return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1; }

export function validateManifest(manifest) {
  if (manifest.schema !== 1 || manifest.model !== MODEL || !Array.isArray(manifest.jobs) || !manifest.jobs.length) throw new Error('Invalid manifest');
  if (!(manifest.budget_usd > 0 && manifest.budget_usd <= 0.05)) throw new Error('Budget exceeds approved limit');
  const ids = new Set(), jobs = new Set();
  for (const job of manifest.jobs) {
    if (!/^[a-z0-9-]+$/.test(job.id) || jobs.has(job.id)) throw new Error('Invalid or duplicate job ID');
    jobs.add(job.id);
    if (!Array.isArray(job.record_ids) || !job.record_ids.length) throw new Error('Missing record IDs');
    for (const id of job.record_ids) { if (typeof id !== 'string' || ids.has(id)) throw new Error('Duplicate record ID'); ids.add(id); }
    const body = job.request;
    if (body?.model !== MODEL || !body.state || !body.questions || !Object.keys(body.questions).length) throw new Error('Invalid request');
    if (!sameKeys(body.questions, job.question_records) || Object.values(job.question_records).some(id => !job.record_ids.includes(id))) throw new Error('Invalid question-record binding');
    if (job.record_ids.some(id => !Object.values(job.question_records).includes(id))) throw new Error('Unquestioned record');
    // UTF-8 byte caps leave ample margin below published token limits; not a tokenizer estimate.
    if (Buffer.byteLength(JSON.stringify(body)) > 45000 || Buffer.byteLength(JSON.stringify(body.state)) > 20000) throw new Error('Request too large for pilot');
    for (const q of Object.values(body.questions)) {
      if (!['choice', 'noul'].includes(q.type) || !q.instructions) throw new Error('Unsupported question');
      if (q.type === 'choice' && (!q.criteria || Object.keys(q.criteria).length < 2)) throw new Error('Invalid choices');
    }
  }
  if (ids.size > 100 || ids.size !== manifest.record_count) throw new Error('Record count exceeds approval or disagrees');
  return { records: ids.size, jobs: jobs.size, questions: manifest.jobs.reduce((n,j) => n + Object.keys(j.request.questions).length, 0) };
}

export function validateResponse(request, response) {
  if (response?.model !== request.model || !response.answers || !sameKeys(request.questions, response.answers)) throw new Error('Response model/answer IDs mismatch');
  const u = response.usage;
  if (!u || !Number.isInteger(u.input_tokens) || u.input_tokens < 0 || u.input_tokens > 65536 || !Number.isInteger(u.output_tokens) || u.output_tokens < 0) throw new Error('Invalid response usage');
  for (const [key, q] of Object.entries(request.questions)) {
    const a = response.answers[key];
    if (a.type !== q.type) throw new Error('Response type mismatch');
    if (a.type === 'noul' && !probability(a.noul)) throw new Error('Invalid noul');
    if (a.type === 'choice') {
      if (!Object.hasOwn(q.criteria, a.choice) || !probability(a.confidence) || !a.probabilities || !sameKeys(q.criteria, a.probabilities)) throw new Error('Invalid choice');
      if (Object.values(a.probabilities).some(p=>!probability(p)) || Math.abs(Object.values(a.probabilities).reduce((a,b)=>a+b,0)-1)>0.06) throw new Error('Invalid probability distribution');
    }
  }
}

export function summarize(manifest, dir) {
  const events = eventsAt(dir), started = events.filter(e=>e.event==='attempt_started');
  const completed = [], controls = [], missing = [];
  let inputTokens = 0, outputTokens = 0, requestWallMs = 0;
  for (const job of manifest.jobs) {
    const file = path.join(dir, `${job.id}.json`);
    if (!fs.existsSync(file)) { missing.push(job.id); continue; }
    const receipt = json(file);
    if (receipt.request_hash !== hash(job.request) || receipt.manifest_hash !== hash(manifest)) throw new Error('Stored result identity mismatch');
    validateResponse(job.request, receipt.response);
    const terminal = events.find(e => e.attempt_id === receipt.attempt_id && ['completed','recovered'].includes(e.event));
    if (!terminal || terminal.receipt_hash !== hash(receipt)) throw new Error('Uncommitted or altered result');
    completed.push(job);
    inputTokens += receipt.response.usage.input_tokens;
    outputTokens += receipt.response.usage.output_tokens;
    requestWallMs += receipt.wall_ms;
    for (const [key, expected] of Object.entries(job.expected ?? {})) {
      const actual = receipt.response.answers[key].choice;
      controls.push({ record_id: job.question_records[key], expected, actual, passed: expected === actual });
    }
  }
  return {
    manifest_hash: hash(manifest), model: manifest.model, record_count: manifest.record_count,
    completed_records: completed.reduce((n,j)=>n+j.record_ids.length,0), completed_jobs: completed.length,
    expected_jobs: manifest.jobs.length, completed_questions: completed.reduce((n,j)=>n+Object.keys(j.request.questions).length,0),
    missing_jobs: missing, attempts: started.length, conservative_cost_bound_usd: started.length*ATTEMPT_RESERVE,
    successful_input_tokens: inputTokens, successful_output_tokens: outputTokens,
    successful_usage_cost_usd: inputTokens*INPUT_PRICE, sum_successful_request_wall_ms: requestWallMs,
    control_correct: controls.filter(c=>c.passed).length, control_count: controls.length,
    control_mismatches: controls.filter(c=>!c.passed),
    limitation: manifest.limitation ?? 'Saved historical candidate triage and synthetic controls only; no current web retrieval, fact confirmation, facility edits, or GPT research.'
  };
}

export async function runBatch(manifest, dir, options = {}) {
  validateManifest(manifest);
  const fetcher = options.fetcher ?? fetch, sleep = options.sleep ?? (ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  fs.mkdirSync(dir, {recursive:true});
  const lockFile=path.join(dir,'runner.lock');
  if (fs.existsSync(lockFile)) {
    const lock=json(lockFile);
    if (!Number.isInteger(lock.pid)) throw new Error('Invalid run lock');
    let alive=true;
    try { process.kill(lock.pid,0); } catch(e) { if(e.code==='ESRCH') alive=false; else throw e; }
    if (alive) throw new Error('Another worker owns this run');
    fs.unlinkSync(lockFile); // Only a stale runtime lock, never a data artifact.
  }
  const lockFd=fs.openSync(lockFile,'wx');
  fs.writeFileSync(lockFd,JSON.stringify({pid:process.pid,created_at:now()})); fs.closeSync(lockFd);
  const journal=path.join(dir,'journal.ndjson'), manifestFile=path.join(dir,'manifest.json');
  const manifestHash=hash(manifest), invocation=randomUUID(), wallStart=performance.now();
  let processed=0, skipped=0;
  try {
    if(fs.existsSync(manifestFile)) { if(hash(json(manifestFile))!==manifestHash) throw new Error('Manifest changed; refusing to reuse run'); }
    else atomicJSON(manifestFile,manifest);
    append(journal,{event:'invocation_started',invocation,at:now()});
    for(const job of manifest.jobs) {
      let events=eventsAt(dir);
      const resultFile=path.join(dir,`${job.id}.json`);
      if(fs.existsSync(resultFile)) {
        const receipt=json(resultFile);
        if(receipt.request_hash!==hash(job.request)||receipt.manifest_hash!==manifestHash) throw new Error('Stored result identity mismatch');
        validateResponse(job.request,receipt.response);
        const prior=events.filter(e=>e.attempt_id===receipt.attempt_id);
        if(!prior.some(e=>e.event==='attempt_started'&&e.job_id===job.id)) throw new Error('Untracked receipt');
        const terminal=prior.find(e=>['completed','recovered'].includes(e.event));
        if(terminal && terminal.receipt_hash!==hash(receipt)) throw new Error('Stored receipt changed');
        if(!terminal) append(journal,{event:'recovered',job_id:job.id,attempt_id:receipt.attempt_id,receipt_hash:hash(receipt),at:now()});
        skipped++; continue;
      }
      const history=events.filter(e=>e.job_id===job.id);
      const starts=history.filter(e=>e.event==='attempt_started');
      if(starts.some(e=>!history.some(f=>f.attempt_id===e.attempt_id&&f.event==='retryable_rejection'))) throw new Error(`Uncertain or failed prior attempt for ${job.id}; automatic resubmission blocked`);
      if(processed >= (options.stopAfterJobs ?? Infinity)) break;
      let succeeded=false;
      for(let retry=starts.length;retry<3;retry++) {
        events=eventsAt(dir);
        const latestRejection=events.filter(e=>e.job_id===job.id&&e.event==='retryable_rejection').at(-1);
        const waitMs=Math.max(0,(latestRejection?.not_before_ms??0)-Date.now());
        if(waitMs>30000) throw new Error('Retry deferred until server Retry-After; rerun later');
        if(waitMs) await sleep(waitMs);
        const attempts=events.filter(e=>e.event==='attempt_started').length;
        if((attempts+1)*ATTEMPT_RESERVE > manifest.budget_usd+1e-12) throw new Error('Approved budget guard stopped execution');
        const attemptId=randomUUID();
        append(journal,{event:'attempt_started',attempt_id:attemptId,job_id:job.id,request_hash:hash(job.request),reserve_usd:ATTEMPT_RESERVE,at:now()});
        const startedAt=performance.now();
        let response;
        try { response=await fetcher(ENDPOINT,{method:'POST',headers:{Authorization:`Bearer ${options.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(job.request),signal:AbortSignal.timeout(30000),redirect:'error'}); }
        catch { append(journal,{event:'uncertain',job_id:job.id,attempt_id:attemptId,at:now()}); throw new Error('Transport result uncertain; no automatic duplicate submission'); }
        if([429,529].includes(response.status)) {
          const header=response.headers.get('retry-after');
          const delay=header ? (Number.isFinite(Number(header)) ? Number(header)*1000 : Date.parse(header)-Date.now()) : 1000*2**retry;
          const notBefore=Date.now()+Math.max(1000,Number.isFinite(delay)?delay:1000*2**retry);
          append(journal,{event:'retryable_rejection',job_id:job.id,attempt_id:attemptId,status:response.status,not_before_ms:notBefore,at:now()});
          continue;
        }
        if(!response.ok) { append(journal,{event:'http_failure',job_id:job.id,attempt_id:attemptId,status:response.status,at:now()}); throw new Error(`HTTP ${response.status}; run stopped`); }
        let data;
        try { data=await response.json(); validateResponse(job.request,data); }
        catch { append(journal,{event:'invalid_response',job_id:job.id,attempt_id:attemptId,at:now()}); throw new Error('Invalid or incomplete response; no records adopted'); }
        const receipt={schema:1,manifest_hash:manifestHash,request_hash:hash(job.request),attempt_id:attemptId,job_id:job.id,record_ids:job.record_ids,received_at:now(),wall_ms:performance.now()-startedAt,provider_request_id:data.request_id??response.headers.get('x-request-id')??null,response:data};
        if(options.apiKey && JSON.stringify(receipt).includes(options.apiKey)) throw new Error('Unexpected credential echo; refusing to save');
        atomicJSON(resultFile,receipt);
        await options.afterReceipt?.(receipt);
        append(journal,{event:'completed',job_id:job.id,attempt_id:attemptId,receipt_hash:hash(receipt),at:now()});
        options.onProgress?.({job:job.id,records:job.record_ids.length,wall_ms:Math.round(receipt.wall_ms),input_tokens:data.usage.input_tokens});
        processed++; succeeded=true; break;
      }
      if(!succeeded) throw new Error('Retry limit reached; no records adopted');
    }
    const result={...summarize(manifest,dir),invocation,invocation_processed_jobs:processed,invocation_skipped_jobs:skipped,invocation_wall_ms:performance.now()-wallStart};
    append(journal,{event:'invocation_completed',...result,at:now()});
    atomicJSON(path.join(dir,'summary.json'),result);
    return result;
  } finally { fs.unlinkSync(lockFile); }
}

const isMain=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isMain) {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const manifest=json(path.join(root,'data-sources/jev-api-pilot-20260925/manifest.json'));
  const dir=path.join(root,'outputs/jev-api-pilot-20260925');
  const args=process.argv.slice(2);
  try {
    if(args.includes('--dry-run')) console.log(JSON.stringify({...validateManifest(manifest),manifest_hash:hash(manifest),one_attempt_reserve_usd:ATTEMPT_RESERVE,budget_usd:manifest.budget_usd}));
    else if(args.includes('--summary')) console.log(JSON.stringify(summarize(manifest,dir),null,2));
    else {
      const stopArg=args.find(a=>a.startsWith('--stop-after='));
      if(args.some(a=>!/^--stop-after=\d+$/.test(a))) throw new Error('Unknown CLI option');
      const result=await runBatch(manifest,dir,{apiKey:loadCredential(),stopAfterJobs:stopArg?Number(stopArg.split('=')[1]):Infinity,onProgress:p=>console.log(JSON.stringify(p))});
      console.log(JSON.stringify(result,null,2));
    }
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
