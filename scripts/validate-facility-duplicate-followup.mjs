import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const batchDir = path.join(root, 'data-sources/facility-duplicate-priority-20260920');
const requestPath = path.join(batchDir, 'gpt-chat-request.json');
const auditPath = path.join(batchDir, 'walking-impact-audit.json');
const candidateAuditPath = path.join(batchDir, 'candidate-audit.json');
const jevResponsePath = path.join(batchDir, 'jev-response.json');
const jevAdoptionPath = path.join(batchDir, 'jev-adoption.json');
const responsePath = path.join(batchDir, 'gpt-response.json');
const normalizationPath = path.join(batchDir, 'gpt-response-normalization.json');
const modelVerificationPath = path.join(batchDir, 'gpt-model-verification.json');
const officialVerificationPath = path.join(batchDir, 'official-url-verification.json');
const decisionAdoptionPath = path.join(batchDir, 'decision-adoption.json');
const facilitiesPath = path.join(root, 'public/data/shopping.geojson');
const verificationPath = path.join(batchDir, 'verification.json');

function loadJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function sha256(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validHttpsUrls(values) {
  return Array.isArray(values) && values.length > 0 && values.every(value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  });
}

const request = loadJson(requestPath);
const audit = loadJson(auditPath);
const candidateAudit = loadJson(candidateAuditPath);
const jevResponse = loadJson(jevResponsePath);
const jevAdoption = loadJson(jevAdoptionPath);
const response = loadJson(responsePath);
const normalization = loadJson(normalizationPath);
const modelVerification = loadJson(modelVerificationPath);
const officialVerification = loadJson(officialVerificationPath);
const decisionAdoption = loadJson(decisionAdoptionPath);
const facilities = loadJson(facilitiesPath).features;
const byId = new Map(facilities.map(feature => [String(feature.id), feature]));
const expectedPairs = new Map(request.groups.map(group => [group.pair_id, group]));
const decisions = Array.isArray(response.decisions) ? response.decisions : [];
const decisionIds = decisions.map(decision => decision.pair_id);
const uniqueDecisionIds = [...new Set(decisionIds)];
const missingIds = [...expectedPairs.keys()].filter(id => !uniqueDecisionIds.includes(id));
const extraIds = uniqueDecisionIds.filter(id => !expectedPairs.has(id));
const duplicateIds = uniqueDecisionIds.filter(id => decisionIds.filter(value => value === id).length > 1);
const allowedDecisions = new Set(['same_current_facility', 'distinct_current_facilities', 'hold']);

const checks = [];
function check(name, passed, detail) {
  checks.push({ name, passed, detail });
}

check('request contains seven unique pairs', expectedPairs.size === 7 && request.groups.length === 7, [...expectedPairs.keys()]);
check('machine filter reduces 195 source rows to 20 priority pairs', candidateAudit.method?.source_duplicate_rows === 195
  && candidateAudit.candidate_count === 20, {
  source_duplicate_rows: candidateAudit.method?.source_duplicate_rows,
  candidate_count: candidateAudit.candidate_count,
});
check('machine filter splits 20 pairs into 6 direct, 8 Jev, and 6 deferred',
  candidateAudit.mechanical_summary?.direct_gpt === 6
  && candidateAudit.mechanical_summary?.jev_gray_zone === 8
  && candidateAudit.mechanical_summary?.deferred_without_jev === 6, candidateAudit.mechanical_summary);
check('Jev response contains eight gray-zone answers', Object.keys(jevResponse.answers ?? {}).length === 8, Object.keys(jevResponse.answers ?? {}));
const sentToGpt = jevAdoption.records.filter(record => record.sent_to_gpt);
check('adoption keeps five machine pairs and two Jev pairs after walking gate', sentToGpt.length === 7
  && sentToGpt.filter(record => record.mechanical_action === 'direct_gpt').length === 5
  && sentToGpt.filter(record => record.mechanical_action === 'jev_gray_zone').length === 2, sentToGpt.map(record => record.pair_id));
check('GPT returned each requested pair exactly once', decisions.length === expectedPairs.size
  && missingIds.length === 0 && extraIds.length === 0 && duplicateIds.length === 0, {
  missing_ids: missingIds,
  extra_ids: extraIds,
  duplicate_ids: duplicateIds,
});
check('walking audit has no unavailable catchments', audit.method?.unavailable_catchments === 0, audit.method?.unavailable_catchments);
check('one selected pair was excluded for zero current walking impact', audit.method?.selected_pairs === 8
  && audit.summary?.impacted_pairs === 7
  && audit.summary?.no_current_walking_impact_pairs === 1, {
  method: audit.method,
  summary: audit.summary,
});
check('GPT execution is verified as normal Chat GPT-6 Pro without Work',
  modelVerification.surface === 'ChatGPT通常Chat'
  && modelVerification.work_used === false
  && modelVerification.observed_model_menu_text === 'GPT-6 Pro を使用しました', modelVerification);
check('raw response normalization preserves trailing source definitions separately',
  normalization.extraction?.json_start === 0
  && normalization.extraction?.json_end > 0
  && normalization.extraction?.trailing_source_definition_bytes > 0
  && normalization.changes?.length === 9, normalization.extraction);
check('nine official URLs were independently checked',
  officialVerification.summary?.official_url_count === 9
  && officialVerification.summary?.direct_read === 7
  && officialVerification.summary?.official_domain_search_fallback === 2
  && officialVerification.summary?.unreadable === 0
  && officialVerification.summary?.decision_changed === 0, officialVerification.summary);
