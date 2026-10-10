import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { applyFacilityCurrent, facilityAvailable } from '../src/facilityFreshness.ts';
import { applyFacilityAudit, validateAuditReview } from '../src/facilityAudit.ts';
import { applyFacilityContacts } from '../src/facilityContact.ts';
import { isFacilityWalkingCandidate } from '../src/facilityMapLocation.ts';
import { bakedFacilityCandidates, nearbyFacilityCandidates, prepareFacilities } from '../src/bakedWalking.ts';
import { mapFacilities } from '../src/facilityVisibility.ts';
import { searchPlaces } from '../src/placeSearch.ts';
const read = file => JSON.parse(fs.readFileSync(`public/data/${file}`, 'utf8'));
const ids = ['civic-KD0000900073', 'civic-care-3577100351-2f51378053', 'osm-node-1423657369', 'osm-node-1631278422'];
const relifeId = 'civic-care-3570303747-0ecce96e23';
const raw = [...read('shopping.geojson').features, ...read('civic-facilities.geojson').features], audit = read('facility-audit.json');
const facilities = applyFacilityContacts(applyFacilityAudit(applyFacilityCurrent(raw, read('facility-current.json')), audit), read('facility-contacts.json'));
const byId = new Map(facilities.map(f => [f.id, f])), targets = ids.map(id => byId.get(id));

test('only the two original care services receive source-listed identity support, without an operating decision', () => {
  assert.deepEqual(audit.counts, { reviewed: 2828, limited_support: 1365, unresolved: 1463, recovered_registry: 23 });
  assert.equal(facilities.length, 8369);
  for (const f of targets.slice(0, 2)) {
    assert.equal(f.properties.audit_review.status, 'limited_support');
    assert.equal(f.properties.audit_review.accepted_type, 'source_listed_identity_and_original_service_with_scope_limits');
    validateAuditReview(f.properties.audit_review, audit.checked_at);
    assert.equal(f.properties.freshness_review, undefined);
    assert.equal(f.properties.registry_review, undefined);
    assert(f.properties.audit_review.scope.includes('現所在地の実地確認・原点への適用・誤植訂正の認定ではありません'));
  }
  const nonta = targets[1];
  assert(nonta.properties.audit_review.summary.startsWith('原IDの番号3577100351と、名称・法人海祐会・電話0820-79-0655・訪問介護を照合'));
  assert(!Object.keys(nonta.properties.registered_details).some(k => /number|番号/.test(k)), 'The source number is encoded in the original ID, not an independent original property');
  assert(nonta.properties.audit_review.limits.some(s => s.includes('2026/09/01〜2032/08/31') && s.includes('2020/09/01〜2026/08/31') && s.includes('現指定有効性・失効・終了を認定しません')));
  assert(targets[0].properties.audit_review.limits.some(s => s.includes('原住所15-5・県市1-5-5・国1-1-5')));
});

test('school and playground evidence cannot support the current original classification or assisted living', () => {
  for (const f of targets.slice(2)) {
    assert.equal(f.properties.audit_review.status, 'unresolved');
    assert.equal(f.properties.audit_review.accepted_type, null);
    validateAuditReview(f.properties.audit_review, audit.checked_at);
  }
  assert.equal(targets[2].properties.category, 'reference');
  assert.equal(targets[2].properties.classification_review.status, 'pending');
  assert.deepEqual(targets[3].properties.registered_details.service, ['assisted_living']);
  assert(targets[3].properties.audit_review.summary.includes('原assisted_livingサービスは支持しない'));
});

test('all five retain every original feature field and every pre-existing source title', () => {
  for (const id of [...ids, relifeId]) {
    const f = structuredClone(byId.get(id)), original = raw.find(f => f.id === id);
    delete f.properties.audit_review;
    assert.deepEqual(f, original);
    assert.equal(facilityAvailable(byId.get(id)), facilityAvailable(original));
    const urls = byId.get(id).properties.audit_review.sources.map(s => s.url);
    assert.equal(new Set(urls).size, urls.length);
  }
  assert(targets[0].properties.audit_review.sources.some(s => s.url.endsWith('jigyoushoitiran89.pdf') && s.title === '公開資料 · www.city.kudamatsu.lg.jp'));
  assert(targets[1].properties.audit_review.sources.some(s => s.url.endsWith('3577100351_11.html') && s.title === '公開資料 · www.kaigo.pref.yamaguchi.lg.jp'));
});

