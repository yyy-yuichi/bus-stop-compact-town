import fs from 'node:fs';import assert from 'node:assert/strict';
import {hash} from './jev-batch.mjs';import {htmlText,normalize,anchor} from './facility-bulk-lib.mjs';import {secondStreetStore,currentListingFeature} from './facility-successors-lib.mjs';import {applyFacilityCurrent,facilityAvailable} from '../src/facilityFreshness.ts';
const d='outputs/facility-secondstreet-20260925',p='data-sources/facility-secondstreet-20260925',R=f=>JSON.parse(fs.readFileSync(f,'utf8')),W=(f,x)=>fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');
const paths={overlay:'public/data/facility-current.json',articles:'data-sources/facility-progress-20260925/article-event-reviews.json',cases:'data-sources/facility-workboard-20260925/case-reviews.json'};
for(const[k,f]of Object.entries(paths))if(!fs.existsSync(d+'/'+k+'-before.json'))fs.copyFileSync(f,d+'/'+k+'-before.json',fs.constants.COPYFILE_EXCL);
const before=R(d+'/overlay-before.json'),overlay=structuredClone(before),articles=R(d+'/articles-before.json'),cases=R(d+'/cases-before.json');assert.equal(before.additions.length,179);assert.equal(before.updates.length,30);
const receipts=fs.readdirSync(d+'/pages').map(f=>({path:d+'/pages/'+f,...R(d+'/pages/'+f)}));
for(const r of receipts){assert.equal(r.status,200);assert.equal(hash(r.html),r.decoded_hash);assert.equal(r.final_url,r.url);}
const directory=receipts.find(r=>r.url==='https://www.2ndstreet.jp/shop/search?prefectural=35'),directoryText=htmlText(directory.html);
const directoryIds=[...new Set([...directory.html.matchAll(/href=["']([^"']*shop\/details\?shopsId=\d+[^"']*)/g)].map(m=>new URL(m[1].replaceAll('&amp;','&'),directory.url).searchParams.get('shopsId')))].sort();
assert.equal(directoryIds.length,12);assert(directoryText.includes('12件該当'));
const rows=receipts.filter(r=>r.url.includes('/shop/details')).map(r=>({...secondStreetStore(r),receipt_path:r.path,receipt_hash:hash(R(r.path))})).sort((a,b)=>a.id.localeCompare(b.id));
assert.deepEqual(rows.map(r=>r.id.split('-').at(-1)).sort(),directoryIds.filter(id=>id!=='31983'));
const base=['shopping','civic-facilities'].flatMap(n=>R('public/data/'+n+'.geojson').features),current=applyFacilityCurrent(base,before),nearby=[];
for(const row of rows){
 assert(normalize(directoryText).includes(normalize(row.name)));assert(normalize(directoryText).includes(normalize(row.address)));
 assert(!current.some(f=>normalize(f.properties.name)===normalize(row.name)||f.id===row.id));
 const near=current.map(f=>({id:f.id,name:f.properties.name,category:f.properties.category,distance_m:Math.round(Math.hypot((anchor(f.geometry)[0]-row.coordinates[0])*Math.cos(row.coordinates[1]*Math.PI/180)*111320,(anchor(f.geometry)[1]-row.coordinates[1])*111320))})).filter(f=>f.distance_m<=150).sort((a,b)=>a.distance_m-b.distance_m);
 nearby.push({id:row.id,nearby:near,decision:row.id==='official-secondstreet-31787'?'10m先のミコー等は別名・別業種。公式支店の経路目的地を採用し、近さだけで旧施設IDを置換しない。':row.id==='official-secondstreet-32241'?'ゆめタウン南岩国西館のテナント。入居先の施設IDを保持し、店別の公式経路目的地を採用。':'同名既存支店なし。異業種・近隣施設は変更しない。'});
 row.store_format='店舗代表点（入口・館内配置未確認）';
 if(row.id==='official-secondstreet-32241')row.store_format='ゆめタウン南岩国西館内の店舗';
 const f=currentListingFeature(row);
 f.properties.freshness_review.sources.unshift({title:'運営会社の山口県店舗一覧',url:directory.url});
 f.properties.freshness_review.summary='公式県内一覧と支店別の名称・住所・経路案内目的地を照合して追加しました。';
 if(row.id==='official-secondstreet-32241')f.properties.freshness_review.limits.push('ゆめタウン南岩国西館内の店舗。館内入口と階層・徒歩動線は未確認。');
 overlay.additions.push(f);
}
W(p+'/reviewed-stores.json',rows);W(p+'/batch.json',{checked_at:'2026-09-25',updates:[],additions:overlay.additions.slice(179)});
const keys=['kaiten-509057','kaiten-617376','kaiten-571437','kaiten-608532','shunan-119477','ube-81847','ube-81621'],queue=R('outputs/facility-bulk-triage-20260925/review-queue.json'),idx=new Map(R('data-sources/facility-progress-20260925/article-index.json').map(a=>[a.key,a]));
const bodies=keys.map(k=>{const a=queue.find(x=>x.key===k);assert.equal(a.body_hash,idx.get(k).body_hash);assert(!articles.some(a=>a.article_key===k));return {key:k,title:a.title,url:a.url,body:a.body,source_body_hash:a.body_hash};});W(d+'/article-inputs.json',bodies);
const sid=id=>'official-secondstreet-'+id,store=id=>overlay.additions.find(f=>f.id===sid(id)),url=id=>'https://www.2ndstreet.jp/shop/details?shopsId='+id;
const first=new Map([['31983','ube-80817:successor']]);
const ev=(k,s,type,ids,disp,reason,src=[],more={})=>({event_id:k+':'+s,event_type:type,facility_ids:ids,disposition:disp,effective_at:null,reason,source_urls:[idx.get(k).url,...src],...more});
const listing=(k,id)=>{const prior=first.get(id),e=ev(k,'current','other',[sid(id)],prior?'duplicate':'reflected_addition','公式の現行支店住所・店舗別目的地を照合。既存施設との重複なし。現在掲載を反映。',[url(id)],prior?{duplicate_of:prior}:{});if(!prior)first.set(id,e.event_id);return e;};
const date=(k,id,reported,suffix='opening-date',type='opening')=>ev(k,suffix,type,[sid(id)],'hold','記事の予定・報告日 '+reported+' を保存。現行店舗ページは実施日を明示していないため、実開店日・先行買取日・臨時休店日の確定と分離。',[url(id)],{reported_date:reported});
const old=(k,s,type,reason)=>ev(k,s,type,[],'hold',reason,[url('32092')]);
const closureSource='https://www.big-wood.co.jp/info/10968/',closure=receipts.find(r=>r.url===closureSource);assert(htmlText(closure.html).includes('2026年3月31日（日）をもって閉店いたしました'));
const closureNames=base.filter(f=>/ビッグ.?ウッド|big.?wood|セカンドストリート|2nd.?street|幸太郎|tsutaya|ツタヤ/i.test(f.properties.name)).map(f=>({id:f.id,name:f.properties.name}));
const reviews=[];
const make=(k,id,report,extra=[],reason='新店舗の現在掲載と開店日の2事項を列挙。')=>reviews.push({article_key:k,source_body_hash:idx.get(k).body_hash,inventory_complete:true,reviewed_at:'2026-09-25',inventory_reason:reason,events:[listing(k,id),date(k,id,report),...extra]});
make('kaiten-509057','31787','2024-07-19');make('kaiten-617376','32241','2026-09-25');make('kaiten-571437','31983','2025-10-03');make('kaiten-608532','32214','2026-07-17');
make('shunan-119477','32214','2026-07-17',[
 date('shunan-119477','32214','2026-06-26','preopening-date'),
 ev('shunan-119477','bigwood-closure','closure',[],'verified_no_change','旧ビッグウッド下松店の閉店自体は運営元の事後告知で確認。本文は2026-03-31(日)と曜日が不整合のため日付を確定欄へ転記しない。元地図に同名・英字名の対象IDがなく、後継店や別施設を閉店にしない。',[closureSource]),
 ev('shunan-119477','summer-sale','other',[],'out_of_scope','期間限定の値引きキャンペーンは固定施設の増減ではない。',[url('32214')])
],'現行セカンドストリート、先行買取、グランドオープン、旧ビッグウッド閉店、期間限定セールを列挙。サンリブは位置説明。');
for(const k of ['ube-81847','ube-81621']){
 const extras=[
 date(k,'32092','2025-10-24〜2025-11-12','preopening-period'),
 old(k,'old-ube-relocation','relocation','記事では大小路の旧宇部店が2025-09-28閉店して宇部新川へ移転したと報告。現在の新店は確認できるが旧支店の事後告知は未取得。元地図に旧店名IDなし。現行店の追加と旧店履歴を分離。'),
 old(k,'tsutaya-prior-closure','closure','記事は幸太郎本舗TSUTAYA宇部店の跡地と説明。元地図に旧店名IDなし。自社閉店告知を未取得のため旧店履歴として保留。')
 ];
 if(k==='ube-81621'){extras.push(date(k,'32092','2025-11-13','preopening-pause','temporary_change'));extras.push(ev(k,'buying-campaign','other',[],'out_of_scope','先行買取の金額増額キャンペーンは固定施設の増減ではない。',[url('32092')]));}
 make(k,'32092','2025-11-14',extras,'新店の現在掲載、先行買取期間、開店日、旧宇部店の移転、前入居TSUTAYAの閉店履歴を列挙。10月記事では11月13日の休店と買取キャンペーンも列挙。駐車場・バス停はアクセス説明。');
}
articles.push(...reviews);W(p+'/article-reviews.json',reviews);
const findings=[];
for(const e of reviews.flatMap(r=>r.events).filter(e=>e.disposition==='hold')){
 const history=e.facility_ids.length===0,tsutaya=e.event_id.includes('tsutaya'),id=e.facility_ids[0],caseId=history?'case:'+(tsutaya?'tsutaya-ube-history':'secondstreet-ube-history'):'facility:'+id,impact=history?'historical_only':'supplemental';
 let c=cases.cases.find(c=>c.case_id===caseId);
 if(!c){const finding={case_id:caseId,reason:history?e.reason:'現在の店別掲載・地点は反映済み。記事にある開店・先行買取等の日付は実施記録未取得。'},ref={path:p+'/adoption-evidence.json',section:'case_findings',index:findings.length,hash:hash(finding)};findings.push(finding);c={case_id:caseId,name:history?(tsutaya?'旧幸太郎本舗TSUTAYA宇部店':'旧セカンドストリート宇部店'):overlay.additions.find(f=>f.id===id).properties.name,facility_ids:history?[]:[id],related_facility_ids:history?[sid('32092')]:[],evidence_refs:[ref],issues:[{issue_id:caseId+':'+impact,impact,priority:'P3',reason:finding.reason,next:'新しい店舗固有の事後告知が得られた際に補完。同日の同じ一覧・検索は繰り返さない。',event_ids:[]}]};cases.cases.push(c);}
 const issue=c.issues.find(i=>i.impact===impact);assert(issue);issue.event_ids.push(e.event_id);cases.event_bindings.push({event_id:e.event_id,event_hash:hash(e),case_id:caseId,issue_id:issue.issue_id});
}
const after=applyFacilityCurrent(base,overlay),evidence={checked_at:'2026-09-25',before_overlay_hash:hash(before),after_overlay_hash:hash(overlay),directory_url:directory.url,directory_ids:directoryIds,existing_unchanged_ids:[sid('31983')],newly_added_ids:rows.map(r=>r.id),corrected_ids:[],nearby,closure_name_candidates:closureNames,case_findings:findings,sources:receipts.map(r=>({path:r.path,url:r.url,hash:hash(R(r.path)),status:r.status})),article_keys:keys,article_inputs_hash:hash(bodies),extra_jev_requests:0,cumulative:{updates:overlay.updates.length,additions:overlay.additions.length,total:after.length,normal_candidates:after.filter(f=>f.properties.category!=='reference'&&facilityAvailable(f)).length}};
W(p+'/adoption-evidence.json',evidence);
for(const[k,v]of Object.entries({overlay,articles,cases})){W(d+'/proposed-'+k+'.json',v);assert([hash(R(d+'/'+k+'-before.json')),hash(v)].includes(hash(R(paths[k]))),'Unrelated change '+k);if(process.argv.includes('--apply'))W(paths[k],v);}
console.log(JSON.stringify({applied:process.argv.includes('--apply'),added:rows.length,corrected:0,articles:reviews.length,events:reviews.flatMap(r=>r.events).length,holds:reviews.flatMap(r=>r.events).filter(e=>e.disposition==='hold').length,cumulative:evidence.cumulative}));
