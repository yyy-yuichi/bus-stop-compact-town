import fs from 'node:fs';
import assert from 'node:assert/strict';
import {hash} from './jev-batch.mjs';
import {htmlText} from './facility-bulk-lib.mjs';
import {buildArticleProgress} from './facility-progress-lib.mjs';

const d='outputs/facility-reuse-pilot-20260927',p='data-sources/facility-reuse-pilot-20260927',checked='2026-09-27';
const R=f=>JSON.parse(fs.readFileSync(f,'utf8')),W=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const before=R(d+'/overlay-before.json'),overlay=structuredClone(before),articles=R(d+'/articles-before.json'),cases=R(d+'/cases-before.json');
assert.equal(before.additions.length,562);assert.equal(before.updates.length,98);
const index=R('data-sources/facility-progress-20260925/article-index.json'),idx=new Map(index.map(a=>[a.key,a]));
const queue=R('outputs/facility-bulk-triage-20260925/review-queue.json'),keys=R(d+'/start.json').article_keys;
for(const k of keys){assert(!articles.some(a=>a.article_key===k));assert.equal(queue.find(a=>a.key===k).body_hash,idx.get(k).body_hash);}
const receipt=R(d+'/'+(process.argv.includes('--sanitized')?'sanitized':'receipts')+'/34418df2ac8dffea13d035d1.json'),ir='https://www.edion.co.jp/kt_24tsuki';
assert.equal(receipt.url,ir);assert.equal(receipt.status,200);assert.equal(receipt.decoded_hash,hash(receipt.html));
const text=htmlText(receipt.html);
assert(text.includes('第24期（2025年3月期）株主通信（通期）'));
assert(/エディオン山口小郡店\s*2024年11月22日/.test(text));
assert(text.includes('山口県山口市小郡前田町4番12号'));
assert(receipt.html.includes('https://search.edion.com/e_store/spot/detail?code=0000001143'));
const id='official-edion-0000001143',f=overlay.additions.find(f=>f.id===id);
assert.equal(f.properties.freshness_review.event,'listed');assert.equal(f.properties.freshness_review.effective_at,null);
assert.equal(f.properties.address,'山口県山口市小郡前田町4番12号');
// This targeted revision advances the verification date; the previous dates remain in adoption-evidence.
f.properties.verified_at=checked;f.properties.source_timestamp=checked;
f.properties.freshness_review={...f.properties.freshness_review,event:'opened',effective_at:'2024-11-22',checked_at:checked,
 summary:'開店後の運営会社の通期株主通信により、同支店の開店日を確認。現行店舗案内の固有ID・住所と照合。',
 sources:[...f.properties.freshness_review.sources,{title:'運営会社の第24期通期株主通信：出店実績・山口小郡店の開店日と住所',url:ir}],
 limits:['店舗代表点であり、店舗入口・館内売場・バス停からの徒歩到達性は未確認。','開店日を通期の事後報告で確認。掲載確認日・記事公開日・事前の開店予定日を実施日へ転用していません。']};
overlay.checked_at=checked;
const library='official-machilibrary-1268',original=articles.find(a=>a.article_key==='ube-82309').events.find(e=>e.event_id==='ube-82309:library-opening');
assert.equal(original.disposition,'reflected_addition');assert.equal(original.effective_at,'2026-05-01');
const make=(k,reason,e)=>({article_key:k,source_body_hash:idx.get(k).body_hash,inventory_complete:true,reviewed_at:checked,inventory_reason:reason,events:[e]});
const hold=k=>({event_id:k+':opening-date',event_type:'opening',facility_ids:['official-megadori-ube'],disposition:'hold',effective_at:null,reported_date:'2026-08-07',
 reason:'記事本文と既存の同住所・自店案内・メーカー店舗固有情報を照合。現在の掲載は確認済みだが、8月7日の開店実施を示す事後の一次記録は未確認。現況掲載の最終判断へ開店イベントを統合しない。',
 source_urls:[idx.get(k).url,'https://x.com/megadori1','https://location.am-all.net/alm/shop?sid=18357']});
