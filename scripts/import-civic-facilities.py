"""Rebuild additional civic places from retained official CSVs, without geocoding."""
import csv
import hashlib
import io
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data-sources/civic-facilities-20260914'


def norm(value):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', value))


def name_key(name, category):
    if category in ('childcare', 'school'):
        name = re.sub(r'^(下松市立|市立)', '', name)
    return norm(name)


def distance(a, b):
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    value = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(math.radians(b[0]-a[0])/2)**2
    return 12742000 * math.asin(min(1, math.sqrt(value)))


def in_ring(point, ring):
    x, y = point
    inside = False
    for (ax, ay), (bx, by) in zip(ring, ring[1:]):
        if (ay > y) != (by > y) and x < (bx-ax)*(y-ay)/(by-ay)+ax:
            inside = not inside
    return inside


def same_location(point, geometry, limit=25):
    if geometry['type'] == 'Point':
        return distance(point, geometry['coordinates']) <= limit
    return any(in_ring(point, rings[0]) and not any(in_ring(point, h) for h in rings[1:]) for rings in geometry['coordinates'])


def safe_url(value):
    parsed = urlsplit(value)
    return value if parsed.scheme in ('https', 'http') and parsed.hostname and not parsed.username and not parsed.password else ''


def read_source(filename):
    path = SOURCE / filename
    receipt = json.loads(path.with_suffix('.receipt.json').read_text(encoding='utf-8'))
    content = path.read_bytes()
    assert hashlib.sha256(content).hexdigest() == receipt['sha256'], filename
    try:
        text = content.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = content.decode('cp932')
    rows = [{k: (v or '').strip() for k, v in row.items()} for row in csv.DictReader(io.StringIO(text))]
    metadata = json.loads((SOURCE / (receipt['dataset']+'-metadata.json')).read_text(encoding='utf-8'))['result']
    assert metadata['license_id'] == 'cc-by'
    return rows, receipt, metadata


