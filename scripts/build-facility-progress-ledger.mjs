import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { hash } from './jev-batch.mjs';
import { htmlText } from './facility-bulk-lib.mjs';
import { buildArticleProgress, additionLedgerRows } from './facility-progress-lib.mjs';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const out = 'outputs/facility-progress-20260925';
const publicOut = 'data-sources/facility-progress-20260925';
const baselineFiles = ['public/data/shopping.geojson', 'public/data/civic-facilities.geojson'];
const sourcePlan = read(`${publicOut}/source-plan.json`);
const receipts = new Map(sourcePlan.map(({ url }) => {
  const path = `${out}/pages/${hash(new URL(url).href).slice(0, 24)}.json`;
  const receipt = read(path);
  assert.equal(receipt.url, url);
  assert.equal(receipt.status, 200, `${url} was not fetched successfully`);
  return [url, { path, receipt }];
}));
const source = url => receipts.get(url);
const digest = path => createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const csv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const writeCsv = (path, headers, rows) => fs.writeFileSync(path,
  [headers.join(','), ...rows.map(row => headers.map(key => csv(row[key])).join(','))].join('\n') + '\n');
const writeJson = (path, value) => fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');

const baseline = baselineFiles.flatMap(path => read(path).features.map(feature => ({
  id: feature.id, name: feature.properties.name, city: feature.properties.city ?? '',
  category: feature.properties.category ?? '', dataset: path,
})));
assert.equal(baseline.length, 7764);
const baselineIds = new Set(baseline.map(row => row.id));
assert.equal(baselineIds.size, baseline.length);
const overlay = read('public/data/facility-current.json');
const updateIds = new Set(overlay.updates.map(row => row.id));
assert.equal(updateIds.size, overlay.updates.length);
assert([...updateIds].every(id => baselineIds.has(id)), 'An update did not match a baseline ID');
assert(Array.isArray(overlay.additions));
const additionIds = new Set(overlay.additions.map(row => row.id));
assert.equal(additionIds.size, overlay.additions.length);
assert([...additionIds].every(id => !baselineIds.has(id)), 'An addition reused a baseline ID');

const graduateSource = 'https://www.karatoharete.com/卒業生';
const tripSource = 'https://yakitoritowine-trip.com/';
const sushiEventSource = 'https://yamaguchi-kujira.jp/store/';
const sushiCitySource = 'https://www.city.shimonoseki.lg.jp/site/kisya/161843.html';
const meatSource = 'https://2929udon.co.jp/shop/';
const marineSource = 'https://www.marinepolis.co.jp/search/yamaguchi';
assert(source(graduateSource).receipt.html.includes('赤間プラザ'));
assert(source(tripSource).receipt.html.includes('プロートン泰平') && source(tripSource).receipt.html.includes('050-8883-2724'));
assert(source(sushiEventSource).receipt.html.includes('寿司響') && source(sushiEventSource).receipt.html.includes('南部町26-3'));
assert(source(sushiCitySource).receipt.html.includes('寿司 響'));
assert(source(meatSource).receipt.html.includes('新下関店'));
assert(!source(marineSource).receipt.html.includes('大内御堀店'));

