import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WALKING_METERS_PER_MINUTE,
  bakedFacilityCandidates,
  distance,
  parseCatchment,
  prepareFacilities,
} from '../src/bakedWalking.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'data-sources/facility-backlog-review-20260920/facility-decision-manifest.json');
const facilitiesPath = path.join(root, 'public/data/shopping.geojson');
const stopsPath = path.join(root, 'public/data/baked-bus-stops.geojson');
const outputDir = path.join(root, 'data-sources/facility-freshness-priority-20260920');
const walkBase = (process.env.VITE_WALK_DATA_URL || 'https://pub-64cdb45739c446ef86342de34ccd47a6.r2.dev/data/walk').replace(/\/$/, '');
const maxBudget = 1000;
const facilityRoadGap = 25;

function loadJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function geometryPoints(geometry) {
  if (geometry.type === 'Point') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(2);
  throw new Error(`Unsupported geometry: ${geometry.type}`);
}

function boundsOf(points) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [longitude, latitude] of points) {
    bounds[0] = Math.min(bounds[0], longitude);
    bounds[1] = Math.min(bounds[1], latitude);
    bounds[2] = Math.max(bounds[2], longitude);
    bounds[3] = Math.max(bounds[3], latitude);
  }
  return bounds;
}

function boundsGap(point, bounds) {
  return distance(point, [
    Math.max(bounds[0], Math.min(bounds[2], point[0])),
    Math.max(bounds[1], Math.min(bounds[3], point[1])),
  ]);
}

