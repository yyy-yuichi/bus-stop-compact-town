import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildArticleProgress, additionLedgerRows } from './facility-progress-lib.mjs';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const checked = '2026-09-25';
function fixture() {
  return {
    articles: [
      { key: 'article-a', body_hash: 'a'.repeat(64), jev_event: 'closure', related_source: true },
      { key: 'article-b', body_hash: 'b'.repeat(64), jev_event: 'opening', related_source: true },
    ],
    overlay: { additions: [], updates: [{ id: 'shop-a', review: {
      event: 'closed', effective_at: '2026-08-20', sources: [{ url: 'https://operator.example/closure' }],
    } }] },
    reviews: [{ article_key: 'article-a', source_body_hash: 'a'.repeat(64), inventory_complete: true,
      reviewed_at: checked, inventory_reason: 'All events inspected.', events: [{
        event_id: 'article-a:close', event_type: 'closure', facility_ids: ['shop-a'],
        disposition: 'reflected_update', effective_at: '2026-08-20',
        reason: 'Branch and date agree.', source_urls: ['https://operator.example/closure'],
      }] }],
  };
}
const build = f => buildArticleProgress(f.articles, f.reviews, f.overlay, checked);

test('related links do not complete an article without an explicit inventory', () => {
  const result = build(fixture());
  assert.equal(result.summary.articles_completed, 1);
  assert.equal(result.summary.articles_pending, 1);
  assert.equal(result.articleRows[1].status, 'pending_article_event_verification');
});

test('complete inventory with a hold remains partial; resolving it advances progress', () => {
  const f = fixture();
  f.reviews[0].events[0].disposition = 'hold';
  assert.equal(build(f).summary.articles_partially_reviewed, 1);
  assert.equal(build(f).summary.held_events, 1);
  f.reviews[0].events[0].disposition = 'reflected_update';
  assert.equal(build(f).summary.articles_completed, 1);
  f.reviews[0].inventory_complete = false;
  assert.equal(build(f).summary.articles_completed, 0);
});

test('one resolved event cannot complete an article containing another held event', () => {
  const f = fixture();
  f.reviews[0].events.push({ ...f.reviews[0].events[0], event_id: 'article-a:second',
    facility_ids: [], disposition: 'hold', reason: 'Second branch unresolved.' });
  const result = build(f);
  assert.equal(result.summary.recorded_events, 2);
  assert.equal(result.summary.articles_completed, 0);
});

test('invalid evidence, changed inputs, missing facilities and event mismatches fail closed', () => {
  const mutations = [
    f => { f.reviews[0].source_body_hash = 'changed'; },
    f => { f.reviews[0].events[0].source_urls = []; },
    f => { f.reviews[0].events[0].source_urls = ['https://unrelated.example/']; },
    f => { f.reviews[0].events[0].facility_ids = ['missing']; },
    f => { f.reviews[0].events[0].event_type = 'opening'; },
    f => { f.reviews[0].events[0].effective_at = '2026-08-21'; },
    f => { f.reviews[0].events = []; },
    f => { f.reviews[0].reviewed_at = '2026-09-26'; },
  ];
  for (const mutate of mutations) {
    const f = fixture(); mutate(f);
    assert.throws(() => build(f));
  }
});

test('duplicate events must identify a resolved original', () => {
  const f = fixture();
  f.reviews.push({ ...f.reviews[0], article_key: 'article-b', source_body_hash: 'b'.repeat(64),
    events: [{ ...f.reviews[0].events[0], event_id: 'article-b:duplicate', disposition: 'duplicate' }] });
  assert.throws(() => build(f));
  f.reviews[1].events[0].duplicate_of = 'article-a:close';
  assert.equal(build(f).summary.articles_completed, 2);
  f.reviews[1].events[0].facility_ids = ['another-shop'];
  assert.throws(() => build(f));
});

test('tracked metadata reproduces current progress without private local CSV files', () => {
  const summary = read('data-sources/facility-progress-20260925/progress-summary.json');
  const articles = read('data-sources/facility-progress-20260925/article-index.json');
  const reviews = read('data-sources/facility-progress-20260925/article-event-reviews.json');
  const overlay = read('public/data/facility-current.json');
  const result = buildArticleProgress(articles, reviews, overlay, summary.checked_at);
  assert.deepEqual(result.summary, summary.article_events);
  assert(result.eventRows.some(row => row.facility_ids === 'osm-way-483625942'));
  assert.equal(result.articleRows.length, result.summary.articles_completed
    + result.summary.articles_partially_reviewed + result.summary.articles_pending);
  const additions = additionLedgerRows(overlay.additions);
  assert(additions.every(row => row.city && row.category));
  assert.equal(additions.find(row => row.id === 'official-relocated-harete-wakadan').city, '下関市');
});
