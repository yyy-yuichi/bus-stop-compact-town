import fs from 'node:fs';
import assert from 'node:assert/strict';
import {evidenceCsv} from './facility-evidence-lib.mjs';
import {hash} from './jev-batch.mjs';
const d='outputs/facility-local-stores-20260925',read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const previous=read('outputs/facility-reconcile-20260925/continued-review-queue.json'),decisions=read('data-sources/facility-local-stores-20260925/decisions.json');
const canon=u=>{try{return decodeURI(u).replace(/^http:/,'https:').replace(/\/$/,'');}catch{return 'invalid:'+u;}};
const lookup=new Map();for(const r of decisions)for(const src of r.sources){const k=canon(src.url);if(!lookup.has(k))lookup.set(k,[]);lookup.get(k).push({record_id:r.id,decision:r.decision,facility_id:r.facility_id});}
const rows=previous.map(r=>({...r,local_directory_reviews:[...new Map((r.outbound_links??[]).flatMap(u=>lookup.get(canon(u))??[]).map(x=>[x.record_id,x])).values()],local_disposition:'Shared directory links are cross-references only, not confirmation of all article events. Current retailers and relocated graduates have separate dispositions.'}));
assert.equal(rows.length,1186);assert(rows.every((r,i)=>r.key===previous[i].key));
fs.writeFileSync(d+'/continued-review-queue.json',JSON.stringify(rows,null,2)+'\n');fs.writeFileSync(d+'/continued-review-queue.csv',evidenceCsv(rows,['queue_number','key','title','url','cities','name_candidates','jev_event','review_lane','candidate_facilities','linked_evidence','reconcile_linked_ids','local_directory_reviews','local_disposition']));
const summary={articles:rows.length,articles_with_new_crossreferences:rows.filter(r=>r.local_directory_reviews.length).length,original_order_preserved:true,previous_queue_hash:hash(previous),queue_hash:hash(rows)};
fs.writeFileSync('data-sources/facility-local-stores-20260925/queue-summary.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
