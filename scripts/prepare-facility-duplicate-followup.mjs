import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bakedFacilityCandidates,
  distance,
  parseCatchment,
  prepareFacilities,
} from '../src/bakedWalking.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const batchDir = path.join(root, 'data-sources/facility-duplicate-priority-20260920');
const facilitiesPath = path.join(root, 'public/data/shopping.geojson');
const stopsPath = path.join(root, 'public/data/baked-bus-stops.geojson');
const walkBase = (process.env.VITE_WALK_DATA_URL || 'https://pub-64cdb45739c446ef86342de34ccd47a6.r2.dev/data/walk').replace(/\/$/, '');
const maximumWalkingMeters = 1000;
const facilityRoadGapMeters = 25;

function loadJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function geometryPoints(geometry) {
  return geometry.type === 'Point' ? [geometry.coordinates] : geometry.coordinates.flat(2);
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

async function mapLimit(values, limit, callback) {
  const result = new Array(values.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= values.length) return;
      result[index] = await callback(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return result;
}

const audit = loadJson(path.join(batchDir, 'candidate-audit.json'));
const jev = loadJson(path.join(batchDir, 'jev-response.json'));
const facilities = loadJson(facilitiesPath).features;
const stops = loadJson(stopsPath).features;
const byId = new Map(facilities.map(facility => [facility.id, facility]));

function jevAnswer(candidate) {
  const key = `duplicate_action__${candidate.pair_id.replaceAll('-', '_')}`;
  return jev.answers[key] ?? null;
}

const selectedPairs = audit.candidates.filter(candidate => {
  if (candidate.mechanical_action === 'direct_gpt') return true;
  const answer = jevAnswer(candidate);
  return answer?.choice === 'gpt_now' && (answer.probabilities?.gpt_now ?? 0) >= 0.7;
});
const selectedIds = new Set(selectedPairs.flatMap(candidate => [candidate.left.id, candidate.right.id]));
const selectedFacilities = [...selectedIds].map(id => {
  const facility = byId.get(id);
  if (!facility) throw new Error(`Missing facility: ${id}`);
  return facility;
});
const prepared = prepareFacilities(selectedFacilities);
const facilityBounds = new Map(selectedFacilities.map(facility => [facility.id, boundsOf(geometryPoints(facility.geometry))]));
const relevantStops = stops.filter(stop => selectedFacilities.some(facility =>
  boundsGap(stop.geometry.coordinates, facilityBounds.get(facility.id)) <= maximumWalkingMeters + facilityRoadGapMeters,
));
const appearances = new Map(selectedFacilities.map(facility => [facility.id, []]));
let unavailableCatchments = 0;

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
    if (!selectedIds.has(candidate.facility.id) || candidate.meters > maximumWalkingMeters) continue;
    appearances.get(candidate.facility.id).push({
      stop_id: stop.id,
      stop_name: stop.properties.name,
      road_distance_m: Math.round(candidate.meters * 10) / 10,
    });
  }
});

const groups = selectedPairs.map(candidate => {
  const left = byId.get(candidate.left.id);
  const right = byId.get(candidate.right.id);
  const leftOrigins = appearances.get(left.id).sort((a, b) => a.road_distance_m - b.road_distance_m || a.stop_id.localeCompare(b.stop_id));
  const rightOrigins = appearances.get(right.id).sort((a, b) => a.road_distance_m - b.road_distance_m || a.stop_id.localeCompare(b.stop_id));
  const union = new Set([...leftOrigins, ...rightOrigins].map(origin => origin.stop_id));
  const shared = new Set(leftOrigins.map(origin => origin.stop_id).filter(id => rightOrigins.some(origin => origin.stop_id === id)));
  return {
    pair_id: candidate.pair_id,
    selection: candidate.mechanical_action === 'direct_gpt'
      ? { source: 'machine', reason: candidate.mechanical_reason }
      : { source: 'jev', answer: jevAnswer(candidate) },
    distance_m: candidate.distance_m,
    category: candidate.category,
    walking_impact: {
      union_origin_count: union.size,
      shared_origin_count: shared.size,
      left_origin_count: leftOrigins.length,
      right_origin_count: rightOrigins.length,
    },
    records: [left, right].map(facility => ({
      id: facility.id,
      name: facility.properties.name,
      category: facility.properties.category,
      geometry: facility.geometry,
      source_ids: facility.properties.source_ids,
      osm_tags: facility.properties.osm_tags,
      classification_review: facility.properties.classification_review ?? null,
    })),
  };
}).sort((left, right) => right.walking_impact.union_origin_count - left.walking_impact.union_origin_count
  || left.pair_id.localeCompare(right.pair_id));

