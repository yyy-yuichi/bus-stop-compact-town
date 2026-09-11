import assert from 'node:assert/strict';
import fs from 'node:fs';
import { searchPlaces } from '../src/placeSearch.ts';
import { placeLink, readPlaceLink } from '../src/placeLink.ts';

const read = name => JSON.parse(fs.readFileSync(`public/data/${name}`, 'utf8'));
const stops = read('review-national.geojson').features;
const facilities = read('shopping.geojson').features;
assert.deepEqual(searchPlaces('こすもす', stops, facilities), searchPlaces('ｺｽﾓｽ', stops, facilities));
assert.deepEqual(searchPlaces('こすもす 高栄', stops, facilities).facilities.map(f => f.id), ['cosmos-onoda']);
assert.equal(searchPlaces('コスモス 宇部市', stops, facilities).stops[0].properties.name, 'コスモス東岐波店');
assert.equal(searchPlaces('コスモス 宇部市', stops, facilities).facilities.length, 0);
assert(searchPlaces('ゆめ', stops, facilities).facilities.length > 0);
assert(searchPlaces('前', stops, facilities).stops.length > 12, 'Search must retain results beyond the first page');
assert.deepEqual(searchPlaces('　 ', stops, facilities), { facilities: [], stops: [] });
assert.deepEqual(searchPlaces('存在しない試験地点12345', stops, facilities), { facilities: [], stops: [] });

const allPlaces = [
  ...facilities.map(f => ({ kind: 'facility', id: String(f.id) })),
  ...stops.map(f => ({ kind: 'national', id: String(f.id) })),
  ...read('walking-onoda.json').pilot_stops.map(s => ({ kind: 'pilot', id: s.id })),
];
for (const place of allPlaces) {
  const url = new URL(placeLink('https://example.org/subdir/?v=old#previous', place));
  assert.equal(url.pathname, '/subdir/');
  assert.equal(url.search, '');
  assert.deepEqual(readPlaceLink(url.hash), place);
}
for (const invalid of [
  '', '#walking', '#kind=unknown&id=sunpark', '#kind=facility&id=../secret',
  '#kind=facility&id=%3Cscript%3E', '#kind=national&id=node%2F5127585172',
  '#kind=pilot&id=mlit-p11-22-35%3A1', '#kind=facility&id=sunpark&id=other',
  '#kind=facility&kind=pilot&id=sunpark', '#kind=facility&id='+ 'x'.repeat(513),
]) assert.equal(readPlaceLink(invalid), null, invalid);
console.log(`Place tools: kana/width/multiple-word search, untruncated results, ${allPlaces.length} share-link round trips and invalid links passed.`);
