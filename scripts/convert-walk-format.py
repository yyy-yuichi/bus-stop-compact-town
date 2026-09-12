"""既存の焼き込み済み徒歩圏（GeoJSON）を配列形式(.json)へ変換する。

再焼き込みは1時間超かかり、既存の出力は正しいので、変換で済ませる。
1停留所ぶんを読み、[lon1,lat1,lon2,lat2,d1,d2,grade,steps]の配列形式で書き出し、
その場で元のFeatureCollectionと突き合わせて無損失を確認してから元ファイルを消す。
標準ライブラリのみで動く。
"""
import json
import sys
from pathlib import Path


def geojson_to_array(fc):
    """旧FeatureCollectionを新配列形式へ変換する。"""
    origin = snap = None
    gap = 0.0
    seg = []
    for f in fc['features']:
        role = f['properties']['role']
        if role == 'stop':
            origin = f['geometry']['coordinates']
        elif role == 'snap':
            snap = f['geometry']['coordinates'][1]
            gap = f['properties']['gap']
        elif role == 'segment':
            (lon1, lat1), (lon2, lat2) = f['geometry']['coordinates']
            p = f['properties']
            seg.append([lon1, lat1, lon2, lat2, p['d1'], p['d2'], p['grade'],
                        1 if p['steps'] else 0])
    return {'v': 1, 'id': fc['stop_id'], 'budget': fc['budget'],
            'origin': origin, 'snap': snap, 'gap': gap, 'seg': seg}


def check_lossless(fc, new):
    """変換前後で座標・d1・d2・grade・steps・origin・snap・gap・budgetが一致することを確かめる。"""
    assert new['id'] == fc['stop_id'], 'id mismatch'
    assert new['budget'] == fc['budget'], 'budget mismatch'
    old_segments = [f for f in fc['features'] if f['properties']['role'] == 'segment']
    old_stop = next(f for f in fc['features'] if f['properties']['role'] == 'stop')
    old_snap = next(f for f in fc['features'] if f['properties']['role'] == 'snap')
    assert new['origin'] == old_stop['geometry']['coordinates'], 'origin mismatch'
    assert new['snap'] == old_snap['geometry']['coordinates'][1], 'snap mismatch'
    assert new['gap'] == old_snap['properties']['gap'], 'gap mismatch'
    assert len(new['seg']) == len(old_segments), 'segment count mismatch'
    for row, f in zip(new['seg'], old_segments):
        (lon1, lat1), (lon2, lat2) = f['geometry']['coordinates']
        p = f['properties']
        assert row == [lon1, lat1, lon2, lat2, p['d1'], p['d2'], p['grade'],
                        1 if p['steps'] else 0], f'segment mismatch: {row} vs {f}'


def convert_dir(src_dir, keep_old=False):
    files = sorted(Path(src_dir).glob('*.geojson'))
    converted = 0
    for path in files:
        fc = json.loads(path.read_text(encoding='utf-8'))
        new = geojson_to_array(fc)
        check_lossless(fc, new)   # 消す前に必ず検査する。
        out_path = path.with_suffix('.json')
        out_path.write_text(json.dumps(new, ensure_ascii=False, separators=(',', ':')),
                            encoding='utf-8')
        if not keep_old:
            path.unlink()
        converted += 1
    return converted


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    src = Path(sys.argv[1]) if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else root / 'work/walk'
    keep_old = '--keep-old' in sys.argv
    n = convert_dir(src, keep_old=keep_old)
    total_bytes = sum(p.stat().st_size for p in Path(src).glob('*.json'))
    print(json.dumps({'converted': n, 'checked_lossless': n, 'dir': str(src),
                      'total_json_bytes': total_bytes}, ensure_ascii=False))
