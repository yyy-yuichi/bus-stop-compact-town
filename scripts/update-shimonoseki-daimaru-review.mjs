import fs from 'node:fs';
import crypto from 'node:crypto';

const file = 'public/data/shopping.geojson';
const original = fs.readFileSync(file, 'utf8');
const parsed = JSON.parse(original);
const matches = parsed.features.filter(feature => feature.id === 'osm-node-2426673962');
if (matches.length !== 1) throw new Error(`Expected one Shimonoseki feature; found ${matches.length}`);
const feature = matches[0];
if (feature.properties.name !== '下関大丸' || feature.properties.verification_status !== 'osm_unverified') {
  throw new Error('Refusing to overwrite a feature that no longer matches the reviewed baseline');
}
const originalGeometry = JSON.stringify(feature.geometry);
const beforeHash = crypto.createHash('sha256').update(original).digest('hex');

Object.assign(feature.properties, {
  name: '大丸下関店',
  city: '下関市',
  official_address: '山口県下関市竹崎町4-4-10',
  official_url: 'https://www.daimaru.co.jp/shimonoseki/hours.html',
  address: '山口県下関市竹崎町4-4-10',
  search_names: '下関大丸 大丸下関店',
  verified_at: '2026-09-24',
  verification_status: 'official_name_and_address_confirmed; scheduled_closure_2027-08-31; representative_point_not_independently_verified',
  osm_name: '下関大丸',
  location_verification: '公式店舗ページの現行名称・所在地を確認。OSM代表点の位置精度・入口は未確認。',
  classification_review: {
    checked_at: '2026-09-24',
    status: 'retained',
    original_category: 'mall',
    note: '大丸松坂屋百貨店の公式ページで「大丸下関店」、所在地、通常営業を確認。公式告知では2027年8月31日営業終了予定（同日までは営業）。店舗名・住所を更新し、OSMの原ID・座標・形状・分類は維持。代表点の位置精度・入口は未確認。',
    evidence_url: 'https://www.daimaru.co.jp/shimonoseki/news/13520.html'
  }
});

if (JSON.stringify(feature.geometry) !== originalGeometry) throw new Error('Geometry unexpectedly changed');
const updated = JSON.stringify(parsed, null, 2) + (original.endsWith('\r\n') ? '\r\n' : '\n');
JSON.parse(updated);
fs.writeFileSync(file, updated, 'utf8');
const afterHash = crypto.createHash('sha256').update(updated).digest('hex');
console.log(JSON.stringify({id: feature.id, beforeHash, afterHash, geometryUnchanged: true, name: feature.properties.name}));
