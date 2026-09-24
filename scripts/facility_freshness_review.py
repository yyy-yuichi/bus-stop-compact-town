"""Apply explicitly verified facility-freshness updates to the generated map."""
from pathlib import Path
from datetime import date
import copy
import json
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / 'data-sources/facility-freshness-baseline-20260924/review-updates.json'
ROOT_FIELDS = {'schema_version', 'repository', 'checked_at', 'updates'}
EXPECTED_FIELDS = {
    'name', 'city', 'category', 'official_address', 'official_url', 'address',
    'search_names', 'verified_at', 'verification_status', 'source_ids',
}
PATCH_FIELDS = {
    'name', 'city', 'official_address', 'official_url', 'address', 'search_names',
    'verified_at', 'verification_status', 'osm_name', 'location_verification',
    'classification_review',
}


def _safe_https(value):
    try:
        parsed = urlsplit(value)
        return parsed.scheme == 'https' and bool(parsed.hostname) and not parsed.username and not parsed.password
    except (TypeError, ValueError):
        return False


def _valid_date(value):
    try:
        return date.fromisoformat(value).isoformat() == value
    except (TypeError, ValueError):
        return False


def load_review():
    return json.loads(REVIEW.read_text(encoding='utf-8'))


def apply_facility_freshness_review(data, review=None):
    review = review or load_review()
    if set(review) != ROOT_FIELDS or review['schema_version'] != 1 or review['repository'] != 'yyy-yuichi/bus-stop-compact-town':
        raise ValueError('Unexpected freshness review identity or schema')
    if not _valid_date(review['checked_at']) or not isinstance(review['updates'], list):
        raise ValueError('Invalid freshness review date or updates')

    by_id = {feature['id']: feature for feature in data['features']}
    if len(by_id) != len(data['features']):
        raise ValueError('Generated facility IDs are not unique')
    update_ids = [item.get('id') for item in review['updates']]
    if not update_ids or len(update_ids) != len(set(update_ids)):
        raise ValueError('Freshness review IDs must be non-empty and unique')

    result = copy.deepcopy(data)
    result_by_id = {feature['id']: feature for feature in result['features']}
    for item in review['updates']:
        if set(item) != {'id', 'expected', 'set', 'event', 'evidence_urls'}:
            raise ValueError(f'Unexpected freshness review fields: {item.get("id")}')
        identifier = item['id']
        expected = item['expected']
        changes = item['set']
        event = item['event']
        urls = item['evidence_urls']
        if set(expected) != EXPECTED_FIELDS or not isinstance(changes, dict) or not changes or set(changes) - PATCH_FIELDS:
            raise ValueError(f'Invalid freshness review patch: {identifier}')
        if not isinstance(urls, list) or not urls or any(not _safe_https(url) for url in urls):
            raise ValueError(f'Invalid official evidence URLs: {identifier}')
        if set(event) != {'type', 'announced_at', 'effective_at', 'source_url'} or event['type'] != 'scheduled_closure':
            raise ValueError(f'Invalid scheduled event: {identifier}')
        if event['announced_at'] is not None and not _valid_date(event['announced_at']):
            raise ValueError(f'Invalid announcement date: {identifier}')
        if not _valid_date(event['effective_at']) or not _safe_https(event['source_url']) or event['source_url'] not in urls:
            raise ValueError(f'Invalid event date or source: {identifier}')
        if identifier not in by_id:
            raise ValueError(f'Freshness review ID is absent: {identifier}')

        before = by_id[identifier]
        after = result_by_id[identifier]
        if before['geometry'] != after['geometry'] or before['id'] != after['id']:
            raise ValueError(f'Identity or geometry changed before review: {identifier}')
        properties = before['properties']
        current_before = {key: properties.get(key) for key in EXPECTED_FIELDS}
        desired = {**expected, **changes}
        current_after = {key: properties.get(key) for key in desired}
        if current_before != expected and current_after != desired:
            raise ValueError(f'Freshness review no longer matches source or applied result: {identifier}')
        if changes.get('verified_at') != review['checked_at']:
            raise ValueError(f'Verification date must match review date: {identifier}')
        classification = changes.get('classification_review')
        if not isinstance(classification, dict) or classification.get('evidence_url') not in urls:
            raise ValueError(f'Missing classification evidence: {identifier}')

        after['properties'].update(copy.deepcopy(changes))
        if after['id'] != before['id'] or after['geometry'] != before['geometry']:
            raise ValueError(f'Freshness review changed identity or geometry: {identifier}')
        if after['properties']['source_ids'] != properties['source_ids'] or after['properties']['category'] != properties['category']:
            raise ValueError(f'Freshness review changed source IDs or category: {identifier}')
    return result
