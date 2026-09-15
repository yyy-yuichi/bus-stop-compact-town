"""Extend the established location/direction UI using the existing city GTFS originals.

Only stop coordinates and static stop sequences are used. No calendars or times.
"""
import collections
import csv
import hashlib
import io
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'work/regional-boarding-20260914'
OUT.mkdir(parents=True, exist_ok=True)
APP = ROOT / 'src/data/boarding-guide-study.json'
before = APP.read_bytes()
baseline = OUT / 'guide-before-expansion.json'
if not baseline.exists():
    baseline.write_bytes(before)
study = json.loads(baseline.read_text(encoding='utf-8'))
original_guide_ids = set(study['guides'])
municipal = json.loads((ROOT / 'public/data/review-stops.geojson').read_text(encoding='utf-8'))['features']
feeds = {
    'iwakuni': ('352080-gtfsjp.zip', 'https://yamaguchi-opendata.jp/ckan/dataset/352080-gtfsjp', 'https://www.city.iwakuni.lg.jp/life/1/14/101/index.html'),
    'hikari': ('352101_kotsu001.zip', 'https://yamaguchi-opendata.jp/ckan/dataset/352101_kotsu001', 'https://www.city.hikari.lg.jp/soshiki/11/kokyokotsu/1/1/1936.html'),
}
ledger, feed_receipts = [], []
for namespace, (filename, source_url, guide_url) in feeds.items():
    path = ROOT / 'data-sources/route-living-pilot-20260914' / filename
    with zipfile.ZipFile(path) as archive:
        def table(name):
            return list(csv.DictReader(io.TextIOWrapper(archive.open(name + '.txt'), encoding='utf-8-sig')))
        stops = {r['stop_id']: r for r in table('stops')}
        routes = {r['route_id']: r for r in table('routes')}
        trips = {r['trip_id']: r for r in table('trips')}
        sequences = collections.defaultdict(list)
        for row in table('stop_times'):
            sequences[row['trip_id']].append(row)
    next_by_stop = collections.defaultdict(lambda: collections.defaultdict(set))
    terminal = collections.defaultdict(set)
    evidence = collections.defaultdict(list)
    for tid, sequence in sequences.items():
        sequence.sort(key=lambda r: int(r['stop_sequence']))
        route_id = trips[tid]['route_id']
        for i, row in enumerate(sequence):
            sid = row['stop_id']
            if i + 1 < len(sequence):
                next_id = sequence[i + 1]['stop_id']
                next_by_stop[sid][route_id].add(stops[next_id]['stop_name'])
                evidence[sid].append({'route_id': route_id, 'trip_id': tid, 'stop_sequence': row['stop_sequence'], 'next_stop_id': next_id})
            else:
                terminal[sid].add(route_id)
    targets = [f for f in municipal if f['properties']['source_namespace'] == namespace]
    added = 0
    for feature in targets:
        id = feature['id']
        sid = feature['properties']['source_stop_id']
        raw = stops[sid]
        origin = [float(raw['stop_lon']), float(raw['stop_lat'])]
        assert raw['stop_name'] == feature['properties']['name'] and origin == feature['geometry']['coordinates'], id
        if id in study['guides']:
            assert study['guides'][id]['source_coordinates'] == origin
            continue
        rows = [{'route': routes[rid]['route_long_name'], 'text': '・'.join(sorted(names)) + '方面', 'next_stops': sorted(names)}
                for rid, names in sorted(next_by_stop[sid].items())]
        next_names = sorted({name for names in next_by_stop[sid].values() for name in names})
        summary = '・'.join(next_names) + '方面' if next_names else 'この資料の路線では終点として登録'
        row = {'group_id': namespace + ':' + raw['stop_name'], 'number': raw.get('platform_code') or None,
               'role': 'boarding', 'summary': summary, 'directions': rows,
               'source_url': source_url, 'guide_url': guide_url,
               'evidence': 'stop-sequence', 'source_coordinates': origin}
        if namespace == 'iwakuni' and raw['stop_name'] == '岩国駅':
            row['guide_url'] = 'https://iwakunibus.notion.site/02e27ab3fa0d4454b39a41dd56cf8b8a'
            row['guide_label'] = '公式のりば案内'
            row['location_description'] = '市の2登録点は約1mの差。公式のりば番号との対応は未特定です。'
        elif namespace == 'iwakuni' and raw['stop_name'] == '新岩国駅':
            row['location_description'] = '市の登録点をそのまま表示しています。駅前の公式番号との対応は未特定です。'
        if namespace == 'iwakuni' and any('由宇地区' in routes[rid]['route_long_name'] for rid in next_by_stop[sid] | {rid: set() for rid in terminal[sid]}):
            row['guide_url'] = 'https://www.city.iwakuni.lg.jp/soshiki/61/115174.html'
            row['data_notice'] = '方面は2026年4月の資料によります。5月新設のマルキュウ由宇店の停留所は未収録です。'
        if namespace == 'hikari' and all(rid in ['2','3','4','5','6'] for rid in next_by_stop[sid]):
            row['guide_url'] = 'https://www.city.hikari.lg.jp/soshiki/11/kokyokotsu/1/1/9452.html'
        study['guides'][id] = row
        added += 1
        ledger.append({'id': id, 'name': raw['stop_name'], 'origin': origin, 'platform_code': raw.get('platform_code',''),
                       'next_stops': next_names, 'terminal_routes': sorted(terminal[sid]), 'evidence': evidence[sid],
                       'source_url': source_url, 'notice': row.get('data_notice')})
    feed_receipts.append({'namespace': namespace, 'file': str(path.relative_to(ROOT)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                          'source_stops': len(stops), 'selected_original_points': len(targets), 'added': added,
                          'held_records': [{'source_stop_id': sid, 'name': r['stop_name']}
                             for sid, r in stops.items() if sid not in {f['properties']['source_stop_id'] for f in targets}]})

# Same-name selection remains a source-record choice, not a physical merge.
# When adjacent points have the same next-stop label, retain route differences.
groups = collections.defaultdict(list)
for id, row in study['guides'].items():
    groups[row['group_id']].append((id, row))
for group in groups.values():
    counts = collections.Counter(row['summary'] for _, row in group)
    for id, row in group:
        if id in original_guide_ids or counts[row['summary']] < 2:
            continue
        names = [d['route'] for d in row['directions']]
        if names:
            row['summary'] += '（' + names[0] + (f'ほか{len(names)-1}路線' if len(names)>1 else '') + '）'

APP.write_text(json.dumps(study, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
(OUT / 'locations.json').write_text(json.dumps(ledger, ensure_ascii=False, indent=2), encoding='utf-8')
(OUT / 'source-manifest.json').write_text(json.dumps(feed_receipts, ensure_ascii=False, indent=2), encoding='utf-8')
summary = {'existing_points_preserved': len(original_guide_ids),
           'added_points': len(ledger), 'total_guides': len(study['guides']), 'sources': feed_receipts}
(OUT / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False))
