"""国土数値情報 P11 からバス停データを作る。座標5桁で同一地点を統合する。

    python3 scripts/build-bus-stops.py

名称を統合の鍵に含めない。同一座標に載る420グループのうち名称が食い違うのは
25件だけで、その中身は「斉木病院前 / 斎木病院前」のような表記ゆれ・誤字・
事業者ごとの表記差だった。名称を鍵にすると、そのせいで同一地点が分かれて残る。
"""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'raw_data/P11-22_35.geojson'

spec = importlib.util.spec_from_file_location('bake', Path(__file__).with_name('bake-walking.py'))
bake = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bake)


def main():
    raw = json.loads(SOURCE.read_text(encoding='utf-8'))['features']
    groups = {}
    for f in raw:
        lon, lat = f['geometry']['coordinates']
        groups.setdefault(bake.stop_id(lon, lat), []).append(f)

    features = []
    for sid, members in groups.items():
        names, operators, routes = [], [], []
        for f in members:
            p = f['properties']
            for value, bucket in ((p.get('P11_001'), names), (p.get('P11_002'), operators)):
                if value and value not in bucket:
                    bucket.append(value)
            for i in range(1, 36):
                route = p.get(f'P11_003_{i:02d}')
                if route and route not in routes:
                    routes.append(route)
        lon, lat = (round(v, 5) for v in members[0]['geometry']['coordinates'])
        features.append({
            'type': 'Feature', 'id': sid,
            'properties': {'name': names[0], 'names': names,
                           'operators': sorted(operators), 'routes': sorted(routes)},
            'geometry': {'type': 'Point', 'coordinates': [lon, lat]},
        })

    features.sort(key=lambda f: f['id'])
    # Keep bus_stop.geojson as the OSM source for the existing pilot/comparison.
    out = ROOT / 'public/data/baked-bus-stops.geojson'
    out.write_text(json.dumps({
        'type': 'FeatureCollection',
        'source': '国土数値情報 バス停留所データ（P11-22_35）',
        'source_url': 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P11-2022.html',
        'attribution': '出典：国土交通省国土数値情報ダウンロードサイト',
        'license': 'CC-BY-4.0',
        'note': '同一座標（小数5桁）の記録を1件に統合し、名称・事業者・系統をまとめた',
        'timestamp': '2022年度（令和4年度）',
        'features': features,
    }, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(json.dumps({'source': len(raw), 'stops': len(features),
                      'merged': len(raw) - len(features),
                      'bytes': out.stat().st_size}, ensure_ascii=False))


if __name__ == '__main__':
    main()
