import assert from 'node:assert/strict';
const norm=s=>String(s??'').normalize('NFKC').replace(/[\s\u200b]/g,'').toLowerCase();
const domains=new Map([['dkt-s.com','ラ・ムー'],['chocozap.jp','chocoZAP'],['workman.co.jp','ワークマン'],['yamaya.jp','やまや'],['b-mozart.co.jp','モーツアルト'],['yamada-denki.jp','ヤマダデンキ'],['s-dondon.co.jp','どんどん']]);
export function operatorLinkHints(links){
 const found=new Map();
 for(const link of links){try{const u=new URL(link),operator=domains.get(u.hostname.replace(/^www\./,''));if(!operator||!['http:','https:'].includes(u.protocol)||u.username||u.password)continue;if([...u.searchParams.keys()].some(k=>/key|token|secret|auth/i.test(k)))continue;u.hash='';found.set(u.href,{operator,url:u.href});}catch{}}
 return [...found.values()].sort((a,b)=>a.url.localeCompare(b.url));
}
export function enrichRoutingInputs(metadata,queue,overlay){
 const articles=new Map(queue.map(a=>[a.key,a]));
 const records=[...overlay.additions.map(f=>({id:f.id,...f.properties})),...overlay.updates.map(u=>({id:u.id,...u.changes,freshness_review:u.review}))].filter(f=>f.freshness_review?.status==='operating');
 return metadata.map(a=>{const source=articles.get(a.article_key);assert(source&&source.body_hash===a.source_body_hash,'Article source changed; refresh identity hints explicitly');
 return {...a,operator_link_hints:operatorLinkHints(source.outbound_links??[]),reviewed_facility_hint_ids:records.filter(f=>f.city===a.city&&a.name_candidates.some(n=>norm(n)===norm(f.name))).map(f=>f.id).sort()};});
}
export function batchRank(batch){return batch.mode==='existing_evidence_comparison'?0:batch.mode==='official_directory_comparison'?1:2;}
