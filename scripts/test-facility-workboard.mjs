import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {hash} from './jev-batch.mjs';import {groupCandidates,operatorHint,buildWorkboard} from './facility-workboard-lib.mjs';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),pub='data-sources/facility-workboard-20260925';
const index=read('data-sources/facility-progress-20260925/article-index.json'),reviews=read('data-sources/facility-progress-20260925/article-event-reviews.json'),overlay=read('public/data/facility-current.json'),metadata=read(pub+'/article-work-inputs.json').articles,cases=read(pub+'/case-reviews.json');
const run=(c=cases,r=reviews,m=metadata)=>buildWorkboard(index,r,overlay,m,c,'2026-09-25');
const article=(key,city='宇部市',name='店舗A',address=null)=>({article_key:key,city,name_candidates:[name],address_hint:address,published_at:'2026-09-01',jev_event:'opening',official_link_hint_ids:[],existing_name_hint_ids:[]});
test('same-city names can group for review but never establish identity; cross-city names stay separate',()=>{
 const g=groupCandidates([article('a'),article('b'),article('c','防府市')],new Set());assert.equal(g.length,2);assert.equal(g[0].article_count,2);
 assert(g.every(x=>x.identity_status==='unverified_candidate_group'&&x.inventory_status==='article_events_not_enumerated'));
 assert.equal(groupCandidates([article('a'),article('b')],new Set(['a'])).length,1);
});
test('conflicting addresses, multiple candidate names and unknown cities remain explicit',()=>{
 const m={...article('multi'),name_candidates:['店舗A','店舗B']};
 const g=groupCandidates([article('a','宇部市','店舗A','宇部市1-1'),article('b','宇部市','店舗A','宇部市2-2'),article('c'),m,article('unknown','自治体未確定')],new Set());
 assert.equal(g.length,5);assert.equal(g.filter(x=>x.split_for_conflicting_addresses).length,3);
 assert.equal(g.flatMap(x=>x.article_keys).length,5);
});
test('a containing mall is not the tenant operator',()=>{
 assert.equal(operatorHint('ヒマラヤスポーツ ゆめタウン南岩国店'),'ヒマラヤ');
 assert.equal(operatorHint('ラーメン店 ゆめタウン店'),null);
 assert.equal(operatorHint('ウォンツ ハローズ西岐波店'),'ウォンツ');
});
test('workboard is reproducible without private receipts and leaves map/article facts untouched',()=>{
 const before=[hash(overlay),hash(reviews)],r=run(),stored=read(pub+'/summary.json');const {input_hashes,...summary}=stored;
 assert.deepEqual(r.summary,summary);assert.deepEqual([hash(overlay),hash(reviews)],before);

 assert(r.summary.known_cases.by_status.map_action>0&&r.summary.known_cases.by_status.supplemental>0);
 assert.equal(r.summary.article_history.held_events,cases.event_bindings.length);assert.equal(r.summary.unreviewed.unique_stores,null);
 assert.equal(r.candidates.flatMap(g=>g.article_keys).length,r.summary.unreviewed.articles);assert.equal(new Set(r.candidates.flatMap(g=>g.article_keys)).size,r.summary.unreviewed.articles);
 assert.equal(r.summary.known_cases.legacy_hold_rows_resolved,5);
});
test('map blocker outranks date-only issues; related buildings are not treated as faulty stores',()=>{
 const r=run(),w=r.caseRows.find(c=>c.case_id==='facility:official-tsuruha-10049'),h=r.caseRows.find(c=>c.case_id==='facility:official-halows-nishikiwa');
 assert.equal(w.status,'map_action');assert(w.supplemental_also_pending);assert.equal(h.status,'supplemental');
 assert.deepEqual(w.facility_ids,['official-tsuruha-10049']);assert(w.related_facility_ids.includes('official-halows-nishikiwa'));
});
test('missing or stale impact decisions cannot silently classify a hold as finished',()=>{
 let c=structuredClone(cases);c.event_bindings.pop();assert.throws(()=>run(c));
 c=structuredClone(cases);c.event_bindings[0].event_hash='stale';assert.throws(()=>run(c));
 const r=structuredClone(reviews);r.find(x=>x.article_key==='ube-80654').events.find(e=>e.event_id==='ube-80654:watts').reason+=' changed';assert.throws(()=>run(cases,r));
 c=structuredClone(cases);c.cases.find(x=>x.case_id==='facility:official-watts-47917').facility_ids=['missing'];assert.throws(()=>run(c));
});
test('closure or relocation uncertainty cannot be recast as a supplemental date',()=>{
 const c=structuredClone(cases),x=c.cases.find(x=>x.case_id==='case:mcd-ube-konan');x.issues[0].impact='supplemental';assert.throws(()=>run(c));
 const m=structuredClone(metadata);m[0].source_body_hash='stale';assert.throws(()=>run(cases,reviews,m));
});
test('pilot inventories co-tenants and predecessor, reuses current listings and preserves position conflict',()=>{
 const p=read(pub+'/pilot-summary.json'),r=read(pub+'/pilot-article-reviews.json');
 assert.equal(p.article_keys.length,7);assert.equal(p.article_events,17);assert.equal(p.extra_network_fetches,0);assert.equal(p.extra_jev_requests,0);assert.equal(p.new_map_additions,0);
 const es=r.flatMap(a=>a.events);assert(es.some(e=>e.event_id==='yamaguchi-43926:watts-corner'));assert(es.some(e=>e.event_id==='yamaguchi-40890:tsutaya-closure'));assert(es.some(e=>e.event_id==='yamaguchi-42851:clinic-plan'));
 assert.equal(run().caseRows.find(c=>c.case_id==='facility:official-tsuruha-10049').status,'map_action');
});
