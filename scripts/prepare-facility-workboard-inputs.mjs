import fs from 'node:fs';import assert from 'node:assert/strict';import {hash} from './jev-batch.mjs';import {applyFacilityCurrent} from '../src/facilityFreshness.ts';
const pub='data-sources/facility-workboard-20260925';fs.mkdirSync(pub,{recursive:true});
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const index=read('data-sources/facility-progress-20260925/article-index.json'),queue=read('outputs/facility-bulk-triage-20260925/review-queue.json'),reviews=read('data-sources/facility-progress-20260925/article-event-reviews.json'),overlay=read('public/data/facility-current.json'),base=['shopping.geojson','civic-facilities.geojson'].flatMap(f=>read('public/data/'+f).features),features=applyFacilityCurrent(base,overlay);
assert.equal(hash(reviews.filter(r=>!['yamaguchi-40890','yamaguchi-42851','yamaguchi-43926','ube-83101','ube-83154','ube-83224','kaiten-484359'].includes(r.article_key))),'1148c430165a7070fb52cdea723c1d10e1a0b0019015da035a0b6ff1368fad8b','Review inputs changed; reassess classifications');assert.equal(hash(overlay),'fbe59a3ade31ce7cd63bf437dfd0c29769af71470b8862eb91b722f77e7eb3a7');assert.equal(queue.length,index.length);const idx=new Map(index.map(a=>[a.key,a])),byId=new Map(features.map(f=>[f.id,f])),norm=s=>s.normalize('NFKC').replace(/[\s\u200b]/g,'').toLowerCase();
const cleanUrl=s=>{try{const u=new URL(s);if(!/^https?:$/.test(u.protocol)||u.username||u.password||/google\.|maps\.app|goo\.gl/.test(u.hostname)||u.pathname==='/')return null;if([...u.searchParams.keys()].some(k=>/key|token|secret|auth/i.test(k)))return null;u.hash='';return u.href;}catch{return null;}};
const official=new Map();for(const f of overlay.additions){const u=cleanUrl(f.properties.official_url);if(u)official.set(u,[...(official.get(u)??[]),f.id]);}
for(const u of overlay.updates)for(const s of u.review.sources){const url=cleanUrl(s.url);if(url)official.set(url,[...new Set([...(official.get(url)??[]),u.id])]);}
const metadata=queue.map(a=>{
 const i=idx.get(a.key);assert(i&&i.body_hash===a.body_hash);const names=[...new Set((a.name_candidates??[]).map(n=>n.trim()).filter(Boolean))];
 const address=a.body?.match(/(?:^|\n)\s*住所\s*\n\s*(?:〒[\d-]+\s*)?([^\n]+)/)?.[1]?.trim()??null;
 const hints=[...new Set((a.outbound_links??[]).flatMap(u=>official.get(cleanUrl(u))??[]))];
 return {article_key:a.key,source_body_hash:a.body_hash,city:a.city_queue??'自治体未確定',name_candidates:names,published_at:a.published_at,jev_event:a.jev_event,address_hint:address,official_link_hint_ids:hints,existing_name_hint_ids:features.filter(f=>names.some(n=>norm(n)===norm(f.properties.name))&&(!f.properties.city||f.properties.city===a.city_queue)).map(f=>f.id)};
});
write(pub+'/article-work-inputs.json',{checked_at:'2026-09-25',input_queue_hash:hash(queue),note:'Hints only. Candidate names, cities, dates and links do not establish facility identity or event completion. Article bodies and embedded API parameters are omitted.',articles:metadata});
const events=new Map(reviews.flatMap(r=>r.events.map(e=>[e.event_id,e]))),cases=new Map(),bindings=[];
function bind(key,label,impact,ids,eventIds,reason,next,priority='P2',related=[]){
 let c=cases.get(key);if(!c){c={case_id:key,name:label,facility_ids:ids,related_facility_ids:related,issues:[]};cases.set(key,c);}
 assert.deepEqual(c.facility_ids,ids);
 const issue={issue_id:key+':'+impact,impact,priority,reason,next,event_ids:eventIds};
 c.issues.push(issue);
 for(const id of eventIds){const e=events.get(id);assert(e?.disposition==='hold',id);bindings.push({event_id:id,event_hash:hash(e),case_id:key,issue_id:issue.issue_id});}
}
const supplemental=[
 ['official-watts-47917',['ube-80654:watts']],
 ['official-shizquya-tokuyama-deck',['shunan-119965:shizqu-opening']],
 ['official-seria-nagato-2953',['kaiten-511755:date']],
 ['official-chiyomaru-abu',['kaiten-513641:date']],
 ['official-iphone-sokusyuri-hagitamagawa',['kaiten-520473:date']],
 ['official-komeri-power-nagato-1054',['kaiten-540611:date']],
 ['official-soil-nagatoyumoto',['kaiten-543665:date']],
 ['official-sukiya-nagato-6605',['kaiten-612233:date']],
 ['official-matsuya-2122',['kaiten-510192:opening']],
 ['official-matsuya-2276',['kaiten-588856:opening']],
 ['official-yoshinoya-062592',['kaiten-581208:opening','ube-82059:opening']],
 ['osm-way-1463857376',['kaiten-515559:opening','shimonoseki-56063:opening','shimonoseki-55069:opening','shimonoseki-51918:opening']],
 ['official-sushiro-2516',['kaiten-588036:opening']],
 ['official-kfc-5063',['kaiten-575908:opening','ube-81774:opening']],
 ['official-mcdonalds-35539',['ube-83012:opening','ube-83170:opening','ube-83311:opening']],
 ['official-halows-nishikiwa',['ube-83311:halows-opening']],
 ['official-tsuruha-10049',['ube-83311:wants-opening']]
];
for(const [id,es] of supplemental)bind('facility:'+id,byId.get(id).properties.name,'supplemental',[id],es,'現行の公式掲載・支店地点は反映済み。未確認の実施日や歴史上の年・日付は記事台帳の保留として維持。','通常の現行地図更新を妨げず、公式の実施記録が得られた際に補完。','P3');
bind('facility:official-tsuruha-10049',byId.get('official-tsuruha-10049').properties.name,'map_action',['official-tsuruha-10049'],['ube-83311:wants-position'],'同一商業施設との案内と公式支店座標が約3.3km相違。','新しい店別の一次地図で位置を確定し、訂正履歴を残す。','P0',['official-halows-nishikiwa']);
cases.get('facility:official-tsuruha-10049').related_facility_ids=['official-halows-nishikiwa'];
bind('case:mcd-ube-konan','マクドナルド宇部厚南の旧地点・現行店舗','map_action',['osm-way-477623030','official-mcdonalds-35538'],['ube-81233:relocation','ube-81345:relocation'],'新店舗は掲載済みだが旧地点が通常候補に残る。支店の移転関係と旧地点の終了が未確認。','旧店舗を特定する一次の閉店・移転告知を確認。','P0');
bind('case:wants-higashisue-pharmacy','ウォンツ宇部東須恵の薬局計画','map_action',[],['ube-80654:pharmacy','ube-80473:pharmacy'],'薬局の開局・計画変更は未確認。ドラッグストアとは別の機能。','公式の薬局一覧と対象住所を照合。','P2',['official-tsuruha-3993']);
bind('case:megadori-ube','メガドリ宇部店','map_action',[],['ube-81165:successor','ube-82743:successor'],'自店住所の裏付けあり、店別代表点未確定。','取得済み自店案内と公開地図を照合。','P1');
bind('case:tokuchan-iijima','飯島町の居酒屋・拉麺徳ちゃん','map_action',[],['shunan-119994:tokuchan-iijima'],'新支店・移転・開店の関係が未確定。','店舗自身の現行住所と支店関係を確認。','P1');
bind('case:toyopet-hagi','山口トヨペット 萩マイカーセンターつばき店','map_action',[],['kaiten-547780:opening'],'公式の住所・電話は確認済み、店別の採用座標未確定。','販売会社の店舗地図から地点・測地系を確認。','P1');
bind('case:tecmopia-hagi','テクモピア萩店','map_action',[],['kaiten-558326:opening'],'運営元原本・店名に結びついた位置が未確認。','取得済みメーカー情報から運営元の現行店舗を確認。','P1');
bind('case:autobacs-ube-konan','オートバックス宇部厚南','map_action',[],['ube-81345:autobacs-relocation'],'公式の移転予定・新住所は取得済み、現行店別点は未確認。','現行公式店舗ページの支店ID・住所・代表点をまとめて照合。','P1');
bind('case:mcd-yumetown-history','旧マクドナルド宇部ゆめタウン店','historical_only',[],['ube-81149:old-mcd-closure','ube-81774:old-mcd-closure'],'既存対象テナントIDなし。後継KFCは別IDで掲載済み。閉店の一次記録は未確認だが現行地図を変更する対象は見つかっていない。','閉店の一次告知が得られた際に履歴を補完。商業施設ubeは変更しない。','P3',['ube','official-kfc-5063']);
bind('case:mcd-konan-site','旧マクドナルド厚南跡の後継計画','watch',[],['ube-81345:old-site-successor'],'工事記事のみで後継店舗未特定。既存施設の閉店確認とは別。','店名・現行住所が公表された場合に新規掲載を検討。','P3',['osm-way-477623030']);
assert.equal(bindings.length,38);assert.equal(new Set(bindings.map(b=>b.event_id)).size,bindings.length);
const legacy=read('data-sources/facility-evidence-20260925/holds.json').items,legacyAudit=[];
const decisions=[
 ['resolved','OZ2店舗は後続の記事採否で対象ID不在と公式閉店を照合済み。',['ube-83294:oz-ube','shunan-119852:oz-kudamatsu']],
 ['active','ふくぱん銀南街の販売終了に対応する元IDの確認が残る。',[]],
 ['active','エミール中央店の閉店に対応する元IDの確認が残る。',[]],
 ['active','海商館の元施設の同一性確認が残る。',[]],
 ['active','海都大内御堀の閉店の一次情報が未取得。',[]],
 ['resolved','旧ウォンツ厚南は後続反映で閉店済み。',['ube-80654:konan']],
 ['resolved','旧ウォンツ小野田は後続反映で閉店済み。',['ube-80817:onoda']],
 ['active','kikiの店舗として公表された精密位置が未取得。',[]],
 ['active','PilatesGenieの店舗位置が未確定。',[]],
 ['active','SuouCoffeeFactoryの現行サービス分類の確認が残る。',[]],
 ['resolved','SOY STOCKは公式テナントIDで掲載済み。',[]],
 ['resolved','旧ミコーは後続反映で月精度の閉店を確認済み。',['kaiten-531557:miko']]
];
for(const [i,item] of legacy.entries()){
 const [status,reason,evs]=decisions[i];assert(status);
 const record={source:'data-sources/facility-evidence-20260925/holds.json',source_index:i,source_hash:hash(item),names:item.names,status,reason,resolved_by_event_ids:evs,resolved_by_facility_ids:i===10?['official-soy-stock-karato']:[]};legacyAudit.push(record);
 if(status==='active'){
  const key='legacy:'+i;const ids=item.facility_ids??[];bind(key,item.names.join(' / '),'map_action',ids,[],reason,item.next,ids.length?'P0':'P1');cases.get(key).evidence_refs=[{path:record.source,index:i,hash:record.source_hash}];
 }
}
const focus=read('data-sources/facility-progress-20260925/focus-review.json');
for(const [i,item] of focus.closures.entries())if(![...cases.values()].some(c=>c.facility_ids.includes(item.id))){const key='facility:'+item.id;bind(key,item.name,'map_action',[item.id],[],item.finding,item.next,'P0');cases.get(key).evidence_refs=[{path:'data-sources/facility-progress-20260925/focus-review.json',section:'closures',index:i,hash:hash(item)}];}
for(const [i,item] of focus.graduates.entries())if(!item.map_adopted){const key='directory:'+item.id;bind(key,item.name,item.location_type==='mobile_no_fixed_point'?'excluded_fixed_map':'map_action',[],[],item.review_status,item.next,item.location_type==='mobile_no_fixed_point'?'P3':'P1');cases.get(key).evidence_refs=[{path:'data-sources/facility-progress-20260925/focus-review.json',section:'graduates',index:i,hash:hash(item)}];}
const local=read('data-sources/facility-local-stores-20260925/decisions.json');
for(const [i,item] of local.entries())if(['hold_offsite','hold_suspended'].includes(item.decision)){const key='directory:'+item.id;bind(key,item.name,item.decision==='hold_offsite'?'excluded_fixed_map':'watch',[],[],item.reason,item.decision==='hold_offsite'?'場外の事業所を市場内の来店施設として追加しない。':'公式の再開告知が得られたら確認。','P3');cases.get(key).evidence_refs=[{path:'data-sources/facility-local-stores-20260925/decisions.json',index:i,hash:hash(item)}];}

