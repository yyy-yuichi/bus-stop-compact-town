import fs from 'node:fs';import assert from 'node:assert/strict';
import {hash} from './jev-batch.mjs';import {htmlText,anchor} from './facility-bulk-lib.mjs';import {halowsBatchPoint,norm} from './facility-halows-lib.mjs';import {applyFacilityCurrent,facilityAvailable} from '../src/facilityFreshness.ts';
const d='outputs/facility-halows-20260925',pub='data-sources/facility-halows-20260925',checked='2026-09-25',R=p=>JSON.parse(fs.readFileSync(p,'utf8')),W=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const paths={overlay:'public/data/facility-current.json',articles:'data-sources/facility-progress-20260925/article-event-reviews.json',cases:'data-sources/facility-workboard-20260925/case-reviews.json'};
for(const[k,p]of Object.entries(paths))if(!fs.existsSync(d+'/'+k+'-before.json'))fs.copyFileSync(p,d+'/'+k+'-before.json',fs.constants.COPYFILE_EXCL);
const before=R(d+'/overlay-before.json'),overlay=structuredClone(before),articles=R(d+'/articles-before.json'),cases=R(d+'/cases-before.json');assert.equal(before.additions.length,173);assert.equal(before.updates.length,30);
const specs=R(pub+'/store-specs.json'),base=['shopping','civic-facilities'].flatMap(n=>R('public/data/'+n+'.geojson').features),current=applyFacilityCurrent(base,before),page=n=>R(d+'/pages/'+n+'.json');
const inputs=[],additions=[],nearby=[];
for(const s of specs){
 const r=page(s.store),m=page(s.map);assert.equal(r.status,200);assert.equal(m.status,200);assert.equal(r.url,s.url);assert.equal(hash(r.html),r.decoded_hash);assert.equal(hash(m.html),m.decoded_hash);
 const text=htmlText(r.html);assert(norm(text).includes(norm(s.address)),s.id+' address');assert(norm(text).includes(norm(s.heading)));
 const frames=[...r.html.matchAll(/<iframe[^>]*src=["']([^"']+)["']/g)].map(x=>x[1].replaceAll('&amp;','&').replaceAll('&#038;','&'));
 assert(frames.some(u=>new URL(u).href===new URL(m.url).href),'Embed must be linked by official branch');
 const markers=[...m.html.matchAll(/\["(0x[a-f\d]+:0x[a-f\d]+)","([^"]+)",\[([\d.]+),([\d.]+)\],"\d+"\]/g)].filter(x=>x[1]===s.cid);
 if(s.cid)assert.equal(markers.length,1);
 const input={id:s.id,url:r.url,status:r.status,heading:s.heading,address:s.address,map_url:m.url,...(s.cid?{marker:{cid:markers[0][1],label:markers[0][2],point:[+markers[0][4],+markers[0][3]]}}:{})};
 const point=halowsBatchPoint(input,s);inputs.push(input);
 const near=current.map(f=>({id:f.id,name:f.properties.name,category:f.properties.category,distance_m:Math.round(Math.hypot((anchor(f.geometry)[0]-point[0])*Math.cos(point[1]*Math.PI/180)*111320,(anchor(f.geometry)[1]-point[1])*111320))})).filter(f=>f.distance_m<=260).sort((a,b)=>a.distance_m-b.distance_m);
 nearby.push({id:s.id,nearby:near,decision:'別支店・異業種・併設店のIDは変更しない。既存同名支店なし。'});
 assert(!current.some(f=>norm(f.properties.name)===norm(s.name)),'Existing identity needs review');
 const limits=['公式に案内された店舗代表点です。入口・館内動線・バス停からの徒歩到達性は未確認です。','現行の公式掲載を確認した記録で、リアルタイムの営業保証ではありません。','開店記事の報告日や事前予定日、公式ニュースの掲載日を実開店日に自動変換していません。'];
 if(s.id==='official-beat-pilates-yamaguchi-ube')limits.push('FORZAキックスタジオ併設の複合施設内にあるピラティス店舗です。別ブランドの独立した入口・地点は未確認のため同じ点で重ねて追加しません。');
 const f={type:'Feature',id:s.id,geometry:{type:'Point',coordinates:point},properties:{name:s.name,category:s.category,city:s.city,address:s.address,official_address:s.address,official_url:s.url,website:s.url,search_names:s.name+(s.id==='official-daiso-005565'?' ダイソー宇部店':s.id==='official-beat-pilates-yamaguchi-ube'?' ビートピラティス':''),source:'店舗公式情報',source_ids:['official:'+s.id.replace(/^official-/,'').replaceAll('-',':')],source_timestamp:checked,retrieved_at:checked,verified_at:checked,verification_status:'official_current_listing',license:'official-published-facts',geometry_kind:'representative_point',geometry_note:'支店の公式案内に結び付く店舗代表点。入口の確認ではありません。',location_verification:s.cid?'公式支店名・住所と、そのページから案内された埋込地図の店舗名・住所・CID付き地点を照合。表示中心は不採用。':'公式支店005565の名称・住所と同ページの地図q目的地座標を照合。表示中心llから取得していません。',freshness_review:{status:'operating',event:'listed',effective_at:null,checked_at:checked,summary:'公式店舗案内の名称・住所・支店別地図を照合し、現在の店舗を追加しました。',sources:[{title:'運営元の現行店舗案内',url:s.url},{title:'公式店舗案内からリンクされた地図',url:m.url}],limits}}};
 additions.push(f);
}
overlay.additions.push(...additions);W(pub+'/reviewed-inputs.json',inputs);W(pub+'/batch.json',{checked_at:checked,updates:[],additions});
const keys=['kaiten-611564','kaiten-528297','kaiten-561182','ube-80673','ube-80854','ube-80909','ube-80984','ube-81111','ube-81813','ube-82372','ube-82926','ube-83053','ube-82464'];
const queue=R('outputs/facility-bulk-triage-20260925/review-queue.json'),idx=new Map(R('data-sources/facility-progress-20260925/article-index.json').map(a=>[a.key,a]));
const bodyInputs=keys.map(k=>{const a=queue.find(a=>a.key===k);assert.equal(a.body_hash,idx.get(k).body_hash);assert(!articles.some(a=>a.article_key===k));return {key:k,url:a.url,title:a.title,body:a.body,source_body_hash:a.body_hash}});W(d+'/article-inputs.json',bodyInputs);
const ha='official-halows-nishikiwa',hu='official-halows-131',ho='official-halows-129',sd='official-sundrug-8207',dd='official-dondon-halows-ube',da='official-daiso-005565',bp='official-beat-pilates-yamaguchi-ube',mc='official-mcdonalds-35538',wa='official-tsuruha-10049';
const store=id=>overlay.additions.find(f=>f.id===id),urls=id=>store(id).properties.freshness_review.sources.map(s=>s.url),events=[],first=new Map();
const ev=(k,s,type,ids,disp,reason,src,extra={})=>({event_id:k+':'+s,event_type:type,facility_ids:ids,disposition:disp,effective_at:null,reason,source_urls:[idx.get(k).url,...src],...extra});
const cur=(k,s,id)=>{const prior=first.get(id),e=ev(k,s,'other',[id],prior?'duplicate':'reflected_addition','現在の店名・公式住所・店別地点を照合済み。同名施設や併設先を重複追加しない。',urls(id),prior?{duplicate_of:prior}:{});if(!prior)first.set(id,e.event_id);return e;};
const date=(k,s,id,report)=>ev(k,s,'opening',[id],'hold',report+'は記事の報告または事前予定。公式の現行掲載・ニュース掲載日とは分離し、日単位の実施記録は補足として保持。',urls(id),{reported_date:report});
const hold=(k,s,type,ids,reason,src=[])=>ev(k,s,type,ids,'hold',reason,src);
const unknown=(k,s)=>hold(k,s,'other',[],'工事区画の用途・店名・店舗地点は本文で未確定。色や近さから後続店舗と同定せず、区画を特定する一次情報を待つ。');
const wants=k=>hold(k,'wants-position','other',[wa],'現在の公式掲載は既存10049と一致するが、店別公式点はハローズから約3.3km離れる。既知の地点矛盾を維持し、入居先の点へ移さない。',urls(wa));
const rows=[
 ['kaiten-611564','ハローズ西岐波の開店1件。現在掲載と実施日の確認を分離。',[cur('kaiten-611564','current',ha),date('kaiten-611564','opening-date',ha,'2026-08-06')]],
 ['kaiten-528297','ハローズ小野田の開店1件。',[cur('kaiten-528297','current',ho),date('kaiten-528297','opening-date',ho,'2024-11-29')]],
 ['kaiten-561182','同地域のサンドラッグ開店記事も本バッチに統合。',[cur('kaiten-561182','current',sd),date('kaiten-561182','opening-date',sd,'2025-07-15')]],
 ['ube-80673','マクドナルド移転予定と未特定の建設区画。日産は位置説明。',[hold('ube-80673','mcd-relocation','relocation',['osm-way-477623030',mc],'新35538は掲載済み。旧35003の営業終了・移転実施の一次告知は未取得。予定日だけで旧店を閉店にしない。',urls(mc)),unknown('ube-80673','mall-unnamed-units')]],
 ['ube-80854','ハローズ、マクドナルドの工事進捗と未特定の併設区画。',[cur('ube-80854','halows-current',hu),cur('ube-80854','mcd-current',mc),date('ube-80854','mcd-opening-date',mc,'2025-07-15'),unknown('ube-80854','mall-unnamed-units')]],
 ['ube-80909','新たに判明したサンドラッグ。マクドナルドは既報の参照、飲食2・サービス4は計画の施設数で個別店舗と同定しない。',[cur('ube-80909','sundrug-current',sd)]],
 ['ube-80984','未特定の橙色・桃色の2建物とモール建設進捗。色からオートバックス・ダイソーに確定しない。既報マクドナルドとサンドラッグは背景説明。',[cur('ube-80984','halows-current',hu),unknown('ube-80984','mall-unnamed-units')]],
 ['ube-81111','ハローズと新規告知5店を全列挙。サンドラッグ宇部店は運営元8207の名称へ照合。',[cur('ube-81111','halows-current',hu),date('ube-81111','halows-opening-date',hu,'2025-07-12'),cur('ube-81111','mcd-current',mc),date('ube-81111','mcd-opening-date',mc,'2025-07-15'),cur('ube-81111','dondon-current',dd),date('ube-81111','dondon-opening-date',dd,'2025-07-15'),cur('ube-81111','sundrug-current',sd),date('ube-81111','sundrug-opening-date',sd,'2025-07-15'),hold('ube-81111','quickcut-current','opening',[],'ハローズ側のテナント案内には記載がある一方、クイックカット運営元の中国地方一覧は別の2店のみ。店舗固有の現況と地点を未確認。閉店も営業中も断定せず追加保留。',['https://quickcutbb.com/shop/?region=chugoku',store(hu).properties.official_url]),cur('ube-81111','daiso-current',da),date('ube-81111','daiso-opening-date',da,'2025-07-18')]],
 ['ube-81813','ハローズ西岐波と匿名併設施設の計画。2026年10月は当初予定で実開店日ではない。既存宇部店・アリーナ21は背景説明。',[cur('ube-81813','halows-current',ha),hold('ube-81813','nishikiwa-planned-units','other',[],'当初計画の別店舗・別棟の個別名は不明。現行ハローズ案内にはウォンツとコインランドリーがあるが、計画の各区画との対応は推定しない。',urls(ha))]],
 ['ube-82372','西岐波ハローズの工事進捗。採用情報は別施設ではない。',[cur('ube-82372','halows-current',ha)]],
 ['ube-82926','ハローズと隣接ウォンツの2店。右折レーンは設備・道路説明。',[cur('ube-82926','halows-current',ha),wants('ube-82926')]],
 ['ube-83053','ハローズ開店予告、ウォンツ、コインランドリーの3店を列挙。',[cur('ube-83053','halows-current',ha),date('ube-83053','halows-opening-date',ha,'2026-08-06'),wants('ube-83053'),hold('ube-83053','laundry-current','opening',[],'ハローズの現行テナント欄でコインランドリー西岐波店を確認。店舗自身の住所・固有地点は未確認で、スーパーやウォンツの点を代用しない。',urls(ha))]],
 ['ube-82464','新たな工事区画と前回出店Beat Pilates。オートバックス移転は場所説明で既処理の記事を参照。',[unknown('ube-82464','mall-2026-construction'),cur('ube-82464','beat-current',bp),date('ube-82464','beat-opening-date',bp,'2025-11')]]
];
const reviews=rows.map(([article_key,inventory_reason,events])=>({article_key,source_body_hash:idx.get(article_key).body_hash,inventory_complete:true,reviewed_at:checked,inventory_reason,events}));
articles.push(...reviews);W(pub+'/article-reviews.json',reviews);
cases.scope='Reviewed article events including the Halows regional batch, selected evidence holds, current focus review, chain reconciliation holds and local directory exclusions. Not an exhaustive survey of unreviewed articles or baseline facilities.';
const findings=[];
const refFor=(case_id,reason)=>{const finding={case_id,reason},ref={path:pub+'/adoption-evidence.json',section:'case_findings',index:findings.length,hash:hash(finding)};findings.push(finding);return ref;};
const bind=(e,caseId,name,ids,impact,reason,next)=>{
 let c=cases.cases.find(c=>c.case_id===caseId);
 if(!c){c={case_id:caseId,name,facility_ids:ids,related_facility_ids:[],issues:[]};cases.cases.push(c);}
 let issue=c.issues.find(i=>i.impact===impact);
 if(!issue){issue={issue_id:caseId+':'+impact,impact,priority:impact==='map_action'?'P1':impact==='watch'?'P2':'P3',reason,next,event_ids:[]};c.issues.push(issue);}
 issue.event_ids.push(e.event_id);cases.event_bindings.push({event_id:e.event_id,event_hash:hash(e),case_id:caseId,issue_id:issue.issue_id});
 if(!c.evidence_refs?.some(r=>r.path===pub+'/adoption-evidence.json')){c.evidence_refs??=[];c.evidence_refs.push(refFor(caseId,reason));}
};
for(const e of reviews.flatMap(r=>r.events).filter(e=>e.disposition==='hold')){
 if(e.event_id.includes('mcd-relocation'))bind(e,'case:mcd-ube-konan','マクドナルド宇部厚南',[],'map_action',e.reason,'新しい旧店固有の移転・終了告知が得られた場合のみ再開。');
 else if(e.event_id.includes('wants-position'))bind(e,'facility:'+wa,'ウォンツ ハローズ西岐波店',[wa],'map_action',e.reason,'店別の訂正地点の一次根拠が出た場合に再開。');
 else if(e.event_id.includes('quickcut'))bind(e,'case:quickcut-halows-ube','クイックカットBB ハローズ宇部モール店',[],'map_action',e.reason,'店舗固有の運営元案内・営業終了案内と地点を確認。一覧の不掲載だけで閉店にしない。');
 else if(e.event_id.includes('laundry'))bind(e,'case:laundry-halows-nishikiwa','コインランドリー西岐波店',[],'map_action',e.reason,'店舗自身の案内または区画が明示されたテナント地図で地点を確認。');
 else if(e.event_id.includes('mall-unnamed'))bind(e,'case:halows-ube-unnamed-units','宇部モール2025年の未特定建物',[],'watch',e.reason,'区画対応を確認できる一次図面・名称告知を得た際に照合。');
 else if(e.event_id.includes('2026-construction'))bind(e,'case:halows-ube-2026-construction','宇部モール2026年4月の工事区画',[],'watch',e.reason,'具体的な店舗名と区画が公表された場合に照合。');
 else if(e.event_id.includes('planned-units'))bind(e,'case:halows-nishikiwa-planned-units','西岐波の当初計画の併設区画',[],'watch',e.reason,'区画対応を確認できる一次図面・名称告知を得た際に照合。');
 else {const id=e.facility_ids[0];assert.equal(e.event_type,'opening');bind(e,'facility:'+id,store(id).properties.name,[id],'supplemental','現在の公式掲載・店舗地点は反映済み。残るのは実施日の補足。','当日実施または事後の公式記録が明示された場合に日付を補完。');}
}
const after=applyFacilityCurrent(base,overlay);
const reused=['outputs/facility-ube-fastfood-20260925/pages/cf39d9a6eabd3ca336735151.json','outputs/facility-ube-fastfood-20260925/pages/ccf05dda56d6d2340ba740d4.json'];
const sources=[...fs.readdirSync(d+'/pages').map(n=>d+'/pages/'+n),...reused].map(path=>{const r=R(path);return {path,url:r.url,hash:hash(r),status:r.status}});
const evidence={checked_at:checked,before_overlay_hash:hash(before),after_overlay_hash:hash(overlay),batch_hash:hash(R(pub+'/batch.json')),inputs_hash:hash(inputs),article_inputs_hash:hash(bodyInputs),article_keys:keys,case_findings:findings,nearby,sources,extra_jev_requests:0,cumulative:{updates:overlay.updates.length,additions:overlay.additions.length,total:after.length,normal_candidates:after.filter(f=>f.properties.category!=='reference'&&facilityAvailable(f)).length,closed:after.filter(f=>f.properties.freshness_review?.status==='closed').length,duplicate_records:after.filter(f=>f.properties.duplicate_of).length},date_assessment:'公式ニュースに開店見出しと日付はあるが、記事の掲載日と実施日の関係は本文で明示されないものを含む。今回の主目的である現在掲載を反映し、日付補足を別管理。Beatの事前リリースは2025-11-01(金)と曜日も不整合。'};
W(pub+'/adoption-evidence.json',evidence);
for(const[k,v]of Object.entries({overlay,articles,cases})){W(d+'/proposed-'+k+'.json',v);const old=R(d+'/'+k+'-before.json'),live=R(paths[k]);if(k==='cases'){old.scope=v.scope;live.scope=v.scope;}assert([hash(old),hash(v)].includes(hash(live)),'Unrelated change '+k);if(process.argv.includes('--apply'))W(paths[k],v);}
console.log(JSON.stringify({applied:process.argv.includes('--apply'),cumulative:evidence.cumulative,articles:reviews.length,events:reviews.flatMap(r=>r.events).length,holds:reviews.flatMap(r=>r.events).filter(e=>e.disposition==='hold').length,new_sources:sources.length,extra_jev_requests:0}));
