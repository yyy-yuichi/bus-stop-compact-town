import fs from 'node:fs';
import assert from 'node:assert/strict';
import { hash } from './jev-batch.mjs';
import { htmlText, normalize } from './facility-bulk-lib.mjs';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const files = ['public/data/shopping.geojson', 'public/data/civic-facilities.geojson', 'public/data/facility-current.json'];
const baseline = files.slice(0, 2).flatMap(file => read(file).features);
const overlay = read(files[2]);
const all = [...baseline, ...overlay.additions];
const aliases = ['食楽金龍', 'ベジモン'];
const matches = all.filter(row => aliases.some(alias => normalize(row.properties.name).includes(normalize(alias))));
assert.equal(matches.length, 0, 'An existing target needs identity review, not a no-change disposition');
const excluded = all.filter(row => normalize(row.properties.name).includes('金龍')).map(row => ({ id: row.id,
  name: row.properties.name, coordinates: row.geometry.coordinates,
  reason: '周南市平和通の食楽金龍ではないラーメン金龍。名称・市域が異なるため除外。' }));
assert.equal(excluded.length, 1);
assert.equal(excluded[0].id, 'osm-node-2253231310');
const current = all.find(row => row.id === 'official-toriichizu-yamaguchi-tokuyama');
assert(current && current.properties.address.includes('平和通'));
const url = 'https://www.instagram.com/p/DTpG2VTEStH/?hl=ja';
const path = `outputs/facility-successors-20260925/pages/${hash(url).slice(0, 24)}.json`;
const receipt = read(path);
assert.equal(receipt.url, url);
const caption = htmlText(receipt.html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/)?.[1] ?? '');
assert(caption.includes('shokuraku_kinryu') && caption.includes('2026年1月31日') && caption.includes('閉店'));
const result = { checked_at: '2026-09-25', target_name: '食楽 金龍', city: '周南市',
  checked_baseline: baseline.length, checked_additions: overlay.additions.length,
  aliases, matching_existing_ids: matches.map(r => r.id), excluded_similar_names: excluded,
  current_successor_id: current.id, current_successor_address: current.properties.address,
  primary_announcement_url: url, primary_receipt: path, primary_receipt_hash: hash(receipt),
  conclusion: 'verified_no_change',
  limits: '店舗の閉店告知を確認。既存の対象店舗IDはないため閉店パッチは追加しない。告知の予定日だけで実施日を断定せず、現行後継店と異店の除外も確認した。',
  input_hashes: Object.fromEntries(files.map(file => [file, hash(read(file))])) };
fs.writeFileSync('data-sources/facility-successors-20260925/closure-absence-check.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ checked_records: all.length, matching_ids: matches.length, excluded_other_shops: excluded.length, current_successor: current.id }));
