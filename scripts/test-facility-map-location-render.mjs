import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { bakedFacilityCandidates, prepareFacilities } from '../src/bakedWalking.ts';
import { mapLocationLabel, mapLocationExclusionNote } from '../src/facilityMapLocation.ts';

const examples = [['友遊', 885.9], ['ファインブラン', 128.1], ['大笑', 5542.1], ['松福', 93.1], ['さざなみ', 1619], ['ゆうわ', 7180.5], ['ヘスティア', 1925.9]];
const degreesPerMeter = 180 / (Math.PI * 6371000);
const point = (east, north = 0) => [east * degreesPerMeter, north * degreesPerMeter];
// Synthetic original points are all close to the same synthetic walkable road.
const marked = examples.map(([name, meters], i) => ({
  type: 'Feature', id: `map-location-render-fixture-${i}`,
  geometry: { type: 'Point', coordinates: point(100 + i * 10) },
  properties: {
    name: `位置テスト ${name}`, category: 'social_facility', address: `合成された元住所 ${i}`,
    source_ids: [`synthetic-render-source-${i}`], official_url: 'https://example.org/original',
    audit_review: {
      status: 'limited_support', checked_at: '2026-10-08', accepted_type: 'service_identity',
      summary: '登録番号と元サービスの資料上の同定を支持する合成例。', scope: '原地図位置の現在位置確認とは別の判断。',
      sources: [{ title: '合成同定資料', url: 'https://example.org/identity' }], limits: ['原地図位置・営業・徒歩到達性は未確認。'],
      map_location: {
        status: 'different_from_current',
        note: i < 6 ? '合成例：原地図位置の現在位置確認は未確認。'
          : '合成例：資料記載の移転実施日は2026-09-01。配置図の更新日は非表示。取得日は別記。原地図位置は未確認。',
        current_location: {
          coordinates: point(100 + i * 10, meters), distance_from_original_m: meters,
          source: {
            title: '合成公式点資料', url: `https://example.org/current-point/${i}`,
            ...(i < 6 ? { as_of: '2026-06-30', published_at: '2026-07-09' } : {}),
            retrieved_at: '2026-10-08',
          },
        },
      },
    },
  },
}));
const legacy = structuredClone(marked[0]);
legacy.id = 'map-location-render-legacy';
legacy.properties.name = '既存位置の扱いを保持する合成例';
delete legacy.properties.audit_review.map_location;
const facilities = [...marked, legacy];
const saved = JSON.stringify(facilities);
const noOp = () => {};
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
  server: { middlewareMode: true, watch: null }, appType: 'custom',
  ssr: { noExternal: ['leaflet'] },
  plugins: [{
    name: 'map-location-render-fixtures', enforce: 'pre',
    // SSR never runs map effects. Substitute only Leaflet's browser-dependent
    // import so the real WalkingPanel candidate calculation and markup run.
    resolveId(source) { if (source === 'leaflet') return '\0map-location-test-leaflet'; },
    load(id) { if (id === '\0map-location-test-leaflet') return 'export default {};'; },
    transform(code, id) {
      if (!id.endsWith('/src/MapPanel.tsx')) return;
      const initialList = 'const [listOpen, setListOpen] = useState(false);';
      assert(code.includes(initialList), 'Test must open only the existing facility list state');
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
  for (const [i, f] of marked.entries()) {
    const html = render(Drawer, { facility: f, onClose: noOp });
    const visible = visibleWithoutDetails(html);
    const location = f.properties.audit_review.map_location;
    assert(visible.includes('限定範囲の根拠あり') && visible.includes(mapLocationLabel(location)), 'Identity evidence and location caution must coexist outside collapsed details');
    assert(visible.includes(location.note));
    assert(visible.includes('徒歩圏の集計・到達性判定の対象外'));
    assert(visible.includes('元データの所在地') && visible.includes(f.properties.address));
    assert(visible.includes('元の地図位置とは別の情報'));
    assert(visible.includes(String(location.current_location.coordinates[0])) && visible.includes(String(location.current_location.coordinates[1])));
    assert(visible.includes(`${examples[i][1]} m`) && visible.includes(location.current_location.source.url));
    assert(visible.includes('取得日：2026-10-08'));
    if (i < 6) {
      assert(visible.includes('資料の基準日：2026-06-30') && visible.includes('資料の公開・出力日：2026-07-09'));
      assert(!visible.includes('資料の基準日：2026-10-08'), 'Retrieval must not be relabeled as the evidence as-of date');
    } else {
      assert(visible.includes('移転実施日は2026-09-01'));
      assert(!visible.includes('資料の基準日：') && !visible.includes('資料の公開・出力日：'), 'Missing evidence dates must remain absent');
    }
    assert(html.indexOf('aria-label="地図の位置確認"') < html.indexOf('<section class="facility-address">'));
  }
  const minimal = structuredClone(marked[0]);
  minimal.properties.audit_review.map_location = { status: 'unverified', note: '合成例：原地図位置は未確認。' };
  const minimalHtml = visibleWithoutDetails(render(Drawer, { facility: minimal, onClose: noOp }));
  assert(minimalHtml.includes('地図の位置は未確認') && !minimalHtml.includes('照合した現施設点'));
  const legacyHtml = render(Drawer, { facility: legacy, onClose: noOp });
  assert(!legacyHtml.includes('aria-label="地図の位置確認"'), 'Existing unmarked records must not acquire a location finding');

  const panel = render(Panel, {
    stops: [], facilities, categories: ['social_facility'], onCategories: noOp, onStop: noOp, onFacility: noOp,
    mode: 'national', onMode: noOp, busy: false, shoppingError: false, shoppingLoading: false,
    retryShopping: noOp, selection: '', onReturnSearch: noOp, municipalFailed: false, retryMunicipal: noOp,
  });
  assert(openedListForTest);
  const visiblePanel = visibleWithoutDetails(panel);
  for (const f of marked) {
    const row = visiblePanel.match(new RegExp(`<button[^>]*class="place-row"[^>]*>(?:(?!</button>)[\\s\\S])*?<strong>${f.properties.name}</strong>(?:(?!</button>)[\\s\\S])*?</button>`))?.[0];
    assert(row?.includes(mapLocationLabel(f.properties.audit_review.map_location)), `${f.properties.name}: the listed name must carry a textual location warning`);
    assert(row.includes('限定範囲の根拠あり'));
  }

  const catchment = {
    stopId: '0_0', budget: 1000, origin: point(0), snap: point(0), snapGap: 0,
    segments: [{ a: point(0), b: point(200), d1: 0, d2: 200, grade: 0, steps: false }],
  };
  const baked = render(BakedList, {
    candidates: bakedFacilityCandidates(catchment, prepareFacilities(facilities)), group: 'all', onGroup: noOp,
    minutes: 5, state: 'ready', retry: noOp, onFacility: noOp, hasExcludedLocations: true,
  });
  const nearby = render(Nearby, {
    origin: point(0), facilities, state: 'ready', retry: noOp, onFacility: noOp, scope: 'fixture-stop:5', onMapFacilities: noOp,
  });
  const graph = {
    version: 1, nodes: [[0, 0, '0'], [...point(200), '1']], edges: [[0, 1, 200, 1, 1, 'road']],
    pilot_stops: [{ id: 'fixture-stop', name: '合成バス停', coordinate: point(0) }],
    facility_ids: facilities.map(f => f.id), core: [-1, -1, 1, 1], bbox: [-1, -1, 1, 1],
  };
  const walking = render(Walking, {
    map: null, id: 'fixture-stop', origin: point(0), data: { graph, facilities }, error: false,
    retry: noOp, onSelect: noOp, onFacility: noOp, focused: false, conditions: { minutes: 5, speed: 4 },
    onConditions: noOp, scope: 'fixture-stop:5', onMapFacilities: noOp,
  });
  assert(baked.includes('すべて 1件 · 道路までの時間順'));
  assert(nearby.includes('1件 · 直線距離が近い順'));
  assert(walking.includes('5分圏の買い物候補 1件'));
  for (const [kind, html] of [['baked', baked], ['nearby', nearby], ['pilot', walking]]) {
    assert(html.includes(legacy.properties.name), `${kind}: legacy candidate must remain listed`);
    assert(visibleWithoutDetails(html).includes(mapLocationExclusionNote), `${kind}: exclusions must have a visible explanation`);
    for (const f of marked) assert(!html.includes(f.properties.name), `${kind}: no flagged name may be advertised with time or distance`);
  }
  assert.equal(JSON.stringify(facilities), saved, 'Rendering must not change original geometry or review semantics');
  console.log('Seven synthetic location examples: visible list/detail warnings, separate points/dates, and baked/nearby/pilot counts of 1 instead of 8 passed.');
} finally {
  if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  await server.close();
}
