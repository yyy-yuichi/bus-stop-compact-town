import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const batchDir = path.join(root, 'data-sources/facility-freshness-priority-20260920');
const sourceManifestPath = path.join(root, 'data-sources/facility-backlog-review-20260920/facility-decision-manifest.json');
const requestPath = path.join(batchDir, 'gpt-chat-request.json');
const auditPath = path.join(batchDir, 'walking-impact-audit.json');
const followupPath = path.join(batchDir, 'facility-freshness-followup-manifest.json');
const verificationPath = path.join(batchDir, 'verification.json');

const expectedFollowupSha256 = '39f2f9bae1acb0f22012900acf8ebc07ce2ee4b64400b30207ba7ccadcf8c998';
const expectedSourceManifestSha256 = 'c3ce08c2dd5ec3af26062b37280481314d15b0b3599c14b6ef7c350ca69b1866';

function loadJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function sha256(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const checks = [];
function check(name, passed, detail) {
  checks.push({ name, passed, detail });
}

const source = loadJson(sourceManifestPath);
const request = loadJson(requestPath);
const audit = loadJson(auditPath);
const followup = loadJson(followupPath);

const sourceHash = sha256(sourceManifestPath);
const requestHash = sha256(requestPath);
const auditHash = sha256(auditPath);
const followupHash = sha256(followupPath);

const expectedIds = request.records.map(record => record.id);
const decisionIds = followup.decisions.map(decision => decision.id);
const uniqueExpectedIds = [...new Set(expectedIds)];
const uniqueDecisionIds = [...new Set(decisionIds)];
const missingIds = uniqueExpectedIds.filter(id => !uniqueDecisionIds.includes(id));
const extraIds = uniqueDecisionIds.filter(id => !uniqueExpectedIds.includes(id));
const duplicateIds = uniqueDecisionIds.filter(id => decisionIds.filter(candidate => candidate === id).length > 1);

check('follow-up file hash matches downloaded GPT artifact', followupHash === expectedFollowupSha256, followupHash);
check('source manifest hash is unchanged', sourceHash === expectedSourceManifestSha256, sourceHash);
check('follow-up source hash matches source manifest', followup.source_manifest_sha256 === sourceHash, followup.source_manifest_sha256);
check('repository matches source manifest', followup.repository === source.repository, followup.repository);
check('base commit matches source manifest', followup.base_commit === source.base_commit, followup.base_commit);
check('request contains six unique IDs', expectedIds.length === 6 && uniqueExpectedIds.length === 6, expectedIds);
check('decision IDs exactly match request IDs', missingIds.length === 0 && extraIds.length === 0 && duplicateIds.length === 0 && decisionIds.length === expectedIds.length, {
  missing_ids: missingIds,
  extra_ids: extraIds,
  duplicate_ids: duplicateIds,
});

const sourceById = new Map(source.decisions.map(decision => [decision.id, decision]));
const requestById = new Map(request.records.map(record => [record.id, record]));
const auditById = new Map(audit.records.map(record => [record.id, record]));
const allowedDecisions = new Set(['update', 'no_change', 'hold']);

for (const decision of followup.decisions) {
  const requestRecord = requestById.get(decision.id);
  const sourceDecision = sourceById.get(decision.id);
  const auditRecord = auditById.get(decision.id);
  check(`${decision.id}: exists in source manifest`, Boolean(sourceDecision), sourceDecision?.decision ?? null);
  check(`${decision.id}: current record matches request`, Boolean(requestRecord) && sameJson(decision.current_record, requestRecord.current_record), decision.current_record.name);
  check(`${decision.id}: current record matches source manifest`, Boolean(sourceDecision) && sameJson(decision.current_record, sourceDecision.current_record), decision.current_record.name);
  check(`${decision.id}: walking impact matches audit`, Boolean(auditRecord) && Boolean(requestRecord) && sameJson(requestRecord.walking_impact, auditRecord.walking_impact), requestRecord?.walking_impact?.origin_count ?? null);
  check(`${decision.id}: decision value is valid`, allowedDecisions.has(decision.decision), decision.decision);
  check(`${decision.id}: remains on hold`, decision.decision === 'hold', decision.decision);
  check(`${decision.id}: has no proposed mutation`, decision.proposed_record === null, decision.proposed_record);
  check(`${decision.id}: geometry remains unchanged`, decision.geometry_action === 'keep' && decision.coordinate_change === false, {
    geometry_action: decision.geometry_action,
    coordinate_change: decision.coordinate_change,
  });
  check(`${decision.id}: unresolved evidence is recorded`, Array.isArray(decision.unresolved) && decision.unresolved.length > 0, decision.unresolved?.length ?? 0);
  const urlsAreSafe = Array.isArray(decision.official_evidence_urls)
    && decision.official_evidence_urls.length > 0
    && decision.official_evidence_urls.every(value => {
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
      } catch {
        return false;
      }
    });
  check(`${decision.id}: official evidence URLs are credential-free HTTPS URLs`, urlsAreSafe, decision.official_evidence_urls);
}

