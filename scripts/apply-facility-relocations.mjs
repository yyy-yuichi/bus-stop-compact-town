import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { htmlText } from './facility-bulk-lib.mjs';

const root = 'data-sources/facility-relocations-20260925';
const pages = 'outputs/facility-relocations-20260925/pages';
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');
const normal = value => value.normalize('NFKC').replace(/[\s\u200bー・‐-]+/g, '').toLowerCase();
const receiptFor = url => {
  const filename = `${digest(new URL(url).href).slice(0, 24)}.json`;
  const fresh = `${pages}/${filename}`;
  const older = `outputs/facility-progress-20260925/pages/${filename}`;
  const path = fs.existsSync(fresh) ? fresh : older;
  const receipt = read(path);
  assert.equal(receipt.url, url);
  assert.equal(receipt.status, 200, `Source failed: ${url}`);
  assert(!receipt.error && receipt.html);
  return { path, receipt, sha256: digest(fs.readFileSync(path)) };
};
const adoptions = read(`${root}/adoptions.json`);
assert.equal(adoptions.length, 4);
const graduated = read('data-sources/facility-progress-20260925/focus-review.json').graduates;
const byGraduate = new Map(graduated.map(row => [row.id, row]));
const baseline = ['shopping.geojson', 'civic-facilities.geojson']
  .flatMap(name => read(`public/data/${name}`).features);
const overlayPath = 'public/data/facility-current.json';
const overlay = read(overlayPath);
assert.equal(overlay.updates.length, 24);
assert([137, 141].includes(overlay.additions.length), 'Unexpected overlay size');
const candidateNames = [...baseline, ...overlay.additions].map(row => ({
  id: row.id, normalized: normal(row.properties.name),
}));
const featureIds = new Set([...baseline, ...overlay.additions].map(row => row.id));
const statusRows = graduated.map(row => ({
  graduate_id: row.id, name: row.name, status: row.location_type === 'mobile_no_fixed_point'
    ? 'mobile_no_fixed_point' : 'geometry_or_current_identity_pending',
  map_feature_id: null, reason: row.next,
}));
const features = [];
for (const item of adoptions) {
  const graduate = byGraduate.get(item.graduate_id);
  assert(graduate && graduate.location_type === 'reported_fixed_address');
  assert(!candidateNames.some(row => row.normalized === normal(item.name) && row.id !== item.facility_id),
    `Same-name existing feature requires manual review: ${item.name}`);
  const operator = receiptFor(item.self_url);
  const map = receiptFor(item.map_url);
  const operatorText = normal(htmlText(operator.receipt.html));
  const mapText = normal(htmlText(map.receipt.html));
  assert(operatorText.includes(normal(item.map_address_fragment)), `Primary address absent: ${item.name}`);
  assert(mapText.includes(normal(item.map_address_fragment)), `Map address absent: ${item.name}`);
  assert(mapText.includes(normal(item.name)), `Map name absent: ${item.name}`);
  const match = map.receipt.html.match(/latitude\\":(\d+(?:\.\d+)?),\\"longitude\\":(\d+(?:\.\d+)?)/);
  assert(match, `Map point absent: ${item.name}`);
  assert.deepEqual([Number(match[2]), Number(match[1])], item.coordinates);
  assert(item.coordinates[0] > 130.9 && item.coordinates[0] < 131.0);
  assert(item.coordinates[1] > 33.9 && item.coordinates[1] < 34.0);
  assert(!featureIds.has(item.facility_id) || overlay.additions.some(row => row.id === item.facility_id));
  const corroboration = item.graduate_id === 'harete-graduate-05'
    ? [{ title: '下関市・参加店舗の発表', url: 'https://www.city.shimonoseki.lg.jp/site/kisya/161843.html' }]
    : [];
  const locationNote = '地図サービスの同名・同住所の店舗代表点です。建物の入口、階への動線、バス停からの徒歩到達性は未確認です。旧横丁の代表点は使用していません。';
  const feature = {
    type: 'Feature', id: item.facility_id,
    properties: {
      name: item.name, city: '下関市', address: item.address, official_address: item.address,
      official_url: item.self_url, category: item.category,
      geometry_kind: 'representative_point', source: '店舗公式情報',
      source_ids: [`official:harete:graduate:${item.graduate_id.split('-').pop()}`],
      source_timestamp: '2026-09-25', verified_at: '2026-09-25',
      verification_status: 'official_current_listing',
      license: 'official-published-facts', search_names: item.search_names,
      location_verification: locationNote,
      freshness_review: {
        status: 'operating', event: 'listed', effective_at: null, checked_at: '2026-09-25',
        summary: '移転先の店舗名・住所と同名同住所の地図掲載を照合して追加しました。実開店日・リアルタイム営業は確定していません。',
        sources: [
          { title: item.graduate_id === 'harete-graduate-05' ? 'イベント主催者の店舗表' : item.self_url.includes('karatoharete') ? '横丁運営元の卒業生案内' : '店舗自身の現行案内', url: item.self_url },
          ...corroboration,
          { title: '同名同住所の地図サービス店舗掲載・代表点', url: item.map_url },
        ],
        limits: ['掲載時点の案内であり、現地の営業保証ではありません。', locationNote, item.note],
      },
    },
    geometry: { type: 'Point', coordinates: item.coordinates },
  };
  features.push(feature);
  const row = statusRows.find(value => value.graduate_id === item.graduate_id);
  row.status = 'reflected_addition';
  row.map_feature_id = item.facility_id;
  row.reason = item.note;
  row.sources = [
    { url: item.self_url, receipt: operator.path, sha256: operator.sha256 },
    { url: item.map_url, receipt: map.path, sha256: map.sha256 },
  ];
}
assert.equal(new Set(features.map(row => row.id)).size, 4);
for (const feature of features) {
  const existing = overlay.additions.find(row => row.id === feature.id);
  if (existing) assert.deepEqual(existing, feature, `Applied row drifted: ${feature.id}`);
  else overlay.additions.push(feature);
}
assert.equal(overlay.additions.length, 141);
const result = {
  checked_at: '2026-09-25', baseline: baseline.length, overlay_updates: overlay.updates.length,
  overlay_additions: overlay.additions.length, graduate_total: statusRows.length,
  graduate_reflected: statusRows.filter(row => row.status === 'reflected_addition').length,
  graduate_pending: statusRows.filter(row => row.status === 'geometry_or_current_identity_pending').length,
  graduate_mobile_no_fixed_point: statusRows.filter(row => row.status === 'mobile_no_fixed_point').length,
  map_changes_this_batch: features.length,
  jev_additional_requests: 0,
  receipts_sha256: Object.fromEntries([...new Set(features.flatMap(feature => feature.properties.freshness_review.sources.map(row => row.url)))].filter(url => {
    const filename = `${digest(new URL(url).href).slice(0, 24)}.json`;
    return fs.existsSync(`${pages}/${filename}`) || fs.existsSync(`outputs/facility-progress-20260925/pages/${filename}`);
  }).map(url => [url, receiptFor(url).sha256])),
};
if (process.argv.includes('--apply')) {
  fs.writeFileSync(overlayPath, JSON.stringify(overlay, null, 2) + '\n');
  fs.writeFileSync(`${root}/relocation-review.json`, JSON.stringify(statusRows, null, 2) + '\n');
  fs.writeFileSync(`${root}/adoption-summary.json`, JSON.stringify(result, null, 2) + '\n');
}
console.log(JSON.stringify(result));
