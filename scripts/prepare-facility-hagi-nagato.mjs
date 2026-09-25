import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {hash} from './jev-batch.mjs';
import {htmlText,normalize} from './facility-bulk-lib.mjs';
import {namedEmbed} from './facility-hagi-nagato-lib.mjs';
import {placeNamedPoint} from './facility-shunan-oz-lib.mjs';
const out='outputs/facility-hagi-nagato-20260925',pub='data-sources/facility-hagi-nagato-20260925';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const before=read(out+'/before-overlay.json');
assert.equal(hash(before),'aa372a1d1807dcc394a41df8873e327cce525706dd4c201f286364c70a101a0e');
const baseline=['shopping.geojson','civic-facilities.geojson'].flatMap(f=>read('public/data/'+f).features),all=[...baseline,...before.additions];
const receipts=fs.readdirSync(out+'/pages').map(f=>({file:out+'/pages/'+f,value:read(out+'/pages/'+f)}));
const get=id=>{const r=receipts.find(r=>r.file.endsWith('/'+id+'.json'));assert(r,id);return r.value;};
const checks=[];
function check(id,terms){const r=get(id);assert.equal(r.status,200);const t=normalize(htmlText(r.html));for(const s of terms)assert(t.includes(normalize(s)),'Missing primary fact '+s);checks.push({url:r.url,confirmed_terms:terms,method:'retrieved_primary_html',receipt_hash:hash(r)});return r;}
const seriaUrl='https://shop.seria-group.com/seria/info/000002953?addresscode=35';
const visual={checked_at:'2026-09-25',observations:[
 {method:'browser_visible_official_detail',url:seriaUrl,official_store_id:'000002953',name:'Seria 長門店',address:'山口県長門市東深川字塚ヶ坪８２１－１',phone:'0837-27-0235',map_url:'https://shop.seria-group.com/seria/map?latlon=34.3706069,131.1903297&shopid=000002953',coordinates:[131.1903297,34.3706069],note:'公式ショップ入口から県一覧2頁を開いて長門店を選択。公式住所行に結び付く店舗ID付き地図リンクの明示座標を視認。通常HTML取得はJSの殻のみで、本文の自動抽出成功とは扱わない。旧サイトの推測ID000003059は不採用。'},
 {method:'manual_visual_reading_of_original_pdf',url:'https://www.juntendo.co.jp/article_source/data/news/files/hagi20241120.pdf',file:out+'/pdf/juntendo-hagi-open.pdf',sha256:createHash('sha256').update(fs.readFileSync(out+'/pdf/juntendo-hagi-open.pdf')).digest('hex'),pages:[1],confirmed_facts:{old_name:'ジュンテンドー東萩店',old_address:'萩市大字椿東2940番地1',closed_at:'2024-10-14',name:'ジュンテンドー萩店',opened_at:'2024-11-20',relationship:'旧東萩店の後継店として移転・増床'},note:'PDF原本1ページをレンダリングして視認。文字抽出には文字化けがあるため抽出JSONを根拠にしない。'}
]};
const jun=check('3b31957ab9c08b006f240fa8',['萩','土原457','0838-24-2012']);
const junMap=get('eb78c76607478eaffb079125');assert(jun.html.includes(junMap.url));assert.equal(new URL(junMap.final_url).pathname,'/maps/search/34.407630,+131.403763');
const junText=htmlText(jun.html); const block=junText.slice(junText.indexOf('土原457')-80,junText.indexOf('土原457')+250);assert(block.includes('萩'));
const kom=check('9f2029c26195d1418c1613ef',['パワー長門','東深川２３３８','0837-23-2200']);
const komPress=check('49ddf80217e456c2de843ba7',['ハード','2012','パワー長門','２月23']);
const komMap=get('c0dd6816197ea54b2004574d');assert(kom.html.includes(komMap.url));
const komPoint=placeNamedPoint(komMap,'コメリハード＆グリーン長門店','0x35435dbc2453e1dd:0x833d1e63bd3e32e8');
const ch=check('c27a022347526e4ab52133c3',['千代丸','2249']);const chMap=get('16319a5ec7b61184c68ae04a');
assert(ch.html.replaceAll('&amp;','&').includes(chMap.url));
const chPoint=namedEmbed(chMap,'0x3544b3006b884165:0x991afb2b3448527c','千代丸食堂','２２４９');
const abu=check('5b4862fcd94c453d6c6d8250',['かしま','2024/8/17','千代丸','9月6']);
const iphone=check('c7048958b9729618774a4d08',['萩田万川','2909-1','070-8991-4485']);
const ipMap=get('2ad20c042f52c7cc22925701');assert(iphone.html.replaceAll('&amp;','&').includes(ipMap.url));
const ipPoint=namedEmbed(ipMap,'0x355b398160d6ec1b:0xec8df589266123ab','iPhone即日修理屋さん萩田万川店','２９０９');
const hacchi=check('a934455d10dbe6a50ff25e58',['2024年10月29日','土原522-1','萩市 商工観光部 産業政策課']);
const haMap=get('8bb4ef1a9c724c9f687b548f');assert(hacchi.html.replaceAll('&amp;','&').includes(haMap.url));
const haPoint=namedEmbed(haMap,'0x3544af81b36ca7fb:0xcc9bc0c4dccbc8dd','酒ト定食 はっち','522-1');
const soil=check('d1ff2dcc948b1635368d0192',['SOIL','2257','0837-25-3333']);
const soilRegional=check('be225ef601cfc37f85ed4bc9',['SOIL Nagatoyumoto','深川湯本2257','0837-25-3333']);
const soMap=get('5144ee5472b9984ccaca522e');assert(soilRegional.html.replaceAll('&#038;','&').includes(soMap.url));
const soPoint=namedEmbed(soMap,'0x354367c002451787:0x34946c3e75b66813','SOIL Nagatoyumoto','2257');
const soilPref=check('0a7d5b88fc8a75e8e1f263df',['SOIL','2257']);assert(soilPref.html.includes('34.3283563,131.1722825'));
const rejectedSoil=get('b72c790d96261dedc7a7d0a9');assert(decodeURIComponent(rejectedSoil.final_url).includes('SOIL+Setoda'));
const su=check('d737bf0384651c1a5427d342',['191号長門店','仙崎字網田331-1']);
const ld=[...su.html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1])).filter(r=>r['@type']==='FastFoodRestaurant');
assert.equal(ld.length,1);assert.equal(ld[0].name,'すき家 191号長門店');assert.equal(ld[0].address.addressLocality,'山口県長門市仙崎字網田331-1');
const suPoint=[Number(ld[0].geo.longitude),Number(ld[0].geo.latitude)];
const location='店舗・施設名と所在地に対応する代表点です。入口・館内動線・バス停からの徒歩到達性は未確認です。';
const rows=[
 {key:'seria',id:'official-seria-nagato-2953',name:'Seria 長門店',city:'長門市',address:'山口県長門市東深川字塚ヶ坪821-1',category:'variety_store',point:visual.observations[0].coordinates,url:seriaUrl,map:visual.observations[0].map_url,method:'visible_official_shop_id_bound_map_link',sources:[],limits:['実開店日は未確認です。記事の地図点は採用せず、現行公式店舗の住所行にある地図リンクを使用しています。']},
 {key:'chiyomaru',id:'official-chiyomaru-abu',name:'阿武産直 千代丸食堂',city:'阿武町',address:'山口県阿武郡阿武町奈古2249 道の駅阿武町内',category:'restaurant',point:chPoint,url:ch.url,map:chMap.url,method:'own_embed_named_cid_marker',sources:[abu.url],limits:['旧かしまの閉店日と後継店の案内を分離。千代丸の9月6日は開店予定告知であり、実開店日は未確認です。']},
 {key:'juntendo',id:'official-juntendo-hagi-274',name:'ジュンテンドー萩店',city:'萩市',address:'山口県萩市大字土原457番地2',category:'home_center',point:[131.403763,34.407630],url:jun.url+'#274',map:junMap.url,method:'official_store_block_explicit_numeric_map_link',date:'2024-11-20',sources:[visual.observations[1].url],limits:['2024年10月14日に閉店した東萩店からの移転・増床。旧店の座標を移転先へ転用していません。隣接するアトラス萩は別施設です。']},
 {key:'iphone',id:'official-iphone-sokusyuri-hagitamagawa',name:'iPhone即日修理屋さん萩田万川店',city:'萩市',address:'山口県萩市下田万2909-1 須佐自動車サテライトショップ萩内',category:'repair',point:ipPoint,url:iphone.url,map:ipMap.url,method:'own_embed_named_address_cid_marker',sources:[],limits:['自動車店内の修理窓口として掲載。実開店日は未確認です。']},
 {key:'hacchi',id:'official-hacchi-hagi',name:'酒ト定食 はっち',city:'萩市',address:'山口県萩市大字土原522-1',category:'restaurant',point:haPoint,url:hacchi.url,map:haMap.url,method:'city_official_listing_named_address_cid_marker',date:'2024-10-29',sources:['https://www.instagram.com/hacci_8_hagi/'],limits:['萩市の食情報サイトが実開店日を掲載。近傍の福祉施設・保育園・商業施設は別施設です。']},
 {key:'komeri',id:'official-komeri-power-nagato-1054',name:'コメリパワー長門店',city:'長門市',address:'山口県長門市東深川2338番地',category:'home_center',point:komPoint,url:kom.url,map:komMap.url,method:'official_outbound_same_branch_former_brand_marker',sources:[komPress.url],limits:['2012年からの旧ハード＆グリーン長門店をパワーへ改装した店舗です。地図の旧ブランド名は現行公式リンク・同住所・運営元の改装告知で照合しました。','2025年2月23日は改装開店の予定告知。最初の開店日として反映せず、実施日は未確認にしています。']},
 {key:'soil',id:'official-soil-nagatoyumoto',name:'SOIL Nagatoyumoto',city:'長門市',address:'山口県長門市深川湯本2257',category:'hotel',point:soPoint,url:soil.url,map:soMap.url,method:'regional_official_named_address_cid_marker_confirmed_by_prefecture',sources:[soilRegional.url,soilPref.url,'https://prtimes.jp/main/html/rd/p/000000037.000080587.html'],limits:['宿泊・飲食・サウナを備える複合施設の代表点です。各設備の入口は未確認です。','自店の地図リンクは広島県のSOIL Setodaへ移るため不採用。長門湯本公式観光サイトの当該施設点と山口県観光連盟の案内を照合しました。実開業日は未確認です。']},
 {key:'sukiya',id:'official-sukiya-nagato-6605',name:'すき家 191号長門店',city:'長門市',address:'山口県長門市仙崎字網田331-1',category:'fast_food',point:suPoint,url:su.url,map:su.url,method:'official_jsonld_same_shop_name_address_geo',sources:[],limits:['現行の支店公式案内を確認。実開店日は未確認です。毎日の営業時間外を閉店イベントとして扱いません。']}
];
const additions=rows.map(r=>({type:'Feature',id:r.id,properties:{name:r.name,city:r.city,address:r.address,official_address:r.address,official_url:r.url,category:r.category,geometry_kind:'representative_point',source:'店舗公式情報',source_ids:['official:'+r.id.slice(9).replaceAll('-',':')],source_timestamp:'2026-09-25',verified_at:'2026-09-25',verification_status:'official_current_listing',license:'official-published-facts',search_names:r.name+(r.key==='komeri'?' コメリハード＆グリーン長門店':''),location_verification:location,freshness_review:{status:'operating',event:r.date?'opened':'listed',effective_at:r.date??null,checked_at:'2026-09-25',summary:r.date?'現行の公式案内と所在地を照合し、開店後の公式発表で開店日を確認しました。':'現行の公式案内・住所と、この店舗名に対応する地図の代表点を照合しました。',sources:[{title:r.key==='hacchi'?'萩市の店舗紹介':'店舗・施設の現行公式案内',url:r.url},...(r.map!==r.url?[{title:'当該施設の代表点を示す地図',url:r.map}]:[]),...r.sources.map(url=>({title:'運営者・自治体等の補足案内',url}))],limits:[location,...r.limits,...(!r.date?['現行掲載の確認であり、リアルタイムの営業を保証しません。']:[])]}},geometry:{type:'Point',coordinates:r.point}}));
const targetSpecs=[['bowl',['ユーズ','us bowl','ボウル','ボーリング','ボウリング']],['seria',['seria','セリア']],['kashima',['かしま','千代丸']],['juntendo',['ジュンテンド','順天堂','juntendo']],['iphone',['iphone','アイフォン','須佐自動車']],['hacchi',['はっち','ハッチ','hacchi']],['komeri',['コメリ','komeri']],['soil',['soil','ソイル','六角堂']],['toyopet',['トヨペット','toyopet','つばき']],['tecmo',['テクモ','tecmo']],['sukiya',['すき家','sukiya']]];
const targets=targetSpecs.map(([key,aliases])=>{const found=all.filter(f=>aliases.some(a=>normalize(f.properties.name+' '+(f.properties.search_names??'')).includes(normalize(a))));
 const excluded=found.map(f=>{const reason=f.id==='osm-node-1423659712'?'浮島郵便局の読みの一部だけが一致する別自治体・別業態の施設。':f.properties.category==='social_facility'?'名称の一部が同じ福祉施設。業態・住所が対象店舗と異なる。':key==='sukiya'&&f.geometry.coordinates[1]<34.2?'長門市の対象店舗から離れた同系列の別支店。':'';
 assert(reason,'Unreviewed existing-name candidate '+f.id);return{id:f.id,name:f.properties.name,city:f.properties.city,category:f.properties.category,geometry:f.geometry,reason};});
 return {key,aliases,matching_existing_ids:[],excluded_similar_names:excluded,checked_records:all.length};
});
const compare=(point,radius)=>all.map(f=>({id:f.id,name:f.properties.name,category:f.properties.category,address:f.properties.address??'',distance_m:Math.round(Math.hypot((f.geometry.coordinates[0]-point[0])*92000,(f.geometry.coordinates[1]-point[1])*111000))})).filter(f=>f.distance_m<radius).sort((a,b)=>a.distance_m-b.distance_m);
const points=rows.map(r=>({id:r.id,method:r.method,coordinates:r.point,compared_candidates:compare(r.point,150),decision:'候補は名称・業態・住所が異なるため同一店舗へ統合しない。既存IDと座標は維持。'}));
const comparisonOnly=[{name:'旧ユーズボウル萩',point:[131.400981,34.391590]},{name:'旧ジュンテンドー東萩',point:[131.409185,34.414746]}].map(r=>({...r,method:'secondary_article_map_viewport_used_only_as_broad_search_area_never_as_an_adopted_point',radius_m:450,candidates:compare(r.point,450),decision:'候補は福祉施設・飲食店・学校等であり別名称・別業態。対象IDなし。'}));
const articles=read(out+'/article-inputs.json');assert.equal(articles.length,12);
const index=read('data-sources/facility-progress-20260925/article-index.json');
write(pub+'/visual-evidence.json',visual);
write(pub+'/adoptions.json',{additions,point_reviews:points});
write(pub+'/review-inputs.json',{checked_at:'2026-09-25',baseline_records:baseline.length,current_records_before:all.length,article_inventory:articles.map(a=>index.find(r=>r.key===a.key)),targets,comparison_only_searches:comparisonOnly,checks,rejected_points:[{url:rejectedSoil.url,final_url:rejectedSoil.final_url,reason:'SOIL Setodaという別県・別施設。長門湯本へ流用禁止。'}],source_receipts:receipts.map(r=>({url:r.value.url,file:r.file,hash:hash(r.value),status:r.value.status??null,error:r.value.error??null})),before_overlay_hash:hash(before),article_inputs_hash:hash(articles),visual_evidence_hash:hash(visual),extra_jev_requests:0});
console.log(JSON.stringify({articles:articles.length,additions:additions.length,opened:additions.filter(r=>r.properties.freshness_review.event==='opened').length,listed:additions.filter(r=>r.properties.freshness_review.event==='listed').length,points:points.map(p=>({id:p.id,coordinates:p.coordinates,nearby:p.compared_candidates.length}))}));
