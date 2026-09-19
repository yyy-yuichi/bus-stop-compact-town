import { openingHours, phoneHref, detailText } from '../src/facilityDetails.ts';
import { SHOPPING_CATEGORIES } from '../src/facilityCatalog.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { searchPlaces } from '../src/placeSearch.ts';
import { placeLink, readPlaceLink } from '../src/placeLink.ts';
import { facilityIconMarkup } from '../src/facilityIcons.ts';
import { municipalCatalog } from '../src/stopCatalog.ts';

const read = name => JSON.parse(fs.readFileSync(`public/data/${name}`, 'utf8'));
const stops = read('review-national.geojson').features;
const facilities = read('shopping.geojson').features;
const municipal = municipalCatalog(read('review-stops.geojson'), read('review-routes.json'));
assert.equal(searchPlaces('岩国市', municipal, []).stops.length, 800);
assert.equal(searchPlaces('光市', municipal, []).stops.length, 172);
assert(searchPlaces('光市 あさえ', municipal, []).stops.length === 0, 'Kanji readings must not be invented');
assert(searchPlaces('光市 浅江中学校前', municipal, []).stops.length > 0);
assert(searchPlaces('岩国市 北河内駅', municipal, []).stops.length > 0);
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
  ...municipal.map(f => ({ kind: 'municipal', id: String(f.id) })),
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
for (const hash of ['#kind=municipal&id=hikari:1_01&minutes=20', '#kind=municipal&id=iwakuni:1_01&speed=4', '#kind=national&id=hikari:1_01', '#kind=municipal&id=mlit-p11-22-35:1', '#kind=municipal&id=hikari:../bad']) assert.equal(readPlaceLink(hash), null, hash);
for (const invalidConditions of [
  'minutes=5', 'speed=3', 'minutes=&speed=3', 'minutes=5&speed=',
  'minutes=0&speed=3', 'minutes=15&speed=3', 'minutes=5.0&speed=3',
  'minutes=5&speed=0', 'minutes=5&speed=5', 'minutes=5&speed=3.0',
  'minutes=NaN&speed=3', 'minutes=5&speed=Infinity',
  'minutes=5&minutes=10&speed=3', 'minutes=5&speed=3&speed=4',
]) assert.equal(readPlaceLink(`${pilotHash}&${invalidConditions}`), null, invalidConditions);
assert.deepEqual(readPlaceLink(pilotHash), { kind: 'pilot', id: 'node/5127585172' }, 'Old pilot links remain valid without conditions');
assert.deepEqual(readPlaceLink('#kind=facility&id=sunpark&minutes=5&speed=3'), { kind: 'facility', id: 'sunpark' }, 'A facility link must not imply a walking origin');
assert.equal(readPlaceLink('#kind=national&id=mlit-p11-22-35%3A1&minutes=5&speed=3'), null, 'National walks use the fixed baked speed, not the pilot speed');
let nationalWalkingLinks = 0;
for (const stop of stops) for (const minutes of [5, 10, 15]) {
  const place = { kind: 'national', id: String(stop.id), minutes };
  assert.deepEqual(readPlaceLink(new URL(placeLink('https://example.org/subdir/', place)).hash), place);
  nationalWalkingLinks++;
}
for (const conditions of ['minutes=0', 'minutes=20', 'minutes=5.0', 'minutes=', 'minutes=NaN', 'minutes=5&minutes=10', 'speed=4', 'minutes=15&speed=4']) {
  assert.equal(readPlaceLink(`#kind=national&id=mlit-p11-22-35%3A1&${conditions}`), null, conditions);
  assert.equal(readPlaceLink(`#kind=municipal&id=hikari%3A4_02&${conditions}`), null, conditions);
  assert.equal(readPlaceLink(`#kind=boarding&id=node%2F123&${conditions}`), null, conditions);
}
for (const point of [{ kind: 'municipal', id: 'hikari:4_02' }, { kind: 'boarding', id: 'node/123' }]) {
  for (const minutes of [5, 10, 15]) {
    const place = { ...point, minutes };
    assert.deepEqual(readPlaceLink(new URL(placeLink('https://example.org/', place)).hash), place);
  }
}
for (const invalid of [
  '', '#walking', '#kind=unknown&id=sunpark', '#kind=facility&id=../secret',
  '#kind=facility&id=%3Cscript%3E', '#kind=national&id=node%2F5127585172',
  '#kind=pilot&id=mlit-p11-22-35%3A1', '#kind=facility&id=sunpark&id=other',
  '#kind=facility&kind=pilot&id=sunpark', '#kind=facility&id='+ 'x'.repeat(513),
]) assert.equal(readPlaceLink(invalid), null, invalid);
console.log(`Place tools: kana/width/multiple-word search, untruncated results, ${allPlaces.length} existing links, ${walkingLinks} pilot links, ${nationalWalkingLinks} national time links and invalid links passed.`);

for (const category of SHOPPING_CATEGORIES) assert(facilityIconMarkup(category.id).startsWith('<svg'));
for (const category of ['cafe','park','dentist','childcare','school','social_facility']) {
  const name=SHOPPING_CATEGORIES.find(c=>c.id===category).name;
  assert(searchPlaces(name,[],facilities).facilities.some(f=>f.properties.category===category));
}
assert.equal(phoneHref('＋８１（８３）１２３－４５６７'),'tel:+81831234567');
assert.equal(phoneHref('083-123-4567'),'tel:0831234567');
for(const bad of ['*21*123456789#','tel:0831234567','javascript:alert(1)','123','1234567890123456','0831234567 ext 12','0831234567;0832345678','<script>']) assert.equal(phoneHref(bad),null);
assert.deepEqual(openingHours('24/7'),{text:'24時間・年中無休',raw:false});
assert.deepEqual(openingHours('Mo-Fr 09:00-17:00; Sa,Su off'),{text:'月〜金 09:00〜17:00 ／ 土・日 休み',raw:false});
assert.equal(openingHours('Mo-Su 18:00-02:00').text,'月〜日 18:00〜翌日02:00');
assert.equal(openingHours('Mo-Su 10:00-24:00').text,'月〜日 10:00〜24:00');
for(const value of ['Mo-Fr 09:00-17:00; PH off','Mo-Fr 09:00-17:00; unknown','Mo 25:00-26:00','sunrise-sunset','Mo 09:00-17:00 "reservation"','']) assert.deepEqual(openingHours(value),{text:value,raw:true},'Never discard unfamiliar date/holiday/exception rules');
assert.equal(detailText('cuisine','ramen;unknown'),'ラーメン・unknown');
assert.equal(detailText('wheelchair','limited'),'一部利用可能の登録');
console.log('Expanded categories, registered details, safe phone actions and lossless hours display passed.');
