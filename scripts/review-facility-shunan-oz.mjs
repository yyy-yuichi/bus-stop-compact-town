import fs from 'node:fs';
import assert from 'node:assert/strict';
import { hash } from './jev-batch.mjs';
import { createHash } from 'node:crypto';
const pub='data-sources/facility-shunan-oz-20260925', out='outputs/facility-shunan-oz-20260925';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')), write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const inputs=read(pub+'/review-inputs.json'), index=new Map(inputs.article_inventory.map(a=>[a.key,a]));
const url=k=>index.get(k).url;
const primary={oz:'https://reggirt.jp/news/gift-galleryoz-ube-kudamatsu-sale/',torachan:'https://www.instagram.com/gyoza_torachan/reel/Dbw03kVvIXH/',shoji:'https://www.instagram.com/shoji_0442/p/Dbc2R5upXCk/',lachere:'https://www.instagram.com/lachere_cafe/p/DZ4WWLynZa3/',shoes:'https://stores.chiyodagrp.co.jp/store/39227.html',hp:'https://www.hotpepper.jp/strJ003917267/',ittoku:'https://ya55808.gorp.jp/',tokuchan:'https://toku-chan.com/store'};
const adopted=read(pub+'/adoptions.json'), shizqu=adopted.additions.find(a=>a.id==='official-shizquya-tokuyama-deck');
const old='osm-node-12606873239', addedI='official-ittoku-shunan-heiwadori', addedS=shizqu.id, addedT='official-tokuchan-kokai';
const images=[
 {target:'schwane',file:'schwane-front.jpg',url:'https://shunan-kudamatsu-hikari.goguynet.jp/wp-content/uploads/sites/40/2026/07/IMG_20260703_091120-1280x960.jpg',article_key:'shunan-119313',reading:'店名が一致する店頭告知に「令和8年6月末」をもって営業終了とある。日付は月まで。読者情報の6月29日には確定しない。',effective_at:null,reported_month:'2026-06'},
 {target:'kazamidori',file:'kazamidori-notice.jpg',url:'https://shunan-kudamatsu-hikari.goguynet.jp/wp-content/uploads/sites/40/2026/08/IMG_20260821_1505242-1280x960.jpg',article_key:'shunan-119838',reading:'かざみどりの店頭告知に8月31日閉店とある。2026年8月記事に撮影された当該店舗の掲示として年を照合。',effective_at:'2026-08-31'},
 {target:'dai3star',file:'dai3star-notice.jpeg',url:'https://shunan-kudamatsu-hikari.goguynet.jp/wp-content/uploads/sites/40/2026/07/IMG_1955-1-1280x960.jpeg',article_key:'shunan-119511',reading:'第三スターの店頭告知に令和8年7月14日閉店とある。',effective_at:'2026-07-14'},
 {target:'oz-hofu',file:'oz-hofu.jpg',url:'https://yamaguchi-hofu.goguynet.jp/wp-content/uploads/sites/232/2024/05/IMG_4917.jpeg',article_key:'yamaguchi-31552',reading:'オズ防府店の告知に5月31日閉店とある。2024年5月の記事と店舗を照合。旧公式URLは404のため代用せず、この掲示写真を根拠とする。',effective_at:'2024-05-31'}
].map(r=>({...r,file:out+'/signs/'+r.file,sha256:createHash('sha256').update(fs.readFileSync(out+'/signs/'+r.file)).digest('hex'),method:'manual_visual_reading_of_shop_notice_reproduced_in_local_news',reviewed_at:'2026-09-25'}));
write(pub+'/visual-evidence.json',{images,observations:[
 {method:'browser_visible_place_details',checked_at:'2026-09-25',url:shizqu.properties.freshness_review.sources[1].url,name:'甘味処 しづくや',address:'銀座1-31 TOKUYAMA DECK D2-11',phone:'0834-20-0129',note:'公開Google Maps店舗詳細の名称・所在地・電話を画面で照合。保存したHTMLは基本店舗名・CID・座標を含むが電話・住所本文を含まない。電話一致をHTML自動検証したとは扱わない。施設公式110、自店投稿D2-011との区画表示差は残す。'},
 {method:'official_site_search_excerpt',checked_at:'2026-09-25',url:adopted.update.review.sources[2].url,note:'施設運営者の検索結果抜粋でジューシーからぎょうざ酒場とらちゃんへの改称案内を確認。ページ本体の取得は404。現行本文の取得成功として扱わず、保存済み報道の旧名・改称記述と合わせて同じ店舗の履歴を照合。'}
]});
const image=t=>images.find(r=>r.target===t).url;
const events=new Map(), reviews=[];
function e(key,suffix,type,disposition,ids,date,reason,sources,extra={}){const row={event_id:key+':'+suffix,event_type:type,facility_ids:ids,disposition,effective_at:date,reason,source_urls:sources,...extra};events.set(row.event_id,row);return row;}
function no(key,suffix,type,date,reason,sources,ids=[]){return e(key,suffix,type,'verified_no_change',ids,date,reason,sources);}
function dup(key,suffix,original,reason){const r=events.get(original);assert(r,original);return e(key,suffix,r.event_type,'duplicate',r.facility_ids,r.effective_at,reason,[url(key),...r.source_urls.filter(u=>u!==url(key))],{duplicate_of:original});}
function review(key,reason,rows){const a=index.get(key);assert(a,key);reviews.push({article_key:key,source_body_hash:a.body_hash,inventory_complete:true,reviewed_at:'2026-09-25',inventory_reason:reason,events:rows});}
const absent='基準7764件と既存追加154件を旧名・別表記で照合したが該当IDなし。閉店店を営業施設として追加せず、別店のIDも変更しない。';
review('ube-83294','宇部店の閉店1件を列挙。',[
 no('ube-83294','oz-ube','closure','2026-09-23',absent+'運営会社の宇部店・下松瑞穂店告知で宇部店の閉店日を確認。',[url('ube-83294'),primary.oz])]);
