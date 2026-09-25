import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const items = read('data-sources/facility-relocations-20260925/followup-adoptions.json');
const overlay = read('public/data/facility-current.json');
const statuses = read('data-sources/facility-relocations-20260925/relocation-review.json');

test('four further relocated shops use matching new-shop points without invented opening dates', () => {
  assert.equal(items.length, 4);
  for (const item of items) {
    const row = overlay.additions.find(value => value.id === item.facility_id);
    assert(row, item.facility_id);
    assert.deepEqual(row.geometry.coordinates, item.coordinates);
    assert.equal(row.properties.freshness_review.event, 'listed');
    assert.equal(row.properties.freshness_review.effective_at, null);
    assert.equal(row.properties.official_url, item.operator_url);
    assert(row.properties.freshness_review.sources.some(source => source.url === item.map_url));
    assert(statuses.some(status => status.graduate_id === item.graduate_id
      && status.status === 'reflected_addition' && status.map_feature_id === item.facility_id));
  }
});

test('contradictory listings do not become open or closed map records', () => {
  for (const id of ['harete-graduate-01', 'harete-graduate-02']) {
    const row = statuses.find(value => value.graduate_id === id);
    assert.equal(row.status, 'conflicting_current_listing_hold');
    assert.equal(row.map_feature_id, null);
  }
  assert(!overlay.additions.some(row => /iiyan|d-day/i.test(row.id)));
});
