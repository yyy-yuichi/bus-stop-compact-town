import fs from 'node:fs';import assert from 'node:assert/strict';
import {hash} from './jev-batch.mjs';import {normalize,htmlText} from './facility-bulk-lib.mjs';
import {mcdPoint,kfcPoint,geometryDistance,metres} from './facility-ube-fastfood-lib.mjs';
import {applyFacilityCurrent} from '../src/facilityFreshness.ts';
const pub='data-sources/facility-ube-fastfood-20260925',out='outputs/facility-ube-fastfood-20260925';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const before=read(out+'/before-overlay.json'),base=['shopping.geojson','civic-facilities.geojson'].flatMap(f=>read('public/data/'+f).features),all=applyFacilityCurrent(base,before);
assert.equal(base.length,7764);assert.equal(all.length,7933);
const receipts=fs.readdirSync(out+'/pages').map(f=>({file:out+'/pages/'+f,value:read(out+'/pages/'+f)}));
const get=url=>{const r=receipts.find(r=>r.value.url===url)?.value;assert(r);assert.equal(r.status,200);return r;};
const mcd=[
 {id:'official-mcdonalds-35538',code:'35538',name:'マクドナルド 宇部厚南店',address:'妻崎開作８６０ー１',currentAddress:'妻崎開作８６０－１',phone:'0836-39-0066',jobUrl:'https://crewrecruiting.mcdonalds.co.jp/map/35538',currentUrl:'https://map.mcdonalds.co.jp/map/35538',limit:'記事は2025年7月15日の移転を報じています。旧地点の閉店と実移転日は一次情報による確認が未了です。旧OSM施設は閉店処理せず保持しています。'},
 {id:'official-mcdonalds-35539',code:'s35539',name:'マクドナルド 宇部西岐波店',address:'西岐波１５５０番１',currentAddress:'西岐波１５５０－１',phone:'0836-38-5715',jobUrl:'https://crewrecruiting.mcdonalds.co.jp/map/s35539',currentUrl:'https://map.mcdonalds.co.jp/map/35539',limit:'公式求人の2026年9月25日は開店前に掲載された予定です。現行の店舗掲載を確認しましたが実開店日は未確認です。記事と公式で朝マックの記載が異なるため、そのサービス情報は採用していません。'}
];
const specs=mcd.map(s=>({...s,url:s.currentUrl,point:mcdPoint(get(s.jobUrl),get(s.currentUrl),s),sources:[s.currentUrl,s.jobUrl],aliases:['マクドナルド','mcdonald'],method:'named_jobLocation_with_current_branch_identity_and_map_agreement'}));
specs.push({id:'official-kfc-5063',name:'ケンタッキーフライドチキン ゆめタウン宇部店',address:'黒石北3-4-1 ゆめタウン宇部1F',url:'https://search.kfc.co.jp/points/5063',point:kfcPoint(get('https://search.kfc.co.jp/points/5063')),sources:['https://search.kfc.co.jp/points/5063','https://www.izumi.jp/tenpo/ube/shop/food/kfc','https://japan.kfc.co.jp/news_release/8090'],aliases:['ケンタッキー','kfc','kentucky'],method:'named_restaurant_jsonld',limit:'公式の2025年11月8日開店告知は11月1日の事前発表です。現在の入居と公式掲載を確認しましたが、実開店日は未確認です。旧マクドナルドの閉店日も一次情報の確認が未了です。'});
assert(htmlText(get(specs[2].sources[1]).html).includes('1F'));
const targets=[],pointReviews=[];
const additions=specs.map(s=>{
 const aliases=f=>s.aliases.some(a=>normalize(f.properties.name+' '+(f.properties.search_names??'')).includes(normalize(a)));
 const describe=f=>({id:f.id,name:f.properties.name,category:f.properties.category,address:f.properties.address??'',...geometryDistance(s.point,f.geometry)});
 const chain=all.filter(aliases).map(describe),near=all.map(describe).filter(f=>f.distance_m<350).sort((a,b)=>a.distance_m-b.distance_m);
 assert(chain.every(c=>c.distance_m>80),'Nearby same-chain branch requires review');
 targets.push({id:s.id,same_chain_candidates:chain.map(c=>({...c,decision:c.id==='osm-way-477623030'&&s.id==='official-mcdonalds-35538'?'旧店舗候補。移転関係・閉店日は一次確認未了。元ID・地点を保持し別の現行住所を追加。':'別地点の支店。対象公式支店名・住所との一致なし。'}))});
 pointReviews.push({id:s.id,method:s.method,spec:s.id.startsWith('official-mcdonalds-')?mcd.find(x=>x.id===s.id):null,coordinates:s.point,compared_candidates:near,decision:s.id==='official-kfc-5063'?'商業施設のポリゴン近傍も確認。入居先ubeは閉店・改名せず別テナントを追加。':'既存の別地点・別業態を保持し、支店に紐づいた現行の地点を追加。'});
 const location='公式の支店名・住所に対応する店舗代表点です。入口・徒歩到達性は未確認です。';
 return {type:'Feature',id:s.id,properties:{name:s.name,city:'宇部市',address:'山口県宇部市'+s.address,official_address:'山口県宇部市'+s.address,official_url:s.url,category:'fast_food',geometry_kind:'representative_point',source:'店舗公式情報',source_ids:['official:'+s.id.slice(9).replaceAll('-',':')],source_timestamp:'2026-09-25',verified_at:'2026-09-25',verification_status:'official_current_listing',license:'official-published-facts',search_names:s.name+(s.id==='official-kfc-5063'?' KFC ケンタッキー ゆめタウン宇部':' マック'),location_verification:location,freshness_review:{status:'operating',event:'listed',effective_at:null,checked_at:'2026-09-25',summary:'現行の公式支店名・住所・支店に紐づく代表点を照合しました。',sources:s.sources.map(url=>({title:'店舗運営者・入居施設の公式情報',url})),limits:[location,s.limit,'現行掲載の確認であり、リアルタイムの営業を保証しません。']}},geometry:{type:'Point',coordinates:s.point}};
});
const wants=all.find(f=>f.id==='official-tsuruha-10049'),halows=all.find(f=>f.id==='official-halows-nishikiwa');
assert(normalize(htmlText(get('https://www.halows.com/stores/detail/138').html)).includes(normalize('ウォンツハローズ西岐波店')));
const wj=[...get('https://shop.tsuruha-g.com/10049').html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(m=>{const j=JSON.parse(m[1]);return j['@graph']??[j];}).find(j=>j?.geo);
assert(wj);assert.deepEqual([Number(wj.geo.longitude),Number(wj.geo.latitude)],wants.geometry.coordinates);
const holds=[
 {topic:'wants_halows_nishikiwa_position_conflict',ids:[wants.id,halows.id],distance_m:Math.round(metres(wants.geometry.coordinates,halows.geometry.coordinates)),official_wants_point:wants.geometry.coordinates,existing_halows_point:halows.geometry.coordinates,source_urls:['https://shop.tsuruha-g.com/10049','https://www.halows.com/stores/detail/138'],finding:'ハローズ公式が同一ショッピングセンターの店舗とするウォンツの公式座標が3km超離れる。取得処理の誤抽出ではなく、現行公式JSON-LDも既存掲載点と一致。正しいウォンツの店別地点は未確定。',next:'店別の一次地図または公式訂正を確認し、既存掲載の修正履歴を残して位置を訂正する。ハローズ中心へ推測移動しない。',priority:'high'},
 {topic:'old_mcd_konan_closure',ids:['osm-way-477623030'],finding:'旧施設と新店舗約245mの移転記事があるが旧支店の公式閉店告知が未取得。旧IDは通常候補に残る。',next:'旧店舗の支店名・住所・閉店告知を一次情報で確認。'},
 {topic:'autobacs_relocation',ids:[],source_urls:['https://www.autobacs.co.jp/ja/news/news-202509031400-1.html'],finding:'2025年9月3日の公式事前発表は9月4日移転予定、妻崎開作860-1。店別の現在地点と実施日は未確認。',next:'現行店舗ページと店別代表点を照合する。'}
];
assert(holds[0].distance_m>3000);
const articles=read(out+'/article-inputs.json'),index=read('data-sources/facility-progress-20260925/article-index.json');assert.equal(articles.length,8);
write(pub+'/adoptions.json',{additions,updates:[],point_reviews:pointReviews});write(pub+'/holds.json',holds);
write(pub+'/review-inputs.json',{checked_at:'2026-09-25',article_inventory:articles.map(a=>index.find(x=>x.key===a.key)),before_overlay_hash:hash(before),article_inputs_hash:hash(articles),baseline_records:base.length,current_records_before:all.length,targets,source_receipts:receipts.map(r=>({url:r.value.url,file:r.file,hash:hash(r.value),status:r.value.status??null,error:r.value.error??null})),extra_jev_requests:0});
console.log(JSON.stringify({articles:8,additions:additions.length,updates:0,position_conflict_m:holds[0].distance_m,points:pointReviews.map(p=>({id:p.id,point:p.coordinates,near:p.compared_candidates.filter(c=>c.distance_m<100)}))}));
