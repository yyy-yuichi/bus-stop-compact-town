import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const lines = path => fs.readFileSync(path, 'utf8').trimEnd().split(/\r?\n/);
const summary = read('data-sources/facility-progress-20260925/progress-summary.json');
const reviews = read('data-sources/facility-progress-20260925/article-event-reviews.json');
const articleLines = lines('outputs/facility-progress-20260925/article-status.csv');
const eventLines = lines('outputs/facility-progress-20260925/event-status.csv');
const facilityLines = lines('outputs/facility-progress-20260925/facility-status.csv');

test('article completion requires explicit inventory and event decision', () => {
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].article_key, 'kaiten-612997');
  assert.equal(reviews[0].inventory_complete, true);
  assert.equal(reviews[0].events.length, 1);
  assert.equal(summary.article_events.total, 1186);
  assert.equal(summary.article_events.articles_completed, 1);
  assert.equal(summary.article_events.articles_pending, 1185);
  assert.equal(summary.article_events.final_event_decisions, 1);
  assert.equal(summary.article_events.with_related_source_only, 35);
  assert.equal(articleLines.length, 1187);
  assert.equal(articleLines.filter(line => line.includes('"completed_all_identified_events"')).length, 1);
  assert.equal(eventLines.length, 2);
  assert(eventLines[1].includes('"osm-way-483625942"'));
});

test('addition rows preserve city and category for grouped review', () => {
  assert.equal(facilityLines.length, 7910);
  const newRow = facilityLines.find(line => line.includes('"official-relocated-harete-wakadan"'));
  assert(newRow?.includes('"下関市"'));
  assert(newRow?.includes('"restaurant"'));
});
