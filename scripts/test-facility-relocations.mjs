import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hash } from './jev-batch.mjs';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const overlay = read('public/data/facility-current.json');
const decisions = read('data-sources/facility-relocations-20260925/adoptions.json');
const statuses = read('data-sources/facility-relocations-20260925/relocation-review.json');
const summary = read('data-sources/facility-relocations-20260925/adoption-summary.json');
const earlier = read('data-sources/facility-local-stores-20260925/adoption-summary.json');

test('all eleven graduates have separate final states without pretending mobile is a fixed shop', () => {
  assert.equal(statuses.length, 11);
  assert.equal(new Set(statuses.map(row => row.graduate_id)).size, 11);
  assert.equal(statuses.filter(row => row.status === 'reflected_addition').length, 8);
  assert.equal(statuses.filter(row => row.status === 'conflicting_current_listing_hold').length, 2);
  assert.equal(statuses.filter(row => row.status === 'mobile_no_fixed_point').length, 1);
  assert.equal(summary.map_changes_this_batch, 4);
  assert.equal(summary.jev_additional_requests, 0);
});

test('four relocated facilities have their own sourced point, not the former complex point or an invented opening date', () => {
  const oldComplex = [130.9440486, 33.9575229];
  for (const decision of decisions) {
    const feature = overlay.additions.find(row => row.id === decision.facility_id);
    assert(feature, decision.facility_id);
    assert.deepEqual(feature.geometry.coordinates, decision.coordinates);
    assert.notDeepEqual(feature.geometry.coordinates, oldComplex);
    assert.equal(feature.properties.freshness_review.event, 'listed');
    assert.equal(feature.properties.freshness_review.effective_at, null);
    assert(feature.properties.location_verification.includes('入口'));
    assert(feature.properties.freshness_review.sources.some(row => row.url === decision.self_url));
    assert(feature.properties.freshness_review.sources.some(row => row.url === decision.map_url));
    assert(statuses.some(row => row.graduate_id === decision.graduate_id && row.map_feature_id === feature.id));
  }
  assert.equal(overlay.additions.filter(row => statuses.some(status => status.map_feature_id === row.id)).length, 8);
  assert.equal(hash({ ...overlay, additions: overlay.additions.slice(0, 137) }), earlier.after_overlay_hash);
});

test('unresolved closure candidates stay unchanged', () => {
  assert(!overlay.updates.some(row => ['osm-way-1236531275', 'osm-way-465881162'].includes(row.id)));
});
