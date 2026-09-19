import assert from 'node:assert/strict';
import fs from 'node:fs';
import { attachBoardingGuides, boardingChoices, boardingTitle, hasOverlappingChoice } from '../src/boardingGuide.ts';
import { municipalCatalog, nationalCatalog, nationalCatchmentId } from '../src/stopCatalog.ts';
import { placeLink, readPlaceLink } from '../src/placeLink.ts';
import { searchPlaces } from '../src/placeSearch.ts';

const read = name => JSON.parse(fs.readFileSync(`public/data/${name}`, 'utf8'));
const original = [...nationalCatalog(read('review-national.geojson')).features, ...municipalCatalog(read('review-stops.geojson'), read('review-routes.json'))];
const before = JSON.stringify(original);
const study = JSON.parse(fs.readFileSync('src/data/boarding-guide-study.json', 'utf8'));
const stops = attachBoardingGuides(original, study);
const byId = new Map(stops.map(s => [String(s.id), s]));
assert.equal(stops.length, original.length + study.hub_points.length);
assert.equal(JSON.stringify(original), before);
for (const stop of original) assert.deepEqual(byId.get(String(stop.id)).geometry, stop.geometry);
assert.equal(stops.filter(s => s.properties.boarding_guide).length, Object.keys(study.guides).length);
assert.equal(stops.filter(s => s.properties.source_kind === 'municipal' && s.properties.boarding_guide).length, 972);
assert.equal(stops.filter(s => s.properties.boarding_guide?.number).length, 78);
assert.equal(stops.filter(s => s.properties.boarding_guide?.role === 'alighting').length, 13);
for (const stop of stops.filter(s => s.properties.source_kind === 'boarding-study')) assert.throws(() => nationalCatchmentId(stop));
assert(byId.get('hikari:4_01').properties.boarding_guide.summary.startsWith('筒井方面'));
assert(byId.get('hikari:4_02').properties.boarding_guide.summary.startsWith('虹ヶ浜二丁目方面'));
assert.equal(byId.get('hikari:4_01').properties.boarding_guide.number, null);
// GTFS stop_code is not a platform number. Even nearly coincident records
// retain their own source ID, routes and origin.
assert.deepEqual(boardingChoices(byId.get('iwakuni:684_01'), stops).map(s => s.id), ['iwakuni:684_01', 'iwakuni:684_02']);
for (const id of ['iwakuni:684_01', 'iwakuni:684_02']) {
  assert.equal(byId.get(id).properties.boarding_guide.number, null);
  assert.equal(byId.get(id).properties.boarding_guide.roadside_review.status, 'hold');
}
assert.notDeepEqual(byId.get('iwakuni:684_01').geometry, byId.get('iwakuni:684_02').geometry);
assert.notEqual(byId.get('iwakuni:684_01').properties.boarding_guide.summary, byId.get('iwakuni:684_02').properties.boarding_guide.summary);
assert.deepEqual(boardingChoices(byId.get('iwakuni:438_01'), stops).map(s => s.id), ['iwakuni:438_01', 'iwakuni:438_02']);
assert.notEqual(byId.get('iwakuni:438_01').properties.boarding_guide.summary, byId.get('iwakuni:438_02').properties.boarding_guide.summary);
assert.match(byId.get('iwakuni:438_01').properties.boarding_guide.summary, /相地/);
assert.match(byId.get('iwakuni:438_02').properties.boarding_guide.summary, /笠塚カープ練習場前/);
assert.equal(byId.get('iwakuni:630_02').properties.boarding_guide.role, 'alighting');
assert.deepEqual(byId.get('iwakuni:630_02').properties.boarding_guide.directions, []);
assert.deepEqual(byId.get('iwakuni:271_02').properties.boarding_guide.directions, []);
assert.equal(byId.get('iwakuni:271_02').properties.boarding_guide.summary, 'この資料の路線では終点として登録');
assert.equal(boardingChoices(byId.get('iwakuni:366_01'), stops).length, 3);
assert.equal(byId.get('hikari:1_01').properties.boarding_guide.summary, '光税務署前方面（右回り 光総合病院方面／左回り 光市役所前方面）');
assert.deepEqual(byId.get('hikari:6_02').properties.boarding_guide.directions.map(r => [r.route, r.next_stops]), [
  ['ひかりぐるりんバス', ['筒井']], ['広域生活交通', ['花園']],
]);
assert.deepEqual(boardingChoices(byId.get('hikari:89_01'), stops).map(s => s.id), ['hikari:89_01', 'hikari:89_02']);
assert(hasOverlappingChoice(byId.get('hikari:89_01'), stops, s => ({ x: s.geometry.coordinates[0]*1000, y:s.geometry.coordinates[1]*1000 })));
assert.deepEqual(boardingChoices(byId.get('node/3677406922'), stops).map(s => s.id), ['node/3677406922'], 'City hall is not a Karato platform');
assert.equal(boardingChoices(byId.get('node/3498204589'), stops).length, 6);
assert.equal(boardingTitle(byId.get('node/3498204589')), '唐戸 5のりば');
assert.equal(boardingTitle(byId.get('node/3498204588')), '唐戸 7のりば');
assert.notDeepEqual(byId.get('node/3498204589').geometry, byId.get('node/3498204588').geometry);
assert.deepEqual(study.unlocated.map(r => r.number), ['2A', '南A', '6', '7', '7', '8', '9']);
assert(!stops.some(s => ['2A','南A'].includes(s.properties.boarding_guide?.number)));
assert.equal(searchPlaces('唐戸 5のりば', stops, []).stops[0].id, 'node/3498204589');
assert.equal(searchPlaces('西河原 筒井', stops, []).stops[0].id, 'hikari:4_01');
assert.equal(searchPlaces('木園', stops, []).stops[0].properties.name, '木園', 'Stop-name matches precede nearby stops that only mention the direction');
const shared = {kind:'boarding', id:'node/3498204588'};
assert.deepEqual(readPlaceLink(new URL(placeLink('https://example.com/', shared)).hash), shared);
assert.deepEqual(readPlaceLink('#kind=boarding&id=node%2F3498204588&minutes=5'), { kind: 'boarding', id: 'node/3498204588', minutes: 5 });
assert.throws(() => attachBoardingGuides(original, {...study, hub_points:[study.hub_points[0], ...study.hub_points]}));
const changed = structuredClone(study);
changed.guides['hikari:4_01'].source_coordinates[0] += .001;
assert.throws(() => attachBoardingGuides(original, changed), 'Changed coordinates cannot silently inherit a label');
assert.throws(() => attachBoardingGuides(original.filter(s => s.id !== 'hikari:4_01'), study));
for (const id of ['node/3640500398','node/3640500395','node/6282455344']) assert.equal(boardingChoices(byId.get(id), stops).length, 6);
assert.equal(byId.get('node/6282455344').properties.name, '1番乗り場', 'Keep original OSM name');
assert.equal(boardingTitle(byId.get('node/6282455344')), '新山口駅 1のりば');
assert.equal(searchPlaces('新山口駅 1のりば', stops, []).stops[0].id, 'node/6282455344');
assert.equal(byId.get('node/3640500395').properties.boarding_guide.number, '1');
assert.equal(byId.get('node/3640500394').properties.boarding_guide.summary, '厚狭・小野田方面');
for (const id of ['node/3640500397','node/3640500396','node/3640475990','node/3204054161']) assert(!byId.has(id), 'Unresolved points are not assigned an official number');
console.log(`Boarding guide passed: 972 city points, ${study.hub_points.length} independent hub sources; reviewed names, directions, source coordinates, exclusions and sharing.`);
