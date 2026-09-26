import fs from 'node:fs';import assert from 'node:assert/strict';
import {hash} from './jev-batch.mjs';import {anchor,htmlText} from './facility-bulk-lib.mjs';import {autobacsPoint} from './facility-konankaiten-lib.mjs';import {applyFacilityCurrent,facilityAvailable} from '../src/facilityFreshness.ts';
const d='outputs/facility-konankaiten-20260925',pub='data-sources/facility-konankaiten-20260925',target='public/data/facility-current.json',checked='2026-09-25';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),save=(f,j)=>fs.writeFileSync(f,JSON.stringify(j,null,2)+'\n');
const paths={overlay:target,cases:'data-sources/facility-workboard-20260925/case-reviews.json',articles:'data-sources/facility-progress-20260925/article-event-reviews.json'};
for(const [key,path] of Object.entries(paths))if(!fs.existsSync(d+'/'+key+'-before.json'))fs.copyFileSync(path,d+'/'+key+'-before.json',fs.constants.COPYFILE_EXCL);
const before=read(d+'/overlay-before.json'),overlay=structuredClone(before),cases=read(d+'/cases-before.json'),articles=read(d+'/articles-before.json');
assert.equal(before.updates.length,30);assert.equal(before.additions.length,172);
const base=['shopping.geojson','civic-facilities.geojson'].flatMap(n=>read('public/data/'+n).features),current=applyFacilityCurrent(base,before);
const input=read(d+'/autobacs-store-dom.json'),news=read(d+'/autobacs-anniversary-dom.json'),point=autobacsPoint(input);
assert.equal(news.url,input.url+'/news/1000000201395');assert.equal(news.published_text,'公開日：2026/9/15');assert(news.text.includes('今月で１周年'));
const release=read(d+'/pages/5067f14861c7937bbb2782fd.json');assert.equal(release.status,200);assert.equal(hash(release.html),release.decoded_hash);
assert(htmlText(release.html).includes('2025年9月4日'));assert(htmlText(release.html).includes('旧店舗から南東に約300m'));
const namedMatches=current.filter(f=>/オートバックス|autobacs/i.test(JSON.stringify(f)));assert.equal(namedMatches.length,0,'Existing brand record requires identity review');
const distance=(a,b)=>Math.hypot((a[0]-b[0])*Math.cos(a[1]*Math.PI/180)*111320,(a[1]-b[1])*111320);
const nearest=current.map(f=>({id:f.id,name:f.properties.name,category:f.properties.category,distance_m:Math.round(distance(point,anchor(f.geometry)))})).sort((a,b)=>a.distance_m-b.distance_m).slice(0,12);
const id='official-autobacs-380064',address='山口県宇部市大字妻崎開作860-1',name='オートバックス 宇部厚南';
const sources=[{title:'運営会社の宇部厚南店案内・店別地図',url:input.url},{title:'移転後1周年の店舗告知（2026-09-15）',url:news.url},{title:'移転前の発表（2025-09-03）',url:release.url}];
const feature={type:'Feature',id,geometry:{type:'Point',coordinates:point},properties:{name,category:'car_service',city:'宇部市',official_address:address,official_url:input.url,address,website:input.url,search_names:name+' オートバックス宇部厚南店 カー用品 整備',source:'店舗公式情報',source_ids:['official:autobacs:380064'],source_timestamp:checked,retrieved_at:checked,verified_at:checked,verification_status:'official_current_listing',license:'official-published-facts',geometry_kind:'representative_point',geometry_note:'公式店舗ページの支店名付き地図の代表点。入口の確認ではありません。',location_verification:'公式支店380064の店名・住所・電話番号と、支店名付き埋込地図のq座標を照合。建物や同住所の他店舗の座標を代用していません。',freshness_review:{status:'operating',event:'listed',effective_at:null,checked_at:checked,summary:'移転先の公式住所・店別地図と、移転後1周年の案内を照合し、現在の店舗を掲載しました。',sources,limits:['2025年9月4日は移転前の発表上の予定日です。1周年告知は日単位の実施日を示さないため、実開店日は未確認として保持しています。','旧地点の店舗IDは既存7,936記録から見つからず、同じ敷地の他施設や旧マクドナルドは変更していません。','座標は公式の店舗代表点であり、現地入口や徒歩経路の確認ではありません。']}}};
overlay.additions.push(feature);const after=applyFacilityCurrent(base,overlay);
const caseResults=[
{case_id:'case:autobacs-ube-konan',status:'supplemental',map_outcome:'current_listing_added',facility_ids:[id],reason:'公式の移転先住所・支店名付き地図と移転後1周年告知で現在掲載を反映。実開店日だけは継続保留。',nearest,existing_name_matches:[]},
{case_id:'case:mcd-ube-konan',status:'map_action',facility_ids:['osm-way-477623030','official-mcdonalds-35538'],reason:'旧35003の公式店別・採用URLは現在一覧トップに転送。消滅は閉店の直接証拠ではないため未採用。現店舗35538は既掲載。',next:'旧支店を特定できる運営元の移転・営業終了告知、または読める店頭告知原文が新たに得られた場合に再開。同じ旧URLと一般検索は繰り返さない。'},
{case_id:'legacy:4',status:'map_action',facility_ids:['osm-way-465881162'],reason:'会社サイト内の大内御堀検索は季節メニューのみ。2026-01-04は二次情報で、店別公式閉店告知を得られず未採用。',next:'運営会社の店別閉店告知・掲示原文が新たに得られた場合に再開。公式一覧の不掲載や同じサイト内検索だけで閉店にしない。'},
{case_id:'facility:osm-way-1236531275',status:'map_action',facility_ids:['osm-way-1236531275'],reason:'保存済み公式の店別掲載と、2026年8月閉店という利用者情報が相反。支店固有の一次閉店情報を得られず未採用。',next:'新下関店自身の営業終了告知・掲示原文、または運営元の訂正が得られた場合に再開。同じ公式掲載を再取得して解決扱いにしない。'}
];
const refs=[
{path:d+'/autobacs-store-dom.json',url:input.url,hash:hash(input)},
{path:d+'/autobacs-anniversary-dom.json',url:news.url,hash:hash(news)},
...['5067f14861c7937bbb2782fd','bf41b29b1ef5dc054bb78c57','a4a0c11e817458ae0caf1af5','b00325c7992ee28e78ca9576','68a8ff3df3ff5776e05a2a76'].map(n=>{const p=d+'/pages/'+n+'.json',r=read(p);return {path:p,url:r.url,hash:hash(r),status:r.status,final_url:r.final_url,error:r.error}}),
{path:'outputs/facility-progress-20260925/pages/9ae0123372fd2215d398c5f3.json',url:'https://2929udon.co.jp/shop/',hash:hash(read('outputs/facility-progress-20260925/pages/9ae0123372fd2215d398c5f3.json'))}
];
save(pub+'/reviewed-inputs.json',{store:input,anniversary:news});
const adopted={checked_at:checked,updates:[],additions:[feature]};save(pub+'/batch.json',adopted);
const evidence={checked_at:checked,before_overlay_hash:hash(before),after_overlay_hash:hash(overlay),batch_hash:hash(adopted),reviewed_inputs_hash:hash(read(pub+'/reviewed-inputs.json')),extra_jev_requests:0,cumulative:{updates:30,additions:173,total:after.length,normal_candidates:after.filter(f=>f.properties.category!=='reference'&&facilityAvailable(f)).length,closed:after.filter(f=>f.properties.freshness_review?.status==='closed').length,duplicate_records:after.filter(f=>f.properties.duplicate_of).length},sources:refs,cases:caseResults};save(pub+'/adoption-evidence.json',evidence);
const article=articles.find(a=>a.article_key==='ube-81345'),event=article.events.find(e=>e.event_id==='ube-81345:autobacs-relocation');
event.previous_assessment={disposition:event.disposition,facility_ids:event.facility_ids,reason:event.reason};
Object.assign(event,{disposition:'reflected_addition',facility_ids:[id],reason:'移転先の現行支店住所・店別地点を確認し、移転後1周年の公式案内も照合して掲載。旧店舗IDは既存台帳に見当たらない。日単位の実開店日は別イベントで保留。',source_urls:[...event.source_urls,input.url,news.url]});
const dateEvent={event_id:'ube-81345:autobacs-opening-date',event_type:'opening',facility_ids:[id],disposition:'hold',effective_at:null,reason:'2025-09-04は移転前発表の予定日。現行掲載と1周年告知は確認済みだが、当日の実開店を裏付ける一次情報は未確認。',source_urls:[release.url,input.url,news.url]};article.events.push(dateEvent);
for(let n=0;n<caseResults.length;n++){const finding=caseResults[n],c=cases.cases.find(c=>c.case_id===finding.case_id),ref={path:pub+'/adoption-evidence.json',section:'cases',index:n,hash:hash(finding)};c.evidence_refs??=[];c.evidence_refs.push(ref);
 if(n===0){c.facility_ids=[id];const i=c.issues.find(i=>i.impact==='map_action');i.previous_assessment={impact:i.impact,priority:i.priority,reason:i.reason,next:i.next,event_ids:i.event_ids};Object.assign(i,{impact:'resolved',priority:'P3',reason:finding.reason,next:'現在の店舗掲載を維持。日付の補足だけを別課題で保持。',event_ids:[],resolution:{checked_at:checked,reason:finding.reason,outcome:'current_listing_added',evidence_ref:ref}});const issue={issue_id:c.case_id+':opening-date',impact:'supplemental',priority:'P3',reason:dateEvent.reason,next:'当日の開店または日付を明示する事後公式案内が得られた場合に補完。',event_ids:[dateEvent.event_id]};c.issues.push(issue);cases.event_bindings=cases.event_bindings.filter(b=>b.event_id!==event.event_id);cases.event_bindings.push({event_id:dateEvent.event_id,event_hash:hash(dateEvent),case_id:c.case_id,issue_id:issue.issue_id});}
 else{c.review_attempts??=[];c.review_attempts.push({checked_at:checked,finding:finding.reason,next: finding.next,evidence_ref:ref});c.issues.find(i=>i.impact==='map_action').next=finding.next;}
}
save(pub+'/article-reviews.json',[article]);save(d+'/proposed-cases.json',cases);save(d+'/proposed-articles.json',articles);save(d+'/proposed-overlay.json',overlay);
for(const [k,v]of Object.entries({overlay,cases,articles}))assert([hash(read(d+'/'+k+'-before.json')),hash(v)].includes(hash(read(paths[k]))),'Unrelated edits: '+k);
if(process.argv.includes('--apply'))for(const[k,v]of Object.entries({overlay,cases,articles}))save(paths[k],v);
console.log(JSON.stringify({applied:process.argv.includes('--apply'),point,cumulative:evidence.cumulative,findings:caseResults.map(c=>({case_id:c.case_id,status:c.status})),extra_jev_requests:0}));
