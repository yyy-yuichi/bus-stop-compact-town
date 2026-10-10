import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { applyFacilityAudit } from '../src/facilityAudit.ts';
import { applyFacilityCurrent, facilityAvailable, facilityChangeReview, freshnessLabel } from '../src/facilityFreshness.ts';
import { isFacilityWalkingCandidate } from '../src/facilityMapLocation.ts';
import { bakedFacilityCandidates, nearbyFacilityCandidates, prepareFacilities } from '../src/bakedWalking.ts';
import { mapFacilities } from '../src/facilityVisibility.ts';
import { searchPlaces } from '../src/placeSearch.ts';

const read = name => JSON.parse(fs.readFileSync(`public/data/${name}`, 'utf8'));
const raw = ['shopping.geojson', 'civic-facilities.geojson'].flatMap(name => read(name).features);
const previous = applyFacilityCurrent(raw, read('facility-current.json'));
const data = read('facility-audit.json'), current = applyFacilityAudit(previous, data);
const original = new Map(raw.map(f => [f.id, f])), now = new Map(current.map(f => [f.id, f]));
const white = 'civic-care-3560290169-1139854fed', sakura = 'civic-care-3550180040-cd9722e7f4', aiyuu = 'civic-care-3560190112-b6defc9f85';

test('three source-qualified results keep every original service and property, with only Whitebird unavailable', () => {
  assert.deepEqual(data.counts, {reviewed: 2828, limited_support: 1365, unresolved: 1463, recovered_registry: 23});
  for (const id of [white, sakura, aiyuu]) {
    const f = now.get(id), o = original.get(id);
    assert.deepEqual(f.geometry, o.geometry);
    assert.deepEqual(f.properties.registered_details, o.properties.registered_details);
    for (const key of ['name', 'category', 'address', 'official_address', 'official_url', 'source_ids']) assert.deepEqual(f.properties[key], o.properties[key]);
    assert.equal(f.properties.freshness_review, undefined);
    assert.equal(f.properties.audit_review.status, 'limited_support');
    assert.equal(new Set(f.properties.audit_review.sources.map(x => x.url)).size, f.properties.audit_review.sources.length);
    assert.equal(facilityAvailable(f), id !== white);
  }
  assert.deepEqual(now.get(sakura).properties.registered_details.service, ['通所リハビリテーション', '短期入所療養介護', '介護老人保健施設']);
  assert.equal(facilityChangeReview(now.get(white)).effective_at, '2025-03');
  assert.equal(facilityChangeReview(now.get(white)).date_precision, 'month');
  assert.equal(facilityChangeReview(now.get(sakura)), undefined);
  assert.equal(facilityChangeReview(now.get(aiyuu)), undefined);
});

test('operator closure excludes ordinary search, nearby, baked walking and normal map candidates while preserving direct historical selection', () => {
  const f = now.get(white), [lon, lat] = f.geometry.coordinates;
  const dx = 10 * 180 / (Math.PI * 6371000 * Math.cos(lat * Math.PI / 180));
  const origin = [lon - dx, lat], end = [lon + dx, lat];
  const catchment = {stopId: 'closure-test', budget: 1000, origin, snap: origin, snapGap: 0, segments: [{a: origin, b: end, d1: 0, d2: 20, grade: 0, steps: false}]};
  const legacy = structuredClone(f); delete legacy.properties.audit_review.operator_closure;
  assert.equal(bakedFacilityCandidates(catchment, prepareFacilities([legacy])).length, 1);
  assert.equal(bakedFacilityCandidates(catchment, prepareFacilities([f])).length, 0);
  assert.equal(nearbyFacilityCandidates(origin, prepareFacilities([f])).length, 0);
  assert.equal(isFacilityWalkingCandidate(f), false);
  assert.equal(searchPlaces('白鳥', [], [f]).facilities.length, 0);
  assert.deepEqual(mapFacilities([f], ['social_facility'], null, 's', {scope: 's', ids: [white]}), []);
  assert.deepEqual(mapFacilities([f], ['social_facility'], f, 's', {scope: 's', ids: [white]})[0].geometry, f.geometry);
  assert.equal(freshnessLabel(f), '掲載介護サービスの閉所を運営者資料で確認');
});

test('audit closure rejects unresolved decisions, invented dates, missing evidence and partial original-service coverage', () => {
  const reject = change => {const copy = structuredClone(data); change(copy); assert.throws(() => applyFacilityAudit(previous, copy));};
  const entry = value => value.reviews.find(x => x.id === white).review;
  reject(x => {entry(x).status = 'unresolved'; entry(x).accepted_type = null; x.counts.limited_support--; x.counts.unresolved++;});
  reject(x => {entry(x).operator_closure.date_precision = 'unknown'; entry(x).operator_closure.effective_at = null;});
  reject(x => entry(x).operator_closure.effective_at = '2027-03');
  reject(x => entry(x).operator_closure.sources[0].url = 'https://example.org/unrelated');
  reject(x => entry(x).operator_closure.affected_services = ['訪問介護']);
  reject(x => entry(x).operator_closure.affected_services = ['訪問看護', '訪問看護']);
  reject(x => {
    const r = x.reviews.find(v => v.id === sakura).review;
    r.operator_closure = structuredClone(entry(x).operator_closure);
    r.operator_closure.sources = [r.sources[0]];
    r.operator_closure.affected_services = ['短期入所療養介護'];
  });
});

test('actual drawer separates operator closure month from designation day and keeps source/service limits outside the source fold', async () => {
  const server = await createServer({cacheDir: '/tmp/udc-roller3-unit-vite-cache', server: {middlewareMode: true, watch: null}, appType: 'custom'});
  const saved = globalThis.window;
  try {
    globalThis.window = {location: {href: 'https://example.org/'}};
    const {default: Drawer} = await server.ssrLoadModule('/src/FacilityDrawer.tsx');
    const render = id => renderToStaticMarkup(React.createElement(Drawer, {facility: now.get(id), onClose() {}}));
    const outside = html => html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, '');
    const closed = render(white), visible = outside(closed);
    assert(visible.includes('運営者公表の閉所時点：2025-03（年月まで確認）'));
    assert(visible.includes('指定廃止日2025-03-31とは日付の役割を分け'));
    assert(!visible.includes('指定廃止日：2025-03-31'));
    assert(visible.includes('通常の検索・周辺施設・徒歩圏の候補には表示しません'));
    assert(closed.includes('取込時点の登録情報（履歴）'));
    const conversion = outside(render(sakura));
    for (const text of ['2024-04-01', '3550180040', '35B0100011', '通所リハビリテーション', '短期入所療養介護', '介護老人保健施設', '全サービス終了とは表示しません']) assert(conversion.includes(text));
    assert(!conversion.includes('閉所を運営者資料で確認'));
    const visit = outside(render(aiyuu));
    for (const text of ['2025-07-01', '訪問看護1有', '2026年の指定継続・当日の営業は未確認', '不掲載を実終了とは扱いません']) assert(visit.includes(text));
    assert(!visit.includes('閉所を運営者資料で確認'));
  } finally {
    if (saved === undefined) delete globalThis.window; else globalThis.window = saved;
    await server.close();
  }
});
