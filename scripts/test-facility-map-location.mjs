import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFacilityAudit, validateAuditReview } from '../src/facilityAudit.ts';
import { facilityAvailable } from '../src/facilityFreshness.ts';
import { hasMapLocationIssue, isFacilityWalkingCandidate } from '../src/facilityMapLocation.ts';
import { bakedFacilityCandidates, nearbyFacilityCandidates, prepareFacilities, distance } from '../src/bakedWalking.ts';
import { mapFacilities } from '../src/facilityVisibility.ts';
import { searchPlaces } from '../src/placeSearch.ts';

// Only the reported distances/dates come from the seven examples. Names have a
// fixture prefix; IDs, coordinates, address and evidence URLs are all synthetic.
const examples = [
  ['友遊', 885.9], ['ファインブラン', 128.1], ['大笑', 5542.1],
  ['松福', 93.1], ['さざなみ', 1619.0], ['ゆうわ', 7180.5], ['ヘスティア', 1925.9],
];
const degreesPerMeter = 180 / (Math.PI * 6371000);
const point = (east, north = 0) => [east * degreesPerMeter, north * degreesPerMeter];
const base = examples.map(([name], i) => ({
  type: 'Feature', id: `map-location-fixture-${i}`,
  geometry: { type: 'Point', coordinates: point(100 + i * 10) },
  properties: {
    name: `位置テスト ${name}`, category: 'social_facility',
    address: `合成された元住所 ${i}`, official_url: `https://example.org/original/${i}`,
    source_ids: [`synthetic-source-${i}`],
  },
}));
const audit = {
  schema_version: 1, checked_at: '2026-10-08', edition: 'Synthetic map-position fixtures',
  provenance: { canonical_sha256: '0'.repeat(64), original_count: 7764 },
  counts: { reviewed: 7, limited_support: 7, unresolved: 0, recovered_registry: 0 },
  recovered_verifications: [],
  reviews: base.map((f, i) => ({
    id: f.id,
    expected: { name: f.properties.name, category: f.properties.category, source_ids: f.properties.source_ids, geometry: f.geometry },
    review: {
      status: 'limited_support', checked_at: '2026-10-08', accepted_type: 'service_identity',
      summary: '合成例：登録番号と元サービスの資料上の同定のみ支持。',
      scope: '現在施設の資料同定と原地図位置の確認は別の判断。',
      sources: [{ title: '合成された同定資料', url: `https://example.org/identity/${i}` }],
      limits: ['営業・原地図位置・徒歩到達性を保証しない。'],
      map_location: {
        status: 'different_from_current',
        note: i < 6 ? '合成例：原地図位置の現在位置確認は未確認。距離から移転や閉鎖を推定しない。'
          : '合成例：資料記載の移転実施日は2026-09-01。配置図の更新日は非表示。取得日は別記。原地図位置は未確認。',
        current_location: {
          coordinates: point(100 + i * 10, examples[i][1]),
          distance_from_original_m: examples[i][1],
          source: {
            title: '合成された公式来訪点資料', url: `https://example.org/current-point/${i}`,
            ...(i < 6 ? { as_of: '2026-06-30', published_at: '2026-07-09' } : {}),
            retrieved_at: '2026-10-08',
          },
        },
      },
    },
  })),
};
const marked = applyFacilityAudit(base, audit);
const legacy = {
  ...structuredClone(base[0]), id: 'map-location-fixture-legacy',
  properties: { ...structuredClone(base[0].properties), name: '位置テスト 位置確認情報のない既存例' },
};
const catchment = {
  stopId: '0_0', budget: 1000, origin: point(0), snap: point(0), snapGap: 0,
  segments: [{ a: point(0), b: point(200), d1: 0, d2: 200, grade: 0, steps: false }],
};