def build():
    old = json.loads((ROOT / 'public/data/shopping.geojson').read_text(encoding='utf-8'))['features']
    index = defaultdict(list)
    for f in old:
        p = f['properties']
        index[(p['category'], name_key(p['name'], p['category']))].append(f)
    records, audit = [], []
    groups = {}
    # Newer city records take precedence over older records with matching name/location.
    files = ['352071_preschool.csv', '352071_educational_institution.csv', '352071_park.csv', '352071_care_service.csv', '350001_care_service_pref.csv', '350001_care_service_city_town.csv']
    raw_counts = {}
    for filename in files:
        rows, receipt, metadata = read_source(filename)
        raw_counts[filename] = len(rows)
        if metadata['version']:
            assert re.fullmatch(r'\d{6}', metadata['version'])
            date = metadata['version'][:4]+'-'+metadata['version'][4:6]
        else:
            assert metadata['name'] == 'care_service' and '令和6年2月1日現在' in metadata['notes']
            date = '2024-02-01'
        publisher = '下松市' if filename.startswith('352071') else '山口県'
        for number, row in enumerate(rows, 1):
            source_id = f"civic:{receipt['resource_id']}:row:{number}"
            status = {'file': filename, 'row': number, 'source_id': source_id}
            name = row.get('名称') or row.get('公園_名称') or row.get('教育機関_学校名') or row.get('介護サービス事業所名称')
            category = 'park' if 'park.' in filename else 'childcare' if 'preschool.' in filename else 'school' if 'educational_' in filename else 'social_facility'
            if category == 'school' and row['教育機関_学校種'].startswith(('A1', 'A2')):
                category = 'childcare'
            if row.get('教育機関_属性情報廃止年月日'):
                audit.append({**status, 'status': 'excluded', 'reason': '学校コード廃止日の記載あり'}); continue
            try:
                point = [float(row['経度']), float(row['緯度'])]
            except (ValueError, KeyError):
                audit.append({**status, 'status': 'excluded', 'reason': '座標なし'}); continue
            if not name or not (130 < point[0] < 133 and 33 < point[1] < 35):
                audit.append({**status, 'status': 'excluded', 'reason': '名称・座標が対象外'}); continue
            address = row.get('所在地_連結表記') or row.get('住所') or row.get('公園_所在地') or ''.join(row.get('教育機関_学校所在地（'+k+'）', '') for k in ('市区町村', '町字', '番地以下'))
            city = row.get('所在地_市区町村') or re.match(r'^(?:山口県)?(.+?[市町村])', address).group(1)
            row_id = row.get('ID') or row.get('公園_ID') or row.get('教育機関_学校コード')
            group_key = (row.get('事業所番号'), norm(address), tuple(point)) if row.get('事業所番号') else None
            if group_key and group_key in groups:
                feature = groups[group_key]
                status.update(status='merged', target=feature['id'], reason='事業所番号・住所・座標が一致')
            else:
                key = (category, name_key(name, category))
                matches = [f for f in index[key] if same_location(point, f['geometry'])]
                if matches:
                    audit.append({**status, 'status': 'duplicate', 'target': matches[0]['id'], 'reason': '同分類・正規化名称が一致し、25m以内または既存範囲内'}); continue
                fid = 'civic-'+(row_id if row_id else 'care-'+row['事業所番号']+'-'+hashlib.sha256(json.dumps(group_key, ensure_ascii=False).encode()).hexdigest()[:10])
                p = dict(name=name, city=city, address=address, official_address='', official_url='', website=safe_url(row.get('URL', '')), geometry_kind='representative_point', source_timestamp=date, source_ids=[], verified_at='', verification_status='civic_unverified', retrieved_at=receipt['retrieved_at'], license='CC-BY-4.0', source='自治体オープンデータ', category=category, civic_sources=[], registered_details={'sources': []}, civic_details=[])
                feature = {'type': 'Feature', 'id': fid, 'properties': p, 'geometry': {'type': 'Point', 'coordinates': point}}
                records.append(feature); index[key].append(feature)
                if group_key:
                    groups[group_key] = feature
                status.update(status='added', target=fid)
            p = feature['properties']
            p['source_ids'].append(source_id)
            p['registered_details']['sources'].append({'source_id': source_id, 'source_timestamp': date, 'retrieved_at': receipt['retrieved_at']})
            source = {'publisher': publisher, 'title': metadata['title'], 'url': 'https://yamaguchi-opendata.jp/ckan/dataset/'+metadata['name'], 'date': date}
            if source not in p['civic_sources']:
                p['civic_sources'].append(source)
            p['search_names'] = ' '.join(dict.fromkeys(filter(None, [p.get('search_names', ''), name, row.get('名称_カナ'), row.get('公園_名称（カナ）'), row.get('教育機関_学校名カナ表記'), row.get('介護サービス事業所名称_カナ')])))
            for field, value in [('phone', row.get('電話番号') or row.get('教育機関_連絡先電話番号')), ('operator', row.get('法人の名称') or row.get('団体名')), ('service', row.get('実施サービス') or row.get('種別') or row.get('公園_説明') or row.get('教育機関_学校種'))]:
                if value and value not in p['registered_details'].get(field, []):
                    p['registered_details'].setdefault(field, []).append(value)
            for label, value in [('遊具', row.get('公園_遊具')), ('トイレ', row.get('公園_トイレ')), ('駐車場', row.get('公園_駐車場') or row.get('駐車場情報')), ('受入年齢', row.get('受入年齢')), ('利用曜日', row.get('利用可能曜日')), ('利用時間', '〜'.join(filter(None, [row.get('開始時間'), row.get('終了時間')]))), ('利用日時の補足', row.get('利用可能日時特記事項') or row.get('利用可能曜日特記事項')), ('一時預かり', row.get('一時預かりの有無')), ('病児保育', row.get('病児保育の有無'))]:
                if value and not any(d['label'] == label and d['value'] == value for d in p['civic_details']):
                    p['civic_details'].append({'label': label, 'value': value, 'source_id': source_id})
            audit.append(status)
    assert len({f['id'] for f in records}) == len(records)
    result = {'type': 'FeatureCollection', 'features': records}
    report = {'raw_counts': raw_counts, 'counts': dict(Counter(a['status'] for a in audit)), 'categories': dict(Counter(f['properties']['category'] for f in records)), 'features': len(records), 'rows': audit}
    return result, report


if __name__ == '__main__':
    collection, report = build()
    (ROOT / 'public/data/civic-facilities.geojson').write_text(json.dumps(collection, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
    (SOURCE / 'import-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k != 'rows'}, ensure_ascii=False, indent=2))
