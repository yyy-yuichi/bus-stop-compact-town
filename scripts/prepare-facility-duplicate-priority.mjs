import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const duplicatePath = path.join(root, 'data-sources/facility-audit-20260912/duplicate-candidates.csv');
const facilitiesPath = path.join(root, 'public/data/shopping.geojson');
const stopsPath = path.join(root, 'public/data/baked-bus-stops.geojson');
const outputDir = path.join(root, 'data-sources/facility-duplicate-priority-20260920');

const essentialCategories = new Set(['mall', 'supermarket', 'drugstore', 'convenience', 'pharmacy', 'bank']);
const locatorNamePattern = /セブン|ローソン|ファミリーマート|コープ|フジ|まるき|コスモス|クスリ岩崎|アルク|サンマート|サンリブ|山口銀行|西中国信用金庫|みずほ銀行|三菱UFJ銀行|トライアル|キヌヤ|ザ・ビッグ|Aプライス/i;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value);
      if (row.some(cell => cell.length > 0)) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }
  const [rawHeader, ...body] = rows;
  const header = rawHeader.map(key => key.replace(/^\uFEFF/, ''));
  return body.map(cells => Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ''])));
}

function geometryPoints(geometry) {
  return geometry.type === 'Point' ? [geometry.coordinates] : geometry.coordinates.flat(2);
}

