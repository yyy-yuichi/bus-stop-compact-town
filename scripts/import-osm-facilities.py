"""Fetch a bounded prefecture extract, then build a reproducible facility layer."""
from pathlib import Path
from collections import Counter
import argparse, datetime, hashlib, json, unicodedata, urllib.parse, urllib.request

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'data-sources/osm-facilities-20260911'
QUERY = '''[out:json][timeout:90];
area["ISO3166-2"="JP-35"]["boundary"="administrative"]->.pref;
(
  nwr(area.pref)["shop"~"^(supermarket|chemist|convenience|mall|department_store)$"];
  nwr(area.pref)["amenity"~"^(hospital|clinic|doctors|pharmacy)$"];
  nwr(area.pref)["healthcare"~"^(hospital|clinic|doctor|pharmacy)$"];
);
out body center;'''

def category(tags):
    shop = tags.get('shop')
    if shop in ('supermarket', 'convenience'): return shop
    if shop == 'chemist': return 'drugstore'
    if shop in ('mall', 'department_store'): return 'mall'
    values = {tags.get('amenity'), tags.get('healthcare')}
    if 'hospital' in values: return 'hospital'
    if values & {'clinic', 'doctors', 'doctor'}: return 'clinic'
    if 'pharmacy' in values: return 'pharmacy'
    return None

def safe_website(value):
    try:
        parsed = urllib.parse.urlsplit(value)
        if parsed.scheme in ('https', 'http') and parsed.hostname and not parsed.username and not parsed.password:
            return value
    except ValueError: pass
    return ''

def normalized_name(value):
    return ''.join(unicodedata.normalize('NFKC', value).split()).lower()

def in_ring(point, ring):
    x, y = point
    inside = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > y) != (b[1] > y) and x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:
            inside = not inside
    return inside

def inside_curated(point, feature):
    geometry = feature['geometry']
    return geometry['type'] == 'MultiPolygon' and any(in_ring(point, polygon[0]) and not any(in_ring(point, hole) for hole in polygon[1:]) for polygon in geometry['coordinates'])

def apply_reviews(additions, reviews):
    by_id = {f['id']: f for f in additions}
    seen = set()
    for review in reviews:
        identifier = review['id']
        if identifier in seen or identifier not in by_id:
            raise ValueError(f'Duplicate or absent reviewed ID: {identifier}')
        seen.add(identifier)
        p = by_id[identifier]['properties']
        if (p['name'], p['category']) != (review['expected_name'], review['expected_category']):
            raise ValueError(f'Review no longer matches source: {identifier}')
        if review.get('evidence_url') and not safe_website(review['evidence_url']):
            raise ValueError(f'Unsafe review evidence URL: {identifier}')
        if review['category'] not in ('mall', 'supermarket', 'drugstore', 'convenience', 'hospital', 'clinic', 'pharmacy', 'reference'):
            raise ValueError(f'Invalid reviewed category: {identifier}')
        p['category'] = review['category']
        p['name'] = review.get('name', p['name'])
        p['classification_review'] = {k: review[k] for k in ('checked_at', 'status', 'note', 'evidence_url') if k in review}
        p['classification_review']['original_category'] = review['expected_category']

