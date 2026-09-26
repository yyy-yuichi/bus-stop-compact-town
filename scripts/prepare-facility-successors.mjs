import fs from 'node:fs';
import assert from 'node:assert/strict';
import { hash } from './jev-batch.mjs';
import { anchor, normalize } from './facility-bulk-lib.mjs';
import { wattsStore, secondStreetStore } from './facility-successors-lib.mjs';

const out = 'outputs/facility-successors-20260925';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const immutable = (file, value) => {
  if (fs.existsSync(file)) assert.equal(hash(read(file)), hash(value), `Immutable input changed: ${file}`);
  else fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
};
const before = `${out}/before-overlay.json`;
if (!fs.existsSync(before)) immutable(before, read('public/data/facility-current.json'));
const overlay = read(before);
const baseline = ['shopping.geojson', 'civic-facilities.geojson'].flatMap(file => read(`public/data/${file}`).features);
const updates = new Map(overlay.updates.map(row => [row.id, row]));
const all = [...baseline, ...overlay.additions].map(f => ({ ...f,
  properties: { ...f.properties, ...updates.get(f.id)?.changes,
    freshness_review: updates.get(f.id)?.review ?? f.properties.freshness_review } }));
const receipt = url => {
  const file = `${out}/pages/${hash(new URL(url).href).slice(0, 24)}.json`;
  const r = read(file);
  assert.equal(r.url, url);
  return { receipt: file, receipt_hash: hash(r), value: r };
};
const wattsPlan = read('data-sources/facility-successors-20260925/watts-plan.json');
const city = receipt('https://www.watts-jp.com/shop/chugoku/yamaguchi/ubeshi/');
const cityIds = [...new Set([...city.value.html.matchAll(/href="https:\/\/www\.watts-jp\.com\/shop\/(\d+)\/"/g)].map(m => m[1]))].sort();
assert.deepEqual(wattsPlan.map(r => r.url.match(/\/(\d+)\/$/)[1]).sort(), cityIds, 'Must cover the whole city list');
const rows = [...wattsPlan.map(({ url }) => { const r = receipt(url); return { ...wattsStore(r.value), receipt: r.receipt, receipt_hash: r.receipt_hash }; }),
  ...['https://www.2ndstreet.jp/shop/details?shopsId=31983'].map(url => { const r = receipt(url); return { ...secondStreetStore(r.value), receipt: r.receipt, receipt_hash: r.receipt_hash }; })]
  .map(row => ({ ...row, nearby: all.flatMap(f => {
    const p = anchor(f.geometry); if (!p) return [];
    const distance = Math.round(Math.hypot((p[0] - row.coordinates[0]) * 92300, (p[1] - row.coordinates[1]) * 111000));
    return distance <= 180 || normalize(f.properties.name) === normalize(row.name)
      ? [{ id: f.id, name: f.properties.name, address: f.properties.official_address ?? f.properties.address ?? '',
        distance_m_approx: distance, status: f.properties.freshness_review?.status ?? 'unverified', category: f.properties.category }] : [];
  }).sort((a, b) => a.distance_m_approx - b.distance_m_approx).slice(0, 12) }));
immutable(`${out}/stores.json`, rows);
console.log(JSON.stringify(rows.map(({ id, name, coordinates, nearby }) => ({ id, name, coordinates, nearby })), null, 2));
