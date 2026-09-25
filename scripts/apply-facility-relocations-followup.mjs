import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const write = (path, value) => fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const file = 'public/data/facility-current.json';
const statusesFile = 'data-sources/facility-relocations-20260925/relocation-review.json';
const items = read('data-sources/facility-relocations-20260925/followup-adoptions.json');
const overlay = read(file);
const statuses = read(statusesFile);
const baseline = ['shopping.geojson', 'civic-facilities.geojson']
  .flatMap(name => read(`public/data/${name}`).features);
assert.equal(items.length, 4);
assert.equal(overlay.checked_at, '2026-09-25');
assert.equal(overlay.updates.length, 24);
assert([141, 145].includes(overlay.additions.length));
const norm = value => value.normalize('NFKC').replace(/[\s・ー‐-]+/g, '').toLowerCase();
const oldPoint = [130.9440486, 33.9575229];
let newAdditions = 0;
for (const item of items) {
  const row = statuses.find(row => row.graduate_id === item.graduate_id);
  assert(row, item.graduate_id);
  assert(!baseline.some(feature => feature.id === item.facility_id));
  assert(![...baseline, ...overlay.additions].some(feature =>
    feature.id !== item.facility_id && norm(feature.properties.name) === norm(item.name)));
  assert(item.map_url.includes(String(item.coordinates[1])) && item.map_url.includes(String(item.coordinates[0]))
    || item.graduate_id === 'harete-graduate-03', `Map URL lacks point: ${item.name}`);
  assert.notDeepEqual(item.coordinates, oldPoint);
  assert(item.coordinates[0] > 130.9 && item.coordinates[0] < 131);
  assert(item.coordinates[1] > 33.9 && item.coordinates[1] < 34);
  const locationNote = '地図サービスの同名・同住所の店舗代表点です。建物の入口、階への動線、バス停からの徒歩到達性は未確認です。旧横丁の代表点は使用していません。';
  const sources = [
    { title: item.graduate_id === 'harete-graduate-03' ? '店舗自身の現行案内' : '横丁運営元の卒業生案内', url: item.operator_url },
    ...(item.corroboration_url ? [{ title: '地域媒体の現行店舗紹介', url: item.corroboration_url }] : []),
    { title: '同名同住所の地図サービス店舗点', url: item.map_url },
  ];
  const feature = {
    type: 'Feature', id: item.facility_id,
    properties: {
      name: item.name, city: '下関市', address: item.address, official_address: item.address,
      official_url: item.operator_url, category: item.category,
      geometry_kind: 'representative_point', source: '店舗公式情報',
      source_ids: [`official:harete:graduate:${item.graduate_id.split('-').pop()}`],
      source_timestamp: '2026-09-25', verified_at: '2026-09-25',
      verification_status: 'official_current_listing', license: 'official-published-facts',
      search_names: `${item.name} 唐戸はれて横丁 移転`, location_verification: locationNote,
      freshness_review: {
        status: 'operating', event: 'listed', effective_at: null, checked_at: '2026-09-25',
        summary: '移転先の店舗名・住所と同名同住所の地図掲載を照合して追加しました。実開店日・リアルタイム営業は確定していません。',
        sources,
        limits: ['掲載時点の案内であり、現地の営業保証ではありません。', locationNote, item.note],
      },
    },
    geometry: { type: 'Point', coordinates: item.coordinates },
  };
  const existing = overlay.additions.find(value => value.id === item.facility_id);
  if (existing) assert.deepEqual(existing, feature, `Applied row drift: ${item.facility_id}`);
  else { overlay.additions.push(feature); newAdditions += 1; }
  row.status = 'reflected_addition';
  row.map_feature_id = item.facility_id;
  row.reason = item.note;
  row.sources = sources.map(source => ({ url: source.url }));
}
assert.equal(overlay.additions.length, 145);
for (const [id, reason, source] of [
  ['harete-graduate-01', '運営元は赤間町2-1・赤間プラザ1階、同名地図店舗は赤間町2-4。再移転または誤記の可能性を解消するまで保留。', 'https://www.google.com/maps/place/カラオケBARいいやん/data=!4m6!3m5!1s0x3543bd0067a7bed5:0x23c48aef4ffb1165!8m2!3d33.9587296!4d130.9432557!16s%2Fg%2F11vrzbfhc8'],
  ['harete-graduate-02', '運営元は赤間プラザ2階を案内する一方、同名同住所の地図店舗は「閉業」。支店別の一次情報がないため追加・閉店とも保留。', 'https://www.google.com/maps/place/D-DAY/data=!4m6!3m5!1s0x3543bdeba7eb4451:0xd07d7e11708c985b!8m2!3d33.9588478!4d130.9434144!16s%2Fg%2F11vlvtyhlk'],
]) {
  const row = statuses.find(row => row.graduate_id === id);
  assert(row && row.status !== 'reflected_addition');
  row.status = 'conflicting_current_listing_hold';
  row.reason = reason;
  row.sources = [{ url: 'https://www.karatoharete.com/卒業生' }, { url: source }];
}
if (process.argv.includes('--apply')) {
  write(file, overlay);
  write(statusesFile, statuses);
}
console.log(JSON.stringify({ additions: overlay.additions.length, reviewed_in_batch: items.length,
  would_add: newAdditions, newly_reflected: process.argv.includes('--apply') ? newAdditions : 0,
  graduates_reflected: statuses.filter(row => row.status === 'reflected_addition').length,
  conflict_holds: statuses.filter(row => row.status === 'conflicting_current_listing_hold').length }));