test('optional location evidence preserves original IDs, fields, geometry and audit status', () => {
  const saved = JSON.stringify([base, audit]);
  const applied = applyFacilityAudit(base, audit);
  assert.equal(JSON.stringify([base, audit]), saved, 'Applying optional evidence must not mutate the original inputs');
  assert.equal(new Set(applied.map(f => f.id)).size, 7);
  for (let i = 0; i < applied.length; i++) {
    const f = applied[i];
    assert.equal(f.id, base[i].id);
    assert.deepEqual(f.geometry, base[i].geometry);
    const { audit_review, ...originalProperties } = f.properties;
    assert.deepEqual(originalProperties, base[i].properties);
    assert.equal(audit_review.status, 'limited_support');
    assert.equal(audit_review.accepted_type, 'service_identity');
    assert.equal(facilityAvailable(f), facilityAvailable(base[i]), 'Location is independent of operation status');
    assert.equal(audit_review.map_location.current_location.distance_from_original_m, examples[i][1]);
    assert(Math.abs(distance(f.geometry.coordinates, audit_review.map_location.current_location.coordinates) - examples[i][1]) < 1e-6);
    validateAuditReview(audit_review, '2026-10-08');
  }
});

test('seven unverified original points cannot inflate nearby, baked or pilot candidate counts', () => {
  // Every original point lies directly on an eligible road and within 1 km.
  const unmarked = [...base, legacy];
  assert.equal(bakedFacilityCandidates(catchment, prepareFacilities(unmarked)).length, 8);
  assert.equal(nearbyFacilityCandidates(point(0), prepareFacilities(unmarked)).length, 8);
  const facilities = [...marked, legacy];
  const saved = JSON.stringify(facilities);
  const expected = [legacy.id];
  assert.deepEqual(bakedFacilityCandidates(catchment, prepareFacilities(facilities)).map(c => c.facility.id), expected);
  assert.deepEqual(nearbyFacilityCandidates(point(0), prepareFacilities(facilities)).map(c => c.facility.id), expected);
  assert.deepEqual(facilities.filter(isFacilityWalkingCandidate).map(f => f.id), expected, 'Pilot candidate predicate must make the same distinction');
  assert.equal(JSON.stringify(facilities), saved);
});

test('search and deliberate map selection retain marked records without stale walking inclusion', () => {
  const facilities = [...marked, legacy];
  const scope = 'synthetic-stop:15';
  const walking = { scope, ids: facilities.map(f => f.id) };
  assert.deepEqual(mapFacilities(facilities, ['social_facility'], null, scope, walking).map(f => f.id), [legacy.id]);
  for (const f of marked) {
    assert(searchPlaces(f.properties.name, [], facilities).facilities.some(result => result.id === f.id));
    const selected = mapFacilities(facilities, ['social_facility'], f, scope, walking);
    assert.deepEqual(selected.map(result => result.id), [legacy.id, f.id]);
    assert.deepEqual(selected.at(-1).geometry, f.geometry, 'Viewing a selected warning record must preserve its original point');
  }
});

test('an explicit location warning also excludes original facility areas without changing their geometry', () => {
  const area = structuredClone(marked[0]);
  area.geometry = {
    type: 'MultiPolygon',
    coordinates: [[[point(90, -10), point(110, -10), point(110, 10), point(90, 10), point(90, -10)]]],
  };
  const saved = JSON.stringify(area);
  assert.equal(bakedFacilityCandidates(catchment, prepareFacilities([area])).length, 0);
  assert.equal(nearbyFacilityCandidates(point(100), prepareFacilities([area])).length, 0);
  assert.equal(JSON.stringify(area), saved);
  delete area.properties.audit_review.map_location;
  assert.equal(bakedFacilityCandidates(catchment, prepareFacilities([area])).length, 1);
  assert.equal(nearbyFacilityCandidates(point(100), prepareFacilities([area]))[0].meters, 0);
});

