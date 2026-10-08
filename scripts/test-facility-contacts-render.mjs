import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { applyFacilityCurrent } from '../src/facilityFreshness.ts';
import { applyFacilityAudit } from '../src/facilityAudit.ts';
import { applyFacilityContacts } from '../src/facilityContact.ts';

const read = name => JSON.parse(fs.readFileSync(`public/data/${name}`, 'utf8'));
const overlay = read('facility-contacts.json');
const original = applyFacilityAudit(applyFacilityCurrent([...read('shopping.geojson').features, ...read('civic-facilities.geojson').features], read('facility-current.json')), read('facility-audit.json'));
const facilities = applyFacilityContacts(original, overlay);
const server = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom' });
const priorWindow = globalThis.window;
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
try {
  globalThis.window = { location: { href: 'https://example.org/' } };
  const { default: Drawer } = await server.ssrLoadModule('/src/FacilityDrawer.tsx');
  const render = facility => renderToStaticMarkup(React.createElement(Drawer, { facility, onClose() {} }));
  for (const item of overlay.contacts) {
    const f = facilities.find(f => f.id === item.id), before = original.find(f => f.id === item.id);
    const html = render(f);
    const visible = html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, '');
    for (const text of ['調剤電話（運営者掲載）', item.contact.phone, '取得日：2026-10-08',
      '元資料に更新日の表示がありません', '一般店舗電話とは区別', '国資料の同定情報（2026-06-01基準）',
      item.contact.identity.registry_id, '新しい時点の確認には数えていません']) assert(visible.includes(text), `${item.id}: ${text}`);
    assert(visible.includes(escape(item.contact.source.url)));
    assert(html.includes(escape(before.properties.name)) && html.includes(escape(before.properties.official_address)));
    assert(html.includes('公式掲載確認') && html.includes('開店日：未確認'));
    assert(!html.includes('tel:'), 'Existing text display creates no dial action; tests never initiate calls');
    assert(!html.includes('取込時点の登録情報（履歴）'), 'Supplement must not invent an original phone field');
    const withoutContact = { ...f, properties: { ...f.properties } };
    delete withoutContact.properties.dispensing_contact;
    assert.equal(render(withoutContact), render(before), 'All preexisting drawer content is retained');
  }
  for (const id of ['civic-KD0000900041', 'civic-care-3590600387-b9f6dece36', 'osm-node-6514743790']) {
    assert.equal(render(facilities.find(f => f.id === id)), render(original.find(f => f.id === id)), 'Unrelated reviewed drawer is byte-identical');
  }
  console.log('Actual four drawers: dispensing phones, official links, retrieval dates, unknown update dates and older identity scope visible; original details/status and unrelated reviews preserved. No call actions.');
} finally {
  if (priorWindow === undefined) delete globalThis.window; else globalThis.window = priorWindow;
  await server.close();
}
