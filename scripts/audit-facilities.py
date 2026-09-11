"""Reconcile every facility with the saved extract and record non-destructive candidates."""
from pathlib import Path
from collections import Counter
import csv, hashlib, importlib.util, json, math, re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'data-sources/facility-audit-20260912'
DRUG_NAME = 'ドラッグ|コスモス|ウォンツ|クスリ岩崎|くすりの|ココカラファイン|セガミ'
CONVENIENCE_NAME = 'ローソン|セブン.?イレブン|ファミリーマート'
spec = importlib.util.spec_from_file_location('importer', Path(__file__).with_name('import-osm-facilities.py'))
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)

def representative(feature):
    """Candidate-screening coordinate only, never an entrance or a containment test."""
    g = feature['geometry']
    if g['type'] == 'Point':
        return g['coordinates'], 'original_node' if feature['properties']['source_ids'][0].startswith('node/') else 'saved_representative_point'
    points = [point for polygon in g['coordinates'] for ring in polygon for point in ring]
    return [(min(p[i] for p in points)+max(p[i] for p in points))/2 for i in (0,1)], 'curated_geometry_bbox_center_for_screening_only'

def distance(a, b):
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 12742000 * math.asin(min(1, math.sqrt(h)))

def duplicate_candidates(features):
    points = [representative(f) for f in features]
    rows = []
    for i, a in enumerate(features):
        for j in range(i+1, len(features)):
            b = features[j]
            pa, pb = a['properties'], b['properties']
            meters = distance(points[i][0], points[j][0])
            same_name = importer.normalized_name(pa['name']) == importer.normalized_name(pb['name'])
            shared = sorted(set(pa['source_ids']) & set(pb['source_ids']))
            if not (shared or (same_name and meters <= 1000) or (pa['category'] == pb['category'] and meters <= 75)):
                continue
            if shared:
                rule, reason = 'shared_source', '同じOSM要素を参照。原本とIDの履歴を確認するまで統合しない。'
            elif same_name:
                rule = 'same_name_within_1000m'
                reason = '名称と代表位置の近さだけでは同一施設と確定できない。敷地と建物の別登録、同名支店を確認する必要がある。'
                if meters > 150:
                    reason = '同名でも代表位置が150mを超えて離れている。支店名未登録・位置の誤り・同一敷地の別建物を区別できない。'
            else:
                rule, reason = 'same_category_within_75m', '名称が異なる近接記録。別施設・館内テナント・旧名の可能性があり、距離だけでは統合できない。'
            rows.append(dict(id_a=a['id'], name_a=pa['name'], category_a=pa['category'], source_a=';'.join(pa['source_ids']),
                id_b=b['id'], name_b=pb['name'], category_b=pb['category'], source_b=';'.join(pb['source_ids']),
                distance_m=round(meters,1), coordinate_basis_a=points[i][1], coordinate_basis_b=points[j][1],
                rule=rule, priority='high' if shared or meters <= 20 or (same_name and meters <= 150) else 'normal',
                status='pending', reason=reason, action='ID維持・未統合'))
    return rows

def classification_flags(feature, element):
    p, tags = feature['properties'], element.get('tags', {})
    flags = []
    codes = {importer.category({k:tags[k]}) for k in ('shop','amenity','healthcare') if k in tags} - {None}
    if len(codes) > 1: flags.append('OSM分類タグが複数の分類を示す')
    if tags.get('name:ja') and tags.get('name') and importer.normalized_name(tags['name:ja']) != importer.normalized_name(tags['name']):
        flags.append('nameとname:jaが異なる（翻訳・別名か誤記かは未確定）')
    name, category = p['name'], p['category']
    if category in ('hospital','clinic') and re.search('動物|整骨|接骨|鍼灸', name): flags.append('人の医科・歯科の分類と施設名が不整合の可能性')
    if category == 'hospital' and re.search('歯科|デンタル', name): flags.append('病院分類だが歯科診療所の可能性')
    if category == 'clinic' and '病院' in name: flags.append('診療所分類と病院という名称の不一致')
    if category != 'drugstore' and re.search(DRUG_NAME, name): flags.append('ドラッグストアを示唆する名称だが店舗種別の確認が必要')
    if category != 'convenience' and re.search(CONVENIENCE_NAME, name): flags.append('コンビニを示唆する名称だが店舗種別の確認が必要')
    if category == 'supermarket' and re.search('銀行|Best|SC|ショッピングセンター', name): flags.append('スーパー分類と館・テナントの名称が混在する可能性')
    if '内閣' in name: flags.append('名称の誤記候補（移転・改称も照合が必要）')
    return flags

