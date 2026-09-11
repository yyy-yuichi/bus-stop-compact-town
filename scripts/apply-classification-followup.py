"""Apply the individually researched 35 pending candidates from a5cfb99."""
from pathlib import Path
import json
import math

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'data-sources/facility-classification-followup-20260912'
REVIEW_PATH = ROOT / 'data-sources/facility-audit-20260912/reviews.json'


def distance(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return round(6371000 * 2 * math.asin(math.sqrt(h)), 1)


research = json.loads((WORK / 'research.json').read_text(encoding='utf-8'))
snapshot = json.loads((WORK / 'baseline-candidates.json').read_text(encoding='utf-8'))
assert snapshot['baseline_commit'] == research['baseline_commit'] == 'a5cfb99'
targets = {r['id']: r for r in snapshot['candidates'] if r['status'] == 'pending'}
checks = research['checks']
assert len(checks) == len({r['id'] for r in checks}) == len(targets) == 35
assert {r['id'] for r in checks} == set(targets), 'Only the original 35 pending records may be changed'
review_data = json.loads(REVIEW_PATH.read_text(encoding='utf-8'))
assert snapshot['source_sha256'] == review_data['source_sha256']
reviews = {r['id']: r for r in review_data['reviews']}
for check in checks:
    identifier = check['id']
    row = targets[identifier]
    assert check['status'] in ('corrected', 'retained', 'pending', 'out_of_scope')
    assert check.get('evidence_url') and check.get('note')
    assert check['status'] != 'pending' or check.get('next_check')
    check['original_name'] = row['original_name']
    check['original_category'] = row['original_category']
    check['before_category'] = row['current_category']
    check['source_id'] = row['source_id']
    check['source_point'] = row['source_point']
    if check.get('official_point'):
        check['representative_point_distance_m'] = distance(check['source_point'], check['official_point'])
    reviews[identifier] = {k: check[k] for k in ('id', 'category', 'name', 'checked_at', 'status', 'note', 'evidence_url') if k in check}
    reviews[identifier].update(expected_name=row['original_name'], expected_category=row['original_category'])
review_data['reviews'] = list(reviews.values())
REVIEW_PATH.write_text(json.dumps(review_data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
(WORK / 'research.json').write_text(json.dumps(research, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
print(f'Applied {len(checks)} individual reviews; total rules: {len(reviews)}')
