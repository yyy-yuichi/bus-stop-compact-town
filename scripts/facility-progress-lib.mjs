import assert from 'node:assert/strict';

export const FINAL_DISPOSITIONS = new Set([
  'reflected_update', 'reflected_addition', 'verified_no_change', 'duplicate', 'out_of_scope',
]);
const types = new Set(['closure', 'opening', 'relocation', 'rename', 'temporary_change', 'other']);
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const https = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
};

// Enumeration completeness and event resolution are independent. A fully enumerated
// article can still contain held events; a partial inventory can never complete it.
export function buildArticleProgress(articles, reviews, overlay, checkedAt) {
  assert(day(checkedAt));
  const byKey = new Map(articles.map(row => [row.key, row]));
  assert.equal(byKey.size, articles.length, 'Duplicate article key');
  const updates = new Map(overlay.updates.map(row => [row.id, row.review]));
  const additions = new Map(overlay.additions.map(row => [row.id, row.properties.freshness_review]));
  const reviewed = new Map(), events = new Map(), eventRows = [];
  for (const review of reviews) {
    const article = byKey.get(review.article_key);
    assert(article, `Unknown article: ${review.article_key}`);
    assert(!reviewed.has(review.article_key), `Duplicate review: ${review.article_key}`);
    assert.equal(review.source_body_hash, article.body_hash, `Article body changed: ${article.key}`);
    assert(day(review.reviewed_at) && review.reviewed_at <= checkedAt, 'Invalid review date');
    assert.equal(typeof review.inventory_complete, 'boolean');
    assert(review.inventory_reason?.trim(), 'Inventory reason required');
    assert(Array.isArray(review.events) && review.events.length, 'Record an explicit event/disposition, including no-change or out-of-scope');
    for (const event of review.events) {
      assert(typeof event.event_id === 'string' && event.event_id.startsWith(`${article.key}:`));
      assert(!events.has(event.event_id), `Duplicate event: ${event.event_id}`);
      assert(types.has(event.event_type), 'Invalid event type');
      assert(FINAL_DISPOSITIONS.has(event.disposition) || event.disposition === 'hold', 'Invalid disposition');
      assert(Array.isArray(event.facility_ids) && new Set(event.facility_ids).size === event.facility_ids.length);
      assert(event.reason?.trim());
      assert(Array.isArray(event.source_urls) && event.source_urls.length && event.source_urls.every(https), 'Evidence URL required');
      const reflected = event.disposition === 'reflected_update' ? updates
        : event.disposition === 'reflected_addition' ? additions : null;
      if (reflected) {
        assert(event.facility_ids.length, 'Reflected event needs a facility');
        for (const id of event.facility_ids) {
          const applied = reflected.get(id);
          assert(applied, `No reflected facility: ${id}`);
          assert(event.source_urls.some(url => applied.sources.some(source => source.url === url)), `Unlinked evidence: ${id}`);
          if (['closure', 'opening', 'rename'].includes(event.event_type)) {
            assert.equal(applied.event, { closure: 'closed', opening: 'opened', rename: 'renamed' }[event.event_type], `Event mismatch: ${id}`);
            assert.equal(event.effective_at ?? null, applied.effective_at, `Event date mismatch: ${id}`);
          }
        }
      }
      events.set(event.event_id, event);
      eventRows.push({ article_key: article.key, event_id: event.event_id, event_type: event.event_type,
        facility_ids: event.facility_ids.join('|'), disposition: event.disposition,
        effective_at: event.effective_at ?? '', source_urls: event.source_urls.join('|'), reason: event.reason,
        duplicate_of: event.duplicate_of ?? '' });
    }
    reviewed.set(article.key, review);
  }
  for (const event of events.values()) {
    if (event.disposition !== 'duplicate') continue;
    const original = events.get(event.duplicate_of);
    assert(original && original !== event && FINAL_DISPOSITIONS.has(original.disposition)
      && original.disposition !== 'duplicate', 'Duplicate must identify a resolved original event');
    assert.equal(event.event_type, original.event_type, 'Duplicate event type mismatch');
    assert.deepEqual([...event.facility_ids].sort(), [...original.facility_ids].sort(), 'Duplicate facility mismatch');
    assert.equal(event.effective_at ?? null, original.effective_at ?? null, 'Duplicate date mismatch');
  }
  const articleRows = articles.map(article => {
    const review = reviewed.get(article.key);
    const complete = review?.inventory_complete && review.events.every(event => FINAL_DISPOSITIONS.has(event.disposition));
    return { queue_number: article.queue_number, key: article.key, title: article.title, url: article.url,
      source: article.source, jev_event: article.jev_event,
      status: complete ? 'completed_all_identified_events' : review ? 'partially_reviewed' : 'pending_article_event_verification',
      inventory_complete: review?.inventory_complete ?? false,
      reviewed_events: review?.events.length ?? 0,
      related_source: Boolean(article.related_source), source_receipts_fetched: article.source_receipts_fetched ?? 0 };
  });
  return { articleRows, eventRows, summary: {
    total: articles.length, classified_by_jev: articles.filter(row => row.jev_event).length,
    articles_completed: articleRows.filter(row => row.status === 'completed_all_identified_events').length,
    articles_partially_reviewed: articleRows.filter(row => row.status === 'partially_reviewed').length,
    articles_pending: articleRows.filter(row => row.status === 'pending_article_event_verification').length,
    recorded_events: eventRows.length,
    final_event_decisions: eventRows.filter(row => FINAL_DISPOSITIONS.has(row.disposition)).length,
    held_events: eventRows.filter(row => row.disposition === 'hold').length,
    with_related_source_only: articleRows.filter(row => row.related_source).length,
    note: 'Article inventory and event decisions are separate. Total events are unknown until all articles are enumerated.',
  } };
}

export function additionLedgerRows(additions) {
  return additions.map(row => ({ id: row.id, name: row.properties.name, city: row.properties.city ?? '',
    category: row.properties.category ?? '', dataset: 'public/data/facility-current.json',
    status: 'reflected_addition', scope: 'addition' }));
}
