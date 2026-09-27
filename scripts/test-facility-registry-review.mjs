import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { applyFacilityCurrent, facilityAvailable } from '../src/facilityFreshness.ts';

const civic = JSON.parse(fs.readFileSync('public/data/civic-facilities.geojson', 'utf8')).features;
const care = civic.find(f => f.id === 'civic-care-3557280025-a46f56b5db');
const school = civic.find(f => f.id === 'civic-B135210001222');
assert(care && school);
const base = [care, school];
const before = structuredClone(base);
const expected = f => ({ name: f.properties.name, category: f.properties.category, source_ids: structuredClone(f.properties.source_ids), geometry: structuredClone(f.geometry) });
const source = { title: '山口県の行政台帳', url: 'https://www.pref.yamaguchi.lg.jp/example', sha256: 'a'.repeat(64) };
const careReview = {
  scope: 'care_service_registry', checked_at: '2026-09-27', source_as_of: '2026-09-01',
  registry_id: 'care-1', official_name: '介護医療院ケアホーム山口', official_address: '山口県山口市の登録住所',
  services: ['介護医療院'], summary: '当該事業者の台帳掲載を照合した。', sources: [source],
  limits: ['現地稼働と建物全体の営業は未確認。']
};
const schoolReview = {
  ...careReview, scope: 'school_register', registry_id: 'school-1', official_name: school.properties.name,
  official_address: school.properties.address, services: [], summary: '学校名簿の掲載を照合した。'
};
const overlay = {
  schema_version: 1, checked_at: '2026-09-27', updates: [], additions: [],
  verifications: [
    { id: care.id, expected: expected(care), changes: { name: '介護医療院ケアホーム山口（登録）', city: care.properties.city, address: '山口県山口市の登録住所' }, review: careReview },
    { id: school.id, expected: expected(school), changes: {}, review: schoolReview }
  ]
};
const result = applyFacilityCurrent(base, overlay);
assert.deepEqual(base, before, 'Base imports remain untouched');
assert.equal(result.length, 2);
assert.equal(result[0].properties.name, overlay.verifications[0].changes.name);
assert.equal(result[0].properties.registry_review.registry_id, 'care-1');
assert.equal(result[1].properties.registry_review.scope, 'school_register');
assert.equal(result[0].properties.freshness_review, care.properties.freshness_review, 'Registry review does not invent a freshness event');
for (let i = 0; i < base.length; i++) {
  assert.deepEqual(result[i].geometry, base[i].geometry);
  assert.deepEqual(result[i].properties.source_ids, base[i].properties.source_ids);
  assert.deepEqual(result[i].properties.registered_details, base[i].properties.registered_details);
  assert.deepEqual(result[i].properties.civic_details, base[i].properties.civic_details);
  assert.equal(facilityAvailable(result[i]), facilityAvailable(base[i]));
}
const reject = (change, message) => {
  const invalid = structuredClone(overlay);
  change(invalid);
  assert.throws(() => applyFacilityCurrent(base, invalid), message);
};
reject(p => { p.verifications = {}; }, 'Verification list must be an array');
reject(p => p.verifications.push(structuredClone(p.verifications[0])), 'Repeated verification ID');
reject(p => p.updates.push({ ...p.verifications[0], review: { status: 'operating' } }), 'Update and verification overlap');
reject(p => p.verifications[0].id = 'not-in-base', 'Only base IDs may be verified');
reject(p => p.verifications[0].expected.name = 'different', 'Expected name must match');
reject(p => p.verifications[0].expected.category = 'different', 'Expected category must match');
reject(p => p.verifications[0].expected.geometry.coordinates[0] += .001, 'Expected position must match');
reject(p => p.verifications[0].expected.source_ids.push('wrong'), 'Expected source IDs must match');
for (const key of ['category', 'official_address', 'source_ids', 'geometry', 'freshness_review']) reject(p => { p.verifications[0].changes[key] = 'forbidden'; }, `Cannot change ${key}`);
reject(p => p.verifications[0].changes.name = '', 'Blank changed value');
reject(p => p.verifications[0].review.source_as_of = '2026-09-28', 'Source as-of cannot follow check');
reject(p => p.verifications[0].review.checked_at = '2026-09-28', 'Check cannot follow overlay');
reject(p => p.verifications[0].review.checked_at = '2026-02-30', 'Calendar date must be valid');
reject(p => p.verifications[0].review.services = [], 'Care review requires a service');
reject(p => p.verifications[0].review.sources[0].sha256 = 'short', 'Evidence hash required');
reject(p => p.verifications[0].review.sources[0].url = 'http://example.org', 'HTTPS source required');
reject(p => p.verifications[0].review.sources[0].url = 'https://user:pass@example.org', 'Credential-bearing URL rejected');
reject(p => p.verifications[0].review.limits = [], 'Review scope limits required');

const server = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom' });
const previousWindow = globalThis.window;
try {
  globalThis.window = { location: { href: 'https://example.org/' } };
  const { default: Drawer } = await server.ssrLoadModule('/src/FacilityDrawer.tsx');
  const html = renderToStaticMarkup(React.createElement(Drawer, { facility: result[0], onClose() {} }));
  for (const phrase of ['行政台帳の掲載確認', '資料基準日', '照合日', '台帳ID', '公式名称', '公式住所', '掲載サービス', '出典・確認の限界', '建物全体の営業・開業']) assert(html.includes(phrase), phrase);
  assert(html.includes(careReview.source_as_of) && html.includes(careReview.official_address));
  assert(!html.includes('開店・掲載確認'), 'Registry listing must not render as an opening event');
  const schoolHtml = renderToStaticMarkup(React.createElement(Drawer, { facility: result[1], onClose() {} }));
  assert(schoolHtml.includes('学校名簿') && !schoolHtml.includes('掲載サービス'));
} finally {
  if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  await server.close();
}
console.log('Registry review validation, preservation, availability and drawer render passed.');
