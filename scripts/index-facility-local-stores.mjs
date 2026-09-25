import fs from 'node:fs';
import assert from 'node:assert/strict';
import {hash} from './jev-batch.mjs';
import {htmlText,httpLinks,normalize,anchor,municipalityIndex} from './facility-bulk-lib.mjs';
import {placePosition} from './facility-evidence-lib.mjs';
import {applyFacilityCurrent} from '../src/facilityFreshness.ts';
const d='outputs/facility-local-stores-20260925',read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const ref=url=>{const file=d+'/pages/'+hash(new URL(url).href).slice(0,24)+'.json';const r=read(file);assert(!r.error&&r.status===200);return {file,r,sha256:hash(r)};};
const home='https://www.karatoharete.com/',market='https://www.karatoichiba.com/stores/';
const base=['shopping.geojson','civic-facilities.geojson'].flatMap(n=>read('public/data/'+n).features);
const overlay=read('public/data/facility-current.json'),all=applyFacilityCurrent(base,overlay);
const dist=(a,b)=>Math.round(Math.hypot((a[0]-b[0])*Math.cos(a[1]*Math.PI/180)*111320,(a[1]-b[1])*111320));
const bounds=municipalityIndex(read('data-sources/prefecture-directed-20260915/municipal-boundaries.geojson').features);
const murl=read(d+'/followups-plan.json').find(p=>p.url.includes('/maps/embed?')).url,mp=placePosition(murl,ref(murl).r);assert(mp?.name.includes('Karato Fish Market'));
const hurl=httpLinks(ref(home).r.html,home).find(u=>u.startsWith('https://www.google.com/maps/dir/'));
const hm=hurl?.match(/!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)/);assert(hm,'No route destination point');
const positions={market:{...mp,url:murl,source:'https://www.karatoichiba.com/access/',receipt:ref(murl).file,receipt_hash:ref(murl).sha256},harete:{name:'唐戸はれて横丁（中之町1-16）',coordinates:[Number(hm[1]),Number(hm[2])],method:'official_route_destination_not_viewport',url:hurl,source:home,receipt:ref(home).file,receipt_hash:ref(home).sha256}};
for(const p of Object.values(positions))assert.deepEqual(bounds.locate(p.coordinates),['下関市']);
const records=[];
for(const s of read(d+'/market-directory.json')){
 const p=ref(s.url),text=htmlText(p.r.html).replace(/\0/g,''),table=p.r.html.match(/<table class="company_information">([\s\S]*?)<\/table>/)?.[1];assert(table);
 const info=Object.fromEntries([...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/g)].map(m=>[htmlText(m[1]),htmlText(m[2])]));
 assert(text.includes(s.name));
 records.push({...s,group:'market_current',company:info['会社名'],phone:info.TEL,body:text.split('このページの上へ')[0],coordinates:mp.coordinates,address:'山口県下関市唐戸町5-50 唐戸市場場内',location_basis:'complex_representative_not_shop_unit',receipt:p.file,receipt_hash:p.sha256});
}
const hrefs=[...read(d+'/directories-plan.json'),...read(d+'/followups-plan.json')].filter(p=>p.url.startsWith(home));
for(const p of hrefs){
 if(records.some(r=>r.url===p.url))continue;
 const source=ref(p.url),text=htmlText(source.r.html).replace(/\0/g,''),name=htmlText(source.r.html.match(/<title>([\s\S]*?)<\/title>/)?.[1]??'').split('|')[0].trim();assert(name&&!/coming soon/i.test(name));
 const body=text.split('軽食・喫茶　オネット').at(-1).split('唐戸はれて横丁 MAP')[0];
 records.push({id:'harete-'+hash(new URL(p.url).href).slice(0,12),url:p.url,name,group:'harete_current',directory_sources:[p.source],directory_label:p.directory_label,body,coordinates:positions.harete.coordinates,address:'山口県下関市中之町1-16 唐戸はれて横丁',location_basis:'complex_representative_not_shop_unit',receipt:source.file,receipt_hash:source.sha256});
}
const grad=ref(home+'卒業生'),text=htmlText(grad.r.html).replace(/[\u200b\0]/g,'');
const names=['カラオケBAR　いいやん','DーDAY','マジックバー　WAKADAN','焼き鳥とワイン　トリップ','寿司　響','ステーキ山本','THE　ZUBAGHETTI','居酒屋　遊こうぎょう','串揚げ酒場　縁','お米とお肉と咖喱　Curry Full','Tokidoki'];
for(let i=0;i<names.length;i++){
 const start=text.indexOf(names[i]),end=i+1<names.length?text.indexOf(names[i+1]):text.indexOf('こうした卒業生');assert(start>=0&&end>start);
 records.push({id:'harete-graduate-'+String(i+1).padStart(2,'0'),url:home+'卒業生',name:names[i],group:'harete_graduate',body:text.slice(start,end).trim(),coordinates:null,location_basis:'relocated_not_at_former_complex',receipt:grad.file,receipt_hash:grad.sha256});
}
for(const r of records){
 const n=normalize(r.name);r.existing_candidates=all.filter(f=>{const fn=normalize(f.properties.name);return fn.length>=3&&n.length>=3&&(fn.includes(n)||n.includes(fn));}).map(f=>({id:f.id,name:f.properties.name,category:f.properties.category,city:bounds.locate(anchor(f.geometry)),coordinates:anchor(f.geometry),distance_m:r.coordinates?dist(r.coordinates,anchor(f.geometry)):null}));
 r.nearby=r.coordinates?all.map(f=>({id:f.id,name:f.properties.name,category:f.properties.category,distance_m:dist(r.coordinates,anchor(f.geometry))})).filter(f=>f.distance_m<180).sort((a,b)=>a.distance_m-b.distance_m):[];
 r.same_directory_names=records.filter(o=>o.id!==r.id&&normalize(o.name)===n).map(o=>({id:o.id,name:o.name,company:o.company,phone:o.phone}));
}
const save=(name,value)=>{const f=d+'/'+name,t=JSON.stringify(value,null,2)+'\n';if(fs.existsSync(f))assert.equal(fs.readFileSync(f,'utf8'),t,'Frozen batch input changed: '+name);else fs.writeFileSync(f,t);};
save('facility-current-before.json',overlay);save('positions.json',positions);save('records.json',records);
console.log(JSON.stringify({records:records.length,groups:Object.fromEntries([...new Set(records.map(r=>r.group))].map(g=>[g,records.filter(r=>r.group===g).length])),same_name_candidates:records.filter(r=>r.existing_candidates.length).map(r=>({name:r.name,candidates:r.existing_candidates})),directory_duplicate_names:records.filter(r=>r.same_directory_names.length).map(r=>r.name)}));
