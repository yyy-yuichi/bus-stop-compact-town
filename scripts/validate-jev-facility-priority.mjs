import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data-sources/jev-facility-priority-20260920');
const request = JSON.parse(fs.readFileSync(path.join(dir, 'request.json'), 'utf8'));
const response = JSON.parse(fs.readFileSync(path.join(dir, 'response.json'), 'utf8'));
const outputPath = path.join(dir, 'summary.json');

const expectedKeys = Object.keys(request.questions).sort();
const actualKeys = Object.keys(response.answers).sort();
if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) {
  throw new Error('Jev response IDs do not exactly match the request');
}

const allowed = new Set(['gpt_now', 'defer_low_current_impact', 'defer_hard_evidence', 'ready_without_gpt']);
const counts = Object.fromEntries([...allowed].map(value => [value, 0]));
const decisions = request.state.records.map(record => {
  const key = `research_action__${record.id.replaceAll('-', '_')}`;
  const answer = response.answers[key];
  if (!allowed.has(answer.choice)) throw new Error(`Invalid choice for ${record.id}: ${answer.choice}`);
  if (!Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) {
    throw new Error(`Invalid confidence for ${record.id}`);
  }
  counts[answer.choice] += 1;
  return {
    id: record.id,
    name: record.name,
    walking_origin_count: record.walking_origin_count,
    gpt_followup_completed: record.gpt_followup_completed,
    choice: answer.choice,
    confidence: answer.confidence,
    probabilities: answer.probabilities,
  };
});

const unexpected = decisions.filter(decision =>
  (decision.gpt_followup_completed && decision.choice !== 'defer_hard_evidence')
  || (!decision.gpt_followup_completed && decision.walking_origin_count === 0 && decision.choice !== 'defer_low_current_impact'),
);
const summary = {
  checked_at: '2026-09-20',
  purpose: 'Jevを公式事実の確定に使わず、GPT-6 Pro通常Chatへ渡す対象の事前選別に使えるかを確認する。',
  model: response.model,
  request_id: response.request_id,
  usage: response.usage,
  evaluation_time_ms: response.evaluation_time_ms,
  record_count: decisions.length,
  decision_counts: counts,
  gpt_now_count: counts.gpt_now,
  validation: {
    exact_ids: true,
    unexpected_decision_count: unexpected.length,
    passed: unexpected.length === 0,
  },
  interpretation: {
    jev_output: '追加GPT調査済み6件はdefer_hard_evidence、徒歩圏影響0の未調査5件はdefer_low_current_impact。',
    agent_adoption: '現在の11件はGPTへ追加投入しない。次は別の高影響候補を機械抽出し、機械条件だけで決まらない候補にJevを使う。',
    limitation: '今回の入力は既調査と徒歩圏影響0が明示されており、Jevの分類は機械規則でも再現できる。公式URL確認や施設更新判断の証拠にはしない。'
  },
  decisions,
};

fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({
  passed: summary.validation.passed,
  record_count: summary.record_count,
  decision_counts: summary.decision_counts,
  input_tokens: summary.usage.input_tokens,
  output_tokens: summary.usage.output_tokens,
  evaluation_time_ms: summary.evaluation_time_ms,
}, null, 2));