function representativePoint(geometry) {
  const points = geometryPoints(geometry);
  const longitudes = points.map(point => point[0]);
  const latitudes = points.map(point => point[1]);
  return [
    (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
    (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
  ];
}

function distance(left, right) {
  const radians = value => value * Math.PI / 180;
  const deltaLatitude = radians(right[1] - left[1]);
  const deltaLongitude = radians(right[0] - left[0]);
  const value = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(left[1])) * Math.cos(radians(right[1])) * Math.sin(deltaLongitude / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(value));
}

const duplicates = parseCsv(fs.readFileSync(duplicatePath, 'utf8'));
const facilities = JSON.parse(fs.readFileSync(facilitiesPath, 'utf8')).features;
const stops = JSON.parse(fs.readFileSync(stopsPath, 'utf8')).features;
const byId = new Map(facilities.map(facility => [facility.id, facility]));
const impactCache = new Map();

function nearbyStopCount(facility) {
  if (impactCache.has(facility.id)) return impactCache.get(facility.id);
  const point = representativePoint(facility.geometry);
  const value = stops.filter(stop => distance(point, stop.geometry.coordinates) <= 1025).length;
  impactCache.set(facility.id, value);
  return value;
}

const candidates = duplicates
  .filter(row => row.priority === 'high' && row.status === 'pending')
  .filter(row => essentialCategories.has(row.category_a) && essentialCategories.has(row.category_b))
  .map(row => {
    const left = byId.get(row.id_a);
    const right = byId.get(row.id_b);
    if (!left || !right) throw new Error(`Missing duplicate record: ${row.id_a} / ${row.id_b}`);
    return { row, left, right };
  })
  .filter(({ left, right }) => !left.properties.classification_review && !right.properties.classification_review)
  .map(({ row, left, right }) => {
    const leftStops = nearbyStopCount(left);
    const rightStops = nearbyStopCount(right);
    const names = `${left.properties.name}\n${right.properties.name}`;
    return {
      pair_id: `${left.id}__${right.id}`,
      category: left.properties.category,
      distance_m: Number(row.distance_m),
      left: {
        id: left.id,
        name: left.properties.name,
        geometry_type: left.geometry.type,
        coordinate: representativePoint(left.geometry),
        nearby_stop_proxy: leftStops,
      },
      right: {
        id: right.id,
        name: right.properties.name,
        geometry_type: right.geometry.type,
        coordinate: representativePoint(right.geometry),
        nearby_stop_proxy: rightStops,
      },
      combined_nearby_stop_proxy: Math.max(leftStops, rightStops),
      official_locator_name_hint: locatorNamePattern.test(names),
      audit_reason: row.reason,
    };
  })
  .sort((left, right) => right.combined_nearby_stop_proxy - left.combined_nearby_stop_proxy
    || left.distance_m - right.distance_m
    || left.pair_id.localeCompare(right.pair_id));

for (const candidate of candidates) {
  if (candidate.official_locator_name_hint && candidate.distance_m <= 20 && candidate.combined_nearby_stop_proxy >= 15) {
    candidate.mechanical_action = 'direct_gpt';
    candidate.mechanical_reason = '公式店舗検索で確認しやすい名称、20m以内、高影響の3条件を満たす。';
  } else if (candidate.combined_nearby_stop_proxy <= 5) {
    candidate.mechanical_action = 'defer_low_impact';
    candidate.mechanical_reason = '近隣バス停数の近似が5以下のため今回の小バッチでは後順位。';
  } else {
    candidate.mechanical_action = 'jev_gray_zone';
    candidate.mechanical_reason = '距離、影響度、公式店舗検索の見込みが混在し、機械条件だけでは今回対象に含めるか決めにくい。';
  }
}

const directGpt = candidates.filter(candidate => candidate.mechanical_action === 'direct_gpt');
const mechanicalDeferred = candidates.filter(candidate => candidate.mechanical_action === 'defer_low_impact');
const grayZone = candidates
  .filter(candidate => candidate.mechanical_action === 'jev_gray_zone')
  .slice(0, 8);
const grayZoneDeferred = candidates
  .filter(candidate => candidate.mechanical_action === 'jev_gray_zone')
  .slice(8);

const audit = {
  checked_at: '2026-09-20',
  purpose: '徒歩圏で重複表示につながる可能性がある近接施設のうち、公式店舗案内による確認を優先する組を抽出する。重複や統合を確定する処理ではない。',
  method: {
    source_duplicate_rows: duplicates.length,
    rules: [
      '既存監査でpriority=highかつstatus=pending',
      '両方が買い物・生活に直結する6分類',
      '両方ともclassification_review未設定で、過去の53件判断と重複しない',
      '1,025m以内の既存バス停数は影響度の近似であり、徒歩圏への実表示件数ではない',
    ],
  },
  candidate_count: candidates.length,
  mechanical_summary: {
    direct_gpt: directGpt.length,
    jev_gray_zone: grayZone.length,
    deferred_without_jev: mechanicalDeferred.length + grayZoneDeferred.length,
  },
  candidates,
};

const criteria = {
  gpt_now: '利用影響の近似が高く、2点が近く、名称から公式店舗・店舗検索資料で同一店舗か確認できる可能性が高い。',
  defer_hard_evidence: '地域店舗・薬局等で公式店舗一覧や位置根拠が見つかりにくく、Web調査をしても同一性を確定しにくい。',
  defer_low_impact: '他候補より現在の利用影響が低く、今回の小バッチでは後順位にできる。',
  ready_without_gpt: '入力済み情報だけで反映可能。距離や名称だけでの確定は禁止するため、通常は選ばない。',
};
const questions = Object.fromEntries(grayZone.map(candidate => [
  `duplicate_action__${candidate.pair_id.replaceAll('-', '_')}`,
  {
    type: 'choice',
    instructions: `${candidate.left.name} / ${candidate.right.name}を次のGPT-6 Pro通常Chat調査へ回すか分類する。正誤・統合・閉店を推測しない。`,
    criteria,
  },
]));
const jevRequest = {
  model: 'jev-latest',
  state: {
    purpose: '重複表示の可能性がある施設組から、公式店舗案内の追加調査で前進しやすい高影響組だけをGPT-6 Pro通常Chatへ渡す。',
    evidence_boundary: 'JevはURLを確認せず、距離、名称、形状種別、近隣バス停数の近似だけで調査優先度を分類する。統合・削除・更新の根拠にはしない。',
    already_selected_by_machine: directGpt,
    candidates: grayZone,
  },
  questions,
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'candidate-audit.json'), `${JSON.stringify(audit, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, 'jev-request.json'), `${JSON.stringify(jevRequest, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, 'jev-state.json'), `${JSON.stringify(jevRequest.state, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, 'jev-questions.json'), `${JSON.stringify(jevRequest.questions, null, 2)}\n`);
console.log(JSON.stringify({
  candidates: candidates.length,
  locator_hint: candidates.filter(candidate => candidate.official_locator_name_hint).length,
  direct_gpt: directGpt.length,
  jev_gray_zone: grayZone.length,
  deferred_without_jev: mechanicalDeferred.length + grayZoneDeferred.length,
  top: candidates.slice(0, 10).map(candidate => ({
    pair_id: candidate.pair_id,
    names: [candidate.left.name, candidate.right.name],
    distance_m: candidate.distance_m,
    nearby_stop_proxy: candidate.combined_nearby_stop_proxy,
    official_locator_name_hint: candidate.official_locator_name_hint,
  })),
}, null, 2));