const reviews=[
 make('kaiten-611331','厚南中央1丁目7番48号のメガドリ宇部店の開店1件。営業時間・アクセスの記載は別の施設変更ではない。',hold('kaiten-611331')),
 make('ube-83043','メガドリ宇部店の開店予定1件。工事の進行・第二駐車場の利用案内・遊戯機紹介は別施設の開閉店ではない。8月1日の事前記事を実施記録と扱わない。',hold('ube-83043')),
 make('yamaguchi-42146','山口小郡店の開店1件。駐車場完成・販促・チラシ公開予定は別の施設変更ではない。2025年3月期通期の事後報告で実施日・同住所・公式支店リンクを照合。',
  {event_id:'yamaguchi-42146:opening',event_type:'opening',facility_ids:[id],disposition:'reflected_addition',effective_at:'2024-11-22',
   reason:'運営会社の開店後の通期株主通信が山口小郡店の2024年11月22日開店・住所・同じ公式支店IDを明記。既存掲載施設の履歴を補完し、施設を重複追加しない。',
   source_urls:[idx.get('yamaguchi-42146').url,ir,f.properties.official_url]}),
 make('ube-82494','まちライブラリー1施設の開設。ゆめタウン宇部本体、式典・読み聞かせは別施設の変更ではない。市の6月の写真付き事後報告と同施設の既存最終判断を再利用。',
  {event_id:'ube-82494:library-opening',event_type:'opening',facility_ids:[library],disposition:'duplicate',effective_at:'2026-05-01',duplicate_of:original.event_id,
   reason:'同じ館内施設・運営元固有ページと市の事後開設報告を照合済み。今回の記事の開設は既存の最終判断と同じイベントであり、新規追加・訂正には数えない。',
   source_urls:[idx.get('ube-82494').url,...original.source_urls.filter(u=>u!==idx.get('ube-82309').url)]})
];
const finding={case_id:'case:megadori-ube',facility_id:'official-megadori-ube',article_keys:['kaiten-611331','ube-83043'],issue:'opening_execution_date_unverified',reported_date:'2026-08-07',reason:'現況掲載は解決済み。今回2記事が報じる実開店日の不足根拠を別の補完項目として追加し、既存の掲載解決を維持。'};
const c=cases.cases.find(c=>c.case_id===finding.case_id);assert(c);const ref={path:p+'/adoption-evidence.json',section:'case_findings',index:0,hash:hash(finding)};
const held=reviews.slice(0,2).map(r=>r.events[0]),issueId='case:megadori-ube:opening-date';
assert(!c.issues.some(i=>i.issue_id===issueId));c.evidence_refs.push(ref);
c.issues.push({issue_id:issueId,impact:'supplemental',priority:'P3',reason:finding.reason,next:'8月7日当日・事後の自店開店記録を取得できた時だけ再開。現在掲載や同じ事前告知の再取得では解決しない。',event_ids:held.map(e=>e.event_id)});
for(const e of held)cases.event_bindings.push({event_id:e.event_id,event_hash:hash(e),case_id:c.case_id,issue_id:issueId});
articles.push(...reviews);
const prior=buildArticleProgress(index,R(d+'/articles-before.json'),before,checked),after=buildArticleProgress(index,articles,overlay,checked);
assert.equal(after.summary.articles_completed-prior.summary.articles_completed,2);
assert.equal(after.summary.articles_partially_reviewed-prior.summary.articles_partially_reviewed,2);
assert.equal(after.summary.articles_pending-prior.summary.articles_pending,-4);
assert.equal(after.summary.final_event_decisions-prior.summary.final_event_decisions,2);
assert.deepEqual(overlay.updates,before.updates);
for(let i=0;i<before.additions.length;i++)if(before.additions[i].id!==id)assert.deepEqual(overlay.additions[i],before.additions[i]);
assert.deepEqual(f.geometry,before.additions.find(x=>x.id===id).geometry);assert.deepEqual(f.properties.source_ids,before.additions.find(x=>x.id===id).properties.source_ids);
fs.mkdirSync(p,{recursive:true});
W(p+'/article-reviews.json',reviews);
W(p+'/batch.json',{checked_at:checked,added_ids:[],corrected_ids:[id],correction_scope:'Opening history added to an existing overlay addition; not a new base update or facility addition.',article_keys:keys,completed_article_delta:2,partial_article_delta:2,pending_article_delta:-4,final_event_delta:2,held_event_delta:2});
W(p+'/adoption-evidence.json',{checked_at:checked,source_urls:[ir,...original.source_urls.filter(u=>u!==idx.get('ube-82309').url),'https://x.com/megadori1','https://location.am-all.net/alm/shop?sid=18357'],before_overlay_hash:hash(before),after_overlay_hash:hash(overlay),corrected_facility:{id,previous_verification_dates:{verified_at:before.additions.find(x=>x.id===id).properties.verified_at,source_timestamp:before.additions.find(x=>x.id===id).properties.source_timestamp},before:before.additions.find(x=>x.id===id).properties.freshness_review,after:f.properties.freshness_review},case_findings:[finding],article_reviews_hash:hash(reviews),independent_review:'All four article bodies independently reviewed for event inventory; primary post-opening source subsequently confirmed for Edion. Library duplicate validated; Megadori execution date remains held.',efficiency:{source_article_bodies_refetched:0,new_detail_receipts:1,reused_html_receipts:3,reused_pdf:1,extra_jev_requests:0},limitations:['Two Megadori articles remain partial; no opening date inferred from current listing.','This easy evidence-reuse pilot is not representative of the remaining article inventory.','Existing map count remains 562 additions and 98 baseline updates; one existing addition received opening-history correction.']});
W(d+'/article-inputs.json',keys.map(k=>{const a=queue.find(x=>x.key===k);return {key:k,title:a.title,url:a.url,body:a.body,source_body_hash:a.body_hash};}));
for(const [name,file,v]of [['overlay','public/data/facility-current.json',overlay],['articles','data-sources/facility-progress-20260925/article-event-reviews.json',articles],['cases','data-sources/facility-workboard-20260925/case-reviews.json',cases]]){
 assert([hash(R(d+'/'+name+'-before.json')),hash(v)].includes(hash(R(file))),'Unrelated change: '+file);if(process.argv.includes('--apply'))W(file,v);
}
console.log(JSON.stringify({additions:0,corrections:1,completed_articles:2,partially_reviewed_articles:2,article_history:after.summary}));
