import fs from 'node:fs';
import assert from 'node:assert/strict';
import { hash } from './jev-batch.mjs';
import { htmlText, normalize } from './facility-bulk-lib.mjs';
import { gorpRestaurant, embeddedNamedPoint, placeNamedPoint, caption } from './facility-shunan-oz-lib.mjs';

const out='outputs/facility-shunan-oz-20260925', pub='data-sources/facility-shunan-oz-20260925';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const immutable=(f,v)=>{if(fs.existsSync(f))assert.equal(hash(read(f)),hash(v),'Immutable source drift');else write(f,v);};
const baseline=['shopping.geojson','civic-facilities.geojson'].flatMap(f=>read('public/data/'+f).features);
const beforeFile=out+'/before-overlay.json';
if(!fs.existsSync(beforeFile))immutable(beforeFile,read('public/data/facility-current.json'));
const before=read(beforeFile);
assert.equal(hash(before),'3cecaf5cc6b28f1304ba3d0e0c229483e4a5ab0e2979735e1606a33876a7d6e2');
const all=[...baseline,...before.additions];
const receipts=fs.readdirSync(out+'/pages').map(f=>({file:out+'/pages/'+f,value:read(out+'/pages/'+f)}));
const receipt=url=>{const r=receipts.find(r=>r.value.url===url);assert(r,url);return r;};
const short=id=>{const r=receipts.find(r=>r.file.endsWith('/'+id+'.json'));assert(r,id);return r.value;};
const checks=[];
function check(url,terms,method='public_primary_page'){
 const r=receipt(url);assert.equal(r.value.status,200);
 const text=url.includes('/p/')||url.includes('/reel/')?caption(r.value):htmlText(r.value.html);
 for(const term of terms)assert(text.includes(term),`Missing ${term} at ${url}`);
 checks.push({url,receipt:r.file,receipt_hash:hash(r.value),method,confirmed_terms:terms});
 return r.value;
}
const urls={oz:'https://reggirt.jp/news/gift-galleryoz-ube-kudamatsu-sale/',
 torachan:'https://www.instagram.com/gyoza_torachan/reel/Dbw03kVvIXH/',
 shoji:'https://www.instagram.com/shoji_0442/p/Dbc2R5upXCk/',
 shojiEnd:'https://www.instagram.com/shoji_0442/p/DcuZoXtvzXE/',
 lachere:'https://www.instagram.com/lachere_cafe/p/DZ4WWLynZa3/',
 shoes:'https://stores.chiyodagrp.co.jp/store/39227.html',
 ittoku:'https://ya55808.gorp.jp/', hp:'https://www.hotpepper.jp/strJ003917267/',
 shizqu:short('f6ecf86cf32735c1b41e7fbe').url,
 shizquPost:'https://www.instagram.com/shizqu_ya/p/DddDekyif8C/',
 shizquMap:short('d581cee36e6ed337a21f29e2').url,
 tokuchan:'https://toku-chan.com/store', tokuchanMap:short('ddbd208e071e02932dbe25f4').url};
