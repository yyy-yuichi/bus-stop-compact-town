import fs from 'node:fs';
import assert from 'node:assert/strict';
import {hash} from './jev-batch.mjs';
import {htmlText,normalize,counts,municipalityIndex} from './facility-bulk-lib.mjs';
import {evidenceCsv} from './facility-evidence-lib.mjs';
import {localDisposition} from './facility-local-stores-lib.mjs';
import {applyFacilityCurrent,facilityAvailable} from '../src/facilityFreshness.ts';
const d='outputs/facility-local-stores-20260925',pub='data-sources/facility-local-stores-20260925',read=f=>JSON.parse(fs.readFileSync(f,'utf8')),save=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const policy=read(pub+'/review-policy.json'),records=read(d+'/records.json'),model=new Map(read(d+'/review.json').map(r=>[r.id,r])),positions=read(d+'/positions.json');
const before=read(d+'/facility-current-before.json'),overlay=structuredClone(before),target='public/data/facility-current.json';
const previousProposalFile=d+'/proposed-facility-current.json',previousSummaryFile=pub+'/adoption-summary.json';
const priorReviewedHash=process.argv.includes('--revise-proposal')&&fs.existsSync(previousProposalFile)&&fs.existsSync(previousSummaryFile)?read(previousSummaryFile).after_overlay_hash:null;
if(priorReviewedHash){assert.equal(priorReviewedHash,hash(read(previousProposalFile)));assert.equal(read(previousSummaryFile).before_overlay_hash,hash(before));}
const base=['shopping.geojson','civic-facilities.geojson'].flatMap(n=>read('public/data/'+n).features),allBefore=applyFacilityCurrent(base,before),bounds=municipalityIndex(read('data-sources/prefecture-directed-20260915/municipal-boundaries.geojson').features);
const evidence=url=>{const file=d+'/pages/'+hash(new URL(url).href).slice(0,24)+'.json',r=read(file);assert(r.status===200&&!r.error);return{url,receipt:file,sha256:hash(r)};};
const decisions=[],added=[];
for(const r of records){
 assert.equal(hash(read(r.receipt)),r.receipt_hash);const decision=localDisposition(r,policy),j=model.get(r.id),refs=[{url:r.url,receipt:r.receipt,sha256:r.receipt_hash}];
 for(const u of r.directory_sources??[])refs.push(evidence(u));
 if(decision.decision==='hold_offsite')assert(htmlText(read(refs.find(s=>s.url===policy.market.offsite_directory).receipt).html).includes('唐戸市場に店舗はおいていません'));
 if(decision.decision==='hold_suspended')assert(r.body.includes('只今、休業中です。'));
 let facility_id=decision.target?.startsWith('official-')?decision.target:null;
 if(decision.decision==='aggregate_source'){
  const paired=records.find(p=>p.id===decision.target);assert.equal(normalize(r.name),normalize(paired.name));assert.equal(normalize(r.company.replace('〒','')),normalize(paired.company.replace('〒','')));facility_id='official-'+paired.id;
 }
 if(decision.decision.startsWith('add_')){
  assert(r.coordinates&&decision.category);assert.deepEqual(bounds.locate(r.coordinates),['下関市']);
  assert(!allBefore.some(f=>normalize(f.properties.name)===normalize(r.name)),'Same existing name requires review');
  assert(!r.existing_candidates.some(f=>f.distance_m!==null&&f.distance_m<300),'Plausible existing same shop requires review');
  const market=r.group==='market_current',p=market?positions.market:positions.harete;
  assert.equal(hash(read(p.receipt)),p.receipt_hash);assert.deepEqual(r.coordinates,p.coordinates);
  const merged=records.filter(o=>policy.market.aggregate[o.id]===r.id);
  refs.push(evidence(p.source),{url:p.url,receipt:p.receipt,sha256:p.receipt_hash});
  for(const o of merged)refs.push({url:o.url,receipt:o.receipt,sha256:o.receipt_hash});
  const limits=['確認日の公式案内に掲載された情報です。リアルタイムの営業保証ではありません。',policy.location_policy,decision.reason];
  if(market)limits.push('会社所在地と場内売場は区別し、場内店舗一覧への掲載を根拠に唐戸市場の施設代表点を使用しています。日々の売切れ・営業時間終了を永久閉店とみなしません。');
  if(merged.length)limits.push(policy.market.aggregate_reason);
  if(decision.date){const [y,m,day]=decision.date.split('-').map(Number),compact=r.body.replace(/\s/g,'');assert(compact.includes(`${y}/${m}/${day}`)||compact.includes(`${y}年${m}月${day}日`),'Opening date absent in current detail');}
  const review={status:'operating',event:decision.date?'opened':'listed',effective_at:decision.date??null,checked_at:policy.checked_at,summary:decision.date?'施設運営者の店舗別案内で開店日と現行掲載を確認しました。':'現行の公式店舗一覧と詳細ページを確認して掲載しました。新規開店日の確認とは区別しています。',sources:[{title:market?'市場運営組合の店舗別案内':'施設運営者の店舗別案内',url:r.url},...merged.map(o=>({title:'同一事業者の別売場掲載（区画未確定のため集約）',url:o.url})),{title:'施設の所在地・現行案内',url:p.source},{title:'公式が案内する施設全体の代表点（店舗入口ではありません）',url:p.url}],limits};
  facility_id='official-'+r.id;
  const f={type:'Feature',id:facility_id,properties:{name:r.name,city:'下関市',address:r.address,official_address:r.address,official_url:r.url,category:decision.category,geometry_kind:'representative_point',source:'店舗公式情報',source_ids:[r,...merged].map(x=>'official:'+x.id.replaceAll('-',':')),source_timestamp:policy.checked_at,verified_at:policy.checked_at,verification_status:'official_current_listing',license:'official-published-facts',search_names:r.name+' '+(market?'唐戸市場':'唐戸はれて横丁'),location_verification:policy.location_policy,freshness_review:review},geometry:{type:'Point',coordinates:r.coordinates}};
  overlay.additions.push(f);added.push(f);
 }
 const row={id:r.id,name:r.name,group:r.group,url:r.url,...decision,facility_id,jev_route:j.jev_route,jev_category:j.jev_category,reviewed_category:decision.category??null,route_overridden:j.jev_route!==decision.route,category_overridden:Boolean(decision.category&&j.jev_category!==decision.category),sources:refs};
 if(r.group==='harete_graduate')row.followup={new_address:r.body.match(/移転先[\s　]*([^\n]+)/)?.[1]?.trim()??null,reported_months:[...r.body.matchAll(/202\d年\d{1,2}月/g)].map(m=>m[0]),note:/予定/.test(r.body)?'予定と独立時期が混在。実開店日を追加確認。':/各地/.test(r.body)?'移動販売。固定店舗として旧施設や任意地点へ登録しない。':r.body.match(/202\d年\d{1,2}月/g)?.length>1?'本文の移転月と独立時期の整合確認が必要。':'新住所・現在の店舗位置を確認する。'};
 decisions.push(row);
}
assert.equal(records.length,97);assert.equal(decisions.length,records.length);assert.equal(added.length,72);assert.equal(new Set(added.map(f=>f.id)).size,added.length);
const after=applyFacilityCurrent(base,overlay);assert([hash(before),hash(overlay),priorReviewedHash].includes(hash(read(target))),'Concurrent overlay change: refuse overwrite');assert.deepEqual(overlay.updates,before.updates);assert.deepEqual(overlay.additions.slice(0,before.additions.length),before.additions);
const summary={checked_at:policy.checked_at,records:records.length,dispositions:counts(decisions,'decision'),added:added.length,added_by_directory:counts(decisions.filter(r=>r.decision.startsWith('add_')),'group'),added_categories:counts(added.map(f=>f.properties),'category'),opening_dates_confirmed:added.filter(f=>f.properties.freshness_review.event==='opened').length,new_confirmed_closures:0,route_corrections:decisions.filter(r=>r.route_overridden).length,category_corrections:decisions.filter(r=>r.category_overridden).length,baseline_count:base.length,before_count:allBefore.length,after_count:after.length,normal_candidates:after.filter(f=>f.properties.category!=='reference'&&facilityAvailable(f)).length,cumulative_overlay:{updates:overlay.updates.length,additions:overlay.additions.length},before_overlay_hash:hash(before),after_overlay_hash:hash(overlay),policy_hash:hash(policy),input_hash:hash(records),jev:read(d+'/summary.json'),input_limitations:['The frozen Jev input uses preliminary complex locations for all market entries; section 10 is explicitly offsite and is rejected after reading its directory introduction. Those preliminary coordinates are never adopted.','A source description says 14 graduates, but this batch has 11 individually described graduates.','Jev missed the explicit suspension of 道中; review rejects operating adoption.','Raw runner limitation text is inherited from its historical pilot; actual input scope is documented here.']};
save(pub+'/decisions.json',decisions);save(pub+'/adoption-summary.json',summary);save(d+'/proposed-facility-current.json',overlay);
fs.writeFileSync(d+'/local-review.csv',evidenceCsv(decisions,['id','name','group','url','decision','facility_id','reason','jev_route','route','route_overridden','jev_category','reviewed_category','category_overridden','followup']));
if(process.argv.includes('--apply'))fs.writeFileSync(target,JSON.stringify(overlay,null,2)+'\n');
console.log(JSON.stringify({...summary,jev:{cumulative_records:summary.jev.cumulative_records,remaining_records:summary.jev.remaining_records,remaining_budget_usd:summary.jev.remaining_budget_usd},applied:process.argv.includes('--apply')},null,2));