review('shunan-119852','下松瑞穂店の閉店1件を列挙。',[
 no('shunan-119852','oz-kudamatsu','closure','2026-09-23',absent+'運営会社の支店別告知と一致。',[url('shunan-119852'),primary.oz])]);
review('ube-83212','本文の宇部店と下松瑞穂店、2支店の閉店を列挙。',[
 dup('ube-83212','oz-ube','ube-83294:oz-ube','同じ宇部店の閉店。'),dup('ube-83212','oz-kudamatsu','shunan-119852:oz-kudamatsu','同じ下松瑞穂店の閉店。')]);
review('kaiten-613336','宇部店閉店1件を列挙。',[dup('kaiten-613336','oz-ube','ube-83294:oz-ube','宇部店の同じ閉店。')]);
review('yamaguchi-31552','防府店閉店1件を列挙。',[
 no('yamaguchi-31552','oz-hofu','closure','2024-05-31',absent+'店頭告知写真と2024年記事を照合。旧公式ページ404は閉店根拠にしない。',[url('yamaguchi-31552'),image('oz-hofu')])]);
review('shunan-119439','ラ・シェールの閉店1件を列挙。',[
 no('shunan-119439','lachere','closure','2026-06-21',absent+'自店の6月22日投稿が前日6月21日の営業終了を明記。',[url('shunan-119439'),primary.lachere])]);
review('shunan-119313','シュヴェーネ閉店1件。店頭告知の月単位と読者の6月29日情報を区別。',[
 no('shunan-119313','schwane','closure',null,absent+'店頭告知は令和8年6月末まで。閉店日を6月29日や6月30日と断定せず月情報として記録。',[url('shunan-119313'),image('schwane')])]);
review('shunan-119510','6月まとめのラ・シェールとシュヴェーネ、2店を列挙。',[
 dup('shunan-119510','lachere','shunan-119439:lachere','ラ・シェールの同じ閉店。'),dup('shunan-119510','schwane','shunan-119313:schwane','シュヴェーネの同じ月単位の閉店。')]);
review('shunan-119492','とらちゃん閉店と、同一店の旧名開店・改称の背景3件を区別。',[
 e('shunan-119492','torachan','closure','reflected_update',[old],'2026-08-15','自店の8月7日告知で8月15日閉店を確認。旧名ジューシーのID・座標を保持し閉店更新。',[primary.torachan,url('shunan-119492')]),
 no('shunan-119492','juicy-opening-history','opening',null,'2024年4月開店という背景記述。既存の旧名IDを閉店履歴として維持するため営業店の新規追加は不要。実開店日は月のみの記述から生成しない。',[url('shunan-119492')],[old]),
 no('shunan-119492','rename-history','rename',null,'同じ110区画での改称は報道と施設公式の検索抜粋で照合し閉店更新の名称に含めた。日付は未確認で、独立した日付付き改称や別店舗追加を作らない。',[url('shunan-119492'),adopted.update.review.sources[2].url],[old])]);
