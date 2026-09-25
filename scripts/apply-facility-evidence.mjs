import fs from 'node:fs';
import assert from 'node:assert/strict';
import {hash}from'./jev-batch.mjs';
import {normalize,municipalityIndex}from'./facility-bulk-lib.mjs';
import {applyFacilityCurrent}from'../src/facilityFreshness.ts';
const d='outputs/facility-evidence-20260925',publicDir='data-sources/facility-evidence-20260925',read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const adopted=read(publicDir+'/adoptions.json'),positions=read(d+'/positions.json'),target='public/data/facility-current.json';
const canon=u=>decodeURI(u).replace(/\/$/,'');
const receipts=['pages','followups'].flatMap(sub=>fs.readdirSync(d+'/'+sub).map(f=>({file:d+'/'+sub+'/'+f,value:read(d+'/'+sub+'/'+f)})));
const source=u=>{const r=receipts.find(r=>canon(r.value.url)===canon(u)&&r.value.status===200&&!r.value.error);if(!r)throw Error('Missing primary receipt: '+u);return{url:u,receipt:r.file,sha256:hash(r.value)};};
const base=['shopping.geojson','civic-facilities.geojson'].flatMap(n=>read('public/data/'+n).features);
const bounds=municipalityIndex(read('data-sources/prefecture-directed-20260915/municipal-boundaries.geojson').features);
const beforeFile=d+'/facility-current-before.json';
if(!fs.existsSync(beforeFile))fs.copyFileSync(target,beforeFile,fs.constants.COPYFILE_EXCL);
const before=read(beforeFile),overlay=structuredClone(before),checked=adopted.checked_at,evidence=[];
assert.equal(checked,overlay.checked_at);
for(const a of adopted.closures){const f=base.find(f=>f.id===a.id);assert.equal(f?.properties.name,a.expected_name);assert(!overlay.updates.some(u=>u.id===a.id));
 overlay.updates.push({id:a.id,expected:{name:f.properties.name,category:f.properties.category,source_ids:f.properties.source_ids,geometry:f.geometry},changes:{},review:{status:'closed',event:'closed',effective_at:a.date,checked_at:checked,summary:'運営会社の支店別閉店告知で山の田店の営業終了日を確認しました。',sources:[{title:'ロイヤルホスト・蛍茶屋店／山の田店／千田町店の閉店告知',url:a.source}],limits:['他の支店の閉店日を転用していません。元データのID・代表点を維持しています。']}});
 evidence.push({id:a.id,decision:'adopt_closure',identity:a.identity,sources:[source(a.source)]});
}
for(const a of adopted.additions){
 const ps=positions.filter(p=>canon(p.source)===canon(a.position_source)&&JSON.stringify(p.coordinates)===JSON.stringify(a.coordinates));assert(ps.length,'Missing exact linked position: '+a.id);
 const pos=ps.find(p=>p.method==='named_embed_place_record')??ps[0];assert.deepEqual(bounds.locate(a.coordinates),[a.city]);
 const names=[a.name,...(a.aliases??'').split(' ').filter(n=>n.length>=4)].map(normalize);
 const matches=base.concat(before.additions).filter(f=>names.includes(normalize(f.properties.name)));
 assert.equal(matches.length,0,'Existing exact name needs review, not a duplicate addition: '+a.id);
 const location=a.location_note??'公式サイトから案内された地図の店舗・住所代表点。画面中心を座標として使用していません。入口・徒歩到達性は未確認です。';
 const sources=[{title:'現行の公式店舗・施設案内',url:a.official_url}];if(a.event_source)sources.push({title:'運営会社の開店発表',url:a.event_source});sources.push({title:'公式サイトが案内する所在地の地図',url:pos.map_url});
 const review={status:'operating',event:a.date?'opened':'listed',effective_at:a.date,checked_at:checked,summary:a.date?'公式の開店情報と現行の店舗案内を確認して、新しく掲載しました。':'公式の名称・所在地・施設案内を確認して、新しく掲載しました。開店日の確認とは区別しています。',sources,limits:[location,'公式サイトの掲載内容を確認した記録で、営業時間のリアルタイム保証ではありません。',...(a.extra_limits??[])]};
 overlay.additions.push({type:'Feature',id:a.id,properties:{name:a.name,city:a.city,official_address:a.address,address:a.address,official_url:a.official_url,category:a.category,geometry_kind:'representative_point',source:'店舗公式情報',source_ids:['official:'+a.id.replace(/^official-/,'').replaceAll('-',':')],source_timestamp:checked,verified_at:checked,verification_status:'official_current_listing',license:'official-published-facts',search_names:a.aliases??a.name,location_verification:location,freshness_review:review},geometry:{type:'Point',coordinates:a.coordinates}});
 evidence.push({id:a.id,name:a.name,decision:a.date?'adopt_opening':'adopt_current_listing',identity:a.identity,operator_group:a.operator_group,sources:[source(a.official_url),...(a.event_source?[source(a.event_source)]:[])],position:{method:pos.method,url:pos.map_url,coordinates:pos.coordinates,receipt:pos.receipt,sha256:pos.receipt_hash},nearest_before:pos.nearest});
}
const current=applyFacilityCurrent(base,overlay),existing=read(target);
if(hash(existing)!==hash(before)&&hash(existing)!==hash(overlay))throw Error('Overlay has unrelated changes; do not overwrite');
fs.writeFileSync(target,JSON.stringify(overlay,null,2)+'\n');
const summary={checked_at:checked,baseline_count:base.length,before_count:base.length+before.additions.length,after_count:current.length,changes_this_batch:{closures:adopted.closures.length,new_opening_date_confirmed:adopted.additions.filter(a=>a.date).length,new_current_listing_date_unknown:adopted.additions.filter(a=>!a.date).length,total:adopted.closures.length+adopted.additions.length},cumulative_overlay:{updates:overlay.updates.length,additions:overlay.additions.length},before_overlay_hash:hash(before),after_overlay_hash:hash(overlay),adoptions_hash:hash(adopted),evidence};
fs.writeFileSync(publicDir+'/adoption-evidence.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({...summary,evidence:undefined},null,2));
