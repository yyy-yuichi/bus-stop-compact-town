import fs from 'node:fs';
import {evidenceCsv} from './facility-evidence-lib.mjs';
import {hash} from './jev-batch.mjs';
const d='outputs/facility-reconcile-20260925',read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const previous=read('outputs/facility-evidence-20260925/continued-review-queue.json'),evidence=read('data-sources/facility-reconcile-20260925/adoption-evidence.json');
const invalidUrls=new Set();
const canon=u=>{try{return decodeURI(u).replace(/^http:/,'https:').replace(/\/$/,'');}catch{invalidUrls.add(u);return 'invalid:'+u;}};
const lookup=new Map();for(const e of evidence.evidence)for(const s of e.sources){const k=canon(s.url);if(!lookup.has(k))lookup.set(k,[]);lookup.get(k).push(e.id);}
const rows=previous.map(r=>({...r,reconcile_linked_ids:[...new Set((r.outbound_links??[]).flatMap(u=>lookup.get(canon(u))??[]))],reconcile_disposition:'Linked-source review only. A multi-branch page can link several facilities; this is not adoption of every event in the article.'}));
fs.writeFileSync(d+'/continued-review-queue.json',JSON.stringify(rows,null,2)+'\n');
fs.writeFileSync(d+'/continued-review-queue.csv',evidenceCsv(rows,['queue_number','key','title','url','cities','name_candidates','jev_event','review_lane','candidate_facilities','linked_evidence','reconcile_linked_ids','reconcile_disposition']));
const summary={articles:rows.length,source_order_preserved:rows.every((r,i)=>r.key===previous[i].key),articles_with_new_linked_evidence:rows.filter(r=>r.reconcile_linked_ids.length).length,malformed_url_count:invalidUrls.size,previous_queue_hash:hash(previous),queue_hash:hash(rows),note:'Article events are not automatically marked verified by shared source URLs. Malformed URLs remain unaltered in the queue and do not match.'};
fs.writeFileSync('data-sources/facility-reconcile-20260925/queue-summary.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
