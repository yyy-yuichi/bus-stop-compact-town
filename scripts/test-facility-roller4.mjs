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
const yume = 'civic-care-3590109181-80602c7d36', main = 'osm-node-1423659567', hall = 'osm-node-4884556138', school = 'osm-node-1423657463';
const ids = [yume, main, hall, school];

test('four reviews preserve exact original fields, separate two campus buildings and retain original care-service limits', () => {
  assert.deepEqual(data.counts, {reviewed: 2828, limited_support: 1365, unresolved: 1463, recovered_registry: 23});
  for (const id of ids) {
    const f = now.get(id), o = original.get(id), restored = structuredClone(f);
    delete restored.properties.audit_review;
    assert.deepEqual(restored, o);
    assert.equal(f.properties.audit_review.status, 'limited_support');
    assert.equal(f.properties.audit_review.map_location.status, 'unverified');
    assert.equal(new Set(f.properties.audit_review.sources.map(x => x.url)).size, f.properties.audit_review.sources.length);
    assert.equal(facilityAvailable(f), id !== school);
    assert.equal(f.properties.freshness_review, undefined);
  }
  assert.deepEqual(now.get(yume).properties.registered_details.service, ['地域密着型通所介護']);
  assert(now.get(yume).properties.audit_review.summary.includes('県の一般型表記を原サービスへ自動転用しません'));
  const location = now.get(yume).properties.audit_review.map_location.current_location;
  assert.deepEqual(location.coordinates, [130.92602200427126, 33.9258217866907]);
  assert.equal(location.point_role, 'operator_designated_destination');
  assert(location.distance_from_original_m > 1208 && location.distance_from_original_m < 1210);
  for (const id of [main, hall]) assert.equal(facilityChangeReview(now.get(id)), undefined);
  assert.notDeepEqual(now.get(main).geometry, now.get(hall).geometry);
  assert.equal(facilityChangeReview(now.get(school)).effective_at, '2012-03');
  assert.equal(facilityChangeReview(now.get(school)).date_precision, 'month');
  assert.equal(freshnessLabel(now.get(school)), '旧学校の廃校を市資料で確認');
});

test('all four old points stay out of walking, the closed school stays out of ordinary search, and direct history keeps original geometry', () => {
  for (const id of ids) {
    const f = now.get(id), [lon, lat] = f.geometry.coordinates;
    const dx = 10 * 180 / (Math.PI * 6371000 * Math.cos(lat * Math.PI / 180));
    const origin = [lon - dx, lat], end = [lon + dx, lat];
    const catchment = {stopId: 'roller4-test', budget: 1000, origin, snap: origin, snapGap: 0, segments: [{a: origin, b: end, d1: 0, d2: 20, grade: 0, steps: false}]};
    const legacy = structuredClone(f); delete legacy.properties.audit_review;
    assert.equal(bakedFacilityCandidates(catchment, prepareFacilities([legacy])).length, 1);
    assert.equal(bakedFacilityCandidates(catchment, prepareFacilities([f])).length, 0);
    assert.equal(nearbyFacilityCandidates(origin, prepareFacilities([f])).length, 0);
    assert.equal(isFacilityWalkingCandidate(f), false);
    assert.equal(searchPlaces(f.properties.name, [], [f]).facilities.length, id === school ? 0 : 1);
    assert.deepEqual(mapFacilities([f], [f.properties.category], null, 's', {scope: 's', ids: [id]}), []);
    assert.deepEqual(mapFacilities([f], [f.properties.category], f, 's', {scope: 's', ids: [id]})[0].geometry, f.geometry);
  }
});

test('historical school closure rejects ambiguous dates, inconsistent evidence, care scope and non-school targets', () => {
  const reject = change => {const copy = structuredClone(data); change(copy); assert.throws(() => applyFacilityAudit(previous, copy));};
  const entry = value => value.reviews.find(x => x.id === school).review;
  reject(x => {entry(x).status = 'unresolved'; entry(x).accepted_type = null; x.counts.limited_support--; x.counts.unresolved++;});
  reject(x => {entry(x).school_closure.date_precision = 'unknown'; entry(x).school_closure.effective_at = null;});
  reject(x => entry(x).school_closure.effective_at = '2027-03');
  reject(x => entry(x).school_closure.sources[0].url = 'https://example.org/unrelated');
  reject(x => {entry(x).school_closure.scope = 'registered_care_services'; entry(x).school_closure.affected_services = ['訪問看護'];});
  for (const id of [main, hall, yume]) reject(x => {
    const r = x.reviews.find(v => v.id === id).review;
    r.school_closure = structuredClone(entry(x).school_closure);
    r.school_closure.sources = [r.sources[0]];
  });
  reject(x => x.reviews.find(v => v.id === yume).review.map_location.current_location.point_role = 'verified_entrance');
});

test('actual drawers show operator point role, bounded building attribution and two distinct school date roles outside source folds', async () => {
  const server = await createServer({cacheDir: '/tmp/udc-roller4-unit-vite-cache', server: {middlewareMode: true, watch: null}, appType: 'custom'});
  const saved = globalThis.window;
  try {
    globalThis.window = {location: {href: 'https://example.org/'}};
    const {default: Drawer} = await server.ssrLoadModule('/src/FacilityDrawer.tsx');
    const render = id => renderToStaticMarkup(React.createElement(Drawer, {facility: now.get(id), onClose() {}}));
    const outside = html => html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, '');
    const destination = outside(render(yume));
    for (const text of ['運営者が指定する目的点', '約1209m', '地域密着型通所介護3590109181', 'R7.11はリニューアル時点', '更新日は未公表']) assert(destination.includes(text));
    assert(!destination.includes('照合した現施設点'));
    const building = outside(render(main));
    assert(building.includes('厳密な面内包含や測量精度は主張せず'));
    const auditorium = outside(render(hall));
    for (const text of ['本館東・図書館南', '独立小矩形講堂', '2026-03-24', '会場指定・予定']) assert(auditorium.includes(text));
    for (const id of [yume, main, hall]) assert(!render(id).includes('aria-label="施設の変更確認"'));
    const closed = outside(render(school));
    for (const text of ['旧学校の廃校を市資料で確認', '市資料の廃校時点：2012-03（年月まで確認）', '2012年4月', '全筆境界を確定せず', '現在利用できる学校', '通常の検索・周辺施設・徒歩圏の候補には表示しません']) assert(closed.includes(text));
    assert(!closed.includes('閉校日：2012-04'));
  } finally {
    if (saved === undefined) delete globalThis.window; else globalThis.window = saved;
    await server.close();
  }
});
