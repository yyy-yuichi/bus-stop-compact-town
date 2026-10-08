import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { applyFacilityAudit } from '../src/facilityAudit.ts';
import { applyFacilityCurrent } from '../src/facilityFreshness.ts';
import { bakedFacilityCandidates, prepareFacilities } from '../src/bakedWalking.ts';
import { hasMapLocationIssue, mapLocationLabel, mapLocationExclusionNote } from '../src/facilityMapLocation.ts';

const ids = [
  'civic-KD0000900041', 'civic-care-3570104848-c0d8ed2640', 'civic-care-3571501935-6ff00a4724',
  'civic-care-3577100807-f7b455679e', 'civic-care-3557180027-5575c06198',
  'civic-care-3591200062-537d813349', 'civic-care-3590600387-b9f6dece36',
  'osm-node-6514743790', 'osm-node-7710431649', 'osm-node-5878954963', 'osm-way-378279929',
];
const read = file => JSON.parse(fs.readFileSync(`public/data/${file}`, 'utf8'));
const raw = [...read('shopping.geojson').features, ...read('civic-facilities.geojson').features];
const facilities = applyFacilityAudit(applyFacilityCurrent(raw, read('facility-current.json')), read('facility-audit.json'));
const targets = ids.map(id => {
  const feature = facilities.find(f => String(f.id) === id);
  assert(feature);
  return feature;
});
assert.equal(targets.filter(hasMapLocationIssue).length, 9, 'The reviewed real-data batch must be applied before running this test');
const saved = JSON.stringify(targets);
const noOp = () => {};
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const visibleWithoutDetails = html => {
  let depth = 0;
  return (html.match(/<details\b[^>]*>|<\/details\s*>|[^<]+|<[^>]+>/g) ?? []).map(token => {
    if (/^<details\b/.test(token)) { depth++; return ''; }
    if (/^<\/details/.test(token)) { depth--; return ''; }
    return depth ? '' : token;
  }).join('');
};
let openedListForTest = false;
const server = await createServer({
  server: { middlewareMode: true, watch: null }, appType: 'custom', ssr: { noExternal: ['leaflet'] },
  plugins: [{
    name: 'review11-render-regressions', enforce: 'pre',
    // Only the browser-dependent map import is stubbed. Real candidate math and
    // real panel rendering below run against the merged facility records.
    resolveId(source) { if (source === 'leaflet') return '\0review11-test-leaflet'; },
    load(id) { if (id === '\0review11-test-leaflet') return 'export default {};'; },
    transform(code, id) {
      if (!id.endsWith('/src/MapPanel.tsx')) return;
      const initialList = 'const [listOpen, setListOpen] = useState(false);';
      assert(code.includes(initialList));
      openedListForTest = true;
      return code.replace(initialList, 'const [listOpen, setListOpen] = useState(true);');
    },
  }],
});
const previousWindow = globalThis.window;
try {
  globalThis.window = { location: { href: 'https://example.org/' } };
  const [{ default: Drawer }, { default: Panel }, { default: BakedList }, { default: Nearby }, { default: Walking }] = await Promise.all([
    server.ssrLoadModule('/src/FacilityDrawer.tsx'), server.ssrLoadModule('/src/MapPanel.tsx'),
    server.ssrLoadModule('/src/BakedFacilityList.tsx'), server.ssrLoadModule('/src/NearbyFacilitiesPanel.tsx'),
    server.ssrLoadModule('/src/WalkingPanel.tsx'),
  ]);
  for (const f of targets) {
    const html = render(Drawer, { facility: f, onClose: noOp });
    const visible = visibleWithoutDetails(html);
    const location = f.properties.audit_review.map_location;
    assert(visible.includes('限定範囲の根拠あり'), `${f.id}: scoped identity support remains visible`);
    assert(visible.includes(escape(f.properties.audit_review.summary)) && visible.includes(escape(f.properties.audit_review.scope)));
    const addressSection = html.match(/<section class="facility-address">[\s\S]*?<\/section>/)?.[0];
    assert(addressSection);
    assert(addressSection.includes(escape(f.properties.official_address || f.properties.address || '住所の登録なし')));
    if (location) {
      assert(visible.includes(mapLocationLabel(location)) && visible.includes(escape(location.note)), `${f.id}: warning and limitation must not depend on expanding details`);
      assert(visible.includes('徒歩圏の集計・到達性判定の対象外'));
      assert(addressSection.includes('元データの所在地'));
      assert(html.indexOf('aria-label="地図の位置確認"') < html.indexOf('<section class="facility-address">'));
      if (location.current_location) {
        const current = location.current_location;
        assert(visible.includes('元の地図位置とは別の情報'));
        assert(visible.includes(String(current.coordinates[0])) && visible.includes(String(current.coordinates[1])));
        assert(visible.includes(`${current.distance_from_original_m} m`));
        assert(visible.includes(escape(current.source.url)));
        assert(visible.includes(`取得日：${current.source.retrieved_at}`));
        if (current.source.as_of) assert(visible.includes(`資料の基準日：${current.source.as_of}`));
        else assert(!visible.includes('資料の基準日：'), 'Unknown evidence date must not be replaced by retrieval date');
        if (current.source.published_at) assert(visible.includes(`資料の公開・出力日：${current.source.published_at}`));
        else assert(!visible.includes('資料の公開・出力日：'), 'Unprovided structured publication date must remain absent');
      }
    } else assert(!html.includes('aria-label="地図の位置確認"'), `${f.id}: unflagged records must not acquire an unsupported warning`);
  }

  const panel = render(Panel, {
    stops: [], facilities: targets, categories: ['social_facility', 'community_centre', 'sports_centre'],
    onCategories: noOp, onStop: noOp, onFacility: noOp, mode: 'national', onMode: noOp,
    busy: false, shoppingError: false, shoppingLoading: false, retryShopping: noOp,
    selection: '', onReturnSearch: noOp, municipalFailed: false, retryMunicipal: noOp,
  });
  assert(openedListForTest);
  const rows = visibleWithoutDetails(panel).match(/<button[^>]*class="place-row"[^>]*>[\s\S]*?<\/button>/g) ?? [];
  for (const f of targets) {
    const row = rows.find(row => row.includes(`<strong>${escape(f.properties.name)}</strong>`));
    assert(row?.includes('限定範囲の根拠あり'), `${f.id}: the reviewed record stays in the facility list`);
    if (hasMapLocationIssue(f)) assert(row.includes(mapLocationLabel(f.properties.audit_review.map_location)));
    else assert(!row.includes('facility-map-location-warning'));
  }

  for (const f of targets) {
    // A synthetic short road through the unchanged original geometry isolates
    // candidate eligibility. It does not assert real-world road access.
    const point = f.geometry.type === 'Point' ? f.geometry.coordinates : f.geometry.coordinates[0][0][0];
    const dx = 10 * 180 / (Math.PI * 6371000 * Math.cos(point[1] * Math.PI / 180));
    const origin = [point[0] - dx, point[1]], end = [point[0] + dx, point[1]];
    const catchment = { stopId: 'fixture', budget: 1000, origin, snap: origin, snapGap: 0,
      segments: [{ a: origin, b: end, d1: 0, d2: 20, grade: 0, steps: false }] };
    const flagged = hasMapLocationIssue(f), expected = flagged ? 0 : 1;
    const baked = render(BakedList, {
      candidates: bakedFacilityCandidates(catchment, prepareFacilities([f])), group: 'all', onGroup: noOp,
      minutes: 5, state: 'ready', retry: noOp, onFacility: noOp, hasExcludedLocations: flagged,
    });
    const nearby = render(Nearby, {
      origin, facilities: [f], state: 'ready', retry: noOp, onFacility: noOp, scope: 'fixture:5', onMapFacilities: noOp,
    });
    const graph = {
      version: 1, nodes: [[...origin, '0'], [...end, '1']], edges: [[0, 1, 20, 1, 1, 'synthetic-road']],
      pilot_stops: [{ id: 'fixture', name: '合成バス停', coordinate: origin }], facility_ids: [String(f.id)],
      core: [point[0] - 1, point[1] - 1, point[0] + 1, point[1] + 1],
      bbox: [point[0] - 1, point[1] - 1, point[0] + 1, point[1] + 1],
    };
    const walking = render(Walking, {
      map: null, id: 'fixture', origin, data: { graph, facilities: [f] }, error: false,
      retry: noOp, onSelect: noOp, onFacility: noOp, focused: false, conditions: { minutes: 5, speed: 4 },
      onConditions: noOp, scope: 'fixture:5', onMapFacilities: noOp,
    });
    assert(baked.includes(`すべて ${expected}件 · 道路までの時間順`), `${f.id}: baked count`);
    assert(nearby.includes(`${expected}件 · 直線距離が近い順`), `${f.id}: nearby count`);
    assert(walking.includes(`5分圏の買い物候補 ${expected}件`), `${f.id}: pilot count`);
    for (const [kind, html] of [['baked', baked], ['nearby', nearby], ['pilot', walking]]) {
      if (flagged) {
        assert(visibleWithoutDetails(html).includes(mapLocationExclusionNote), `${f.id}/${kind}: visible explanation for exclusion`);
        assert(!html.includes(escape(f.properties.name)), `${f.id}/${kind}: no time or distance attached to a flagged original point`);
      } else {
        assert(html.includes(escape(f.properties.name)), `${f.id}/${kind}: unchanged eligible record stays available as a candidate`);
        assert(!html.includes(mapLocationExclusionNote), `${f.id}/${kind}: no blanket location finding`);
      }
    }
  }
  assert.equal(JSON.stringify(targets), saved);
  console.log('Reviewed actual 11: always-visible scoped/location warnings, original addresses, separate current points, nine candidate exclusions and two unchanged candidate records passed across all three panels.');
} finally {
  if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  await server.close();
}
