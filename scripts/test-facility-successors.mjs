import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hash } from './jev-batch.mjs';
import { wattsStore, secondStreetStore, adoptListings } from './facility-successors-lib.mjs';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const rows = read('data-sources/facility-successors-20260925/adoptions.json');
const summary = read('data-sources/facility-successors-20260925/adoption-summary.json');
const overlay = read('public/data/facility-current.json');
const raw = ['shopping.geojson', 'civic-facilities.geojson'].flatMap(file => read(`public/data/${file}`).features);

test('Watts parser binds name and ID, never another nearby marker or viewport', () => {
  const html = '<h1><span>Shop Information</span>ワッツ東須恵店</h1><dt>住所</dt><dd>山口県宇部市東須恵768 ウォンツ店内</dd><dt>営業時間</dt><dd>9:00～21:00</dd>'
    + '{id: 111, name: "他の店", lat: 35.1, lng: 139.1},'
    + '{id: 47917, name: "ワッツ東須恵店<!-- note -->", lat: 33.989, lng: 131.206}';
  const r = { status: 200, url: 'https://www.watts-jp.com/shop/47917/', html };
  assert.deepEqual(wattsStore(r).coordinates, [131.206, 33.989]);
  assert.equal(wattsStore({ ...r, html: html.replace('宇部市東須恵768 ウォンツ店内', '山口市嘉川1379-3') }).city, '山口市');
  assert.equal(wattsStore({ ...r, html: html.replace('宇部市東須恵768 ウォンツ店内', '大島郡周防大島町西三蒲1653-1') }).city, '周防大島町');
  assert.throws(() => wattsStore({ ...r, html: html.replace('山口県宇部市', '広島県広島市') }));
  assert.throws(() => wattsStore({ ...r, html: html.replace('id: 47917', 'id: 222') }));
  assert.throws(() => wattsStore({ ...r, html: html.replace('ワッツ東須恵店<!-- note -->', '別の支店') }));
  assert.throws(() => wattsStore({ ...r, html: html + '{id: 47917, name: "ワッツ東須恵店", lat: 33.9, lng: 131.2}' }));
});

test('Second Street uses the shop directions destination, not a map zoom center', () => {
  const r = { status: 200, url: 'https://www.2ndstreet.jp/shop/details?shopsId=31983',
    html: '<title>セカンドストリート 山陽小野田店｜案内</title><dt>住所</dt><dd>山口県山陽小野田市中川3丁目10番17号</dd><a href="https://www.google.com/maps/dir//33.985,131.174">経路</a>center=34,132' };
  assert.deepEqual(secondStreetStore(r).coordinates, [131.174, 33.985]);
  assert.throws(() => secondStreetStore({ ...r, html: r.html.replace('/maps/dir//', '/maps/?center=') }));
});

test('all eight city listings plus successor retain their own source points and null opening dates', () => {
  assert.equal(rows.filter(row => row.category === 'variety_store').length, 8);
  assert.equal(rows.filter(row => row.category === 'second_hand').length, 1);
  assert.equal(new Set(rows.map(row => row.id)).size, 9);
  for (const row of rows) {
    const feature = overlay.additions.find(f => f.id === row.id);
    assert.deepEqual(feature.geometry.coordinates, row.coordinates);
    assert.equal(feature.properties.freshness_review.event, 'listed');
    assert.equal(feature.properties.freshness_review.effective_at, null);
    assert(feature.properties.location_verification.includes('入口'));
    assert(feature.properties.freshness_review.sources.some(s => s.url === row.url));
  }
  const checkpoint = { ...overlay, checked_at: '2026-09-25', updates: overlay.updates.slice(0, summary.cumulative_updates), additions: overlay.additions.slice(0, summary.cumulative_additions) };
  assert.equal(hash({ ...checkpoint, additions: checkpoint.additions.filter(f => !rows.some(r => r.id === f.id)) }), summary.before_overlay_hash);
  assert.equal(hash(checkpoint), summary.after_overlay_hash);
  assert.equal(overlay.updates.find(r => r.id === 'osm-way-332618123').review.status, 'closed');
});

test('replay is a true no-op and does not claim nine newly applied records again', () => {
  const once = adoptListings(overlay, rows, raw);
  assert.equal(once.newly_added, 0);
  assert.deepEqual(once.overlay, overlay);
  const drift = structuredClone(rows); drift[0].coordinates[0] += 0.01;
  assert.throws(() => adoptListings(overlay, drift, raw));
});

test('primary closure announcement with no old map ID does not close a different-city restaurant', () => {
  const check = read('data-sources/facility-successors-20260925/closure-absence-check.json');
  assert.equal(check.checked_baseline, 7764);
  assert.deepEqual(check.matching_existing_ids, []);
  assert(check.excluded_similar_names.some(row => row.id === 'osm-node-2253231310'));
  assert(!overlay.updates.some(row => row.id === 'osm-node-2253231310'));
  assert(overlay.additions.some(row => row.id === check.current_successor_id));
});

test('Jev budget counts each target once and its routing never overrides the identity decision', () => {
  assert.equal(summary.jev.jev.record_count, 9);
  assert.equal(summary.jev.jev.attempts, 2);
  assert.equal(summary.jev.remaining_records, 975);
  assert(summary.jev.cumulative_reservation_usd <= 1);
  const successor = rows.find(row => row.id === 'official-secondstreet-31983');
  assert.equal(successor.jev.choice, 'new_unmatched');
  assert.equal(successor.decision.human_route, 'different_prior_occupant');
});
