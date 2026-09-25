import fs from 'node:fs';
import { summarize,hash } from './jev-batch.mjs';
import { counts,csv } from './facility-bulk-lib.mjs';
const dir='outputs/facility-bulk-triage-20260925',read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const preflight=read(`${dir}/preflight-summary.json`),manifest=read(`${dir}/jev-manifest.json`),articles=read(`${dir}/article-ledger.json`),facilities=read(`${dir}/facility-ledger.json`);
const jev=summarize(manifest,`${dir}/jev`),answers=new Map();
for(const job of manifest.jobs) {
  const file=`${dir}/jev/${job.id}.json`;
  if(!fs.existsSync(file))continue;
  const receipt=read(file); // summarize already validated identity, completeness and committed receipt hashes.
  for(const [key,id] of Object.entries(job.question_records))answers.set(id,receipt.response.answers[key]);
}
const rank={closure:0,opening:1,relocation_rename:2,multiple_changes:3,temporary_renewal:4,unclear:5,not_change:6,not_sent:7};
for(const a of articles) {
  const answer=answers.get(a.key);a.jev_event=answer?.choice??'not_sent';a.jev_confidence=answer?.confidence??null;a.jev_probabilities=answer?.probabilities??null;
  a.priority_rank=rank[a.jev_event];
  a.review_lane=!answer?'awaiting_jev':answer.confidence<0.75||['multiple_changes','unclear'].includes(answer.choice)?'ambiguous_review':answer.choice==='not_change'?'nonchange_check_sample':a.match_status==='one_name_candidate'?'candidate_identity_and_primary_source':a.match_status==='multiple_name_candidates'?'ambiguous_identity':a.match_status==='municipality_conflict'?'location_conflict_review':'new_or_unmatched_discovery';
  a.city_queue=a.cities.length===1?a.cities[0]:'自治体未確定';
}
// No quotas. Full queue: municipality round-robin, lifecycle priority within each city,
// then no-known-brand hints before brand hints, newest publication first and stable article key.
const groups=new Map();
for(const a of articles) {if(!groups.has(a.city_queue))groups.set(a.city_queue,[]);groups.get(a.city_queue).push(a);}
const cities=[...groups.keys()].sort((a,b)=>a.localeCompare(b,'ja'));
for(const group of groups.values())group.sort((a,b)=>a.priority_rank-b.priority_rank||Number(!!a.brand_hint)-Number(!!b.brand_hint)||b.published_at.localeCompare(a.published_at)||a.key.localeCompare(b.key,'en'));
const queue=[];
for(let turn=0;queue.length<articles.length;turn++)for(const city of cities){const a=groups.get(city)[turn];if(a)queue.push({...a,queue_number:queue.length+1});}
const journalFile=`${dir}/jev/journal.ndjson`;
const invocations=fs.existsSync(journalFile)?fs.readFileSync(journalFile,'utf8').trim().split('\n').map(JSON.parse).filter(e=>e.event==='invocation_completed').map(e=>({invocation:e.invocation,processed_jobs:e.invocation_processed_jobs,skipped_jobs:e.invocation_skipped_jobs,wall_ms:e.invocation_wall_ms})):[];
const summary={...preflight,jev_status:jev.completed_records===articles.length?'classified_not_verified':jev.completed_records?'partial':'prepared_not_sent',jev,invocations,jev_event_counts:counts(queue,'jev_event'),review_lane_counts:counts(queue,'review_lane'),queue_order:'municipality round-robin; lifecycle priority; no-known-brand hints first; publication descending; article key ascending',queue_hash:hash(queue.map(a=>({key:a.key,lane:a.review_lane,event:a.jev_event}))),raw_input_hashes_unchanged:Object.entries(preflight.input_hashes).every(([file,expected])=>hash(fs.readFileSync(file,'utf8'))===expected),map_changes_this_batch:0};
if(!summary.raw_input_hashes_unchanged)throw Error('Inputs changed after preparation');
fs.writeFileSync(`${dir}/summary.json`,JSON.stringify(summary,null,2)+'\n');
fs.writeFileSync(`${dir}/review-queue.json`,JSON.stringify(queue,null,2)+'\n');
fs.writeFileSync(`${dir}/review-queue.csv`,csv(queue,['queue_number','key','title','url','published_at','city_queue','jev_event','jev_confidence','review_lane','match_status','candidate_facilities','name_candidates','brand_hint','operator_class','outbound_links']));
// Public audit summary contains counts/hashes only, not republished news article bodies.
fs.writeFileSync('data-sources/facility-bulk-triage-20260925/summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({facilities:facilities.length,articles:articles.length,jev_status:summary.jev_status,completed:jev.completed_records,events:summary.jev_event_counts,lanes:summary.review_lane_counts,map_changes_this_batch:0,queue_hash:summary.queue_hash},null,2));