const records = read('outputs/facility-local-stores-20260925/records.json');
const decisions = read('data-sources/facility-local-stores-20260925/decisions.json');
assert.equal(records.length, 97);
assert.equal(decisions.length, records.length);
const graduateDecisions = decisions.filter(row => row.decision === 'hold_relocated');
assert.equal(graduateDecisions.length, 11);
const recordById = new Map(records.map(row => [row.id, row]));
const currentGraduateText = htmlText(source(graduateSource).receipt.html);
const normalize = value => value.normalize('NFKC').replace(/[\s\u200b-]+/g, '');
assert(normalize(htmlText(source(tripSource).receipt.html)).includes(normalize('山口県下関市唐戸町2-12 プロートン泰平1F-D')));
const addressFrom = body => {
  const match = body.match(/移転先[\s　]*([^\r\n]+)/);
  if (!match) return null;
  let address = match[1].trim();
  if (address === '各地') return null;
  const continuation = body.slice(match.index + match[0].length).match(/^\s*(南栄ビル[^\r\n]*|栄光ビル[^\r\n]*)/);
  if (continuation) address += ' ' + continuation[1].trim();
  return address.replace(/\s+/g, ' ').trim();
};
const relocationStatus = new Map(read('data-sources/facility-relocations-20260925/relocation-review.json').map(row => [row.graduate_id, row]));
const graduateReview = graduateDecisions.map(decision => {
  const record = recordById.get(decision.id);
  assert(record && record.name === decision.name);
  const operatorAddress = addressFrom(record.body);
  const address = decision.id === 'harete-graduate-05' ? '下関市南部町26-3 2F' : operatorAddress;
  const locationType = /キッチンカー/.test(record.body) ? 'mobile_no_fixed_point'
    : address ? 'reported_fixed_address' : 'fixed_address_not_stated';
  const exactNameCandidates = [...baseline, ...overlay.additions].filter(item => normalize(item.name ?? '') === normalize(record.name)).map(item => item.id);
  assert(normalize(currentGraduateText).includes(normalize(record.name)), `${record.name} vanished from the current operator page`);
  if (operatorAddress) assert(normalize(currentGraduateText).includes(normalize(operatorAddress)), `${record.name} address changed on the current operator page`);
  const adopted = relocationStatus.get(decision.id);
  assert(adopted && adopted.name === decision.name);
  const mapAdopted = adopted.status === 'reflected_addition';
  if (mapAdopted) assert(overlay.additions.some(row => row.id === adopted.map_feature_id));
  return {
    id: decision.id, name: decision.name, kind: 'relocated_graduate',
    review_status: mapAdopted ? 'reflected_addition' : adopted.status === 'conflicting_current_listing_hold'
      ? 'conflicting_current_listing_hold' : locationType === 'reported_fixed_address'
      ? 'address_sourced_geometry_and_identity_pending'
      : locationType === 'mobile_no_fixed_point' ? 'mobile_without_fixed_map_point'
        : 'address_not_stated',
    location_type: locationType, reported_address: address,
    address_source: decision.id === 'harete-graduate-05' ? sushiEventSource : address ? graduateSource : null,
    address_source_receipt: decision.id === 'harete-graduate-05' ? source(sushiEventSource).path : address ? source(graduateSource).path : null,
    identity_corrob_source: decision.id === 'harete-graduate-05' ? sushiCitySource : null,
    identity_corrob_receipt: decision.id === 'harete-graduate-05' ? source(sushiCitySource).path : null,
    old_location_excluded: true, map_adopted: mapAdopted, map_feature_id: adopted.map_feature_id,
    exact_name_candidate_ids: exactNameCandidates,
    official_directory_url: graduateSource,
    official_directory_receipt: source(graduateSource).path,
    current_self_operated_site: decision.id === 'harete-graduate-04' ? tripSource : null,
    current_self_operated_receipt: decision.id === 'harete-graduate-04' ? source(tripSource).path : null,
    current_self_operated_address: decision.id === 'harete-graduate-04'
      ? '山口県下関市唐戸町2-12 プロートン泰平1F-D' : null,
    source_record: 'outputs/facility-local-stores-20260925/records.json',
    next: mapAdopted ? 'Keep checking self-operated current notices and do not turn a representative map point into an entrance.'
      : locationType === 'mobile_no_fixed_point' ? 'Do not create a fixed map point for mobile operations.'
      : locationType === 'fixed_address_not_stated' ? 'Find the current shop address from the operator or the shop itself.'
      : 'Match this address and shop identity to a location point; verify any date before publishing it as an actual opening.',
  };
});
assert.equal(graduateReview.filter(row => row.location_type === 'reported_fixed_address').length, 10);
assert.equal(graduateReview.filter(row => row.location_type === 'fixed_address_not_stated').length, 0);
assert.equal(graduateReview.filter(row => row.location_type === 'mobile_no_fixed_point').length, 1);
assert(graduateReview.every(row => row.exact_name_candidate_ids.every(id => id === row.map_feature_id)), 'Check newly found exact-name candidates');

const closureReview = [
  {
    id: 'osm-way-1236531275', name: '肉肉うどん 新下関店', kind: 'closure_candidate',
    review_status: 'hold_conflicting_current_primary_listing', map_adopted: false,
    official_url: meatSource, official_receipt: source(meatSource).path,
    finding: 'The current brand shop page still lists Shin-Shimonoseki; a branch-specific primary closure notice has not been obtained.',
    next: 'Check a dated branch-specific operator notice before marking this ID closed.',
  },
  {
    id: 'osm-way-465881162', name: '海都大内御堀店', kind: 'closure_candidate',
    review_status: 'hold_primary_closure_notice_missing', map_adopted: false,
    official_url: marineSource, official_receipt: source(marineSource).path,
    finding: 'The current company Yamaguchi list does not show this branch; absence is not a dated closure notice.',
    previous_hold: 'data-sources/facility-evidence-20260925/holds.json',
    next: 'Obtain an operator or other branch-specific primary closure notice and verify the event date.',
  },
];
assert(closureReview.every(row => baselineIds.has(row.id) && !updateIds.has(row.id)));
const holdIds = new Set(closureReview.map(row => row.id));
const facilityRows = baseline.map(row => ({ ...row,
  status: updateIds.has(row.id) ? 'reflected_update' : holdIds.has(row.id) ? 'hold' : 'not_attested_complete',
  scope: 'baseline',
}));
const additionRows = additionLedgerRows(overlay.additions);
writeCsv(`${out}/facility-status.csv`, ['scope', 'id', 'name', 'city', 'category', 'status', 'dataset'], [...facilityRows, ...additionRows]);

