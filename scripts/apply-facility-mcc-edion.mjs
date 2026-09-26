import fs from 'node:fs';
import assert from 'node:assert/strict';
import {hash} from './jev-batch.mjs';
import {normalize,htmlText,municipalityIndex} from './facility-bulk-lib.mjs';
import {applyFacilityCurrent} from '../src/facilityFreshness.ts';
const d='outputs/facility-mcc-edion-20260926',p='data-sources/facility-mcc-edion-20260926',checked='2026-09-26';
const R=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,'')),W=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
fs.mkdirSync(p,{recursive:true});
const before=R(d+'/overlay-before.json'),overlay=structuredClone(before),base=['shopping','civic-facilities'].flatMap(n=>R('public/data/'+n+'.geojson').features),current=applyFacilityCurrent(base,before),byId=new Map(base.map(f=>[f.id,f]));
const bounds=municipalityIndex(R('data-sources/prefecture-directed-20260915/municipal-boundaries.geojson').features),distance=(a,b)=>Math.hypot((a[0]-b[0])*92200,(a[1]-b[1])*111000);
assert.equal(before.additions.length,487);assert.equal(before.updates.length,97);
const sources=new Map();
const get=(url,large=false)=>{const path=d+'/sanitized/'+hash(url).slice(0,24)+(large?'-complete':'')+'.json',r=R(path);assert.equal(r.url,url);assert.equal(r.status,200);assert(!r.error);assert.equal(hash(r.html),r.decoded_hash);sources.set(url,{path,hash:hash(r),url});return r;};
const edionPage='https://search.edion.com/e_store/spot/list?address=35&search=address',client=get(edionPage),edir=R(d+'/edion-directory.json'),elist=JSON.parse(get(edir.url).html);
assert(client.html.includes('//search.edion.com/e_store/api/proxy2/shop/list'));assert(client.html.includes("param['exclude-category'] = excludeCategories.join('.')"));
const query=new URL(edir.url).searchParams;assert.equal(query.get('address'),'35');assert.equal(query.get('exclude-category'),'15.11.12.13.14');assert.equal(query.get('ex-code'),'only.prior.notgroupby');assert.equal(query.get('limit'),'100');assert.equal(elist.count.total,62);assert.equal(elist.items.length,62);assert.deepEqual(elist.items,edir.stores);
const mdir=R(d+'/mcc-directory.json'),mreceipt=get(mdir.url,true),mlist=JSON.parse(mreceipt.html).filter(s=>s.address.startsWith('山口県')&&!s.name.includes('岩崎'));assert.equal(mlist.length,15);assert.deepEqual(mlist,mdir.stores);
const plan=R(d+'/review-plan.json');assert.equal(plan.length,77);assert.deepEqual(plan.map(r=>r.brand+':'+r.shop_id).sort(),[...elist.items.map(s=>'edion:'+s.code),...mlist.map(s=>'mcc:'+s.id)].sort());
function inRing([x,y],r){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const[a,b]=r[i],[c,e]=r[j];if((b>y)!==(e>y)&&x<(c-a)*(y-b)/(e-b)+a)inside=!inside;}return inside;}
function contains(g,point){const polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];return polys.some(r=>inRing(point,r[0])&&!r.slice(1).some(h=>inRing(point,h)));}
const decisions=[];
for(const row of plan){
 const r=get(row.url);let name,address,point,location,category;
 if(row.brand==='edion'){
  const listed=elist.items.find(s=>s.code===row.shop_id),raw=JSON.parse(r.html.match(/(?:var )?spotDetail\s*=\s*(\{[^\n]+\});/)[1]);
  const ld=[...r.html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1])).find(s=>s['@type']==='ElectronicsStore');
  assert(ld&&listed);assert.equal(raw.code,row.shop_id);assert.equal(raw.prefectureCode,'35');assert.equal(new URL(row.url).searchParams.get('code'),row.shop_id);assert.equal(raw.name,listed.name);assert.equal(ld.name,listed.name);assert.equal(ld.geo['@type'],'GeoCoordinates');assert.equal(listed.status,'normal');assert(listed.categories.every(c=>['01','02'].includes(c.code)));assert.equal(raw.phone,listed.phone);
  name=raw.name;address=htmlText(raw.addressName);assert.equal(address,htmlText(listed.address_name));point=[+raw.lon,+raw.lat];assert.deepEqual(point,[listed.coord.lon,listed.coord.lat]);assert.deepEqual(point,[ld.geo.longitude,ld.geo.latitude]);assert(normalize(htmlText(r.html)).includes(normalize(address)));assert(!/閉店いた|閉店しま|休業中|閉業/.test(htmlText(r.html)));category='electronics';
  location='公式県内一覧の同じ支店ID・名称・住所・電話・店舗座標と、支店ページspotDetailおよびElectronicsStoreのGeoCoordinatesが一致。住所検索点・地図表示中心は不採用。';
 }else{
  const raw=mlist.find(s=>s.id===row.shop_id);assert(raw);assert([1,30,32].includes(raw.icon));assert.equal(new URL(row.url).searchParams.get('kid'),String(raw.id));assert(new Date(raw.publish_start+'+09:00')<=new Date(checked+'T23:59:59+09:00'));assert.equal(raw.publish_end,null);
  name=htmlText(r.html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]);address=htmlText(r.html.match(/<li class="iconAdd">([\s\S]*?)<div/)[1]);assert.equal(normalize(name),normalize(raw.name));assert.equal(normalize(address),normalize(raw.address));assert(r.html.includes('window.shop = {'));const configured=r.html.match(/"stores": "([^"]+)"/)[1];assert.equal(new URL(configured).pathname,new URL(mdir.url).pathname);
  point=[+r.html.match(/var longitude = ([\d.]+)/)[1],+r.html.match(/var latitude = ([\d.]+)/)[1]];assert(Math.abs(point[0]-raw.longitude)<1e-9&&Math.abs(point[1]-raw.latitude)<1e-9);assert(!/閉店いた|閉店しま|休業中|閉業/.test(htmlText(r.html)));category=name.includes('薬局')?'pharmacy':'drugstore';
  location='公式の支店ID別ページwindow.shopの店舗固有座標を、保存済み公開店舗一覧の同じ支店ID・名称・住所・座標と照合。キャッシュ時刻だけが異なる同一公開データを再利用。';
 }
 assert.equal(row.name,name);assert.equal(row.address,address);assert.deepEqual(row.point,point);assert.equal(row.category,category);assert.deepEqual(bounds.locate(point),[row.city]);assert(normalize(address).includes(normalize(row.city)));
 const containing=current.filter(f=>contains(f.geometry,point)).map(f=>({id:f.id,name:f.properties.name,category:f.properties.category}));
 const review={status:'operating',event:'listed',effective_at:null,checked_at:checked,summary:row.action==='update'?'公式支店名・住所・店舗固有地点と元の同系列施設を照合し、支店情報を補完。':'公式の現行店舗一覧と支店名・住所・店舗固有地点を照合して掲載。',sources:[{title:'公式の当該支店案内・店舗固有座標',url:row.url},{title:'運営会社の公式店舗一覧',url:row.brand==='edion'?edionPage:'https://www.matsukiyococokara-online.com/map'}],limits:['現行掲載の確認であり、新規開店した日を確定した記録ではありません。','店舗代表点であり、店舗入口・館内売場・バス停からの徒歩到達性は未確認。','サイト更新日・掲載開始日・会員サービス開始日を開店日へ転用していません。']};
 if(row.action==='add'){
  assert.equal(row.matches.length,0);assert(!current.some(f=>f.id===row.id||normalize(f.properties.name)===normalize(name)||f.properties.official_url===row.url));
  if(row.brand==='edion'){assert(!row.nearby.some(f=>f.category==='electronics'));assert(!containing.some(f=>f.category==='electronics'));}
  else{assert(!row.nearby.some(f=>['drugstore','pharmacy'].includes(f.category)&&/セガミ|ココカラ/.test(f.name)));assert(!containing.some(f=>['drugstore','pharmacy'].includes(f.category)));}
  overlay.additions.push({type:'Feature',id:row.id,properties:{name,city:row.city,address,official_address:address,official_url:row.url,category,geometry_kind:'representative_point',source:'店舗公式情報',source_ids:['official:'+row.brand+':'+row.shop_id],source_timestamp:checked,verified_at:checked,verification_status:'official_current_listing',license:'official-published-facts',search_names:name,location_verification:location,freshness_review:review},geometry:{type:'Point',coordinates:point}});
 }else if(row.action==='update'){
  assert.equal(row.shop_id,20805483);const id=row.facility_ids[0],f=byId.get(id);assert.equal(id,'osm-node-2748741363');assert.equal(f.properties.name,'マツモトキヨシ');assert.equal(f.properties.category,'pharmacy');assert(f.geometry.type==='Point'&&distance(f.geometry.coordinates,point)<50);assert(!before.updates.some(u=>u.id===id));review.limits.push('元ID・元座標・元source_idsを保持。シーモールの同系列店舗として支店名を補完し、別館リピエのココカラファインと統合しません。');overlay.updates.push({id,expected:{name:f.properties.name,category:f.properties.category,source_ids:f.properties.source_ids,geometry:f.geometry},changes:{name,city:row.city,address,search_names:f.properties.name+' '+name},review});
 }else{
  assert.equal(row.action,'existing_unchanged');assert.equal(row.shop_id,21405568);const old=current.find(f=>f.id==='official-matsukiyo-21405568');assert(old.properties.official_url.includes('21405568'));assert.equal(normalize(old.properties.address),normalize(address));assert(distance(old.geometry.coordinates,point)<30);
 }
 decisions.push({...row,containing_polygons:containing,location_verification:location});
}
const additions=overlay.additions.slice(before.additions.length),updates=overlay.updates.slice(before.updates.length);assert.equal(additions.length,75);assert.equal(updates.length,1);assert.equal(additions.filter(f=>f.id.startsWith('official-edion-')).length,62);assert.equal(additions.filter(f=>f.properties.category==='pharmacy').length,4);applyFacilityCurrent(base,overlay);
const evidence={checked_at:checked,before_overlay_hash:hash(before),after_overlay_hash:hash(overlay),newly_added_ids:additions.map(f=>f.id),corrected_ids:updates.map(f=>f.id),counts:{additions:75,corrections:1,edion_additions:62,mcc_additions:13,existing_unchanged:1,held:0},directory_counts:{edion:62,mcc_non_iwasaki:15},sources:[...sources.values()],article_scope:'All previous article decisions, dates and known cases are unchanged. Current listings never complete article histories. Absent directory entries never prove closure.',efficiency:'Reused the 9.1MB official MCC nationwide dataset and indexed stored URLs before new requests. One official Edion prefecture request with documented defaults and limit returned all 62 stores, then independently verified each branch against JSON-LD and shop-specific data. 77 stores in one implementation/build/save batch.',limitations:['75 additions are current listings, not 75 proven openings. New opening dates remain null.','One Matsukiyo branch-name correction preserves original ID, point and source_ids.','The existing Co-op Cocoto Izumi branch is unchanged despite a 29m official point difference.','Edion Tokusa is within shopping center Apia, a separate store from nearby Wants and its Watts section.','MCC listings do not resolve former Segami sites or absent Kokokara Shimonoseki Ikuno; the prior Yuda-nishi/Segami hold remains unchanged.'],extra_jev_requests:0};
W(p+'/adoption-evidence.json',evidence);W(p+'/reviewed-stores.json',decisions);W(p+'/batch.json',{checked_at:checked,additions,updates});assert([hash(before),hash(overlay)].includes(hash(R('public/data/facility-current.json'))),'Unrelated changes');if(process.argv.includes('--apply'))W('public/data/facility-current.json',overlay);console.log(JSON.stringify(evidence.counts));
