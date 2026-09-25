import fs from 'node:fs';
import assert from 'node:assert/strict';
const pub='data-sources/facility-dining-chains-20260925';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const inputs=read(pub+'/review-inputs.json'),index=new Map(inputs.article_inventory.map(a=>[a.key,a])),batch=read(pub+'/adoptions.json');
const source=id=>(batch.additions.find(r=>r.id===id)?.properties.freshness_review??batch.updates.find(r=>r.id===id).review).sources.map(s=>s.url);
const specs=[
 ['kaiten-510192','official-matsuya-2122','記事は2024年7月26日開店、運営者の7月26日事前発表は7月28日開店予定。施工会社の7月26日は竣工日。実開店日を確定しない。','松屋・松のやの複合店開店1件。併設ブランドを別施設として数えず、現行掲載と開店日を分離。'],
 ['kaiten-588856','official-matsuya-2276','記事の2026年2月27日は事前告知。現行公式では実開店日を確認できない。住所は記事13-13から同一支店ID・電話の公式13番39号を採用。','複合店開店1件。現在地・支店同一性と実開店日を分離。'],
 ['kaiten-581208','official-yoshinoya-062592','2025年12月20日は開店前の記事・公式告知の引用。実施日の一次確認は未了。住所は記事373-5ではなく同一支店ID・電話の公式673-5を採用。','吉野家開店1件。実施日と現行掲載を分離。'],
 ['ube-82059','official-yoshinoya-062592','12月15日の記事が12月20日開店予定を案内。施工・看板・注文方式・ドライブスルーの説明を開店実施の証拠にしない。','同一吉野家の開店予定1件。近隣交差点・バス停は場所の説明で変更イベントではない。','kaiten-581208:current'],
 ['kaiten-515559','osm-way-1463857376','2024年9月5日は9月4日の事前記事。現行公式店舗情報には実開店日の記録がなく未確認。','はま寿司開店1件。既存IDの現行掲載更新と実開店日を分離。'],
 ['shimonoseki-56063','osm-way-1463857376','8月16日の記事に9月5日の開店予定看板。予定を実施日として確定しない。','同一はま寿司の開店予定1件。記事の一般的な季節の記述は変更イベントではない。','kaiten-515559:current'],
 ['shimonoseki-55069','osm-way-1463857376','7月29日の記事は求人情報をもとに2024年9月初旬開店予定を紹介。実開店日は未確認。','同一はま寿司の建設・開店予定1件。周辺飲食店は地域説明。','kaiten-515559:current'],
 ['shimonoseki-51918','osm-way-1463857376','5月20日の建設記事では運営会社への問い合わせ結果も開店日未定。後続の事前記事だけでは実開店日を確定しない。','同一はま寿司の建設・開店計画1件。肉肉うどん・スシロー・かっぱ寿司は近隣案内で、その閉店・移転を報じた記事ではない。','kaiten-515559:current'],
 ['kaiten-588036','official-sushiro-2516','記事は2026年2月10日開店とするが、公式ニュース一覧は2022年2月10日、公式本文も同じ住所・電話・支店ID2516の開店を案内。2026年の新規開店・再開・改装の裏付けは未確認。2026年を初出店日へ転記しない。','光浅江店の2026年開店報道1件。2022年の公式記録との年の不一致を残し、現行掲載だけ反映。']
];
const reviews=specs.map(([k,id,reason,inventory_reason,duplicate])=>{
 const current={event_id:k+':current',event_type:'other',facility_ids:[id],disposition:duplicate?'duplicate':id.startsWith('official-')?'reflected_addition':'reflected_update',effective_at:null,reason:duplicate?'現行公式掲載の照合は同一支店の反映済みイベントへ集約。開店日の保留は重複完了へ変換しない。':id.startsWith('official-')?'現行公式店名・住所・支店ID・支店座標を照合。別名の近隣施設と別支店を保持して追加。':'既存URL・支店名・25m以内の公式点が一致。同じOSM IDと元座標を保持して名称・市・住所を補完。',source_urls:source(id),...(duplicate?{duplicate_of:duplicate}:{})};
 return {article_key:k,source_body_hash:index.get(k).body_hash,inventory_complete:true,reviewed_at:'2026-09-25',inventory_reason,events:[{event_id:k+':opening',event_type:'opening',facility_ids:[id],disposition:'hold',effective_at:null,reason,source_urls:[index.get(k).url,...source(id)]},current]};
});
assert.equal(reviews.length,9);write(pub+'/article-reviews.json',reviews);
const canonical='data-sources/facility-progress-20260925/article-event-reviews.json',previous=read(canonical);let appended=0;
for(const r of reviews){const existing=previous.find(x=>x.article_key===r.article_key);if(existing)assert.deepEqual(existing,r,'Review drift');else{previous.push(r);appended++;}}
write(canonical,previous);console.log(JSON.stringify({articles:reviews.length,appended,events:18,held:9,distinct_held_stores:5}));