def write_csv(name, rows):
    with (OUT/name).open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]), lineterminator='\n')
        writer.writeheader(); writer.writerows(rows)
    with (OUT/name).open(encoding='utf-8-sig', newline='') as stream:
        restored = list(csv.DictReader(stream))
    assert len(restored) == len(rows)
    for row, readback in zip(rows, restored):
        assert all(str(value) == readback[key] for key,value in row.items())

def triage(feature, element):
    p, tags = feature['properties'], element.get('tags', {})
    retained_aliases = {'osm-node-4315767097', 'osm-way-549063054', 'osm-way-862156891', 'osm-way-862156921'}
    if feature['id'] in retained_aliases:
        return 'retained', '原本のnameとname:jaは支店名の有無・表記の差。分類タグは一致し、長い名称もsearch_namesに残っているため今回は変更不要。店舗の公式照合を意味しない。'
    if feature['id'] == 'osm-way-305489114':
        return 'pending', 'name=サンリブ、name:ja=ABC Mart、branch=下松店が混在。既存サンリブ下松から代表点間11.6mだが、建物と靴店テナントのどちらを指すか不明。既存IDの形状を優先し、両IDを維持して保留。'
    if feature['id'] == 'osm-way-297142744':
        return 'pending', 'name=イオン防府店、name:ja=イオンモールが混在。館名・個店名の対象範囲を未照合。登録の日本語名を維持し、現地のモール種別を断定しない。'
    if '内閣' in p['name']:
        return 'pending', '内科の誤記候補だが、周南市の同名医院に移転・改称情報もある。現行公式資料とこのOSM位置の対応を確定していないため、旧位置へ新名称だけを付けない。'
    if '銀行' in p['name'] or p['name'] == 'Best':
        return 'pending', 'スーパーのタグと、館内テナント等を指す可能性のある名称が混在。対象要素の範囲・正式店舗名を未照合のため、名称だけで銀行・家電店へ変更しない。'
    if tags.get('shop') == 'supermarket' and tags.get('amenity') == 'pharmacy':
        return 'pending', 'shop=supermarketとamenity=pharmacyが併記され、名称はコスモスのみ。支店と対象要素を特定した公式店舗照合を行っていないため、取込優先順によるスーパー分類を維持。'
    if p['category'] == 'clinic' and '病院' in p['name']:
        return 'pending', 'OSMのdoctors/doctor分類と病院という名称が不一致。名称だけでは施設種別を決めず、現行公式資料との個別照合まで診療所分類を維持。'
    if re.search(DRUG_NAME, p['name']):
        return 'pending', 'ドラッグストアを示唆する名称だが、店舗と調剤薬局の併設関係・対象OSM要素の範囲を公式店舗資料で個別照合していない。チェーン名だけで分類を変更しない。'
    if re.search(CONVENIENCE_NAME, p['name']):
        return 'pending', 'コンビニのブランドを示唆する名称だが別のshopタグが付いている。名称だけでは業態を決めず、支店・公式店舗資料との照合まで原本分類を維持。'
    return 'pending', '個店とショッピングセンターの名称・範囲を未照合。保存原本の分類は再現できるが、名称だけで別分類へ変更せず保留。'

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    raw_path = importer.WORK/'osm-facilities.json'
    raw = json.loads(raw_path.read_text(encoding='utf-8'))
    curated = json.loads((importer.WORK/'curated-facilities.geojson').read_text(encoding='utf-8'))
    retrieval = json.loads((importer.WORK/'retrieval.json').read_text(encoding='utf-8'))
    reviews = importer.load_reviews()
    source_hash = hashlib.sha256(raw_path.read_bytes()).hexdigest()
    assert source_hash == retrieval['sha256'] == reviews['source_sha256']
    baseline, skipped = importer.build(raw, curated, retrieval['retrieved_at'])
    rebuilt, _ = importer.build(raw, curated, retrieval['retrieved_at'], reviews['reviews'])
    current = json.loads((ROOT/'public/data/shopping.geojson').read_text(encoding='utf-8'))
    assert current == rebuilt
    assert current['features'][:len(curated['features'])] == curated['features']
    assert [f['id'] for f in current['features']] == [f['id'] for f in baseline['features']]
    raw_by_id = {f"{e['type']}/{e['id']}":e for e in raw['elements']}
    current_by_id = {f['id']:f for f in current['features']}
    reviewed_by_id = {r['id']:r for r in reviews['reviews']}
    checks, classifications = [], []
    for f in baseline['features']:
        p, after = f['properties'], current_by_id[f['id']]
        assert f['geometry'] == after['geometry']
        imported = p.get('verification_status') == 'osm_unverified'
        e = raw_by_id.get(p['source_ids'][0])
        flags = classification_flags(f, e) if imported else []
        review = reviewed_by_id.get(f['id'])
        status, reason = (review['status'], review['note']) if review else triage(f, e) if flags else ('no_rule_flag', '')
        checks.append(dict(id=f['id'], name=p['name'], source_ids=';'.join(p['source_ids']),
            source_match='saved_osm_element' if imported else 'curated_snapshot_unchanged',
            original_category=p['category'], current_category=after['properties']['category'],
            geometry_preserved=True, id_preserved=True, status=status))
        if flags or review:
            classifications.append(dict(id=f['id'], original_name=p['name'], current_name=after['properties']['name'],
                original_category=p['category'], current_category=after['properties']['category'],
                source_id=p['source_ids'][0], raw_tags=json.dumps(e.get('tags',{}),ensure_ascii=False,sort_keys=True),
                flags=';'.join(flags), status=status, reason=reason,
                evidence_url=review.get('evidence_url','') if review else ''))
    duplicates = duplicate_candidates(baseline['features'])
    write_csv('record-checks.csv', checks)
    write_csv('duplicate-candidates.csv', duplicates)
    write_csv('classification-review.csv', classifications)
    summary = dict(date='2026-09-12', baseline_implementation_commit='be5e421bdfea979945dbe3ddc5510ee8d07bb51a',
        source_sha256=source_hash, source_timestamp=raw['osm3s']['timestamp_osm_base'],
        raw_elements=len(raw['elements']), records=len(checks), curated_preserved=len(curated['features']),
        baseline_categories=dict(Counter(f['properties']['category'] for f in baseline['features'])),
        current_categories=dict(Counter(f['properties']['category'] for f in current['features'])),
        unchanged_ids_and_geometries=len(checks), source_ids_unique=len({sid for f in current['features'] for sid in f['properties']['source_ids']}) == sum(len(f['properties']['source_ids']) for f in current['features']),
        duplicate_candidates=len(duplicates), duplicate_priorities=dict(Counter(r['priority'] for r in duplicates)),
        duplicate_rules=dict(Counter(r['rule'] for r in duplicates)), merged_or_deleted_records=0,
        classification_candidates=len(classifications), classification_statuses=dict(Counter(r['status'] for r in classifications)),
        skipped=dict(Counter(r['reason'] for r in skipped)),
        limitations=['距離は候補抽出用の代表点間距離であり、入口・歩行距離ではない。',
          '名称はNFKC・空白除去・小文字化で比較。同名1000m以内または同分類75m以内を抽出。範囲外の重複不存在は保証しない。',
          '分類候補はタグ矛盾と名称の手掛かりによる点検。全施設の公式確認・現在の営業確認は未実施。',
          '既存公式照合22件は原本との完全一致を確認し、OSMタグで上書きしていない。',
          '重複候補は変更前の1135件から抽出し、分類修正で候補が消えないよう固定した。'],
        sha256={name:hashlib.sha256((OUT/name).read_bytes()).hexdigest() for name in ('record-checks.csv','duplicate-candidates.csv','classification-review.csv','reviews.json')})
    (OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps(summary,ensure_ascii=False,indent=2))

if __name__ == '__main__': main()
