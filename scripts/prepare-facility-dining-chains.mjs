import fs from 'node:fs';
import assert from 'node:assert/strict';
import {hash} from './jev-batch.mjs';
import {normalize,htmlText} from './facility-bulk-lib.mjs';
import {namedShopPoint} from './facility-dining-chains-lib.mjs';
import {applyFacilityCurrent} from '../src/facilityFreshness.ts';
const pub='data-sources/facility-dining-chains-20260925',out='outputs/facility-dining-chains-20260925';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const before=read(out+'/before-overlay.json'),base=['shopping.geojson','civic-facilities.geojson'].flatMap(f=>read('public/data/'+f).features),all=applyFacilityCurrent(base,before);
assert.equal(base.length,7764);assert.equal(all.length,7929);
const receipts=fs.readdirSync(out+'/pages').map(f=>({file:out+'/pages/'+f,value:read(out+'/pages/'+f)}));
const get=url=>{const r=receipts.find(r=>r.value.url===url)?.value;assert(r);assert.equal(r.status,200);return r;};
const nav=(url,code,name,address)=>({url,code,name,address,variable:'spotDetailBean',idKey:'code',addressKey:'addressName',lonKey:'lon'});
const specs=[
 {key:'onoda',id:'official-matsuya-2122',city:'山陽小野田市',aliases:['松屋','松のや','matsuya','matsunoya'],spec:nav('https://pkg.navitime.co.jp/matsuyafoods/spot/detail?code=0000002122','0000002122','松屋 山陽小野田店（松のや併設）','山口県山陽小野田市中央一丁目3番46号'),limits:['松屋・松のやの複合店舗を1施設として掲載します。','記事の2024年7月26日と運営者の事前発表の7月28日が異なり、施工会社の7月26日は竣工日です。実開店日は未確認です。'],extra:['https://prtimes.jp/main/html/rd/p/000000635.000047538.html','https://cados.jp/results/2197/']},
 {key:'shinyama',id:'official-matsuya-2276',city:'山口市',aliases:['松屋','松のや','matsuya','matsunoya'],spec:nav('https://pkg.navitime.co.jp/matsuyafoods/spot/detail?code=0000002276','0000002276','松屋 新山口駅前店（松のや併設）','山口県山口市小郡黄金町13番39号'),limits:['松屋・松のやの複合店舗を1施設として掲載します。','記事の13-13ではなく、同一支店ID・電話番号の現行公式住所13番39号を採用しました。実開店日は未確認です。'],extra:[]},
 {key:'yoshi',id:'official-yoshinoya-062592',city:'宇部市',aliases:['吉野家','yoshinoya'],spec:nav('https://stores.yoshinoya.com/yoshinoya/spot/detail?code=ysn_062592','ysn_062592','吉野家 宇部昭和町店','山口県宇部市昭和町２丁目６７３－５'),limits:['記事の373-5ではなく、同一支店ID・電話番号の現行公式住所673-5を採用しました。実開店日は未確認です。','公式に9月28日3～5時のメンテナンス休業予告があります。短時間の休業予告を恒久的な閉店として扱いません。'],extra:[]},
 {key:'sushi',id:'official-sushiro-2516',city:'光市',aliases:['スシロー','sushiro'],spec:{url:'https://www.akindo-sushiro.co.jp/shop/detail.php?id=2516',code:'2516',name:'光浅江店',address:'浅江5丁目14番25号',variable:'item',idKey:'id',addressKey:'address',lonKey:'lng'},displayName:'スシロー 光浅江店',officialAddress:'山口県光市浅江5丁目14番25号',limits:['公式ニュースには同じ支店ID・住所の2022年2月10日開店記録があります。記事の2026年2月10日を新規開店日には採用せず、2026年の変更有無は未確認にしています。'],extra:['https://www.akindo-sushiro.co.jp/news/detail.php?id=2595','https://www.akindo-sushiro.co.jp/news/?page=16']}
];
const press=get('https://prtimes.jp/main/html/rd/p/000000635.000047538.html');
assert(htmlText(press.html).includes('2024年7月28日'));
const hama=get('https://maps.hama-sushi.co.jp/jp/detail/5747.html');
const hj=JSON.parse(hama.html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/)[1]);
assert.equal(hj.name,'はま寿司 新下関店');assert.equal(hj.address.streetAddress,'秋根西町二丁目8-25');assert.equal(hj.url,hama.url);
const hamaPoint=[Number(hj.geo.longitude),Number(hj.geo.latitude)];
const distance=(a,b)=>Math.hypot((a[0]-b[0])*92000,(a[1]-b[1])*111000);
const near=point=>all.map(f=>({id:f.id,name:f.properties.name,category:f.properties.category,address:f.properties.address??'',distance_m:Math.round(distance(point,f.geometry.coordinates))})).filter(f=>f.distance_m<180).sort((a,b)=>a.distance_m-b.distance_m);
const location='公式の支店名・住所に対応する店舗代表点です。入口・徒歩到達性は未確認です。';
const pointReviews=[],targets=[];
const additions=specs.map(r=>{
 const receipt=get(r.spec.url),point=namedShopPoint(receipt,r.spec);
 const candidates=all.filter(f=>r.aliases.some(a=>normalize(f.properties.name+' '+(f.properties.search_names??'')).includes(normalize(a))));
 assert(candidates.every(f=>distance(point,f.geometry.coordinates)>500),'Existing candidate requires identity review');
 targets.push({key:r.key,aliases:r.aliases,matching_existing_ids:[],excluded_same_chain:candidates.map(f=>({id:f.id,name:f.properties.name,coordinates:f.geometry.coordinates,distance_m:Math.round(distance(point,f.geometry.coordinates)),reason:'別支店。対象店の座標・市域または公式住所と異なり500m超離れている。'}))});
 const compared=near(point);assert(compared.every(f=>!r.aliases.some(a=>normalize(f.name).includes(normalize(a)))));
 pointReviews.push({id:r.id,method:'official_named_branch_data_top_level_coordinates',spec:r.spec,coordinates:point,compared_candidates:compared,decision:'近隣施設は別名称・別業態。元IDと座標を保持して独立施設を追加。'});
 const name=r.displayName??r.spec.name,address=r.officialAddress??r.spec.address;
 return {type:'Feature',id:r.id,properties:{name,city:r.city,address,official_address:address,official_url:r.spec.url,category:'fast_food',geometry_kind:'representative_point',source:'店舗公式情報',source_ids:['official:'+r.id.slice(9).replaceAll('-',':')],source_timestamp:'2026-09-25',verified_at:'2026-09-25',verification_status:'official_current_listing',license:'official-published-facts',search_names:name+(r.key==='onoda'?' 松のや 山陽小野田店':r.key==='shinyama'?' 松のや 新山口駅前店':''),location_verification:location,freshness_review:{status:'operating',event:'listed',effective_at:null,checked_at:'2026-09-25',summary:'現行の公式店名・住所・支店IDと、その支店の代表点を照合しました。',sources:[{title:'現行の公式店舗情報',url:r.spec.url},...r.extra.map(url=>({title:'運営元・施工会社の時点照合資料',url}))],limits:[location,...r.limits,'現行掲載の確認であり、リアルタイムの営業を保証しません。']}},geometry:{type:'Point',coordinates:point}};
});
const old=base.find(f=>f.id==='osm-way-1463857376');assert(old);assert.equal(old.properties.website,hama.url);assert(old.properties.search_names.includes('新下関店'));assert(distance(old.geometry.coordinates,hamaPoint)<25);assert(!before.updates.some(u=>u.id===old.id));
pointReviews.push({id:old.id,method:'existing_id_branch_website_and_name_agree_official_jsonld_within_25m',coordinates:old.geometry.coordinates,official_comparison_point:hamaPoint,compared_candidates:near(hamaPoint),decision:'同一支店。元ID・元座標・元source_idsを保持し、名称・住所・市を更新。新規追加しない。'});
targets.push({key:'hama',aliases:['はま寿司','hama-sushi','hamasushi'],matching_existing_ids:[old.id]});
const updates=[{id:old.id,expected:{name:old.properties.name,category:old.properties.category,source_ids:old.properties.source_ids,geometry:old.geometry},changes:{name:'はま寿司 新下関店',city:'下関市',address:'山口県下関市秋根西町二丁目8-25',search_names:old.properties.search_names+' はま寿司 新下関店'},review:{status:'operating',event:'listed',effective_at:null,checked_at:'2026-09-25',summary:'既存データの支店URL・名称と現行公式情報を照合し、同じIDの住所と支店名を補完しました。',sources:[{title:'はま寿司 新下関店の現行公式情報',url:hama.url}],limits:['元のOSM ID・出典・代表点を保持しています。入口と徒歩到達性は未確認です。','2024年9月5日は開店前の記事・告知の記載で、実開店日は未確認です。','公式の毎日の閉店時刻・店舗検索メンテナンス・将来の営業時間変更を、店舗の恒久的な閉店と扱いません。']}}];
const articles=read(out+'/article-inputs.json'),index=read('data-sources/facility-progress-20260925/article-index.json');assert.equal(articles.length,9);
write(pub+'/adoptions.json',{additions,updates,point_reviews:pointReviews});
write(pub+'/review-inputs.json',{checked_at:'2026-09-25',article_inventory:articles.map(a=>index.find(x=>x.key===a.key)),before_overlay_hash:hash(before),article_inputs_hash:hash(articles),baseline_records:base.length,current_records_before:all.length,targets,source_receipts:receipts.map(r=>({url:r.value.url,file:r.file,hash:hash(r.value),status:r.value.status??null,error:r.value.error??null})),extra_jev_requests:0});
console.log(JSON.stringify({articles:articles.length,additions:additions.length,updates:updates.length,points:pointReviews.map(p=>({id:p.id,point:p.coordinates}))}));
