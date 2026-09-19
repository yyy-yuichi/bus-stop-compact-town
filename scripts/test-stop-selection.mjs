import assert from 'node:assert/strict';
import fs from 'node:fs';
import { attachBoardingGuides } from '../src/boardingGuide.ts';
import { nationalCatalog, municipalCatalog } from '../src/stopCatalog.ts';
import { choiceAccessibleLabel, choiceHoverLabel, choiceReducer, choiceText, relatedStops } from '../src/stopChoiceModel.ts';
import { CHOICE_HEIGHT, CHOICE_WIDTH, contains, overlapGroups, pointRect, spiderLayout, touches } from '../src/stopSpiderLayout.ts';

const read = name => JSON.parse(fs.readFileSync(`public/data/${name}`, 'utf8'));
const base = [...nationalCatalog(read('review-national.geojson')).features,
  ...municipalCatalog(read('review-stops.geojson'), read('review-routes.json'))];
const study = JSON.parse(fs.readFileSync('src/data/boarding-guide-study.json', 'utf8'));
const stops = attachBoardingGuides(base, study);
const byId = new Map(stops.map(stop => [String(stop.id), stop]));

const hikari = byId.get('hikari:4_01');
assert(hikari);
assert.deepEqual(relatedStops(hikari, stops).map(stop => stop.id), ['hikari:4_01', 'hikari:4_02']);
assert.equal(choiceText(hikari).direction, hikari.properties.boarding_guide.summary, 'Chooser keeps the source wording');
assert.equal(choiceText(hikari).number, null, 'A missing source number is not invented');
assert.equal(choiceHoverLabel(hikari), choiceText(hikari).name, 'Hover shows only the name when no number is confirmed');
assert(choiceAccessibleLabel(hikari).includes(choiceText(hikari).direction), 'The screen-reader label keeps direction details');
const held = stops.find(stop => stop.properties.boarding_guide?.assignment_hold);
assert(held);
assert.equal(choiceText(held).number, null, 'A held number is not presented as confirmed');
assert(choiceText(held).notes.includes('番号対応未確認'));
const national = stops.find(stop => stop.properties.source_kind === 'national' && !stop.properties.boarding_guide);
assert(national);
assert(!choiceHoverLabel(national).includes(String(national.id)), 'Hover never exposes a source record ID');
assert.deepEqual(relatedStops(national, stops), [], 'Nearby unreviewed records are never treated as one stop');

let state = choiceReducer(null, { type: 'open', ids: ['a', 'b', 'a'], kind: 'overlap' });
assert.deepEqual(state?.ids, ['a', 'b']);
assert.equal(state?.listOpen, false);
state = choiceReducer(state, { type: 'selection', id: 'b' });
assert(state, 'Selecting one choice keeps the chooser available');
state = choiceReducer(state, { type: 'layout', available: false });
assert.equal(state?.listOpen, true, 'A failed visual layout opens the accessible list');
assert.equal(choiceReducer(state, { type: 'selection', id: 'outside' }), null, 'A separate stop closes the old chooser');

const points = [{ id: 'a', x: 100, y: 100 }, { id: 'b', x: 100, y: 100 }, { id: 'c', x: 300, y: 300 }];
const groups = overlapGroups(points);
assert.deepEqual(groups.map(group => group.map(point => point.id)), [['a', 'b'], ['c']]);
assert.throws(() => overlapGroups([{ id: 'a', x: 1, y: 1 }, { id: 'a', x: 2, y: 2 }]));
const view = { left: 0, top: 0, right: 390, bottom: 700 };
const blocker = { left: 0, top: 0, right: 390, bottom: 80 };
const layout = spiderLayout(points.slice(0, 2), view, [blocker]);
assert(layout);
const cards = layout.map(point => pointRect(point, CHOICE_WIDTH, CHOICE_HEIGHT));
assert(cards.every(card => contains(view, card) && !touches(card, blocker, 8)));
assert(!touches(cards[0], cards[1], 8));
assert.equal(spiderLayout(points.slice(0, 2), { left: 0, top: 0, right: 120, bottom: 120 }), null,
  'Unsafe narrow screens use the list instead of squeezing cards');

const layerSource = fs.readFileSync('src/BusStopLayer.tsx', 'utf8');
assert.match(layerSource, /onStop=\{locateStop\}/, 'Search results locate a stop without opening its detail');
assert.match(layerSource, /const walkScope = selected \?/, 'Walking data remains tied to an explicitly selected stop');
assert.match(layerSource, /StopSelectionProvider/, 'The marker chooser owns one selection session');
const drawerSource = fs.readFileSync('src/BusStopDrawer.tsx', 'utf8');
assert.equal((drawerSource.match(/<StopChoiceButton/g) || []).length, 1, 'The drawer has one related-stop entry point');
assert(!fs.readFileSync('src/BoardingGuidePanel.tsx', 'utf8').includes('boarding-choices'), 'The old duplicate chooser is removed');
const markerSource = fs.readFileSync('src/StopMarkers.tsx', 'utf8');
assert.match(markerSource, /node\.removeAttribute\('title'\)/, 'A second native browser tooltip is not left on stop markers');
assert.match(markerSource, /tooltip\.textContent = hoverLabel/, 'The visible tooltip uses the concise label');
const selectionCss = fs.readFileSync('src/stopSelection.css', 'utf8');
assert.match(selectionCss, /\.stop-choice-tooltip[^}]*white-space:nowrap[^}]*text-overflow:ellipsis/s,
  'Long stop names stay on one bounded line');
assert.match(selectionCss, /@media \(hover:none\), \(pointer:coarse\)[^{]*\{[^}]*\.leaflet-tooltip\.stop-choice-tooltip[^}]*display:none/s,
  'Touch devices do not show a hover-only tooltip');

console.log(JSON.stringify({ relatedChoices: 2, overlapGroups: groups.length, spiderCards: layout.length, searchTapContract: 'passed' }));
