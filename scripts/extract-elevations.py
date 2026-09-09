"""bake-walking.pyがDEMタイルから実際に読む標高値だけを、呼び出し順のまま抜き出す。

タイル(raw_data/dem, 543MB)は1km四方=65,536点をまるごと持つが、焼き込みが読むのは
そのうち0.31%だけ。ここで抜いた並びを raw_data/elevations.json に書けば、以後の
焼き込みはタイル無しでも動く（bake-walking.py の ElevationTable が読む）。

並び順は prepare_graph の結果に対して apply_grades が辿る順そのものであり、
座標そのものは持たない。同じ prepare_graph を bake-walking.py 側でも呼ぶ限り、
何番目の呼び出しかが両者で一致する——が、それは将来ここが変わらない前提に
乗っているだけなので、graph_fingerprint(グラフの並び順のSHA-256)も一緒に
書き出す。焼き込み側の ElevationTable はこれを照合し、ずれていれば例外を出す。
標準ライブラリのみで動く。
"""
import importlib.util
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location('bake_walking', Path(__file__).with_name('bake-walking.py'))
_bake = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_bake)

class _Recorder:
    """Elevation.at()と同じ形で呼ばれ、返した値を呼ばれた順にためるだけ。"""
    def __init__(self, elevation):
        self.elevation = elevation
        self.values = []

    def at(self, lon, lat):
        value = self.elevation.at(lon, lat)
        self.values.append(value)
        return value

if __name__ == '__main__':
    graph, stops, edges_before_prune, edges_after_prune = _bake.prepare_graph(root)
    elevation = _bake.Elevation(root / 'raw_data/dem', pause=0.25, max_requests=8000)
    recorder = _Recorder(elevation)
    _bake.apply_grades(graph, recorder)

    fingerprint = _bake.graph_fingerprint(graph)
    out = root / 'raw_data/elevations.json'
    out.write_text(json.dumps({'fingerprint': fingerprint, 'values': recorder.values},
                              separators=(',', ':')), encoding='utf-8')
    print(json.dumps({'entries': len(recorder.values), 'bytes': out.stat().st_size,
                      'fingerprint': fingerprint, 'elevation': elevation.stats()},
                     ensure_ascii=False))