// Pilot: extend existing store issues instead of repeating each article as a new store.
function extend(key,impact,ids){const c=cases.get(key),i=c?.issues.find(i=>i.impact===impact);assert(i);for(const id of ids){const e=events.get(id);assert(e?.disposition==='hold');i.event_ids.push(id);bindings.push({event_id:id,event_hash:hash(e),case_id:key,issue_id:i.issue_id});}}
extend('facility:official-tsuruha-10049','supplemental',['ube-83101:opening','ube-83154:opening','ube-83224:opening']);
extend('facility:official-halows-nishikiwa','supplemental',['ube-83101:halows-opening','ube-83154:halows-opening']);
bind('facility:official-tsuruha-3989',byId.get('official-tsuruha-3989').properties.name,'supplemental',['official-tsuruha-3989'],['yamaguchi-40890:opening','yamaguchi-42851:opening','yamaguchi-43926:opening'],'現在の支店・住所・位置は反映済み。実開店日の確認は補足。','公式の実施記録が得られた際に補完。','P3');
bind('facility:official-tsuruha-3979',byId.get('official-tsuruha-3979').properties.name,'supplemental',['official-tsuruha-3979'],['kaiten-484359:opening'],'現在の支店・住所・位置は反映済み。実開店日の確認は補足。','公式の実施記録が得られた際に補完。','P3');
bind('case:tsutaya-hofu-history','旧TSUTAYA防府店','historical_only',[],['yamaguchi-40890:tsutaya-closure'],'元施設にTSUTAYA/ツタヤ名称候補なし。現行ウォンツは掲載済み。旧店閉店の一次記録は未確認。','一次の閉店記録が得られた際に履歴を補完。','P3',['official-tsuruha-3989']);
bind('case:hofu-imono-clinic-plan','防府鋳物師のクリニック区画募集','watch',[],['yamaguchi-40890:clinic-plan','yamaguchi-42851:clinic-plan'],'募集看板だけで店名・開院・診療科は未特定。','開院の具体的な告知が出た場合に掲載候補へ。','P3',['official-tsuruha-3989']);
bind('case:watts-hofu-imono','防府鋳物師のWatts売場','map_action',[],['yamaguchi-43926:watts-corner'],'入居先公式には100円ショップ設備。記事のWatts名と売場固有の一次情報をつなぐ確認が残る。','Watts公式の防府市一覧をまとめて照合する。','P1',['official-tsuruha-3989']);
assert.equal(bindings.length,51);assert.equal(new Set(bindings.map(b=>b.event_id)).size,51);
const reconciliation=read('data-sources/facility-reconcile-20260925/review-decisions.json'),reconcileAudit=[];
for(const [id,label] of [['3889','ウォンツ下松山田と旧ドラッグセガミ'],['3905','ウォンツ宇部亀浦の重複候補']]){
 const item=reconciliation.held_sites[id],key='reconcile:tsuruha-'+id;bind(key,label,'map_action',item.base_ids,[],item.reason,'既存の建物・支店・後継関係を照合し、重複追加を避ける。','P0');
 cases.get(key).evidence_refs=[{path:'data-sources/facility-reconcile-20260925/review-decisions.json',section:'held_sites',index:id,hash:hash(item)}];reconcileAudit.push({section:'held_sites',key:id,case_ids:[key]});
}
const td=reconciliation.other_holds[0];bind('reconcile:tadokoro-kudamatsu',td.name,'map_action',[],[],td.reason,'既存まいどおおきに食堂との同一性・後継関係を確認する。','P1');
cases.get('reconcile:tadokoro-kudamatsu').evidence_refs=[{path:'data-sources/facility-reconcile-20260925/review-decisions.json',section:'other_holds',index:0,hash:hash(td)}];
reconcileAudit.push({section:'other_holds',key:0,case_ids:['reconcile:tadokoro-kudamatsu']},{section:'other_holds',key:1,case_ids:['legacy:8']},{section:'other_holds',key:2,case_ids:['legacy:4']});
const closureKeys=[];
for(const [code,name] of [['higashimizome','宇部東見初'],['ube-numa','宇部沼'],['yanai-shinjo','柳井新庄'],['yamaguchi-ouchi','山口大内']]){
 const key='reconcile:wants-closed-'+code,item=reconciliation.other_holds[3];bind(key,'旧ウォンツ'+name+'店','map_action',[],[],item.reason,'保存済みの支店別閉店案内と旧住所・元施設の同一性を照合する。','P1');
 cases.get(key).evidence_refs=[{path:'data-sources/facility-reconcile-20260925/review-decisions.json',section:'other_holds',index:3,hash:hash(item)}];closureKeys.push(key);
}
reconcileAudit.push({section:'other_holds',key:3,case_ids:closureKeys});

write(pub+'/case-reviews.json',{checked_at:'2026-09-25',scope:'Current 51 article holds including the seven-article pilot, selected evidence holds, current focus review, chain reconciliation holds and local directory exclusions. Not an exhaustive survey of all unreviewed articles or baseline facilities.',cases:[...cases.values()],event_bindings:bindings,legacy_audit:legacyAudit,reconciliation_audit:reconcileAudit});
console.log(JSON.stringify({article_inputs:metadata.length,known_cases:cases.size,held_events_bound:bindings.length,legacy_resolved:legacyAudit.filter(x=>x.status==='resolved').length}));
