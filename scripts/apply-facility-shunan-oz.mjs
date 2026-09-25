import fs from 'node:fs';
import assert from 'node:assert/strict';
import {hash} from './jev-batch.mjs';
import {adoptShunanBatch} from './facility-shunan-oz-lib.mjs';
import {applyFacilityCurrent, facilityAvailable} from '../src/facilityFreshness.ts';
const pub='data-sources/facility-shunan-oz-20260925', out='outputs/facility-shunan-oz-20260925';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const inputs=read(pub+'/review-inputs.json'),rows=read(pub+'/adoptions.json'),before=read(out+'/before-overlay.json');
assert.equal(hash(before),inputs.before_overlay_hash);
for(const r of inputs.source_receipts)assert.equal(hash(read(r.file)),r.hash,'Immutable source changed');
const raw=['shopping.geojson','civic-facilities.geojson'].flatMap(f=>read('public/data/'+f).features);
const current=read('public/data/facility-current.json');
const {overlay,newAdditions,newUpdates}=adoptShunanBatch(current,rows.additions,rows.update);
assert.equal(hash({...overlay,additions:overlay.additions.filter(f=>!rows.additions.some(a=>a.id===f.id)),updates:overlay.updates.filter(f=>f.id!==rows.update.id)}),hash(before),'Unrelated record drift');
const records=applyFacilityCurrent(raw,overlay);
const summary={checked_at:'2026-09-25',batch:'shunan-summer-closures-oz-and-current-successors',reviewed_articles:24,reviewed_targets:15,changes_this_batch:{additions:3,updates:1,confirmed_opening_dates:1,current_listings_date_unknown:2,closed_existing_ids:1},cumulative_updates:overlay.updates.length,cumulative_additions:overlay.additions.length,current_records_including_history:records.length,normal_candidates:records.filter(f=>f.properties.category!=='reference'&&facilityAvailable(f)).length,closed_records:records.filter(f=>f.properties.freshness_review?.status==='closed').length,before_overlay_hash:hash(before),after_overlay_hash:hash(overlay),adoptions_hash:hash(rows),inputs_hash:hash(inputs),extra_jev_requests:0,jev_remaining:read('data-sources/facility-progress-20260925/progress-summary.json').jev_remaining};
if(process.argv.includes('--apply')){write('public/data/facility-current.json',overlay);write(pub+'/adoption-summary.json',summary);}
console.log(JSON.stringify({new_additions:newAdditions,new_updates:newUpdates,applied:process.argv.includes('--apply'),...summary}));