function sha256(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

async function mapLimit(values, limit, callback) {
  const result = new Array(values.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= values.length) return;
      result[index] = await callback(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return result;
}

const manifest = loadJson(manifestPath);
const allFacilities = loadJson(facilitiesPath).features;
const stops = loadJson(stopsPath).features;
const byId = new Map(allFacilities.map(facility => [facility.id, facility]));
const held = manifest.decisions.filter(decision => decision.decision === 'hold');
const displayCandidates = held.filter(decision => decision.current_record.category !== 'reference');
const candidateIds = new Set(displayCandidates.map(decision => decision.id));
const candidateFacilities = displayCandidates.map(decision => {
  const facility = byId.get(decision.id);
  if (!facility) throw new Error(`Missing facility: ${decision.id}`);
  if (JSON.stringify(facility.geometry) !== JSON.stringify(decision.current_record.geometry)) {
    throw new Error(`Geometry changed since review: ${decision.id}`);
  }
  return facility;
});
const prepared = prepareFacilities(candidateFacilities);
const facilityBounds = new Map(candidateFacilities.map(facility => [facility.id, boundsOf(geometryPoints(facility.geometry))]));
const relevantStops = stops.filter(stop => candidateFacilities.some(facility =>
  boundsGap(stop.geometry.coordinates, facilityBounds.get(facility.id)) <= maxBudget + facilityRoadGap,
));

let unavailableCatchments = 0;
const appearances = new Map(candidateFacilities.map(facility => [facility.id, []]));
await mapLimit(relevantStops, 8, async stop => {
  const response = await fetch(`${walkBase}/${encodeURIComponent(stop.id)}.json`);
  if (response.status === 404) {
    unavailableCatchments += 1;
    return;
  }
  if (!response.ok) throw new Error(`Walking data ${response.status}: ${stop.id}`);
  const catchment = parseCatchment(await response.json());
  if (catchment.stopId !== stop.id) throw new Error(`Walking ID mismatch: ${stop.id}`);
  for (const candidate of bakedFacilityCandidates(catchment, prepared)) {
    if (!candidateIds.has(candidate.facility.id) || candidate.meters > maxBudget) continue;
    appearances.get(candidate.facility.id).push({
      stop_id: stop.id,
      stop_name: stop.properties.name,
      road_minutes: Math.round(candidate.meters / WALKING_METERS_PER_MINUTE * 10) / 10,
      road_distance_m: Math.round(candidate.meters * 10) / 10,
      straight_gap_m: Math.round(candidate.gap * 10) / 10,
    });
  }
});

const records = displayCandidates.map(decision => {
  const found = appearances.get(decision.id).sort((a, b) => a.road_distance_m - b.road_distance_m || a.stop_id.localeCompare(b.stop_id));
  return {
    id: decision.id,
    current_record: decision.current_record,
    walking_impact: {
      origin_count: found.length,
      nearest_road_minutes: found.length ? found[0].road_minutes : null,
      origins: found,
    },
    prior_official_evidence_urls: decision.official_evidence_urls,
    confirmed_facts: decision.confirmed_facts,
    unresolved: decision.unresolved,
    prior_reason: decision.reason,
  };
}).sort((a, b) => b.walking_impact.origin_count - a.walking_impact.origin_count || a.id.localeCompare(b.id));

const impacted = records.filter(record => record.walking_impact.origin_count > 0);
const deferred = records.filter(record => record.walking_impact.origin_count === 0);
const audit = {
  checked_at: '2026-09-20',
  purpose: '既存徒歩15分圏に表示される追加根拠待ち施設を、鮮度確認の優先対象として抽出する。施設の営業・移転・同一性を判定する処理ではない。',
  inputs: {
    decision_manifest: path.relative(root, manifestPath).replaceAll('\\', '/'),
    decision_manifest_sha256: sha256(manifestPath),
    facilities: path.relative(root, facilitiesPath).replaceAll('\\', '/'),
    facilities_sha256: sha256(facilitiesPath),
    stops: path.relative(root, stopsPath).replaceAll('\\', '/'),
    stops_sha256: sha256(stopsPath),
    walking_data_base: walkBase,
  },
  method: {
    pending_hold_records: held.length,
    display_candidate_records: displayCandidates.length,
    reference_records_deferred: held.length - displayCandidates.length,
    candidate_stop_rule: '施設の点又は範囲のbboxから1,025m以内の計算起点だけを取得し、既存bakedFacilityCandidatesと同じ道路接続25m・予算1,000mで再計算。',
    relevant_stop_origins: relevantStops.length,
    unavailable_catchments: unavailableCatchments,
  },
  summary: {
    impacted_records: impacted.length,
    no_current_walking_impact_records: deferred.length,
  },
  records,
};

const request = {
  schema_version: 1,
  task: 'walking-impact facility freshness follow-up',
  instructions: [
    '対象はrecordsにある既存施設だけとし、機能追加や新規施設探索へ広げない。',
    '過去のconfirmed_factsと公式URLを再利用し、既に確定した事項を一から調べ直さない。',
    'Exa等は公式ページ候補の発見に使ってよいが、採否の根拠は運営会社・自治体・公的機関の一次情報に限る。Google Maps表示だけでは確定しない。',
    '元IDと元座標・形状は変更しない。施設名、分類、営業状態、元レコードとの同一性を公式資料で直接確認できる場合だけupdate又はno_changeとする。',
    '直接確認できない場合はholdとし、追加で必要な公式資料をunresolvedへ具体的に残す。',
    '各IDをちょうど1回返し、decisionはupdate/no_change/holdのいずれかにする。',
    'updateの場合だけproposed_recordを返し、name、category、geometry、classification_reviewを含める。geometryはcurrent_recordと完全一致させる。',
    '公式根拠URL、確認事実、未解決事項、理由を分け、推測を確認事実として書かない。',
  ],
  priority_basis: '既存の徒歩15分圏に実際に表示される回数が多い順。件数は施設の正しさを示さず、調査順だけに使う。',
  records: impacted,
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'walking-impact-audit.json'), `${JSON.stringify(audit, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, 'gpt-chat-request.json'), `${JSON.stringify(request, null, 2)}\n`);
console.log(JSON.stringify({
  held: held.length,
  display_candidates: displayCandidates.length,
  relevant_stop_origins: relevantStops.length,
  unavailable_catchments: unavailableCatchments,
  impacted: impacted.map(record => ({ id: record.id, name: record.current_record.name, origin_count: record.walking_impact.origin_count })),
  deferred: deferred.map(record => ({ id: record.id, name: record.current_record.name })),
}, null, 2));
