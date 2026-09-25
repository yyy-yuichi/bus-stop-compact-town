import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hash} from './jev-batch.mjs';
import {localDisposition} from './facility-local-stores-lib.mjs';
import {SHOPPING_CATEGORIES,categoryOf} from '../src/facilityCatalog.ts';
import {facilityIconMarkup} from '../src/facilityIcons.ts';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),d='data-sources/facility-local-stores-20260925',p=read(d+'/review-policy.json'),s=read(d+'/adoption-summary.json'),rows=read(d+'/decisions.json'),overlay=read('public/data/facility-current.json');
test('all 97 inputs accounted for, without presenting them as 97 new shops',()=>{
 assert.equal(rows.length,97);assert.equal(new Set(rows.map(r=>r.id)).size,97);
 assert.equal(rows.filter(r=>r.decision.startsWith('add_')).length,72);
 for(const [decision,n] of Object.entries({already_present:1,aggregate_source:1,hold_offsite:8,hold_suspended:1,hold_relocated:11,outside_scope:3}))assert.equal(rows.filter(r=>r.decision===decision).length,n);
 assert.equal(rows.filter(r=>r.route_overridden).length,7);assert.equal(rows.filter(r=>r.category_overridden).length,1);
});
test('offsite, suspended and relocated records cannot be placed at former complex',()=>{
 const modelLure={id:'karato-market-228',group:'market_current',directory_sources:[],jev_route:'new_current_listing'};
 assert.equal(localDisposition(modelLure,p).decision,'hold_suspended');
 assert.equal(localDisposition({...modelLure,id:'new-offsite',directory_sources:[p.market.offsite_directory]},p).decision,'hold_offsite');
 assert.equal(localDisposition({...modelLure,group:'harete_graduate'},p).decision,'hold_relocated');
 for(const r of rows.filter(r=>r.decision.startsWith('hold_')||r.decision==='outside_scope'))assert(!overlay.additions.some(f=>f.id==='official-'+r.id));
});
test('one business summary preserves both market listing IDs and sources',()=>{
 const f=overlay.additions.find(f=>f.id==='official-karato-market-232');assert(f);
 assert.deepEqual(f.properties.source_ids,['official:karato:market:232','official:karato:market:5544']);
 assert(!overlay.additions.some(f=>f.id==='official-karato-market-5544'));
 assert(f.properties.freshness_review.sources.some(s=>s.url.endsWith('/5544/')));
 assert(f.properties.freshness_review.limits.some(t=>t.includes('異なる売場')));
});
test('current page identity overrides old slugs and known future-opening promises',()=>{
 const by=id=>overlay.additions.find(f=>f.id==='official-'+id);
 assert(by('harete-733e1c15c22e').properties.name.includes('OWL'));
 assert(by('harete-c3cde32a6b7f').properties.name.includes('イヤシロチ'));
 assert.equal(by('harete-3ef746b2b020').properties.freshness_review.event,'listed');
 assert.equal(by('harete-3ef746b2b020').properties.freshness_review.effective_at,null);
 for(const [id,date]of Object.entries(p.harete.opening_dates))assert.equal(by(id).properties.freshness_review.effective_at,date);
 assert.equal(overlay.additions.filter(f=>f.properties.name==='SOY STOCK').length,1);
});
test('food specialists use dedicated shopping category and shared-point warning',()=>{
 assert.equal(SHOPPING_CATEGORIES.find(c=>c.id==='food_shop').group,'shopping');assert(facilityIconMarkup('food_shop').includes('<path'));
 const added=rows.filter(r=>r.decision.startsWith('add_')).map(r=>overlay.additions.find(f=>f.id===r.facility_id));
 assert.equal(added.filter(f=>categoryOf(f).id==='food_shop').length,60);
 for(const f of added){assert(f.properties.location_verification.includes('施設全体の代表点'));assert(f.properties.location_verification.includes('店舗入口'));}
 assert.equal(new Set(added.map(f=>JSON.stringify(f.geometry.coordinates))).size,2,'Two complex points, not 72 measured entrances');
});
test('latest checkpoint exact overlay, previous data immutable, approval cap respected',()=>{
 assert.equal(hash(overlay),s.after_overlay_hash);assert.equal(hash(p),s.policy_hash);
 const addedIds=new Set(rows.filter(r=>r.decision.startsWith('add_')).map(r=>r.facility_id));
 assert.equal(hash({...overlay,additions:overlay.additions.filter(f=>!addedIds.has(f.id))}),s.before_overlay_hash);
 assert.equal(s.jev.cumulative_records,2016);assert(s.jev.cumulative_reservation_usd<=1);assert.equal(s.jev.remaining_records,984);
 assert.equal(s.after_count,7901);assert.equal(s.normal_candidates,7840);
});
