import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { applyFacilityCurrent } from '../src/facilityFreshness.ts';
import { applyFacilityAudit } from '../src/facilityAudit.ts';
import { applyFacilityContacts } from '../src/facilityContact.ts';
import { bakedFacilityCandidates, prepareFacilities } from '../src/bakedWalking.ts';
import { mapLocationExclusionNote } from '../src/facilityMapLocation.ts';
const read = name => JSON.parse(fs.readFileSync(`public/data/${name}`, 'utf8'));
const facilities = applyFacilityContacts(applyFacilityAudit(applyFacilityCurrent([...read('shopping.geojson').features, ...read('civic-facilities.geojson').features], read('facility-current.json')), read('facility-audit.json')), read('facility-contacts.json'));
const f = facilities.find(f => f.id === 'civic-care-3570106660-61245f957a'), original = JSON.stringify(f);
const noOp = () => {}, render = (C, props) => renderToStaticMarkup(React.createElement(C, props));
const visible = html => { let depth = 0; return (html.match(/<details\b[^>]*>|<\/details\s*>|[^<]+|<[^>]+>/g) ?? []).map(token => { if (/^<details\b/.test(token)) { depth++; return ''; } if (/^<\/details/.test(token)) { depth--; return ''; } return depth ? '' : token; }).join(''); };
const server = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom', ssr: { noExternal: ['leaflet'] }, plugins: [{
  name: 'cellneg-real-display', enforce: 'pre',
  resolveId(source) { if (source === 'leaflet') return '\0cellneg-leaflet'; },
  load(id) { if (id === '\0cellneg-leaflet') return 'export default {};'; },
  transform(code, id) { if (id.endsWith('/src/MapPanel.tsx')) { const init = 'const [listOpen, setListOpen] = useState(false);'; assert(code.includes(init)); return code.replace(init, 'const [listOpen, setListOpen] = useState(true);'); } },
}] });
const priorWindow = globalThis.window;
try {
  globalThis.window = { location: { href: 'https://example.org/' } };
  const [{ default: Drawer }, { default: Panel }, { default: Baked }, { default: Nearby }, { default: Walking }] = await Promise.all([
    server.ssrLoadModule('/src/FacilityDrawer.tsx'), server.ssrLoadModule('/src/MapPanel.tsx'), server.ssrLoadModule('/src/BakedFacilityList.tsx'), server.ssrLoadModule('/src/NearbyFacilitiesPanel.tsx'), server.ssrLoadModule('/src/WalkingPanel.tsx'),
  ]);
  const html = render(Drawer, { facility: f, onClose: noOp }), shown = visible(html);
  for (const text of ['限定範囲の根拠あり', '地図の位置は未確認', '281.950m', '徒歩圏の集計・到達性判定の対象外', '元の地図位置とは別の情報', '資料の基準日：2026-06-30', '資料の公開・出力日：2026-07-09']) assert(shown.includes(text));
  assert(shown.includes('下関市本町2－11－11') && shown.includes('元データの所在地'));
  assert(html.includes('floor=1') && html.includes('県全CSVの今回再取得や全行再ハッシュはしていません'));
  assert(!html.includes('開店・掲載確認') && !html.includes('閉店確認'));
  const list = render(Panel, { stops: [], facilities: [f], categories: ['social_facility'], onCategories: noOp, onStop: noOp, onFacility: noOp, mode: 'national', onMode: noOp, busy: false, shoppingError: false, shoppingLoading: false, retryShopping: noOp, selection: '', onReturnSearch: noOp, municipalFailed: false, retryMunicipal: noOp });
  assert(list.includes(f.properties.name) && list.includes('地図の位置は未確認') && list.includes('限定範囲の根拠あり'));
  const point = f.geometry.coordinates, dx = 10 * 180 / (Math.PI * 6371000 * Math.cos(point[1] * Math.PI / 180));
  const origin = [point[0] - dx, point[1]], end = [point[0] + dx, point[1]];
  const c = { stopId: 'cellneg-test', budget: 1000, origin, snap: origin, snapGap: 0, segments: [{ a: origin, b: end, d1: 0, d2: 20, grade: 0, steps: false }] };
  const baked = render(Baked, { candidates: bakedFacilityCandidates(c, prepareFacilities([f])), group: 'all', onGroup: noOp, minutes: 5, state: 'ready', retry: noOp, onFacility: noOp, hasExcludedLocations: true });
  const nearby = render(Nearby, { origin, facilities: [f], state: 'ready', retry: noOp, onFacility: noOp, scope: 'cellneg-test:5', onMapFacilities: noOp });
  const graph = { version: 1, nodes: [[...origin, '0'], [...end, '1']], edges: [[0, 1, 20, 1, 1, 'synthetic-road']], pilot_stops: [{ id: 'cellneg-test', name: '合成バス停', coordinate: origin }], facility_ids: [f.id], core: [point[0]-1, point[1]-1, point[0]+1, point[1]+1], bbox: [point[0]-1, point[1]-1, point[0]+1, point[1]+1] };
  const walking = render(Walking, { map: null, id: 'cellneg-test', origin, data: { graph, facilities: [f] }, error: false, retry: noOp, onSelect: noOp, onFacility: noOp, focused: false, conditions: { minutes: 5, speed: 4 }, onConditions: noOp, scope: 'cellneg-test:5', onMapFacilities: noOp });
  assert(baked.includes('すべて 0件 · 道路までの時間順')); assert(nearby.includes('0件 · 直線距離が近い順')); assert(walking.includes('5分圏の買い物候補 0件'));
  for (const html of [baked, nearby, walking]) { assert(visible(html).includes(mapLocationExclusionNote)); assert(!html.includes(f.properties.name)); }
  assert.equal(JSON.stringify(f), original);
  console.log('Actual Cellneg: scoped support and location warning outside details, original address/point retained, separate dated known point and all three walk panels excluded.');
} finally { if (priorWindow === undefined) delete globalThis.window; else globalThis.window = priorWindow; await server.close(); }