const articles = read(`${publicOut}/article-index.json`);
assert.equal(articles.length, 1186);
assert.equal(new Set(articles.map(row => row.key)).size, articles.length);
const articleReviewPath = `${publicOut}/article-event-reviews.json`;
const articleReviews = read(articleReviewPath);
const { articleRows, eventRows, summary: articleSummary } = buildArticleProgress(articles, articleReviews, overlay, overlay.checked_at);
writeCsv(`${out}/event-status.csv`, ['article_key', 'event_id', 'event_type', 'facility_ids',
  'disposition', 'effective_at', 'source_urls', 'reason', 'duplicate_of'], eventRows);
writeCsv(`${out}/article-status.csv`, ['queue_number', 'key', 'title', 'url', 'source', 'jev_event', 'status', 'inventory_complete', 'reviewed_events', 'related_source', 'source_receipts_fetched'], articleRows);
const previousHolds = read('data-sources/facility-evidence-20260925/holds.json').items;
const staleHoldIds = [...new Set(previousHolds.flatMap(row => row.facility_ids ?? []))].filter(id => updateIds.has(id));
const localCounts = Object.fromEntries([...new Set(decisions.map(row => row.decision))].map(status =>
  [status, decisions.filter(row => row.decision === status).length]));
writeJson(`${publicOut}/focus-review.json`, {checked_at: '2026-09-25', graduates: graduateReview, closures: closureReview});
const summary = {
  checked_at: overlay.checked_at,
  baseline: {
    total: baseline.length, reflected_updates: updateIds.size, explicitly_held: holdIds.size,
    not_attested_complete: baseline.length - updateIds.size - holdIds.size,
    verified_no_change_attested_in_this_ledger: 0,
    note: 'Not attested complete includes records that may have been examined earlier without a facility-level final disposition; it is not proof that each shop is stale.',
  },
  additions: { reflected: additionRows.length },
  article_events: articleSummary,
  local_directory_batch: { total: decisions.length, dispositions: localCounts,
    new_map_additions: localCounts.add_current_listing + localCounts.add_opening },
  immediate_followups: { graduates: graduateReview.length,
    fixed_address_reported: graduateReview.filter(row => row.location_type === 'reported_fixed_address').length,
    address_from_operator: graduateReview.filter(row => row.address_source === graduateSource).length,
    address_from_event_organizer: graduateReview.filter(row => row.address_source === sushiEventSource).length,
    address_not_stated: 0, mobile_without_fixed_point: 1,
    closure_candidates_with_existing_ids: closureReview.length,
    graduates_reflected: graduateReview.filter(row => row.map_adopted).length,
    graduates_pending: graduateReview.filter(row => !row.map_adopted && row.location_type === 'reported_fixed_address').length,
    graduate_map_additions_cumulative: graduateReview.filter(row => row.map_adopted).length },
  earlier_hold_rows_now_reflected: staleHoldIds,
  jev_remaining: { records: read('data-sources/facility-successors-20260925/adoption-summary.json').jev.remaining_records,
    conservative_budget_usd: read('data-sources/facility-successors-20260925/adoption-summary.json').jev.remaining_budget_usd,
    source: 'data-sources/facility-successors-20260925/adoption-summary.json' },
  inputs_sha256: Object.fromEntries([
    ...baselineFiles, 'public/data/facility-current.json',
    'outputs/facility-local-stores-20260925/continued-review-queue.json',
    articleReviewPath,
    `${publicOut}/article-index.json`,
    'data-sources/facility-local-stores-20260925/decisions.json',
    'outputs/facility-local-stores-20260925/records.json',
    `${publicOut}/source-plan.json`,
    'data-sources/facility-relocations-20260925/relocation-review.json',
    'data-sources/facility-relocations-20260925/adoptions.json',
    ...[...receipts.values()].map(item => item.path),
  ].map(path => [path, digest(path)])),
};
assert.equal(summary.local_directory_batch.new_map_additions, 72);
assert.equal(summary.article_events.with_related_source_only, 35);
writeJson(`${publicOut}/progress-summary.json`, summary);
console.log(JSON.stringify({baseline: summary.baseline, additions: summary.additions,
  articles: summary.article_events, immediate: summary.immediate_followups}));
