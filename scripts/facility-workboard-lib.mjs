import assert from 'node:assert/strict';import {hash} from './jev-batch.mjs';import {buildArticleProgress} from './facility-progress-lib.mjs';
const impacts=new Set(['map_action','supplemental','historical_only','watch','excluded_fixed_map','resolved']);
const norm=s=>s.normalize('NFKC').replace(/[\s\u200b]/g,'').toLowerCase();
const unique=xs=>[...new Set(xs)].sort();
const brands=[['マクドナルド',['マクドナルド','(仮称)マクドナルド']],['KFC',['ケンタッキー','KFC']],['ウォンツ',['ウォンツ']],['ツルハ',['ツルハ']],['ドラッグストアモリ',['ドラッグストアモリ']],['コスモス',['ディスカウントドラッグコスモス','ドラッグコスモス','コスモス']],['ダイソー',['ダイソー','DAISO']],['セリア',['Seria','セリア']],['ワッツ',['ワッツ','Watts']],['はま寿司',['はま寿司']],['スシロー',['スシロー']],['吉野家',['吉野家']],['松屋・松のや',['松屋','松のや']],['すき家',['すき家']],['丸久',['丸久','アルク']],['マックスバリュ',['マックスバリュ']],['ハローズ',['ハローズ']],['ゆめタウン・ゆめマート',['ゆめタウン','ゆめマート']],['ローソン',['ローソン']],['ファミリーマート',['ファミリーマート']],['セブンイレブン',['セブン-イレブン','セブンイレブン']],['コメリ',['コメリ']],['ナフコ',['ホームプラザナフコ','ナフコ']],['セカンドストリート',['セカンドストリート']],['ヒマラヤ',['ヒマラヤ']],['オートバックス',['オートバックス']],['スターバックス',['スターバックス']]];
export function operatorHint(name){return brands.find(([,aliases])=>aliases.some(a=>norm(name).startsWith(norm(a))))?.[0]??null;}
export function groupCandidates(metadata,reviewedKeys){
 const pending=metadata.filter(a=>!reviewedKeys.has(a.article_key)),buckets=new Map();
 for(const a of pending){
  const eligible=a.name_candidates.length===1&&a.city!=='自治体未確定';
  const key=eligible?a.city+'|'+norm(a.name_candidates[0]):'article|'+a.article_key;
  if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(a);
 }
 const groups=[];
 for(const [key,rows] of buckets){
  const addresses=unique(rows.map(a=>a.address_hint?norm(a.address_hint):null).filter(Boolean));
  const split=addresses.length>1;
  const sub=new Map();
  for(const a of rows){const k=split?(a.address_hint?norm(a.address_hint):'address-unknown'):'all';if(!sub.has(k))sub.set(k,[]);sub.get(k).push(a);}
  for(const [addressKey,articles] of sub){
   const names=unique(articles.flatMap(a=>a.name_candidates)),single=names.map(norm).every(n=>n===norm(names[0]??''))&&names.length>0;
   const operator=single?operatorHint(names[0]):null;
   const changeKinds=unique(articles.map(a=>a.jev_event));
   const priority=changeKinds.some(e=>['closure','relocation_rename','multiple_changes'].includes(e))?'P1':changeKinds.includes('opening')?'P2':'P3';
   groups.push({group_id:'candidate:'+hash(key+'|'+addressKey).slice(0,16),label:single?names[0]:articles[0].article_key,city:articles[0].city,names,operator_hint:operator,identity_status:'unverified_candidate_group',inventory_status:'article_events_not_enumerated',priority,article_keys:articles.map(a=>a.article_key).sort(),article_count:articles.length,published_from:articles.map(a=>a.published_at).sort()[0],published_to:articles.map(a=>a.published_at).sort().at(-1),change_kinds:changeKinds,address_hints:unique(articles.map(a=>a.address_hint).filter(Boolean)),split_for_conflicting_addresses:split,official_link_hint_ids:unique(articles.flatMap(a=>a.official_link_hint_ids)),existing_name_hint_ids:unique(articles.flatMap(a=>a.existing_name_hint_ids)),next:operator?'既存の公式取得資料・現行一覧を運営元単位で照合し、相違候補を確認。':'同じ地域の候補をまとめ、自店案内と現在地を照合。複数店記事は店舗・イベントを列挙。'});
  }
 }
 return groups.sort((a,b)=>a.priority.localeCompare(b.priority)||b.article_count-a.article_count||a.group_id.localeCompare(b.group_id));
}
export function buildWorkboard(index,reviews,overlay,metadata,caseReviews,checkedAt){
 const progress=buildArticleProgress(index,reviews,overlay,checkedAt),byArticle=new Map(index.map(a=>[a.key,a])),events=new Map(reviews.flatMap(r=>r.events.map(e=>[e.event_id,e])));
 assert.equal(metadata.length,index.length);assert.equal(new Set(metadata.map(a=>a.article_key)).size,index.length);
 for(const a of metadata){assert.equal(a.source_body_hash,byArticle.get(a.article_key)?.body_hash);assert(Array.isArray(a.name_candidates));assert(Array.isArray(a.official_link_hint_ids));assert(Array.isArray(a.existing_name_hint_ids));}
 const reflected=new Map([...overlay.additions.map(f=>[f.id,f.properties.freshness_review]),...overlay.updates.map(u=>[u.id,u.review])]);
 const cases=new Map(caseReviews.cases.map(c=>[c.case_id,c]));assert.equal(cases.size,caseReviews.cases.length);
 const issueMap=new Map();for(const c of cases.values()){assert(c.name);assert(c.issues.length);assert.equal(new Set(c.facility_ids).size,c.facility_ids.length);for(const i of c.issues){assert(impacts.has(i.impact));assert(['P0','P1','P2','P3'].includes(i.priority));assert(i.reason&&i.next);assert(!issueMap.has(i.issue_id));issueMap.set(i.issue_id,{c,i});if(i.impact==='supplemental'){assert(c.facility_ids.length);for(const id of c.facility_ids){const r=reflected.get(id);assert(r&&r.status==='operating'&&['listed','opened','renamed'].includes(r.event),'Supplemental needs an existing reviewed map record');}}}}
 for(const c of cases.values())for(const i of c.issues)if(i.impact==='resolved'){
  assert.equal(i.event_ids.length,0,'Held article events cannot become resolved workboard issues');
  const r=i.resolution;assert(r&&r.checked_at===checkedAt&&r.reason&&r.evidence_ref&&c.evidence_refs?.some(e=>hash(e)===hash(r.evidence_ref)),'Resolved issue needs checked evidence');
  assert(['closure_history_updated','obsolete_predecessor_closed','duplicate_consolidated','verified_no_map_change'].includes(r.outcome));
  if(r.outcome==='verified_no_map_change')assert.equal(c.facility_ids.length,0);
  else assert(c.facility_ids.length&&c.facility_ids.every(id=>reflected.has(id)),'Resolved change must be reflected');
 }
 const bound=new Set();for(const b of caseReviews.event_bindings){const e=events.get(b.event_id),v=issueMap.get(b.issue_id);assert(e?.disposition==='hold');assert.equal(hash(e),b.event_hash,'Held event changed; reassess impact');assert(v&&v.c.case_id===b.case_id&&v.i.event_ids.includes(b.event_id));assert(!bound.has(b.event_id));bound.add(b.event_id);
 if(v.i.impact==='supplemental'){assert(['opening','temporary_change'].includes(e.event_type),'Closure/identity cannot become date-only');assert(e.facility_ids.length&&e.facility_ids.every(id=>v.c.facility_ids.includes(id)));}
 }
 for(const {i} of issueMap.values())for(const id of i.event_ids)assert(bound.has(id),'Issue lacks bound event');
 assert.deepEqual([...bound].sort(),[...events.values()].filter(e=>e.disposition==='hold').map(e=>e.event_id).sort(),'Every held event must be accounted for');
 for(const l of caseReviews.legacy_audit){assert(['resolved','active'].includes(l.status));if(l.status==='resolved'){assert(l.resolved_by_event_ids.length||l.resolved_by_facility_ids.length);for(const id of l.resolved_by_event_ids){const e=events.get(id);assert(e&&e.disposition!=='hold'&&e.disposition!=='duplicate');}for(const id of l.resolved_by_facility_ids)assert(reflected.has(id));}}
 const caseRows=[...cases.values()].map(c=>{
  const status=['map_action','watch','supplemental','historical_only','excluded_fixed_map','resolved'].find(x=>c.issues.some(i=>i.impact===x));
  const eventIds=unique(c.issues.flatMap(i=>i.event_ids));
  return {...c,status,priority:c.issues.map(i=>i.priority).sort()[0],article_keys:unique(eventIds.map(id=>id.slice(0,id.indexOf(':')))),held_event_ids:eventIds,supplemental_also_pending:c.issues.some(i=>i.impact==='supplemental')&&status!=='supplemental'};
 }).sort((a,b)=>a.priority.localeCompare(b.priority)||a.case_id.localeCompare(b.case_id));
 const candidates=groupCandidates(metadata,new Set(reviews.map(r=>r.article_key))),pendingKeys=candidates.flatMap(g=>g.article_keys);
 assert.equal(pendingKeys.length,progress.summary.articles_pending);assert.equal(new Set(pendingKeys).size,pendingKeys.length);
 const batches=new Map();for(const g of candidates){const key=g.operator_hint?'operator:'+g.operator_hint:'area:'+g.city;if(!batches.has(key))batches.set(key,{batch_id:key,label:g.operator_hint??g.city,mode:g.operator_hint?'official_directory_comparison':'local_store_review',group_ids:[],article_keys:[],existing_official_hint_groups:0,high_priority_groups:0});const b=batches.get(key);b.group_ids.push(g.group_id);b.article_keys.push(...g.article_keys);if(g.official_link_hint_ids.length)b.existing_official_hint_groups++;if(g.priority==='P1')b.high_priority_groups++;}
 const batchRows=[...batches.values()].map(b=>({...b,candidate_groups:b.group_ids.length,article_count:b.article_keys.length})).sort((a,b)=>b.existing_official_hint_groups-a.existing_official_hint_groups||b.high_priority_groups-a.high_priority_groups||b.article_count-a.article_count||a.batch_id.localeCompare(b.batch_id));
 const impactCounts=Object.fromEntries([...impacts].map(x=>[x,caseRows.filter(c=>c.status===x).length]));
 const issueCounts=Object.fromEntries([...impacts].map(x=>[x,caseReviews.event_bindings.filter(b=>issueMap.get(b.issue_id).i.impact===x).length]));
 const summary={checked_at:checkedAt,scope:caseReviews.scope,known_cases:{total:caseRows.length,by_status:impactCounts,held_article_events:bound.size,event_impact_counts:issueCounts,legacy_hold_rows_resolved:caseReviews.legacy_audit.filter(l=>l.status==='resolved').length},unreviewed:{articles:pendingKeys.length,candidate_groups:candidates.length,groups_with_multiple_articles:candidates.filter(g=>g.article_count>1).length,repeat_articles_grouped:pendingKeys.length-candidates.length,conflicting_address_groups:candidates.filter(g=>g.split_for_conflicting_addresses).length,groups_with_official_link_hints:candidates.filter(g=>g.official_link_hint_ids.length).length,operator_batches:batchRows.filter(b=>b.mode==='official_directory_comparison').length,area_batches:batchRows.filter(b=>b.mode==='local_store_review').length,unique_stores:null},map_records:{reflected_updates:overlay.updates.length,reflected_additions:overlay.additions.length,reflected_ids:reflected.size},article_history:progress.summary,note:'Known cases and unreviewed candidate groups may overlap and must not be summed as unique stores. Supplemental status never resolves a held article event. Official links and names remain hints until store identity and all article events are checked. No time estimate follows from article counts.'};
 return {summary,caseRows,candidates,batchRows};
}
