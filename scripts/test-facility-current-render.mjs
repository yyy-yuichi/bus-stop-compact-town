// Render the actual drawer with Vite's TSX pipeline; no browser or extra packages.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { applyFacilityCurrent } from '../src/facilityFreshness.ts';
const read = name => JSON.parse(fs.readFileSync(`public/data/${name}`, 'utf8'));
const facilities = applyFacilityCurrent([...read('shopping.geojson').features, ...read('civic-facilities.geojson').features], read('facility-current.json'));
const server = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom' });
const previousWindow = globalThis.window;
try {
  globalThis.window = { location: { href: 'https://example.org/' } };
  const { default: Drawer } = await server.ssrLoadModule('/src/FacilityDrawer.tsx');
  const render = id => renderToStaticMarkup(React.createElement(Drawer, { facility: facilities.find(f => f.id === id), onClose() {} }));
  const closed = render('osm-way-475283671');
  assert(closed.includes('閉店確認') && closed.includes('2025-09-20'));
  assert(closed.includes('通常の検索・周辺施設・徒歩圏の候補には表示しません'));
  assert(closed.indexOf('閉店確認') < closed.indexOf('所在地'));
  const added = render('official-donki-738');
  assert(added.includes('開店・掲載確認') && added.includes('店舗公式情報'));
  assert(!added.includes('ODbL') && !added.includes('OpenStreetMap'));
  const care = render('civic-care-3557280025-a46f56b5db');
  assert(care.includes('介護医療院ケアホーム山口') && care.includes('取込時点の登録情報（履歴）'));
  assert(care.includes('35B0800032') && care.includes('3557280025'));
  const scheduled = render('osm-node-2426673962');
  assert(scheduled.includes('営業終了予定日') && scheduled.includes('2027-08-31'));
  assert(!scheduled.includes('候補には表示しません'));
  assert(render('osm-node-1423658379').includes('医療法人星の里会 岡医院'));
  const reviewed = facilities.filter(f => f.properties.freshness_review);
  for (const f of reviewed) {
    const html = render(f.id);
    assert(html.includes(f.properties.name));
    if (f.properties.freshness_review.event === 'listed') {
      assert(html.includes('公式掲載確認') && html.includes('開店日：未確認'));
      assert(!html.includes('開店日：2026-09-25') && !html.includes('：null'));
    }
  }
  assert(render('osm-way-483625942').includes('2026-08-20'));
  assert(render('official-ichimatsu-hikari').includes('2024-03-15'));
  assert(render('official-toriichizu-yamaguchi-tokuyama').includes('2026-08-25'));
  assert(render('osm-way-305954680').includes('閉店日：2025-01（年月まで確認）'));
  const unknownClosed = render('osm-way-332618123');
  assert(unknownClosed.includes('閉店日：未確認（閉店自体は公式告知で確認）'));
  assert(!unknownClosed.includes('閉店日：2025-03-01') && !unknownClosed.includes('：null'));
  assert(render('official-soy-stock-karato').includes('開店日：未確認'));
  assert(render('official-tsuruha-3945').includes('併設調剤薬局の公式案内'));
  assert(!render('official-soy-stock-karato').includes('店舗公式案内と開店発表を照合しました'));
  console.log(`Actual drawer render: ${reviewed.length} facilities, unknown opening dates distinguished, visible evidence and official provenance passed.`);
} finally {
  if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  await server.close();
}
