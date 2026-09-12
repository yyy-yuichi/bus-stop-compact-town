import assert from 'node:assert/strict';
import fs from 'node:fs';
import { searchPlaces } from '../src/placeSearch.ts';
import { placeLink, readPlaceLink } from '../src/placeLink.ts';
import { facilityIconMarkup } from '../src/facilityIcons.ts';

const read = name => JSON.parse(fs.readFileSync(`public/data/${name}`, 'utf8'));
const stops = read('review-national.geojson').features;
const facilities = read('shopping.geojson').features;
assert.deepEqual(searchPlaces('こすもす', stops, facilities), searchPlaces('ｺｽﾓｽ', stops, facilities));
assert.deepEqual(searchPlaces('こすもす 高栄', stops, facilities).facilities.map(f => f.id), ['cosmos-onoda']);
assert.equal(searchPlaces('コスモス 宇部市', stops, facilities).stops[0].properties.name, 'コスモス東岐波店');
assert(searchPlaces('病院', stops, facilities).facilities.some(f => f.properties.category === 'hospital'));
assert(searchPlaces('まるき', stops, facilities).facilities.some(f => f.id === 'maruki-nakagawa'));
assert(searchPlaces('ゆめ', stops, facilities).facilities.length > 0);
const reference = searchPlaces('イシダ動物病院', stops, facilities).facilities;
assert.equal(reference.length, 1);
assert.equal(reference[0].properties.category, 'reference', 'Animal hospital must not be listed as a human hospital');
assert.equal(reference[0].id, 'osm-node-7037775362', 'Old reference links must remain valid');
assert(searchPlaces('2023年12月23日OPEN', stops, facilities).facilities.some(f => f.id === 'osm-way-1228233757'), 'Retain original name as a search alias');
assert(facilityIconMarkup('reference').startsWith('<svg'), 'Reference records need a non-medical marker');
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
let walkingLinks = 0;
for (const stop of read('walking-onoda.json').pilot_stops) {
  for (const minutes of [5, 10]) for (const speed of [3, 4]) {
    const place = { kind: 'pilot', id: stop.id, walking: { minutes, speed } };
    const url = new URL(placeLink('https://example.org/subdir/?v=old#previous', place));
    assert.equal(url.pathname, '/subdir/');
    assert.equal(url.search, '');
    const params = new URLSearchParams(url.hash.slice(1));
    assert.equal(params.get('minutes'), String(minutes));
    assert.equal(params.get('speed'), String(speed));
    assert.deepEqual(readPlaceLink(url.hash), place, 'The recipient must get the same stop, minutes and speed');
    walkingLinks++;
  }
}
const pilotHash = '#kind=pilot&id=node%2F5127585172';
for (const invalidConditions of [
  'minutes=5', 'speed=3', 'minutes=&speed=3', 'minutes=5&speed=',
  'minutes=0&speed=3', 'minutes=15&speed=3', 'minutes=5.0&speed=3',
  'minutes=5&speed=0', 'minutes=5&speed=5', 'minutes=5&speed=3.0',
  'minutes=NaN&speed=3', 'minutes=5&speed=Infinity',
  'minutes=5&minutes=10&speed=3', 'minutes=5&speed=3&speed=4',
]) assert.equal(readPlaceLink(`${pilotHash}&${invalidConditions}`), null, invalidConditions);
assert.deepEqual(readPlaceLink(pilotHash), { kind: 'pilot', id: 'node/5127585172' }, 'Old pilot links remain valid without conditions');
assert.deepEqual(readPlaceLink('#kind=facility&id=sunpark&minutes=5&speed=3'), { kind: 'facility', id: 'sunpark' }, 'A facility link must not imply a walking origin');
assert.deepEqual(readPlaceLink('#kind=national&id=mlit-p11-22-35%3A1&minutes=5&speed=3'), { kind: 'national', id: 'mlit-p11-22-35:1' }, 'National stops must not acquire pilot walking support through a link');
for (const invalid of [
  '', '#walking', '#kind=unknown&id=sunpark', '#kind=facility&id=../secret',
  '#kind=facility&id=%3Cscript%3E', '#kind=national&id=node%2F5127585172',
  '#kind=pilot&id=mlit-p11-22-35%3A1', '#kind=facility&id=sunpark&id=other',
  '#kind=facility&kind=pilot&id=sunpark', '#kind=facility&id='+ 'x'.repeat(513),
]) assert.equal(readPlaceLink(invalid), null, invalid);
console.log(`Place tools: kana/width/multiple-word search, untruncated results, ${allPlaces.length} existing links, ${walkingLinks} walking-condition links and invalid links passed.`);
