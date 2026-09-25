import assert from 'node:assert/strict';
import { htmlText, normalize } from './facility-bulk-lib.mjs';

function field(html, label) {
  const match = html.match(new RegExp(`<dt[^>]*>\\s*${label}\\s*</dt>\\s*<dd[^>]*>([\\s\\S]*?)</dd>`));
  assert(match, `Missing ${label}`);
  return htmlText(match[1]).trim();
}

export function wattsStore(receipt) {
  assert.equal(receipt.status, 200);
  const url = new URL(receipt.url);
  assert.equal(url.origin, 'https://www.watts-jp.com');
  const id = url.pathname.match(/^\/shop\/(\d+)\/$/)?.[1];
  assert(id, 'Not a single-shop URL');
  const h1 = receipt.html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1];
  assert(h1);
  const name = htmlText(h1.replace(/<span[^>]*>[\s\S]*?<\/span>/, ''));
  const blocks = [...receipt.html.matchAll(/\{\s*id:\s*['"]?(\d+)['"]?,\s*name:\s*"([^"]*)",\s*lat:\s*([\d.-]+),\s*lng:\s*([\d.-]+)/g)]
    .filter(match => match[1] === id);
  assert.equal(blocks.length, 1, 'Need exactly one marker bound to this shop ID, not a nearby store or viewport');
  const marker = blocks[0];
  assert.equal(normalize(htmlText(marker[2])), normalize(name), 'Marker shop name mismatch');
  const coordinates = [Number(marker[4]), Number(marker[3])];
  assert(coordinates[0] > 130 && coordinates[0] < 133 && coordinates[1] > 33 && coordinates[1] < 35);
  const address = field(receipt.html, '住所');
  assert(address.startsWith('山口県宇部市') && address.includes('店内'));
  return { id: `official-watts-${id}`, name, address, city: '宇部市', category: 'variety_store',
    url: receipt.url, coordinates, hours: field(receipt.html, '営業時間'),
    location_method: 'official_marker_exact_shop_id_and_name',
    store_format: htmlText(h1.match(/<i[^>]*>([\s\S]*?)<\/i>/)?.[1] ?? '') || '未記載',
    source_id: `official:watts:${id}` };
}

export function secondStreetStore(receipt) {
  assert.equal(receipt.status, 200);
  const url = new URL(receipt.url);
  assert.equal(url.origin, 'https://www.2ndstreet.jp');
  assert.equal(url.pathname, '/shop/details');
  const id = url.searchParams.get('shopsId');
  assert(id && /^\d+$/.test(id));
  const name = htmlText(receipt.html.match(/<title>([^｜]+)｜/)?.[1] ?? '');
  assert(name.startsWith('セカンドストリート '));
  const destinations = [...receipt.html.matchAll(/href="(https:\/\/www\.google\.com\/maps\/dir\/\/([\d.-]+),([\d.-]+))"/g)];
  assert.equal(destinations.length, 1, 'Need the official shop directions destination, not a viewport');
  const match = destinations[0];
  const address = field(receipt.html, '住所');
  const city = address.match(/^山口県([^市]+市)/)?.[1];
  assert(city, 'Require a Yamaguchi municipality');
  const point = [Number(match[3]), Number(match[2])];
  assert(point.every(Number.isFinite) && point[0] > 130 && point[0] < 133 && point[1] > 33 && point[1] < 35);
  return { id: `official-secondstreet-${id}`, name, address, city, category: 'second_hand',
    url: receipt.url, coordinates: [Number(match[3]), Number(match[2])], map_url: match[1],
    location_method: 'official_shop_directions_destination', store_format: '独立店舗',
    source_id: `official:secondstreet:${id}` };
}

export function currentListingFeature(row) {
  const locationNote = '運営会社が店舗名に対応付けた代表点です。店舗入口・館内動線・バス停からの徒歩到達性は未確認です。';
  const tenant = row.category === 'variety_store';
  return { type: 'Feature', id: row.id, properties: {
    name: row.name, city: row.city, address: row.address, official_address: row.address,
    official_url: row.url, category: row.category, geometry_kind: 'representative_point',
    source: '店舗公式情報', source_ids: [row.source_id], source_timestamp: '2026-09-25', verified_at: '2026-09-25',
    verification_status: 'official_current_listing', license: 'official-published-facts',
    search_names: `${row.name} ${tenant ? '100円ショップ 生活雑貨' : 'リユース リサイクル セカスト'}`,
    location_verification: locationNote,
    freshness_review: { status: 'operating', event: 'listed', effective_at: null, checked_at: '2026-09-25',
      summary: tenant ? '運営会社の店舗一覧・住所・店舗別地図を照合し、店内の100円ショップとして追加。入居先の営業状態は変更していません。'
        : '運営会社の現行店舗紹介・住所・経路検索の店舗点を照合して追加。旧店舗とは別IDで管理します。',
      sources: [{ title: '運営会社の現行店舗紹介・店舗別地図', url: row.url },
        ...(row.map_url ? [{ title: '運営会社の店舗経路検索リンク', url: row.map_url }] : [])],
      limits: [locationNote, '公式掲載の確認であり、実開店日やリアルタイム営業を確定するものではありません。',
        ...(tenant ? [`店内売場（公式区分：${row.store_format}）。入居先と独立した入口があるという意味ではありません。`] : [])] },
  }, geometry: { type: 'Point', coordinates: row.coordinates } };
}

export function adoptListings(overlay, rows, baseline) {
  const result = structuredClone(overlay);
  let added = 0;
  for (const row of rows) {
    assert(!baseline.some(feature => feature.id === row.id), 'Addition collides with original ID');
    assert(![...baseline, ...result.additions].some(feature => feature.id !== row.id
      && normalize(feature.properties.name) === normalize(row.name)), 'Exact-name match requires review');
    const feature = currentListingFeature(row);
    const existing = result.additions.find(value => value.id === row.id);
    if (existing) assert.deepEqual(existing, feature, `Previously adopted listing changed: ${row.id}`);
    else { result.additions.push(feature); added++; }
  }
  return { overlay: result, newly_added: added };
}