check(urls.oz,['宇部店・下松瑞穂店','2026年9月23日']);
check(urls.torachan,['gyoza_torachan on August 7, 2026','8/15の営業をもって閉店']);
check(urls.shoji,['shoji_0442 on July 31, 2026','8月16日','閉店']);
check(urls.shojiEnd,['8月末','全ての契約も終え']);
check(urls.lachere,['lachere_cafe on June 22, 2026','6月21日の営業','閉店']);
// This shop page renders its closed notice from data attributes.
const shoe=receipt(urls.shoes);assert(shoe.value.html.includes('2026年8月16日(日)をもちまして閉店'));
checks.push({url:urls.shoes,receipt:shoe.file,receipt_hash:hash(shoe.value),method:'official_store_announcement',confirmed_terms:['2026年8月16日(日)をもちまして閉店']});
check(urls.shizqu,['甘味処 しづくや','110','0834-20-0129']);
check(urls.shizquPost,['shizqu_ya on September 18, 2026','周南市銀座1-31','0834-20-0129']);
check(urls.tokuchan,['拉麺','徳ちゃん','山口県周南市鼓海1丁目324-18','0834-34-1528']);
check(urls.hp,['9/16 OPEN','洋食酒場ITTOKU']);
const ittoku=gorpRestaurant(receipt(urls.ittoku).value,'洋食酒場 ITTOKU');
const shizquPoint=placeNamedPoint(receipt(urls.shizquMap).value,'甘味処しづくや','0x3544e7ad64bce933:0x62514faf955cea64');
const tokuchanPoint=embeddedNamedPoint(receipt(urls.tokuchanMap).value,'0x3544e6beb6096653:0x94391da6a6a3a5b1','拉麺 徳ちゃん');
const location='店舗名と所在地に対応する代表点です。店舗入口・館内動線・バス停からの徒歩到達性は未確認です。';
const newRows=[
 {id:'official-ittoku-shunan-heiwadori',name:ittoku.name,address:ittoku.address,category:'restaurant',coordinates:ittoku.coordinates,url:urls.ittoku,map_url:urls.ittoku,method:'official_restaurant_jsonld_name_address_geo',event:'opened',effective_at:'2026-09-16',extra_sources:[{title:'店舗が掲載する開店案内（9/16 OPEN、年は2026年記事と照合）',url:urls.hp}],limits:['近傍にある別名の山田歯科のID・位置・状態は変更していません。']},
 {id:'official-shizquya-tokuyama-deck',name:'甘味処 しづくや',address:'山口県周南市銀座1丁目31 徳山デッキD2 1階110区画',category:'cafe',coordinates:shizquPoint,url:urls.shizqu,map_url:urls.shizquMap,method:'named_google_place_marker_with_ui_phone_and_official_address',event:'listed',effective_at:null,extra_sources:[{title:'自店の9月18日商品案内・住所・電話',url:urls.shizquPost}],limits:['施設公式は110区画、自店投稿はD2-011、地図はD2-11と区画表記に差があります。名称・住所・電話番号の一致を照合し、店頭の区画表示は未確認です。','9月18日の開店予定報道と当日の商品案内は確認しましたが、実開店日は確定せず未確認で掲載します。']},
 {id:'official-tokuchan-kokai',name:'拉麺 徳ちゃん',address:'山口県周南市鼓海1丁目324-18',category:'restaurant',coordinates:tokuchanPoint,url:urls.tokuchan,map_url:urls.tokuchanMap,method:'official_embed_marker_exact_cid_and_name_not_viewport',event:'listed',effective_at:null,extra_sources:[],limits:['鼓海の現店舗として掲載。飯島町の新店舗との関係・移転は未確認であり、この店舗を移転済みとしていません。']}
];
const additions=newRows.map(r=>({type:'Feature',id:r.id,properties:{name:r.name,city:'周南市',address:r.address,official_address:r.address,official_url:r.url,category:r.category,geometry_kind:'representative_point',source:'店舗公式情報',source_ids:['official:'+r.id.slice(9).replaceAll('-',':')],source_timestamp:'2026-09-25',verified_at:'2026-09-25',verification_status:'official_current_listing',license:'official-published-facts',search_names:r.name,location_verification:location,freshness_review:{status:'operating',event:r.event,effective_at:r.effective_at,checked_at:'2026-09-25',summary:r.event==='opened'?'店舗公式の現行案内・開店表記・住所と店舗地図を照合しました。':'施設運営者または店舗自身の現行案内・所在地と、店舗名に対応する地図点を照合しました。',sources:[{title:'店舗または施設運営者の現行案内',url:r.url},...(r.map_url!==r.url?[{title:'店舗名・住所に対応する地図の店舗代表点',url:r.map_url}]:[]),...r.extra_sources],limits:[location,...r.limits,...(r.event==='listed'?['現行掲載の確認であり、実開店日やリアルタイム営業を保証するものではありません。']:[])]}},geometry:{type:'Point',coordinates:r.coordinates}}));
const old=baseline.find(r=>r.id==='osm-node-12606873239');assert.equal(old.properties.name,'小籠包酒場　ジューシー');
const update={id:old.id,expected:{name:old.properties.name,category:old.properties.category,source_ids:old.properties.source_ids,geometry:old.geometry},changes:{name:'ぎょうざ酒場 とらちゃん（旧 小籠包酒場ジューシー）',city:'周南市',address:'山口県周南市銀座1丁目31 徳山デッキD2 1階',search_names:'ぎょうざ酒場 とらちゃん 小籠包酒場 ジューシー'},review:{status:'closed',event:'closed',effective_at:'2026-08-15',checked_at:'2026-09-25',summary:'旧名ジューシーの既存IDを保持し、改称後の自店による8月15日閉店告知を照合しました。後継しづくやは別施設として掲載します。',sources:[{title:'自店の閉店告知（2026年8月7日投稿）',url:urls.torachan},{title:'店舗の旧名・改称と閉店を報じた記事',url:'https://shunan-kudamatsu-hikari.goguynet.jp/2026/07/17/torachan/'},{title:'施設運営者の旧110区画案内（検索キャッシュで改称を照合、現ページは404）',url:short('a9bc778790ec73a7690961d6').url}],limits:['改称前の元ID・元座標を履歴として保持しています。後継店へIDを付け替えていません。','改称の実施日は未確認です。施設運営者の旧店舗ページは取得時404で、改称文は検索キャッシュと報道で照合しました。']}};
const excludedIds = new Map([
 ['osm-node-12376461152','chocoZAPはOZギフト店と別業態・別名称'],
 ...['civic-KD0000900004','civic-KD0000900020','civic-KD0000900045','civic-KD0000900055','civic-care-3570701205-3e2f9f3a58','civic-care-3570204002-f023d040b0','civic-care-3570700082-d0d2af184a','civic-care-3570202659-f7682ac0f6','civic-care-3571600190-0ed27dc78d','civic-care-3570700173-e8e968f0d8'].map(id=>[id,'読みの一部（しょうじ等）の一致のみ。名称・自治体・介護事業の業態が周南市飯島町の飲食店Shojiと異なる。'])
]);
const targets=[
 ['oz-ube','ギフトギャラリーOZ 宇部店',['ギフトギャラリー','オズ','oz']],['oz-kudamatsu','ギフトギャラリーOZ 下松瑞穂店',['ギフトギャラリー','オズ','oz']],['oz-hofu','オズ イオンタウン防府店',['ギフトギャラリー','オズ','oz']],
 ['lachere','カフェ・ラ・シェール',['ラシェール','ラ・シェール','lachere','la chere']],['schwane','お菓子のアトリエ シュヴェーネ',['シュヴェーネ','シュベーネ','schwane','schwäne']],['dai3star','第三スター',['第三スター','第3スター']],
 ['shoji','スパイスカレー＆パスタShoji',['shoji','しょうじ','ショウジ']],['vansan','VANSAN 周南平和通店',['vansan','バンサン']],['kazamidori','かざみどり サンリブ下松店',['かざみどり','風見鶏']],['shoes','シュープラザ イオンタウン周南久米店',['シュープラザ','shoes plaza']],['shake','シェーク',['シェーク','シェイク']],
 ['torachan','ぎょうざ酒場とらちゃん（旧ジューシー）',['とらちゃん','ジューシー','juicy','小籠包']],['ittoku',ittoku.name,['ittoku','洋食酒場']],['shizqu','甘味処しづくや',['しづくや','しずくや','shizqu']],['tokuchan','拉麺徳ちゃん（鼓海）',['徳ちゃん','並木','とくちゃん']]
].map(([id,name,aliases])=>{const found=all.filter(f=>aliases.some(a=>normalize(f.properties.name+' '+(f.properties.search_names??'')).includes(normalize(a))));const excluded=found.filter(f=>excludedIds.has(f.id)).map(f=>({id:f.id,name:f.properties.name,city:f.properties.city,category:f.properties.category,reason:excludedIds.get(f.id)}));const matching=found.filter(f=>!excluded.some(x=>x.id===f.id));assert.deepEqual(matching.map(f=>f.id),id==='torachan'?[old.id]:[],`Unexpected candidate for ${id}`);return {id,name,aliases,matching_existing_ids:matching.map(f=>f.id),excluded_similar_names:excluded,checked_records:all.length};});
const nearby=newRows.map(r=>({id:r.id,method:r.method,coordinates:r.coordinates,compared_candidates:all.filter(f=>f.geometry.type==='Point').map(f=>({id:f.id,name:f.properties.name,distance_m:Math.round(Math.hypot((f.geometry.coordinates[0]-r.coordinates[0])*92300,(f.geometry.coordinates[1]-r.coordinates[1])*111000))})).filter(f=>f.distance_m<150).sort((a,b)=>a.distance_m-b.distance_m)}));
const keys=['ube-83294','shunan-119852','ube-83212','kaiten-613336','yamaguchi-31552','shunan-119439','shunan-119510','shunan-119313','shunan-119996','shunan-119951','shunan-119492','shunan-119838','shunan-119953','kaiten-604989','shunan-119511','shunan-101155','shunan-99289','shunan-92674','kaiten-521041','shunan-95765','shunan-120037','shunan-119965','shunan-119994','shunan-100787'];
const index=read('data-sources/facility-progress-20260925/article-index.json');const articles=read('outputs/facility-bulk-triage-20260925/articles.json').articles.filter(a=>keys.includes(a.key));assert.equal(articles.length,keys.length);
immutable(out+'/article-inputs.json',articles);
write(pub+'/adoptions.json',{additions,update,point_reviews:nearby});
write(pub+'/review-inputs.json',{checked_at:'2026-09-25',baseline_records:7764,current_records_before:all.length,article_inventory:keys.map(key=>index.find(a=>a.key===key)),targets,checks,source_receipts:receipts.map(r=>({url:r.value.url,file:r.file,hash:hash(r.value),status:r.value.status,error:r.value.error??null})),before_overlay_hash:hash(before),extra_jev_requests:0});
console.log(JSON.stringify({articles:articles.length,targets:targets.length,proposed_additions:additions.length,proposed_updates:1,point_reviews:nearby.map(r=>({id:r.id,coordinates:r.coordinates,nearest:r.compared_candidates.slice(0,2)}))}));