test('all four original points are excluded from baked, nearby and pilot walking candidates', () => {
  for (const f of targets) {
    const l = f.properties.audit_review.map_location;
    assert.deepEqual(Object.keys(l).sort(), ['note', 'status']);
    assert.equal(l.status, 'unverified'); assert(l.note.trim());
    const [lon, lat] = f.geometry.coordinates, dx = 10 * 180 / (Math.PI * 6371000 * Math.cos(lat * Math.PI / 180));
    const origin = [lon - dx, lat], end = [lon + dx, lat];
    // Artificial roads test exclusion even when the original point is otherwise reachable.
    const c = { stopId: 'scoped-support-test', budget: 1000, origin, snap: origin, snapGap: 0, segments: [{ a: origin, b: end, d1: 0, d2: 20, grade: 0, steps: false }] };
    const unflagged = structuredClone(f); delete unflagged.properties.audit_review.map_location;
    if (f.properties.category !== 'reference') assert.equal(bakedFacilityCandidates(c, prepareFacilities([unflagged])).length, 1);
    assert.equal(bakedFacilityCandidates(c, prepareFacilities([f])).length, 0);
    assert.equal(nearbyFacilityCandidates(origin, prepareFacilities([f])).length, 0);
    assert(!isFacilityWalkingCandidate(f));
  }
});

test('walking exclusion preserves search and deliberate selection at the exact original geometry', () => {
  const scope = 'scoped-support-test:15', walking = { scope, ids };
  assert.deepEqual(mapFacilities(targets, ['social_facility', 'reference'], null, scope, walking), []);
  for (const f of targets) {
    assert(searchPlaces(f.properties.name, [], targets).facilities.some(x => x.id === f.id));
    assert.deepEqual(mapFacilities(targets, ['social_facility', 'reference'], f, scope, walking)[0].geometry, f.geometry);
  }
});

test('operator-page supplement leaves Relife unresolved and does not fill phone, current address or location', () => {
  const f = byId.get(relifeId), r = f.properties.audit_review;
  assert.equal(r.status, 'unresolved'); assert.equal(r.accepted_type, null);
  assert.equal(r.sources.filter(s => s.url === 'https://www.lcraft.biz/assistive-products').length, 1);
  assert(r.summary.includes('本人公開資料の限定補強') && r.summary.includes('現在点は未解消のまま'));
  assert(r.limits.some(s => s.includes('当日の営業・利用の保証ではありません')));
});

test('actual drawers keep source scope, designation conflict and unsupported assisted living visible without a current-service guarantee', async () => {
  const server = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom' });
  const oldWindow = globalThis.window;
  try {
    globalThis.window = { location: { href: 'https://example.org/' } };
    const { default: Drawer } = await server.ssrLoadModule('/src/FacilityDrawer.tsx');
    const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
    for (const f of [...targets, byId.get(relifeId)]) {
      const r = f.properties.audit_review, html = renderToStaticMarkup(React.createElement(Drawer, { facility: f, onClose() {} }));
      const outside = html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, '');
      assert(outside.includes(escape(r.summary)) && outside.includes(escape(r.scope)));
      assert(outside.includes('当日の営業や施設全体の状態を一括して保証するものではありません'));
      assert(!html.includes('aria-label="施設の変更確認"'));
      for (const limit of r.limits) assert(html.includes(escape(limit)));
      if (ids.includes(f.id)) assert(outside.includes('徒歩圏の集計・到達性判定の対象外'));
      if (f.id === ids[3]) assert(outside.includes('原assisted_livingサービスは支持しない'));
      if (r.status === 'unresolved') assert(outside.includes('未解決') && !outside.includes('限定範囲の根拠あり'));
      else assert(outside.includes('限定範囲の根拠あり'));
    }
  } finally { if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow; await server.close(); }
});
