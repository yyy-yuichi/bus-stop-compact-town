// Offline readback/report only: this never calls Jev or edits app data.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { applyFacilityCurrent, facilityAvailable } from '../src/facilityFreshness.ts';
import { summarize } from './jev-batch.mjs';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const input = read('data-sources/facility-events-20260925/jev-cases.json');
const decisions = read('data-sources/facility-events-20260925/decisions.json').decisions;
const overlay = read('public/data/facility-current.json');
const raw = ['shopping','civic-facilities'].flatMap(n => read(`public/data/${n}.geojson`).features);
const current = applyFacilityCurrent(raw, overlay);
const resultIds = new Set([...overlay.updates.map(r => r.id), ...overlay.additions.map(r => r.id)]);
assert.equal(decisions.length, input.cases.length);
assert.deepEqual(new Set(decisions.map(d => d.case_id)), new Set(input.cases.map(c => c.id)));
for (const d of decisions) if (d.decision === 'adopted' || d.decision === 'existing_notice_display') assert(resultIds.has(d.facility_id));
assert.equal(resultIds.size, decisions.filter(d => ['adopted','existing_notice_display'].includes(d.decision)).length);
const jev = summarize(read('outputs/jev-real-events-20260925/manifest.json'), 'outputs/jev-real-events-20260925');
const previous = summarize(read('data-sources/jev-api-pilot-20260925/manifest.json'), 'outputs/jev-api-pilot-20260925');
const files = ['public/data/shopping.geojson','public/data/civic-facilities.geojson','public/data/facility-current.json','data-sources/facility-events-20260925/jev-cases.json','data-sources/facility-events-20260925/decisions.json'];
const summary = {
  checked_at: overlay.checked_at,
  original_records: raw.length, records_with_history: current.length,
  records_not_confirmed_closed: current.filter(facilityAvailable).length,
  decision_counts: Object.fromEntries(['adopted','existing_notice_display','held','not_lifecycle_change'].map(s => [s,decisions.filter(d => d.decision === s).length])),
  jev_real_source_summaries: jev,
  combined_pilot: { records: previous.record_count + jev.record_count, attempts: previous.attempts + jev.attempts, estimated_usage_usd: previous.successful_usage_cost_usd + jev.successful_usage_cost_usd, conservative_attempt_reserve_usd: previous.conservative_cost_bound_usd + jev.conservative_cost_bound_usd },
  limitations: ['Agent-authored source summaries; Jev did not retrieve or independently verify sources.', 'No measured end-to-end speed-up against a matched no-Jev control.', 'Unreviewed facilities are not operating-confirmed.', 'All 100 originally authorized pilot targets have been consumed. No new API calls in this report.'],
  files: files.map(file => ({ file, sha256: sha(file) }))
};
fs.mkdirSync('outputs/facility-events-20260925', { recursive: true });
fs.writeFileSync('outputs/facility-events-20260925/summary.json', JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