test('explicit flags govern exclusion without a distance threshold or inferred operating event', () => {
  for (const status of ['unverified', 'different_from_current']) {
    for (const meters of [undefined, 0, 0.1, 93.1, 128.1, 7180.5, 100000]) {
      const f = structuredClone(marked[0]);
      f.properties.audit_review.map_location.status = status;
      if (meters === undefined) delete f.properties.audit_review.map_location.current_location;
      else f.properties.audit_review.map_location.current_location.distance_from_original_m = meters;
      validateAuditReview(f.properties.audit_review, '2026-10-08');
      assert(hasMapLocationIssue(f));
      assert(!isFacilityWalkingCandidate(f));
      assert(facilityAvailable(f));
      assert.equal(f.properties.freshness_review, undefined, 'Location evidence must not create closure or relocation events');
      assert.equal(f.properties.audit_review.status, 'limited_support');
    }
  }
  const withoutLocation = structuredClone(marked[0]);
  delete withoutLocation.properties.audit_review.map_location;
  validateAuditReview(withoutLocation.properties.audit_review, '2026-10-08');
  assert(!hasMapLocationIssue(withoutLocation));
  assert(isFacilityWalkingCandidate(withoutLocation), 'Existing limited-support reviews must keep their previous candidate behavior');
  const unresolved = structuredClone(withoutLocation);
  unresolved.properties.audit_review.status = 'unresolved';
  unresolved.properties.audit_review.accepted_type = null;
  assert(isFacilityWalkingCandidate(unresolved), 'Location rules must not blanket-exclude existing unresolved reviews');
  assert(isFacilityWalkingCandidate(legacy));
  assert(!isFacilityWalkingCandidate({ ...legacy, properties: { ...legacy.properties, duplicate_of: 'other' } }));
  assert(!isFacilityWalkingCandidate({ ...legacy, properties: { ...legacy.properties, freshness_review: { status: 'closed' } } }));
});

test('as-of, publication, retrieval and stated event dates remain distinct and optional', () => {
  for (const f of marked.slice(0, 6)) {
    const source = f.properties.audit_review.map_location.current_location.source;
    assert.equal(source.as_of, '2026-06-30');
    assert.equal(source.published_at, '2026-07-09');
    assert.equal(source.retrieved_at, '2026-10-08');
  }
  const last = marked.at(-1).properties.audit_review.map_location;
  assert.equal(last.current_location.source.as_of, undefined);
  assert.equal(last.current_location.source.published_at, undefined);
  assert.equal(last.current_location.source.retrieved_at, '2026-10-08');
  assert(last.note.includes('2026-09-01'));
  const minimal = structuredClone(audit.reviews[0].review);
  minimal.map_location = { status: 'unverified', note: '原地図位置は未確認。' };
  validateAuditReview(minimal, '2026-10-08');
});

test('malformed optional location evidence is rejected before rendering or routing', () => {
  const reject = change => {
    const review = structuredClone(audit.reviews[0].review);
    change(review);
    assert.throws(() => validateAuditReview(review, '2026-10-08'));
  };
  for (const value of [null, false, 'unverified', {}, { status: 'relocated', note: 'distance only' }]) reject(r => { r.map_location = value; });
  reject(r => { r.map_location.note = ' '; });
  reject(r => { r.map_location.current_location = null; });
  for (const coordinates of [[181, 0], [0, 91], [NaN, 0], [0, Infinity], [1], [1, 2, 3], ['131', 34]]) {
    reject(r => { r.map_location.current_location.coordinates = coordinates; });
  }
  for (const meters of [-1, NaN, Infinity, '93.1']) reject(r => { r.map_location.current_location.distance_from_original_m = meters; });
  reject(r => { r.map_location.current_location.source.title = ''; });
  for (const url of ['javascript:alert(1)', 'http://127.0.0.1/point', 'https://example.org/?token=secret']) {
    reject(r => { r.map_location.current_location.source.url = url; });
  }
  for (const field of ['as_of', 'published_at', 'retrieved_at']) {
    for (const value of ['2026-02-30', '2026-6-30', '2026-10-09', 'yesterday', null, 20261008]) {
      reject(r => { r.map_location.current_location.source[field] = value; });
    }
    const futureEvidence = structuredClone(audit.reviews[0].review);
    futureEvidence.map_location.current_location.source[field] = '2026-10-09';
    assert.throws(() => validateAuditReview(futureEvidence, '2026-11-01'), 'Evidence dates are bounded by the individual review date');
  }
});
