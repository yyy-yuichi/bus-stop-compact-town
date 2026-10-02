import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { applyFacilityCurrent } from '../src/facilityFreshness.ts';
import { applyFacilityAudit, auditLabel } from '../src/facilityAudit.ts';
const read = p => JSON.parse(fs.readFileSync(`public/data/${p}`, 'utf8'));
const facilities = applyFacilityAudit(applyFacilityCurrent([...read('shopping.geojson').features, ...read('civic-facilities.geojson').features], read('facility-current.json')), read('facility-audit.json'));
const server = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom' });
const previousWindow = globalThis.window;
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
try {
  globalThis.window = { location: { href: 'https://example.org/' } };
  const { default: Drawer } = await server.ssrLoadModule('/src/FacilityDrawer.tsx');
  const { default: Panel } = await server.ssrLoadModule('/src/MapPanel.tsx');
  for (const f of facilities.filter(f => f.properties.audit_review)) {
    const r = f.properties.audit_review;
    const html = renderToStaticMarkup(React.createElement(Drawer, { facility: f, onClose() {} }));
    assert(html.includes(auditLabel(r)) && html.includes(escape(r.summary)) && html.includes(escape(r.scope)));
    assert(html.indexOf(auditLabel(r)) < html.indexOf('<section class="facility-address">'));
    assert(html.includes('施設全体の状態を一括して保証するものではありません'));
    assert(html.includes('元の施設ID・名称・分類・位置・形状は保持'));
    if (r.status === 'unresolved') assert(html.includes('営業中・閉鎖・移転とは判定していません'));
    assert(!html.includes('aria-label="施設の変更確認"'), 'Scoped audit text must not create an operational event component');
    for (const source of r.sources) assert(html.includes(escape(source.url)));
    if (!r.sources.length) assert(html.includes('公開リンク未収録'));
  }
  for (const item of read('facility-audit.json').recovered_verifications) {
    const html = renderToStaticMarkup(React.createElement(Drawer, { facility: facilities.find(f => f.id === item.id), onClose() {} }));
    assert(html.includes(escape(item.review.official_name)) && html.includes(item.review.checked_at));
    assert(html.includes('現況・入口は未確認'));
  }
  const noop = () => {};
  const html = renderToStaticMarkup(React.createElement(Panel, { stops: [], facilities, categories: [], onCategories: noop, onStop: noop, onFacility: noop, mode: 'national', onMode: noop, busy: false, shoppingError: false, shoppingLoading: false, retryShopping: noop, selection: '', onReturnSearch: noop, municipalFailed: false, retryMunicipal: noop }));
  assert(html.includes('限定根拠 1,330件') && html.includes('未解決 1,498件'));
  assert(!/drive\.google\.com|docs\.google\.com|sediment:/.test(html));
  console.log('All 2,828 scoped audit drawers, 23 recovered registry drawers and visible summary rendered successfully.');
} finally {
  if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  await server.close();
}