review('shunan-101155','Shoji開店と追記された旧入居店訂正を列挙。料理紹介は施設変更ではない。',[
 no('shunan-101155','shoji-opening','opening',null,absent+'記事は2024年9月19日開店を報道するが、現在は自店告知で閉店を確認。過去の開店記事から営業中として追加しない。日付は現行施設の開店日へ反映しない。',[url('shunan-101155'),primary.shoji]),
 no('shunan-101155','predecessor-correction','other',null,'記事追記は「シェーク跡」を訂正し、お重と焼肉ドラゴンに言及。Shojiとシェークを同じ店舗や座標として結び付けない。過去入居順の曖昧な打消し表示から移転イベントを作らない。',[url('shunan-101155')])]);
review('shunan-119951','Shojiの8月16日閉店と2024年9月開店の背景を列挙。契約終了8月末を最終営業日と混同しない。',[
 no('shunan-119951','shoji','closure','2026-08-16',absent+'自店7月31日投稿が8月16日閉店を明記。8月31日投稿は契約終了の報告。',[url('shunan-119951'),primary.shoji,'https://www.instagram.com/shoji_0442/p/DcuZoXtvzXE/']),
 dup('shunan-119951','shoji-opening','shunan-101155:shoji-opening','閉店済みShojiの同じ過去開店。')]);
review('kaiten-604989','シュープラザ周南久米店の閉店1件を列挙。',[
 no('kaiten-604989','shoes','closure','2026-08-16',absent+'千代田の店舗公式データに8月16日をもって閉店した旨がある。',[url('kaiten-604989'),primary.shoes])]);
review('shunan-119838','かざみどりサンリブ下松店の閉店1件を列挙。',[
 no('shunan-119838','kazamidori','closure','2026-08-31',absent+'店頭告知写真の8月31日と記事年2026年を照合。',[url('shunan-119838'),image('kazamidori')])]);
review('kaiten-521041','VANSANの2024年開店1件を列挙。現在の後継店情報まで照合。',[
 no('kaiten-521041','vansan-opening','opening',null,absent+'2024年10月11日開店の過去報道。現在は同住所のITTOKUが自店案内を掲載しており、VANSANを現在営業中として追加しない。過去実開店日は一次告知未取得で日付確定扱いにしない。',[url('kaiten-521041'),primary.ittoku])]);
review('shunan-120037','VANSAN閉店と後継ITTOKU開店の2件を列挙。',[
 no('shunan-120037','vansan','closure',null,absent+'報道に自店LINE通知の引用と8月31日閉店情報があるが、元通知自体は未取得。現在同住所にITTOKUの公式案内を確認。閉店日を一次検証済みとせず、地図の変更対象がないという判定に限る。',[url('shunan-120037'),url('shunan-119953'),primary.ittoku]),
 e('shunan-120037','ittoku','opening','reflected_addition',[addedI],'2026-09-16','店自身の現行案内、9/16 OPEN表記、2026年9月18日記事の年・店舗名を照合。公式JSON-LDの店名・住所・geoを採用し、近くの歯科と別IDで追加。',[primary.ittoku,primary.hp,url('shunan-120037')])]);
review('shunan-119953','VANSAN閉店、過去開店、後継店予告の3件を列挙。元LINE未取得の制約を残す。',[
 dup('shunan-119953','vansan','shunan-120037:vansan','同じ旧店。閉店日が未一次検証である制約も継承。'),
 dup('shunan-119953','vansan-opening','kaiten-521041:vansan-opening','同じ2024年の開店背景。'),
 dup('shunan-119953','ittoku','shunan-120037:ittoku','本文末の同じ場所の後継予告を後続記事と現在のITTOKU公式で解決。')]);
review('shunan-119996','8月まとめにある5店舗すべてを列挙。契約終了日・同名店との混同を避ける。',[
 dup('shunan-119996','torachan','shunan-119492:torachan','とらちゃん8月15日閉店。'),dup('shunan-119996','shoji','shunan-119951:shoji','Shoji8月16日閉店。'),dup('shunan-119996','shoes','kaiten-604989:shoes','シュープラザ8月16日閉店。'),dup('shunan-119996','kazamidori','shunan-119838:kazamidori','かざみどり8月31日閉店。'),dup('shunan-119996','vansan','shunan-120037:vansan','VANSANの閉店報道。日付の一次確認は未取得。')]);
review('shunan-119511','第三スターの閉店1件を列挙。スター本店・第二スターの紹介は第三スター閉店の対象外。',[
 no('shunan-119511','dai3star','closure','2026-07-14',absent+'店頭告知の店舗名と令和8年7月14日を視認確認。他のスター店へ閉店を適用しない。',[url('shunan-119511'),image('dai3star')])]);
