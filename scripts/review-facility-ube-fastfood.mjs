import fs from 'node:fs';import assert from 'node:assert/strict';
const pub='data-sources/facility-ube-fastfood-20260925',read=f=>JSON.parse(fs.readFileSync(f,'utf8')),write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const inputs=read(pub+'/review-inputs.json'),index=new Map(inputs.article_inventory.map(a=>[a.key,a])),batch=read(pub+'/adoptions.json');
const source=id=>batch.additions.find(r=>r.id===id).properties.freshness_review.sources.map(s=>s.url);
const kfc='official-kfc-5063',west='official-mcdonalds-35539',konan='official-mcdonalds-35538',old='osm-way-477623030',halows='official-halows-nishikiwa',wants='official-tsuruha-10049';
const current=(key,id,dup)=>({event_id:key+':current',event_type:'other',facility_ids:[id],disposition:dup?'duplicate':'reflected_addition',effective_at:null,reason:'同じ支店の現行公式名称・住所・代表点を照合。現在の掲載と実開店日を分離。',source_urls:source(id),...(dup?{duplicate_of:dup}:{})});
const hold=(key,suffix,type,ids,reason,urls=[])=>({event_id:key+':'+suffix,event_type:type,facility_ids:ids,disposition:'hold',effective_at:null,reason,source_urls:[index.get(key).url,...urls]});
const opening=(k,id,reason)=>hold(k,'opening','opening',[id],reason,source(id));
const oldYume=k=>hold(k,'old-mcd-closure','closure',[],'記事は2025年6月30日の旧ゆめタウン宇部店閉店を報道。旧テナントに対応する既存IDは候補照合で見当たらず、商業施設ubeとは別。店自身の閉店告知本文は未取得で、日付の一次確認は保留。入居先の施設を閉店にしない。',['https://www.izumi.jp/tenpo/ube/shop/food/kfc']);
const relocate=k=>hold(k,'relocation','relocation',[old,konan],'記事は2025年7月15日の移転と旧建物撤去を報道。現行公式住所は妻崎開作860-1。旧OSMの地点は約245m西側。旧支店の閉店・移転関係・実施日は一次確認未了。元のIDと地点を保持する。',source(konan));
const rows=[
 ['kaiten-575908','KFCゆめタウン宇部の開店1件。現行テナントと予定日を分離。',[opening('kaiten-575908',kfc,'2025年11月8日開店という記事。公式の11月1日新店告知は事前発表であり、現行掲載だけでは実施日を確定しない。'),current('kaiten-575908',kfc)]],
 ['ube-81149','旧マクドナルドゆめタウン宇部の閉店1件。覆い・椅子・店内写真は新施設の開店ではない。',[oldYume('ube-81149')]],
 ['ube-81774','KFC新店1件と旧マクドナルド閉店1件。開店販促は独立施設イベントとして数えない。',[opening('ube-81774',kfc,'11月3日の記事は11月8日開店予定を紹介。公式発表も事前で、実施日の確認は保留。'),current('ube-81774',kfc,'kaiten-575908:current'),oldYume('ube-81774')]],
 ['ube-83012','マクドナルド西岐波の建設・開店計画1件。求人や看板を営業開始の証拠としない。',[opening('ube-83012',west,'7月27日の記事と9月18日更新の公式求人は9月25日開店予定。実開店日は未確認。'),current('ube-83012',west)]],
 ['ube-83170','同じ西岐波店の開店予定1件。ドライブスルーは施設の設備で別店舗ではない。',[opening('ube-83170',west,'8月30日の記事は9月25日予定を紹介。現行公式掲載と実開店日を分離。'),current('ube-83170',west,'ube-83012:current')]],
 ['ube-83311','西岐波マクドナルド開店、ハローズ8月6日開店、ウォンツ9月10日開店の3件を列挙。サービス記載の不一致とウォンツの位置も検討。',[opening('ube-83311',west,'9月25日の記事でも写真は9月20日の開店前、文面は開店予定。朝マックなしという記事と公式表記が相違するためサービス情報は採用しない。'),current('ube-83311',west,'ube-83012:current'),hold('ube-83311','halows-opening','opening',[halows],'記事の2026年8月6日開店と現行公式掲載を分離。実開店日の一次記録は未確認。',['https://www.halows.com/stores/detail/138']),hold('ube-83311','wants-opening','opening',[wants],'記事の2026年9月10日開店は一次記録未確認。取得した公式新店一覧に不掲載でも、開店の否定とは扱わない。',['https://shop.tsuruha-g.com/10049','https://www.wants.co.jp/news/open/']),hold('ube-83311','wants-position','other',[wants,halows],'同一商業施設とのハローズ公式案内に対し、ウォンツの現行公式座標はハローズの掲載点から3km超離れる。新しい正確な店別座標が未確定のため推測移動せず、既存掲載の位置修正を優先残件とする。',['https://www.halows.com/stores/detail/138','https://shop.tsuruha-g.com/10049'])]],
 ['ube-81233','マクドナルド厚南移転1件。旧建物解体・更地化を別施設の開店としない。',[relocate('ube-81233'),current('ube-81233',konan)]],
 ['ube-81345','旧マクドナルド厚南の解体・工事と移転、オートバックス厚南の移転予定。旧敷地の基礎工事だけでは後継店を特定しない。',[relocate('ube-81345'),current('ube-81345',konan,'ube-81233:current'),hold('ube-81345','autobacs-relocation','relocation',[],'記事の9月4日移転予定はオートバックス自身の9月3日発表と一致。新住所は妻崎開作860-1だが、店別代表点と実施日が未確認のため今回の地図追加は保留。',['https://www.autobacs.co.jp/ja/news/news-202509031400-1.html']),hold('ube-81345','old-site-successor','other',[old],'旧マクドナルド跡の工事を報じるが後継店の名前は未特定。新施設を推測して追加しない。')]]
];
const reviews=rows.map(([k,inventory_reason,events])=>({article_key:k,source_body_hash:index.get(k).body_hash,inventory_complete:true,reviewed_at:'2026-09-25',inventory_reason,events}));
assert.equal(reviews.length,8);write(pub+'/article-reviews.json',reviews);
const path='data-sources/facility-progress-20260925/article-event-reviews.json',canonical=read(path);let appended=0;
for(const r of reviews){const existing=canonical.find(x=>x.article_key===r.article_key);if(existing)assert.deepEqual(existing,r);else{canonical.push(r);appended++;}}
write(path,canonical);const events=reviews.flatMap(r=>r.events);console.log(JSON.stringify({appended,events:events.length,held:events.filter(e=>e.disposition==='hold').length}));
