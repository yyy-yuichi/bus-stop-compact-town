import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyFacilityAudit, validateAuditReview, publicEvidenceUrl } from '../src/facilityAudit.ts';
import { applyFacilityCurrent, facilityAvailable } from '../src/facilityFreshness.ts';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const raw = ['shopping.geojson', 'civic-facilities.geojson'].flatMap(p => read(`public/data/${p}`).features);
const previous = applyFacilityCurrent(raw, read('public/data/facility-current.json'));
const data = read('public/data/facility-audit.json');
const before = JSON.stringify(previous), saved = JSON.stringify(data);
const current = applyFacilityAudit(previous, data);
const priorById = new Map(previous.map(f => [f.id, f]));
const audits = new Map(data.reviews.map(r => [r.id, r]));
const recovered = new Set(data.recovered_verifications.map(r => r.id));
test('formal v13 and 23 recovered registry results are reconciled once', () => {
  assert.deepEqual(data.counts, { reviewed: 2828, limited_support: 1330, unresolved: 1498, recovered_registry: 23 });
  assert.equal(raw.length, 7764);
  assert.equal(data.provenance.canonical_sha256, '27d739ea29231a46ec7a9dbf337d65c089720cca5f4dd4b1e3c40de195c6282e');
  assert.equal(current.length, previous.length);
  assert.equal(new Set(current.map(f => f.id)).size, current.length);
  assert.deepEqual(current.map(f => f.id), previous.map(f => f.id));
  assert.equal(new Set([...audits.keys(), ...recovered]).size, 2851);
  assert(raw.every(f => { const after = current.find(a => a.id === f.id); return !!(after.properties.audit_review || after.properties.registry_review || after.properties.freshness_review); }), 'Every original has a preserved earlier decision or explicit scoped audit status');
  assert.equal(JSON.stringify(previous), before);
  assert.equal(JSON.stringify(data), saved);
  assert.deepEqual(applyFacilityAudit(previous, data), current);
});
test('limited support never silently changes operation, identity, location or services', () => {
  for (const f of current) {
    const old = priorById.get(f.id);
    assert.deepEqual(f.geometry, old.geometry);
    for (const key of ['name', 'category', 'source_ids', 'registered_details', 'civic_details', 'freshness_review', 'duplicate_of']) assert.deepEqual(f.properties[key], old.properties[key]);
    assert.equal(facilityAvailable(f), facilityAvailable(old));
    if (audits.has(f.id)) {
      assert.deepEqual(f.properties.audit_review, audits.get(f.id).review);
      assert.equal(f.properties.registry_review, undefined);
    } else if (recovered.has(f.id)) {
      assert(f.properties.registry_review);
      assert.equal(f.properties.audit_review, undefined);
    } else assert.deepEqual(f, old);
  }
});
test('bad counts, duplicate IDs, scope drift and overlapping decisions fail closed', () => {
  const check = change => { const copy = structuredClone(data); change(copy); assert.throws(() => applyFacilityAudit(previous, copy)); };
  check(x => x.counts.limited_support++);
  check(x => x.reviews.push(x.reviews[0]));
  check(x => x.reviews[0].expected.name += 'drift');
  check(x => x.reviews[0].expected.geometry.coordinates = [0, 0]);
  check(x => x.reviews[0].id = x.recovered_verifications[0].id);
  check(x => x.recovered_verifications[0].changes.name = 'Unauthorized rename');
  check(x => x.reviews.find(r => r.review.status === 'limited_support').review.sources = [{title: 'unsafe', url: 'javascript:alert(1)'}]);
  check(x => x.reviews.find(r => r.review.status === 'unresolved').review.accepted_type = 'current_operating');
  assert.throws(() => applyFacilityAudit(current, data));
});
test('only safe public evidence URLs and complete scope records are rendered', () => {
  for (const entry of data.reviews) {
    validateAuditReview(entry.review, data.checked_at);
    assert.deepEqual(Object.keys(entry).sort(), ['expected', 'id', 'review']);
    assert.deepEqual(Object.keys(entry.review).sort(), ['accepted_type', 'checked_at', 'limits', 'scope', 'sources', 'status', 'summary']);
    for (const source of entry.review.sources) assert.deepEqual(Object.keys(source).sort(), ['title', 'url']);
  }
  for (const url of ['javascript:alert(1)', 'https://user:secret@example.org/', 'https://drive.google.com/file/d/private/view', 'http://127.0.0.1/a', 'https://example.org/?token=secret', 'http://[::1]/', 'https://a.drive.google.com/file', 'https://chatgpt.com/files/a', 'https://a.blob.core.windows.net/private', 'https://example.org/?X-Amz-Signature=secret']) assert.equal(publicEvidenceUrl(url), false);
  assert(publicEvidenceUrl('https://example.org/facility'));
  const serialized = JSON.stringify(data);
  assert(!/drive\.google\.com|docs\.google\.com|sediment:|file_uri|workspace_path|raw_bytes|base64|%PDF|BEGIN PRIVATE KEY/.test(serialized));
});