def build(raw, existing, retrieved_at, reviews=()):
    # Previously curated records retain their IDs, provenance and geometry.
    curated = [f for f in existing['features'] if f['properties'].get('verification_status') != 'osm_unverified']
    used = {source for f in curated for source in f['properties']['source_ids']}
    additions, skipped = [], []
    for e in raw['elements']:
        sid = f"{e['type']}/{e['id']}"
        t = e.get('tags', {})
        if sid in used:
            skipped.append({'source_id': sid, 'reason': 'existing_source_id'}); continue
        c = category(t)
        if not c: continue
        if any(t.get(k) in ('yes', 'true', '1') for k in ('disused', 'abandoned', 'demolished', 'construction')) or t.get('access') == 'private':
            skipped.append({'source_id': sid, 'reason': 'inactive_or_private'}); continue
        name = t.get('name:ja') or t.get('name')
        if not name:
            skipped.append({'source_id': sid, 'reason': 'no_name'}); continue
        center = e if e['type'] == 'node' else e.get('center', {})
        if not all(k in center for k in ('lat', 'lon')):
            skipped.append({'source_id': sid, 'reason': 'no_coordinates'}); continue
        duplicate = next((f for f in curated if e['type'] == 'node' and normalized_name(f['properties']['name']) == normalized_name(name) and inside_curated([center['lon'], center['lat']], f)), None)
        if duplicate:
            skipped.append({'source_id':sid, 'reason':'same_name_node_inside_curated_geometry', 'kept_id':duplicate['id']}); continue
        city = t.get('addr:city', '')
        address = t.get('addr:full') or ''.join(t.get(k, '') for k in ('addr:province', 'addr:city', 'addr:suburb', 'addr:quarter', 'addr:neighbourhood', 'addr:place', 'addr:street', 'addr:housenumber'))
        p = dict(name=name, city=city, category=c, official_address='', official_url='',
                 address=address, website=safe_website(t.get('website') or t.get('contact:website', '')),
                 search_names=' '.join(t.get(k, '') for k in ('name', 'name:ja', 'name:ja-Hira', 'name:ja_kana', 'alt_name', 'brand', 'branch')),
                 geometry_kind='representative_point', source='OpenStreetMap', source_ids=[sid],
                 source_timestamp=raw['osm3s']['timestamp_osm_base'], retrieved_at=retrieved_at,
                 verified_at='', verification_status='osm_unverified', license='ODbL-1.0',
                 geometry_note='Original OSM node' if e['type'] == 'node' else 'Center of the OSM element bounding box; not an entrance',
                 osm_tags={k: t[k] for k in ('shop', 'amenity', 'healthcare') if k in t})
        additions.append(dict(type='Feature', id=f"osm-{e['type']}-{e['id']}", properties=p,
                              geometry={'type':'Point', 'coordinates':[center['lon'], center['lat']]}))
        used.add(sid)
    additions.sort(key=lambda f: f['id'])
    apply_reviews(additions, reviews)
    return {'type':'FeatureCollection', 'features':curated + additions}, skipped

def load_reviews():
    return json.loads((ROOT/'data-sources/facility-audit-20260912/reviews.json').read_text(encoding='utf-8'))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--fetch', action='store_true')
    parser.add_argument('--endpoint', default='https://overpass-api.de/api/interpreter')
    args = parser.parse_args()
    WORK.mkdir(parents=True, exist_ok=True)
    raw_path = WORK / 'osm-facilities.json'
    if args.fetch:
        if raw_path.exists(): raise SystemExit('Saved extract exists; use it for reproducible rebuilds.')
        endpoint = args.endpoint
        request = urllib.request.Request(endpoint, data=urllib.parse.urlencode({'data': QUERY}).encode(), headers={'User-Agent':'bus-stop-compact-town/0.1 (+https://github.com/yyy-yuichi/bus-stop-compact-town)'})
        with urllib.request.urlopen(request, timeout=120) as response: content = response.read()
        raw = json.loads(content)
        if raw.get('remark') or not raw.get('elements'): raise ValueError('Incomplete or empty extract')
        raw_path.write_bytes(content)
        (WORK/'query.overpassql').write_text(QUERY, encoding='utf-8')
        (WORK/'retrieval.json').write_text(json.dumps({'endpoint':endpoint, 'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sha256':hashlib.sha256(content).hexdigest()}, indent=2), encoding='utf-8')
    raw = json.loads(raw_path.read_text(encoding='utf-8'))
    retrieval = json.loads((WORK/'retrieval.json').read_text(encoding='utf-8'))
    if hashlib.sha256(raw_path.read_bytes()).hexdigest() != retrieval['sha256']:
        raise ValueError('Source hash mismatch')
    dest = ROOT/'public/data/shopping.geojson'
    original = json.loads(dest.read_text(encoding='utf-8'))
    if not (WORK/'curated-facilities.geojson').exists():
        (WORK/'curated-facilities.geojson').write_bytes(dest.read_bytes())
    review_data = load_reviews()
    if review_data['source_sha256'] != retrieval['sha256']:
        raise ValueError('Reviews refer to a different source snapshot')
    data, skipped = build(raw, original, retrieval['retrieved_at'], review_data['reviews'])
    dest.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')
    report = dict(raw_elements=len(raw['elements']), total=len(data['features']),
                  categories=dict(Counter(f['properties']['category'] for f in data['features'])),
                  skipped=skipped, snapshot=raw['osm3s']['timestamp_osm_base'], source_sha256=retrieval['sha256'])
    (WORK/'import-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')
    print(json.dumps({k:v for k,v in report.items() if k != 'skipped'}, ensure_ascii=False))
    print('Skipped:', dict(Counter(s['reason'] for s in skipped)))

if __name__ == '__main__': main()
