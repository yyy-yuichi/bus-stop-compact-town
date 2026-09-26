import fs from 'node:fs';
import assert from 'node:assert/strict';
import { hash } from './jev-batch.mjs';
import { adoptListings } from './facility-successors-lib.mjs';
const out = 'outputs/facility-successors-20260925';
const pub = 'data-sources/facility-successors-20260925';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const rows = read(`${out}/store-review.json`), decisions = read(`${pub}/decisions.json`);
assert.equal(rows.length, decisions.length);
assert.equal(new Set(decisions.map(row => row.id)).size, decisions.length);
for (const row of rows) {
  assert.equal(hash(read(row.receipt)), row.receipt_hash, 'Source receipt changed');
  const decision = decisions.find(d => d.id === row.id);
  assert.equal(decision?.decision, 'add_current_listing');
  assert(row.jev?.choice && row.jev?.confidence !== undefined, 'Missing saved Jev route');
  for (const id of [decision.host_id, decision.prior_occupant_id, ...(decision.host_candidate_ids ?? [])].filter(Boolean)) {
    assert(row.nearby.some(r => r.id === id), `Decision not linked to compared record: ${id}`);
  }
}
const baseline = ['shopping.geojson', 'civic-facilities.geojson'].flatMap(file => read(`public/data/${file}`).features);
const current = read('public/data/facility-current.json');
const { overlay, newly_added } = adoptListings(current, rows, baseline);
const before = read(`${out}/before-overlay.json`);
assert.equal(hash({ ...overlay, additions: overlay.additions.filter(r => !rows.some(s => s.id === r.id)) }), hash(before), 'Unrelated overlay changed');
const publicRows = rows.map(({ nearby, ...row }) => ({ ...row, compared_candidates: nearby, decision: decisions.find(d => d.id === row.id) }));
const jev = read(`${out}/summary.json`);
const summary = { checked_at: '2026-09-25', batch: 'watts-ube-all-and-onoda-successor',
  reviewed_listings: rows.length, map_additions_in_checkpoint: rows.length, map_updates_in_checkpoint: 0,
  official_watts_city_count: 8, independent_new_buildings_claimed: 0,
  cumulative_updates: overlay.updates.length, cumulative_additions: overlay.additions.length,
  current_records_including_history: baseline.length + overlay.additions.length,
  before_overlay_hash: hash(before), after_overlay_hash: hash(overlay),
  jev: { ...jev, batch_scope: 'Saved current official listings versus existing candidate records. Routing only; final identity and adoption manually checked.',
    manually_rerouted: ['official-secondstreet-31983'] } };
if (process.argv.includes('--apply')) {
  write('public/data/facility-current.json', overlay);
  write(`${pub}/adoptions.json`, publicRows);
  write(`${pub}/adoption-summary.json`, summary);
}
console.log(JSON.stringify({ would_add: newly_added, newly_reflected: process.argv.includes('--apply') ? newly_added : 0,
  cumulative_additions: overlay.additions.length, cumulative_updates: overlay.updates.length }));
