import assert from 'node:assert/strict';
import fs from 'node:fs';
import { attachBoardingGuides, attachLocationReviews, boardingChoices, boardingTitle, findBoardingStop } from '../src/boardingGuide.ts';
import { attachBoardingWalks } from '../src/boardingWalking.ts';
import { placeLink, readPlaceLink } from '../src/placeLink.ts';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const data = read('src/data/boarding-location-review.json');
const study = read('src/data/boarding-guide-study.json');
const originals = study.hub_points.map(s => ({ ...s, properties: { ...s.properties, boarding_guide: study.guides[s.id] } }));
const before = JSON.stringify(originals);
const all = attachLocationReviews(originals, data);
assert.equal(JSON.stringify(originals), before);
assert.equal(data.points.length, 5);
assert.equal(boardingChoices(all.find(s => s.id === 'review:ube-chuo-7'), all).length, 9);
assert.equal(boardingChoices(all.find(s => s.id === 'review:ube-shinkawa-6'), all).length, 8);
const tokuyama8 = findBoardingStop(all, 'review:tokuyama-8');
assert.equal(tokuyama8.id, 'bocho:00451571-000000003384');
assert.equal(boardingChoices(tokuyama8, all).length, 8);
assert.equal(boardingTitle(tokuyama8), '徳山駅前 8のりば');
assert.equal(tokuyama8.properties.name, '徳山駅前(ちょい乗り)');
assert.deepEqual(tokuyama8.geometry.coordinates, [131.803308, 34.052243]);
assert.equal(findBoardingStop(all, 'review:tokuyama-9'), undefined);
assert(!all.some(s => s.id === 'review:tokuyama-8'));
assert.deepEqual(readPlaceLink('#kind=boarding&id=review%3Atokuyama-8'), {kind:'boarding',id:'review:tokuyama-8'});
// Candidate links cannot be reassigned to an arbitrary ID, collide, or become duplicate pins.
const aliasStudy = {version:1, hub_points:study.hub_points, guides:Object.fromEntries(study.hub_points.map(s => [s.id, study.guides[s.id]]))};
assert.doesNotThrow(() => attachBoardingGuides([], aliasStudy));
const invalidAlias = structuredClone(aliasStudy);
invalidAlias.guides[tokuyama8.id].previous_candidate_ids.push('review:tokuyama-8');
assert.throws(() => attachBoardingGuides([], invalidAlias), /Invalid boarding alias/);
const restored = structuredClone(data.points[0]); restored.id='review:tokuyama-8';
assert.throws(() => attachLocationReviews(originals, {version:1,points:[restored]}), /Invalid review origin/);
for (const p of data.points) {
  assert.match(boardingTitle(p), /位置候補/);
  const place = { kind: 'boarding', id: p.id };
  assert.deepEqual(readPlaceLink(new URL(placeLink('https://example.com/', place)).hash), place);
  assert.equal(readPlaceLink(`#kind=boarding&id=${encodeURIComponent(p.id)}&minutes=15`), null);
  assert.throws(() => attachBoardingWalks(all, { version:1, budget:1000, snap_limit:30, stops:{ [p.id]:{ origin:p.geometry.coordinates, gap:null } } }, {}), /origin mismatch/);
}
assert.throws(() => attachLocationReviews(all, data), /Invalid review origin/);
const invalid = structuredClone(data); invalid.points[0].geometry.coordinates[0] += .01;
assert.throws(() => attachLocationReviews(originals, invalid), /Invalid review origin/);
for (const id of Object.keys(study.guides).filter(id => id.startsWith('bocho:'))) {
  const p = {kind:'boarding', id, minutes:10};
  assert.deepEqual(readPlaceLink(new URL(placeLink('https://example.com/',p)).hash), p);
  assert.equal(study.guides[id].evidence, 'official-platform-coordinate');
}
const oldPath='work/boarding-location-review-20260914/guides-before.json';
if (fs.existsSync(oldPath)) for (const [id,g] of Object.entries(read(oldPath).guides)) assert.deepEqual(study.guides[id], g);
const walk=read('src/data/boarding-walk-study/index.json');
for (const p of data.points) assert(!walk.stops[p.id]);
assert(walk.stops[tokuyama8.id].file);
assert(!walk.stops['review:tokuyama-8']);
console.log('Location review passed: 5 separate candidates, official origins, exact old-link transition, immutable originals, no candidate catchments.');
