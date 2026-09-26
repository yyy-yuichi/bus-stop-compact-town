import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const input = 'outputs/facility-local-stores-20260925/continued-review-queue.json';
const articles = JSON.parse(fs.readFileSync(input, 'utf8'));
const hash = text => createHash('sha256').update(text).digest('hex');
const rows = articles.map(row => {
  assert.equal(hash(row.body), row.body_hash, `Body hash mismatch: ${row.key}`);
  return { key: row.key, queue_number: row.queue_number, title: row.title, url: row.url,
    source: row.source, body_hash: row.body_hash, jev_event: row.jev_event,
    related_source: (row.linked_evidence ?? []).some(item => (item.adopted_ids ?? []).length)
      || (row.reconcile_linked_ids ?? []).length > 0
      || (row.local_directory_reviews ?? []).some(item => ['add_current_listing', 'add_opening', 'already_present', 'aggregate_source'].includes(item.decision)),
    source_receipts_fetched: (row.linked_evidence ?? []).filter(item => item.state === 'fetched').length };
});
fs.writeFileSync('data-sources/facility-progress-20260925/article-index.json', JSON.stringify(rows, null, 2) + '\n');
console.log(JSON.stringify({ articles: rows.length, article_bodies_published: 0 }));
