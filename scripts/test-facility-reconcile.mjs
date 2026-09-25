import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hash} from './jev-batch.mjs';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const d='data-sources/facility-reconcile-20260925', config=read(d+'/review-decisions.json'), evidence=read(d+'/adoption-evidence.json'), rows=read(d+'/store-decisions.json'), overlay=read('public/data/facility-current.json');
test('all 65 listings have exactly one disposition; 54 physical sites are not 65 new stores',()=>{
 assert.equal(rows.length,65);assert.equal(new Set(rows.map(r=>r.id)).size,65);
 assert.equal(rows.filter(r=>r.decision==='co_located_service').length,11);
 assert.equal(rows.filter(r=>r.decision.startsWith('add_')).length,39);
 assert.equal(rows.filter(r=>r.decision==='enrich_existing').length,13);
 assert.equal(rows.filter(r=>r.decision==='hold').length,2);
 assert.equal(rows.filter(r=>r.route_overridden).length,17);
});
test('pharmacy service remains traceable without duplicate physical additions',()=>{
 for(const [ph,store]of Object.entries(config.pharmacy_pairs)){
  const p=rows.find(r=>r.id==='tsuruha-'+ph),s=rows.find(r=>r.id==='tsuruha-'+store);assert.equal(p.facility_id,s.facility_id);
  assert(!overlay.additions.some(f=>f.id==='official-tsuruha-'+ph));
  const r=overlay.additions.find(f=>f.id===s.facility_id)?.properties.freshness_review??overlay.updates.find(u=>u.id===s.facility_id)?.review;
  assert(r.sources.some(r=>r.url==='https://shop.tsuruha-g.com/'+ph));
 }
});
test('published manifest binds the historical reviewed prefix and approval totals',()=>{
 // Later append-only batches must not invalidate or silently modify this checkpoint.
 const checkpoint={...overlay,updates:overlay.updates.slice(0,evidence.cumulative_overlay.updates),additions:overlay.additions.slice(0,evidence.cumulative_overlay.additions)};
 assert.equal(evidence.after_overlay_hash,hash(checkpoint));assert.equal(evidence.decisions_hash,hash(config));
 assert.equal(evidence.evidence.length,70);assert.equal(new Set(evidence.evidence.map(e=>e.id)).size,70);
 assert(evidence.jev.cumulative_records<=3000&&evidence.jev.cumulative_reservation_usd<=1);
 assert.equal(evidence.jev.cumulative_records,1919);assert.equal(evidence.jev.remaining_records,1081);
 assert.equal(evidence.changes_this_batch.new_confirmed_closures,3);assert.equal(evidence.changes_this_batch.already_excluded_closure_structured,1);
});