review('shunan-92674','シェーク閉店1件を列挙。店主の私的事情は記録対象外。',[
 no('shunan-92674','shake','closure',null,absent+'2024年6月27日閉店を店主への取材記事が報じる。Shojiの旧所在地と同一視しない。独立した一次日付告知を取得した扱いにしない。',[url('shunan-92674'),url('shunan-101155')])]);
review('shunan-99289','Shoji開店予定、シェーク閉店、旧入居店の誤認を列挙し訂正記事へ接続。',[
 dup('shunan-99289','shoji-opening','shunan-101155:shoji-opening','開店予定は後続記事と現在の閉店告知まで照合。'),dup('shunan-99289','shake','shunan-92674:shake','シェークの同じ閉店。'),dup('shunan-99289','predecessor-correction','shunan-101155:predecessor-correction','後続記事が跡地の誤認を訂正。')]);
review('shunan-95765','VANSANの2024年開店予定1件。現在の後継店情報まで接続。',[dup('shunan-95765','vansan-opening','kaiten-521041:vansan-opening','同じ開店。過去予定から現在営業中を作らない。')]);
review('shunan-119965','とらちゃん閉店、しづくや開店予定、現行掲載の3イベントを分離。',[
 dup('shunan-119965','torachan','shunan-119492:torachan','旧入居店の同じ閉店。'),
 e('shunan-119965','shizqu-opening','opening','hold',[addedS],null,'9月18日開店予定の報道と同日の自店商品案内は確認。ただし実開店を明言した一次告知が未取得のため日付は未確定。現行掲載の確認と分離。',[url('shunan-119965'),shizqu.properties.official_url,'https://www.instagram.com/shizqu_ya/p/DddDekyif8C/']),
 e('shunan-119965','shizqu-current','other','reflected_addition',[addedS],null,'施設公式の現行テナント案内、自店の名称・所在地・電話、Googleの同名店舗点を照合。旧店のID・座標を転用せず追加。区画番号の表記差を制約に残す。',shizqu.properties.freshness_review.sources.map(s=>s.url))]);
review('shunan-100787','並木から徳ちゃんへの改称、改装準備の一時休業、現在の鼓海店掲載を分離。',[
 no('shunan-100787','rename','rename',null,'旧名並木青果市場店・新名徳ちゃんとも既存IDなし。2024年9月21日の改称報道と現在の自店名は整合するが、元動画の特定・取得は未了。現行掲載として別イベントで反映し、日付付き改称を生成しない。',[url('shunan-100787'),primary.tokuchan]),
 no('shunan-100787','renovation','temporary_change',null,'2024年9月20日の現地取材時の改装準備休業。現在は自店店舗案内があるため過去の一時休業を現行状態に適用しない。',[url('shunan-100787'),primary.tokuchan]),
 e('shunan-100787','tokuchan-current','other','reflected_addition',[addedT],null,'鼓海1丁目324-18の自店案内と同サイト埋込地図の店名・CID付きマーカーを照合。地図表示中心を除外し、開店日は未確認で掲載。',[primary.tokuchan])]);
review('shunan-119994','Shoji閉店、飯島町新店舗と鼓海店の関係、関連記事の改称背景を列挙。',[
 dup('shunan-119994','shoji','shunan-119951:shoji','Shojiの同じ閉店。'),
 e('shunan-119994','tokuchan-iijima','other','hold',[],null,'飯島町に居酒屋・拉麺徳ちゃんの文字があるが、現行の自店サイト・SNSから開店、移転、新支店のいずれかを確定できない。鼓海店を移転済みにせず、飯島町へ旧Shojiの点も転用しない。追加・関係判定を保留。',[url('shunan-119994'),primary.tokuchan,'https://www.instagram.com/ra_mentokuchan/']),
 dup('shunan-119994','rename-background','shunan-100787:rename','関連記事が扱う鼓海店の同じ旧名改称背景。飯島町への移転とは別。')]);
assert.equal(reviews.length,24);assert.equal(new Set(reviews.map(r=>r.article_key)).size,24);
write(pub+'/article-reviews.json',reviews);
const canonical='data-sources/facility-progress-20260925/article-event-reviews.json', previous=read(canonical);
for(const r of reviews){const existing=previous.find(x=>x.article_key===r.article_key);if(existing)assert.deepEqual(existing,r,'Review drift');else previous.push(r);}
write(canonical,previous);
console.log(JSON.stringify({new_articles:reviews.length,new_events:reviews.reduce((n,r)=>n+r.events.length,0),holds:reviews.flatMap(r=>r.events).filter(e=>e.disposition==='hold').length,visual_notices:images.length}));
