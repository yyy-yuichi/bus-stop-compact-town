import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const batchDir = path.join(root, 'data-sources/facility-duplicate-priority-20260920');
const rawPath = path.join(batchDir, 'gpt-response.raw.md');
const outputPath = path.join(batchDir, 'gpt-response.json');
const normalizationPath = path.join(batchDir, 'gpt-response-normalization.json');

const raw = fs.readFileSync(rawPath, 'utf8');

function extractLeadingJson(value) {
  const start = value.indexOf('{');
  if (start < 0) throw new Error('GPT raw response does not contain a JSON object');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return { json: value.slice(start, index + 1), start, end: index + 1 };
    }
  }
  throw new Error('GPT raw response JSON object is not closed');
}

const extracted = extractLeadingJson(raw);
const response = JSON.parse(extracted.json);
const changes = [];

function normalizeUrl(value, pairId) {
  const markdown = value.match(/^\[(https?:\/\/[^\]]+)]\((https?:\/\/[^)]+)\)$/);
  let normalized = markdown ? markdown[2] : value;
  if (markdown) {
    changes.push({ pair_id: pairId, type: 'markdown_link_to_url', from: value, to: normalized });
  }
  const parsed = new URL(normalized);
  if (parsed.protocol === 'http:' && parsed.hostname === 'marukijapan.co.jp') {
    parsed.protocol = 'https:';
    const upgraded = parsed.toString();
    changes.push({
      pair_id: pairId,
      type: 'scheme_upgrade_for_validation',
      from: normalized,
      to: upgraded,
      note: '生回答はhttp。別経路で同一ホストのhttps URLを確認対象としたが、取得側では内部エラー。確定事実は宇部市公式ページでも確認する。',
    });
    normalized = upgraded;
  }
  return normalized;
}

for (const decision of response.decisions ?? []) {
  decision.official_evidence_urls = (decision.official_evidence_urls ?? []).map(value => normalizeUrl(value, decision.pair_id));
}

const normalization = {
  checked_at: '2026-09-20',
  purpose: 'GPT通常Chatの生回答を変更せず保存した上で、先頭JSONと末尾の出典定義を分離し、Markdownリンクを機械検査可能なURL文字列へ変換する。判断本文は変更しない。',
  source: path.relative(root, rawPath).replaceAll('\\', '/'),
  output: path.relative(root, outputPath).replaceAll('\\', '/'),
  extraction: {
    json_start: extracted.start,
    json_end: extracted.end,
    trailing_source_definition_bytes: Buffer.byteLength(raw.slice(extracted.end)),
  },
  changes,
};

fs.writeFileSync(outputPath, `${JSON.stringify(response, null, 2)}\n`);
fs.writeFileSync(normalizationPath, `${JSON.stringify(normalization, null, 2)}\n`);
console.log(JSON.stringify({ decisions: response.decisions?.length ?? 0, normalization_changes: changes.length }, null, 2));