const calculatedCounts = followup.decisions.reduce((counts, decision) => {
  counts[decision.decision] += 1;
  return counts;
}, { update: 0, no_change: 0, hold: 0 });
const totalOriginAppearances = request.records.reduce((sum, record) => sum + record.walking_impact.origin_count, 0);
check('summary decision counts match decisions', followup.summary.update === calculatedCounts.update
  && followup.summary.no_change === calculatedCounts.no_change
  && followup.summary.hold === calculatedCounts.hold, calculatedCounts);
check('all coordinate changes remain zero', followup.summary.coordinate_changes === 0
  && followup.decisions.every(decision => decision.coordinate_change === false), followup.summary.coordinate_changes);
check('walking impact audit preserves the 29-to-11-to-6 funnel', audit.method.pending_hold_records === 29
  && audit.method.display_candidate_records === 11
  && audit.method.reference_records_deferred === 18
  && audit.summary.impacted_records === 6
  && audit.summary.no_current_walking_impact_records === 5, {
  method: audit.method,
  summary: audit.summary,
});
check('six selected records appear across 37 walking origins', request.records.length === 6
  && request.records.every(record => record.walking_impact.origin_count > 0)
  && totalOriginAppearances === 37, totalOriginAppearances);
check('GPT manifest self-validation passed', followup.validation?.passed === true
  && followup.validation?.decision_count === 6
  && followup.validation?.unique_id_count === 6
  && followup.validation?.geometry_changes === 0
  && followup.validation?.coordinate_changes === 0, followup.validation);

const failed = checks.filter(item => !item.passed);
const verification = {
  checked_at: '2026-09-20',
  purpose: 'GPT-6 Pro通常Chatのfollow-up結果を、既存監査・徒歩圏優先順位・変更禁止条件と機械照合する。',
  files: {
    source_manifest: { path: path.relative(root, sourceManifestPath).replaceAll('\\', '/'), sha256: sourceHash },
    walking_impact_audit: { path: path.relative(root, auditPath).replaceAll('\\', '/'), sha256: auditHash },
    gpt_chat_request: { path: path.relative(root, requestPath).replaceAll('\\', '/'), sha256: requestHash },
    gpt_followup_manifest: { path: path.relative(root, followupPath).replaceAll('\\', '/'), sha256: followupHash },
  },
  result: {
    passed: failed.length === 0,
    check_count: checks.length,
    failed_check_count: failed.length,
    selected_record_count: expectedIds.length,
    walking_origin_appearance_count: totalOriginAppearances,
    decision_counts: calculatedCounts,
    app_data_changes: 0,
  },
  checks,
};

fs.writeFileSync(verificationPath, `${JSON.stringify(verification, null, 2)}\n`);
console.log(JSON.stringify(verification.result, null, 2));
if (failed.length > 0) {
  console.error(JSON.stringify(failed, null, 2));
  process.exitCode = 1;
}