const impactedGroups = groups.filter(group => group.walking_impact.union_origin_count > 0);
const jevAdoption = {
  checked_at: '2026-09-20',
  purpose: 'Jevの生回答と、GPT通常Chatへ渡す対象についての採用判断を分離して記録する。Jevは公式資料を検証していない。',
  policy: {
    machine_direct: '公式店舗検索で確認しやすい名称、20m以内、高影響の3条件を満たす組はJevを使わず選ぶ。',
    jev_adoption: '機械条件だけで順序を決めにくい8組のうち、Jevがgpt_nowを選び、その確率が0.70以上の組だけを採用する。',
    walking_gate: '採用後、既存徒歩15分圏への実表示が0件の組はGPTへ送らない。',
  },
  records: audit.candidates.map(candidate => {
    const answer = jevAnswer(candidate);
    const passedJev = answer?.choice === 'gpt_now' && (answer.probabilities?.gpt_now ?? 0) >= 0.7;
    const selected = selectedPairs.some(pair => pair.pair_id === candidate.pair_id);
    const walking = groups.find(group => group.pair_id === candidate.pair_id)?.walking_impact ?? null;
    return {
      pair_id: candidate.pair_id,
      mechanical_action: candidate.mechanical_action,
      jev_answer: answer,
      selected_before_walking_gate: selected,
      walking_impact: walking,
      sent_to_gpt: selected && (walking?.union_origin_count ?? 0) > 0,
      adoption_reason: candidate.mechanical_action === 'direct_gpt'
        ? '機械条件で直接選定。'
        : candidate.mechanical_action === 'defer_low_impact'
          ? '影響度近似が低いためJevへ送らず見送り。'
          : passedJev
            ? 'Jevのgpt_now確率が0.70以上のため採用。'
            : 'Jevの生回答は保存したが、gpt_now確率が0.70未満のため不採用。',
    };
  }),
};
const auditOutput = {
  checked_at: '2026-09-20',
  purpose: '機械選別とJev選別を通過した近接施設組が、既存徒歩15分圏へ実際に表示されるか確認する。重複の確定ではない。',
  method: {
    selected_pairs: selectedPairs.length,
    selected_unique_records: selectedFacilities.length,
    relevant_stop_origins: relevantStops.length,
    unavailable_catchments: unavailableCatchments,
    walking_rule: '既存bakedFacilityCandidatesと同じ道路接続25m・道路距離1,000m。',
  },
  summary: {
    impacted_pairs: impactedGroups.length,
    no_current_walking_impact_pairs: groups.length - impactedGroups.length,
  },
  groups,
};

const request = {
  schema_version: 1,
  task: 'official-source review of high-impact nearby facility records',
  instructions: [
    '通常のGPT Chatで調査する。Workへ移行しない。',
    '対象はgroupsにある施設組だけとし、新規施設探索や機能提案へ広げない。',
    '運営会社、チェーン公式店舗検索、自治体、公的機関の一次資料を優先する。Exa等は公式ページ候補の発見に使ってよい。Google Maps表示だけでは確定しない。',
    'OSMは元レコードの確認に使えるが、現在の営業・名称・同一性を確定する公式根拠にはしない。',
    '距離と名称だけで同一施設と判断しない。公式店舗名、住所、公式位置表示、施設数を確認する。',
    '各pair_idをちょうど1回返し、decisionはsame_current_facility/distinct_current_facilities/holdのいずれかにする。',
    'same_current_facilityは、公式資料が現在の1施設を直接示し、2レコードがその同じ施設を表す根拠を説明できる場合だけ使う。通常表示として残すrecord_idとreferenceへ移すrecord_idを提案するが、ID・座標・形状は変更しない。選択根拠がなければholdとする。',
    'distinct_current_facilitiesは、公式資料が現在の別施設・別店舗を直接示す場合だけ使う。',
    'holdでは不足する公式資料をunresolvedへ具体的に残す。',
    '公式根拠URL、確認事実、未解決事項、理由を分け、推測を確認事実として書かない。',
    '結果はJSONで返す。トップレベルにchecked_at、decisionsを置き、各decisionにpair_id、decision、official_evidence_urls、confirmed_facts、unresolved、reasonを含める。same_current_facilityの場合だけkeep_normal_record_idとreference_record_idを含める。',
  ],
  groups: impactedGroups,
};

fs.writeFileSync(path.join(batchDir, 'walking-impact-audit.json'), `${JSON.stringify(auditOutput, null, 2)}\n`);
fs.writeFileSync(path.join(batchDir, 'gpt-chat-request.json'), `${JSON.stringify(request, null, 2)}\n`);
fs.writeFileSync(path.join(batchDir, 'jev-adoption.json'), `${JSON.stringify(jevAdoption, null, 2)}\n`);
console.log(JSON.stringify({
  selected_pairs: selectedPairs.length,
  selected_unique_records: selectedFacilities.length,
  relevant_stop_origins: relevantStops.length,
  unavailable_catchments: unavailableCatchments,
  impacted_pairs: impactedGroups.map(group => ({
    pair_id: group.pair_id,
    union_origin_count: group.walking_impact.union_origin_count,
    shared_origin_count: group.walking_impact.shared_origin_count,
  })),
  no_current_walking_impact_pairs: groups.filter(group => group.walking_impact.union_origin_count === 0).map(group => group.pair_id),
}, null, 2));
