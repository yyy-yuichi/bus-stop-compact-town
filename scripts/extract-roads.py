"""Geofabrikの中国地方PBFから、山口県範囲の歩ける道路を抜き出す。

osmium を使うのはこのファイルだけ。以降の処理は標準ライブラリで動く。
    python3 -m pip install -r requirements.txt
    python3 scripts/extract-roads.py
"""
import hashlib
import importlib.util
import json
import shutil
import sys
import urllib.request
from pathlib import Path

import osmium

ROOT = Path(__file__).resolve().parents[1]
PBF_URL = 'https://download.geofabrik.de/asia/japan/chugoku-latest.osm.pbf'
PBF_PATH = ROOT / 'work/chugoku-latest.osm.pbf'
BBOX = [130.80, 33.85, 132.40, 34.55]   # 山口県を覆う範囲。バス停の分布より余裕を持たせる
KEEP = {'highway', 'area', 'foot', 'access', 'foot:conditional', 'access:conditional',
        'oneway:foot:conditional', 'barrier', 'oneway:foot', 'foot:forward',
        'foot:backward', 'bridge', 'tunnel', 'layer'}

spec = importlib.util.spec_from_file_location('builder', Path(__file__).with_name('build-walking-pilot.py'))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class Roads(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways = []
        self.wanted = set()
        self.nodes = {}
        self._seen_ways = set()  # apply_file runs twice on this handler; way() fires both times.

    def way(self, w):
        if w.id in self._seen_ways:
            return
        tags = {k: v for k, v in w.tags if k in KEEP}
        if 'highway' not in tags or not builder.can_walk(tags):
            return
        self._seen_ways.add(w.id)
        refs = [str(n.ref) for n in w.nodes]
        self.ways.append({'id': str(w.id), 'refs': refs, 'tags': tags})
        self.wanted.update(refs)

    def node(self, n):
        key = str(n.id)
        if key not in self.wanted:
            return
        lon, lat = n.location.lon, n.location.lat
        if BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]:
            self.nodes[key] = [round(lon, 7), round(lat, 7)]
            tags = {k: v for k, v in n.tags if k in KEEP}
            if tags:
                self.nodes[key].append(tags)


def ensure_pbf(path=PBF_PATH, url=PBF_URL):
    """無ければ1回だけ取得する。Geofabrikは1日1回しか更新されないので取り直さない。"""
    path = Path(path)
    if path.exists():
        print(f'既にある: {path} ({path.stat().st_size / 1024 / 1024:.0f}MB)', file=sys.stderr)
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(path.name + '.part')
    print(f'取得: {url}', file=sys.stderr)
    with urllib.request.urlopen(url, timeout=600) as response, open(partial, 'wb') as out:
        shutil.copyfileobj(response, out)
    # 途中で落ちたファイルを「取得済み」と誤認して使わないよう、完了後に改名する。
    partial.rename(path)
    print(f'保存: {path} ({path.stat().st_size / 1024 / 1024:.0f}MB)', file=sys.stderr)
    return path


def main(pbf=None):
    pbf = ensure_pbf(pbf or PBF_PATH)
    handler = Roads()
    handler.apply_file(str(pbf))          # 1周目: way を拾い、必要なノードIDを集める
    handler.apply_file(str(pbf))          # 2周目: そのノードの座標とタグを拾う
    result = {
        'source_url': 'https://download.geofabrik.de/asia/japan/chugoku-latest.osm.pbf',
        'source_sha256': hashlib.sha256(pbf.read_bytes()).hexdigest(),
        'retrieved_at': __import__('datetime').date.today().isoformat(),
        'license': 'ODbL-1.0',
        'attribution': '© OpenStreetMap contributors',
        'bbox': BBOX,
        'nodes': handler.nodes,
        'ways': [w for w in handler.ways if any(r in handler.nodes for r in w['refs'])],
    }
    out = ROOT / 'raw_data/yamaguchi-roads.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(json.dumps({'ways': len(result['ways']), 'nodes': len(result['nodes']),
                      'bytes': out.stat().st_size}, ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1] if sys.argv[1:] else None)