check('adoption keeps all seven pairs on hold with no application mutation',
  decisionAdoption.adopted?.hold === 7
  && decisionAdoption.adopted?.same_current_facility === 0
  && decisionAdoption.adopted?.distinct_current_facilities === 0
  && decisionAdoption.application_changes === 0
  && decisionAdoption.coordinates_changed === 0
  && decisionAdoption.geometries_changed === 0, decisionAdoption);

for (const group of request.groups) {
  check(`${group.pair_id}: contains exactly two records`, group.records.length === 2, group.records.map(record => record.id));
  check(`${group.pair_id}: has current walking impact`, group.walking_impact.union_origin_count > 0, group.walking_impact);
  for (const record of group.records) {
    const current = byId.get(record.id);
    check(`${record.id}: still exists in facility data`, Boolean(current), record.id);
    check(`${record.id}: coordinates are unchanged`, Boolean(current) && sameJson(current.geometry, record.geometry), {
      request: record.geometry,
      current: current?.geometry ?? null,
    });
    check(`${record.id}: category is unchanged`, current?.properties?.category === record.category, {
      request: record.category,
      current: current?.properties?.category ?? null,
    });
  }
}

for (const decision of decisions) {
  const group = expectedPairs.get(decision.pair_id);
  const pairRecordIds = new Set(group?.records.map(record => record.id) ?? []);
  check(`${decision.pair_id}: decision value is valid`, allowedDecisions.has(decision.decision), decision.decision);
  check(`${decision.pair_id}: official URLs are credential-free HTTPS URLs`, validHttpsUrls(decision.official_evidence_urls), decision.official_evidence_urls);
  check(`${decision.pair_id}: confirmed facts are recorded`, Array.isArray(decision.confirmed_facts) && decision.confirmed_facts.length > 0
    && decision.confirmed_facts.every(value => typeof value === 'string' && value.trim()), decision.confirmed_facts?.length ?? 0);
  check(`${decision.pair_id}: unresolved items use an array`, Array.isArray(decision.unresolved)
    && decision.unresolved.every(value => typeof value === 'string' && value.trim()), decision.unresolved);
  check(`${decision.pair_id}: reason is recorded`, typeof decision.reason === 'string' && decision.reason.trim().length > 0, decision.reason);

  if (decision.decision === 'same_current_facility') {
    check(`${decision.pair_id}: keep and reference IDs are the requested pair`,
      pairRecordIds.size === 2
      && pairRecordIds.has(decision.keep_normal_record_id)
      && pairRecordIds.has(decision.reference_record_id)
      && decision.keep_normal_record_id !== decision.reference_record_id, {
        keep_normal_record_id: decision.keep_normal_record_id,
        reference_record_id: decision.reference_record_id,
      });
  } else {
    check(`${decision.pair_id}: non-merge decision has no record mutation proposal`,
      decision.keep_normal_record_id == null && decision.reference_record_id == null, {
        keep_normal_record_id: decision.keep_normal_record_id ?? null,
        reference_record_id: decision.reference_record_id ?? null,
      });
  }
}

const decisionCounts = decisions.reduce((counts, decision) => {
  if (allowedDecisions.has(decision.decision)) counts[decision.decision] += 1;
  return counts;
}, { same_current_facility: 0, distinct_current_facilities: 0, hold: 0 });
const failed = checks.filter(item => !item.passed);
const verification = {
  checked_at: '2026-09-20',
  purpose: '近接重複候補について、GPT通常Chatの公式資料照合結果を対象ID・現行座標・形式と機械照合する。',
  files: {
    gpt_chat_request: { path: path.relative(root, requestPath).replaceAll('\\', '/'), sha256: sha256(requestPath) },
    walking_impact_audit: { path: path.relative(root, auditPath).replaceAll('\\', '/'), sha256: sha256(auditPath) },
    candidate_audit: { path: path.relative(root, candidateAuditPath).replaceAll('\\', '/'), sha256: sha256(candidateAuditPath) },
    jev_response: { path: path.relative(root, jevResponsePath).replaceAll('\\', '/'), sha256: sha256(jevResponsePath) },
    jev_adoption: { path: path.relative(root, jevAdoptionPath).replaceAll('\\', '/'), sha256: sha256(jevAdoptionPath) },
    gpt_response: { path: path.relative(root, responsePath).replaceAll('\\', '/'), sha256: sha256(responsePath) },
    gpt_response_normalization: { path: path.relative(root, normalizationPath).replaceAll('\\', '/'), sha256: sha256(normalizationPath) },
    gpt_model_verification: { path: path.relative(root, modelVerificationPath).replaceAll('\\', '/'), sha256: sha256(modelVerificationPath) },
    official_url_verification: { path: path.relative(root, officialVerificationPath).replaceAll('\\', '/'), sha256: sha256(officialVerificationPath) },
    decision_adoption: { path: path.relative(root, decisionAdoptionPath).replaceAll('\\', '/'), sha256: sha256(decisionAdoptionPath) },
    facilities: { path: path.relative(root, facilitiesPath).replaceAll('\\', '/'), sha256: sha256(facilitiesPath) },
  },
  result: {
    passed: failed.length === 0,
    check_count: checks.length,
    failed_check_count: failed.length,
    requested_pair_count: expectedPairs.size,
    decision_counts: decisionCounts,
  },
  checks,
};

fs.writeFileSync(verificationPath, `${JSON.stringify(verification, null, 2)}\n`);
console.log(JSON.stringify(verification.result, null, 2));
if (failed.length > 0) {
  console.error(JSON.stringify(failed, null, 2));
  process.exitCode = 1;
}
