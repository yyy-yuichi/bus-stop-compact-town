import fs from 'node:fs';import assert from 'node:assert/strict';import {hash} from './jev-batch.mjs';
const pub='data-sources/facility-workboard-20260925',out='outputs/facility-workboard-20260925',read=f=>JSON.parse(fs.readFileSync(f,'utf8')),write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');fs.mkdirSync(out,{recursive:true});
const keys=['yamaguchi-40890','yamaguchi-42851','yamaguchi-43926','ube-83101','ube-83154','ube-83224','kaiten-484359'];
const queue=read('outputs/facility-bulk-triage-20260925/review-queue.json'),index=new Map(read('data-sources/facility-progress-20260925/article-index.json').map(a=>[a.key,a])),overlay=read('public/data/facility-current.json'),stores=read('outputs/facility-reconcile-20260925/tsuruha-stores.json');
assert.equal(hash(overlay),'fbe59a3ade31ce7cd63bf437dfd0c29769af71470b8862eb91b722f77e7eb3a7','Map overlay changed; reassess pilot');
const reused=[];
for(const n of ['3989','3979']){
 const s=stores.find(x=>x.id==='tsuruha-'+n),f=overlay.additions.find(x=>x.id==='official-tsuruha-'+n),r=read(s.receipt);assert.equal(r.status,200);assert.equal(r.url,s.url);assert(r.html.includes(s.name));assert.deepEqual(s.coordinates,f.geometry.coordinates);
 assert.equal(s.address.replace(/\s/g,''),f.properties.address.replace(/\s/g,''));reused.push({url:s.url,path:s.receipt,hash:hash(r),name:s.name,coordinates:s.coordinates});
}
for(const path of ['outputs/facility-ube-fastfood-20260925/pages/ccf05dda56d6d2340ba740d4.json','outputs/facility-ube-fastfood-20260925/pages/cf39d9a6eabd3ca336735151.json']){const r=read(path);assert.equal(r.status,200);reused.push({url:r.url,path,hash:hash(r)});}
const inputs=keys.map(k=>{const a=queue.find(x=>x.key===k);assert.equal(a.body_hash,index.get(k).body_hash);return {key:k,title:a.title,url:a.url,body:a.body,source_body_hash:a.body_hash};});write(out+'/pilot-article-inputs.json',inputs);
const source=id=>overlay.additions.find(f=>f.id===id).properties.freshness_review.sources.map(s=>s.url),ev=(k,s,type,ids,disp,reason,urls,dup)=>({event_id:k+':'+s,event_type:type,facility_ids:ids,disposition:disp,effective_at:null,reason,source_urls:[index.get(k).url,...urls],...(dup?{duplicate_of:dup}:{})});
const im='official-tsuruha-3989',ry='official-tsuruha-3979',wa='official-tsuruha-10049',ha='official-halows-nishikiwa';
const date=(k,id)=>ev(k,'opening','opening',[id],'hold','記事の開店日は現行掲載と分離。公式の実開店日の確認は保留し、地図反映済みの名称・住所・位置を再追加しない。',source(id));
const current=(k,id,dup)=>ev(k,'current','other',[id],dup?'duplicate':'reflected_addition','取得済みの支店別公式本文・住所・座標と既存の掲載IDが一致。新たな施設追加は不要。',source(id),dup);
const clinic=k=>ev(k,'clinic-plan','other',[],'hold','クリニック募集看板のみで開院・診療科・店舗名は未確定。空き区画募集を開院済み施設として追加しない。',[]);
const rows=[
 ['yamaguchi-40890','ウォンツ開店計画、旧TSUTAYA閉店、クリニック区画募集を列挙。営業継続のソフトバンクは変更イベントではない。',[date('yamaguchi-40890',im),current('yamaguchi-40890',im),ev('yamaguchi-40890','tsutaya-closure','closure',[],'hold','記事は2023年3月の旧TSUTAYA防府店閉店を記載。基準施設のTSUTAYA/ツタヤ名称候補なし。現行ウォンツは既に掲載済み。旧店の一次閉店記録は未確認で履歴として保留。',[]),clinic('yamaguchi-40890')]],
 ['yamaguchi-42851','同一ウォンツ開店計画とクリニック区画募集。ソフトバンクは継続営業、駐車場の工事は店舗の新設として別計上しない。',[date('yamaguchi-42851',im),current('yamaguchi-42851',im,'yamaguchi-40890:current'),clinic('yamaguchi-42851')]],
 ['yamaguchi-43926','同一ウォンツ開店予定と併設Watts売場の新設を列挙。給水機器等は設備説明。',[date('yamaguchi-43926',im),current('yamaguchi-43926',im,'yamaguchi-40890:current'),ev('yamaguchi-43926','watts-corner','opening',[],'hold','記事はWatts併設を案内。ウォンツ公式も100円ショップ設備を掲載するが、Watts自身の売場ID・地点は未確認。入居先ウォンツを二重追加せず別売場の確認へ。',source(im))]],
 ['ube-83101','ウォンツの開店予定と先行したハローズ開店を列挙。既知のウォンツ位置の相違は店舗案件で継続管理。',[date('ube-83101',wa),ev('ube-83101','halows-opening','opening',[ha],'hold','記事はハローズ開店後1週間と記述。現行掲載済みで、一次資料による実施日の確認は補足として保留。',source(ha))]],
 ['ube-83154','ウォンツ開店予定とハローズ8月6日開店を列挙。販促・営業時間の説明を別の施設に数えない。',[date('ube-83154',wa),ev('ube-83154','halows-opening','opening',[ha],'hold','記事は2026年8月6日開店を記述。現行掲載済みで、一次資料による実施日の確認は補足として保留。',source(ha))]],
 ['ube-83224','同一ウォンツの9月10日開店予定。隣接ハローズは場所の説明でこの記事に独立した変更報道はない。',[date('ube-83224',wa)]],
 ['kaiten-484359','ウォンツ竜王開店1件。住所・電話が公式と一致し既に掲載済み。併設薬局を重複する物理店舗として追加しない。',[date('kaiten-484359',ry),current('kaiten-484359',ry)]]
];
const reviews=rows.map(([key,inventory_reason,events])=>({article_key:key,source_body_hash:index.get(key).body_hash,inventory_complete:true,reviewed_at:'2026-09-25',inventory_reason,events}));
const path='data-sources/facility-progress-20260925/article-event-reviews.json',previous=read(path);assert.equal(hash(previous.filter(r=>!keys.includes(r.article_key))),'1148c430165a7070fb52cdea723c1d10e1a0b0019015da035a0b6ff1368fad8b');
for(const r of reviews){const old=previous.find(x=>x.article_key===r.article_key);if(old)assert.deepEqual(old,r);else previous.push(r);}
write(path,previous);write(pub+'/pilot-article-reviews.json',reviews);
write(pub+'/pilot-summary.json',{checked_at:'2026-09-25',article_keys:keys,main_store_candidates:3,existing_current_stores_reused:2,known_position_conflict_retained:'official-tsuruha-10049',new_map_additions:0,new_map_updates:0,extra_network_fetches:0,extra_jev_requests:0,article_events:reviews.flatMap(r=>r.events).length,held_events:reviews.flatMap(r=>r.events).filter(e=>e.disposition==='hold').length,reused_sources:reused,article_inputs_hash:hash(inputs),overlay_hash:hash(overlay),note:'Seven full articles reveal additional predecessor, co-tenant and planned-use events beyond the three title candidates. The workboard tracks these separately; grouping never completes an unread article.'});
console.log(JSON.stringify({articles:reviews.length,events:reviews.flatMap(r=>r.events).length,holds:reviews.flatMap(r=>r.events).filter(e=>e.disposition==='hold').length,new_map_changes:0,extra_fetches:0}));
