import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const batchDir = path.join(root, 'data-sources/facility-freshness-priority-20260920');
const outputDir = path.join(root, 'data-sources/jev-facility-priority-20260920');
const audit = JSON.parse(fs.readFileSync(path.join(batchDir, 'walking-impact-audit.json'), 'utf8'));
const followup = JSON.parse(fs.readFileSync(path.join(batchDir, 'facility-freshness-followup-manifest.json'), 'utf8'));
const followupById = new Map(followup.decisions.map(decision => [decision.id, decision]));

function unresolvedTags(values) {
  const text = values.join('\n');
  const rules = [
    ['official_layout_or_boundary', /配置図|平面図|区画|範囲|形状|建物全体|施設範囲/],
    ['official_coordinates_or_point_match', /座標|位置|原点|一致/],
    ['closure_or_current_status', /閉店|廃止|営業状態|現存|撤去/],
    ['rename_or_succession', /改称|承継|後継|跡地|移転/],
    ['historical_identity', /旧|誤記|元名称|同一性|直接対応/],
    ['operator_or_facility_scope', /運営|管理主体|テナント|ATM|ドラッグ|調剤|店舗区画/],
  ];
  return rules.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);
}

const records = audit.records.map(record => {
  const followupDecision = followupById.get(record.id);
  const unresolved = followupDecision?.unresolved ?? record.unresolved;
  return {
    id: record.id,
    name: record.current_record.name,
    category: record.current_record.category,
    walking_origin_count: record.walking_impact.origin_count,
    nearest_road_minutes: record.walking_impact.nearest_road_minutes,
    official_evidence_url_count: (followupDecision?.official_evidence_urls ?? record.prior_official_evidence_urls ?? []).length,
    unresolved_tags: unresolvedTags(unresolved),
    unresolved_count: unresolved.length,
    gpt_followup_completed: Boolean(followupDecision),
    gpt_followup_decision: followupDecision?.decision ?? null,
  };
});

const criteria = {
  gpt_now: '現在の徒歩圏に表示され、通常Chatでの追加公式調査がまだなく、運営者・自治体・公的機関の公開資料を探すことで確定へ進む可能性がある。',
  defer_low_current_impact: '現在の既存徒歩15分圏に表示されないため、鮮度調査の優先度を下げる。正しいという意味ではない。',
  defer_hard_evidence: '既に追加公式調査済み、または必要根拠が配置図・公式座標・承継資料・現地確認等で、同じWeb調査を繰り返しても進みにくい。',
  ready_without_gpt: '入力済みの公式根拠だけで機械反映でき、追加のGPT調査を必要としない。',
};

const questions = {};
for (const record of records) {
  const key = record.id.replaceAll('-', '_');
  questions[`research_action__${key}`] = {
    type: 'choice',
    instructions: `${record.id}をGPT-6 Pro通常Chatへ回すべきか、影響度・既調査・未解決タグだけで分類する。正誤や閉店は推測しない。`,
    criteria,
  };
}

const request = {
  model: 'jev-latest',
  state: {
    purpose: '施設鮮度調査で、GPT-6 Pro通常Chatへ渡す件数を減らし、同じ追加調査の繰り返しを避ける。',
    evidence_boundary: 'JevはURLへアクセスせず、入力済みの機械集計と未解決タグだけを分類する。公式事実の確定やアプリ更新判断には使わない。',
    selection_rule: '徒歩圏の表示件数は利用影響の優先順位だけに使う。既調査、低影響、公開Web資料で解けない課題をGPT対象から外す。',
    records,
  },
  questions,
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'request.json'), `${JSON.stringify(request, null, 2)}\n`);
console.log(JSON.stringify({
  records: records.length,
  questions: Object.keys(questions).length,
  gpt_followup_completed: records.filter(record => record.gpt_followup_completed).length,
  no_current_walking_impact: records.filter(record => record.walking_origin_count === 0).length,
  output: path.relative(root, path.join(outputDir, 'request.json')).replaceAll('\\', '/'),
}, null, 2));
