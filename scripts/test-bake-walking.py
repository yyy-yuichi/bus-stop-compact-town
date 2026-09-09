import importlib.util
from pathlib import Path
import math

p = Path(__file__).with_name('bake-walking.py')
spec = importlib.util.spec_from_file_location('bake', p)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

INF = math.inf

# 片方向・片端だけ到達。バジェットで途中まで。
# f(t) = 100 + 200t, budget 150 -> t <= 0.25
r = m.clip_edge(100.0, INF, 200.0, True, False, 150.0)
assert len(r) == 1, r
lo, hi, vlo, vhi = r[0]
assert abs(lo - 0.0) < 1e-9 and abs(hi - 0.25) < 1e-9, r
assert abs(vlo - 100.0) < 1e-6 and abs(vhi - 150.0) < 1e-6, r

# 両方向・両端到達で内部に山型の頂点。
# d_a=100, d_b=120, L=40 -> t* = (120-100+40)/(2*40) = 0.75, 頂点 = (100+120+40)/2 = 130
r = m.clip_edge(100.0, 120.0, 40.0, True, True, 1000.0)
assert len(r) == 2, r
assert abs(r[0][1] - 0.75) < 1e-9, r
assert abs(r[0][3] - 130.0) < 1e-6, r
assert abs(r[1][2] - 130.0) < 1e-6 and abs(r[1][3] - 120.0) < 1e-6, r

# 山型がないとき（差が区間長以上）は分割しない。
r = m.clip_edge(100.0, 200.0, 40.0, True, True, 1000.0)
assert len(r) == 1, r

# 出発点が区間の内部にある場合、その点でも分割する（谷型の底）。
r = m.clip_edge(INF, INF, 100.0, True, True, 1000.0, snap=(0.5, 0.0))
assert len(r) == 2, r
assert abs(r[0][1] - 0.5) < 1e-9, r
assert abs(r[0][3] - 0.0) < 1e-6, r   # スナップ点の距離は gap そのもの
assert abs(r[1][3] - 50.0) < 1e-6, r  # 端まで 50m

# どこにも届かなければ空。
assert m.clip_edge(INF, INF, 100.0, True, True, 50.0) == []

# スナップ点の谷と、別ルートで到達した端点からの直線が交わる点も折れ点になる。
# ここを分割しないと、区間の内部で距離が線形でなくなる。
r = m.clip_edge(20.0, INF, 100.0, True, True, 1000.0, snap=(0.5, 0.0))
peak = [p for p in r if abs(p[0] - 0.15) < 1e-9]
assert peak, f'交点 t=0.15 で分割されていない: {r}'
assert abs(peak[0][2] - 35.0) < 1e-6, peak

# 片方向だけ歩ける場合も扱えること。
r = m.clip_edge(INF, 100.0, 200.0, False, True, 150.0)
assert len(r) == 1, r
assert abs(r[0][3] - 100.0) < 1e-6 and abs(r[0][2] - 150.0) < 1e-6, r

# 長さ0の区間で例外を出さないこと。
assert m.clip_edge(10.0, 10.0, 0.0, True, True, 100.0) == [(0.0, 1.0, 10.0, 10.0)]

# 一方通行の区間では、出発点から逆走する側へ徒歩圏を伸ばさない。
# a→b にしか歩けないなら、出発点より始点側は到達できない。
r = m.clip_edge(INF, INF, 100.0, True, False, 1000.0, snap=(0.5, 0.0))
assert r and all(lo >= 0.5 - 1e-9 for lo, hi, v_lo, v_hi in r), r
r = m.clip_edge(INF, INF, 100.0, False, True, 1000.0, snap=(0.5, 0.0))
assert r and all(hi <= 0.5 + 1e-9 for lo, hi, v_lo, v_hi in r), r

print('clip_edge checks passed (20 assertions).')

# 平坦はちょうど等倍でなければならない。これが崩れると勾配ゼロ回帰テストが通らない。
assert m.equivalent_flat(100.0, 0.0) == 100.0

# 往復の悪いほうを採るため、上りと下りが同じ倍率になる。
assert abs(m.equivalent_flat(100.0, 0.10) - m.equivalent_flat(100.0, -0.10)) < 1e-9

# exp(3.5 * 0.08) = 1.3231...
assert abs(m.equivalent_flat(100.0, 0.08) - 132.31) < 0.01, m.equivalent_flat(100.0, 0.08)

# 勾配がきついほど遠くなる（単調）。
vals = [m.equivalent_flat(100.0, g / 100) for g in range(0, 31, 5)]
assert vals == sorted(vals) and vals[0] < vals[-1]

print('equivalent_flat checks passed (4 assertions).')

import json
ROOT = Path(__file__).resolve().parents[1]
g = m.load_pilot_graph(ROOT / 'public/data/walking-onoda.json')
assert len(g['nodes']) == 2818, len(g['nodes'])
assert len(g['edges']) == 3023, len(g['edges'])
assert all(e[m.GRADE] == 0 for e in g['edges'])

pilot = json.loads((ROOT / 'public/data/walking-onoda.json').read_text(encoding='utf-8'))
stop = pilot['pilot_stops'][0]
fc = m.bake_stop(g, stop['id'], stop['name'], stop['coordinate'], 1000.0)
assert fc['type'] == 'FeatureCollection' and fc['budget'] == 1000.0
roles = [f['properties']['role'] for f in fc['features']]
assert roles[0] == 'stop' and roles[1] == 'snap'
segs = [f for f in fc['features'] if f['properties']['role'] == 'segment']
assert len(segs) > 100, len(segs)
for f in segs:
    p = f['properties']
    assert isinstance(p['d1'], int) and isinstance(p['d2'], int)
    assert p['d1'] <= 1000 and p['d2'] <= 1000
    assert p['grade'] == 0 and p['steps'] is False
    for c in f['geometry']['coordinates']:
        assert len(c) == 2 and round(c[0], 5) == c[0] and round(c[1], 5) == c[1]

# 30mより遠い地点はスナップできない。
assert m.bake_stop(g, 'x', 'x', [131.0, 33.0], 1000.0) is None
assert m.stop_filename('131.17228_33.98546') == '131.17228_33.98546.geojson'
assert m.stop_id(131.1722795, 33.9854622) == '131.17228_33.98546'

# 一方通行の区間にバス停が接続したとき、_dijkstra が逆走側へ種を蒔かないこと。
# clip_edge 側は単体で検査済みだが、種蒔きの側はここでしか通らない。
DEG = 180 / (math.pi * 6371000)          # 緯度1メートルあたりの度数
def oneway_graph(forward, backward):
    return {'nodes': [[0.0, 0.0], [0.0, 100 * DEG]],
            'edges': [[0, 1, 100.0, forward, backward, 'w1', 0, False, False]]}

mid = [0.0, 50 * DEG]                     # 区間の中央に立つ
# 出力座標は5桁に丸められるため、比較の基準も同じ丸めを通す。生の 50*DEG と
# 1e-9 で比べると、丸め自体の誤差（約3.4e-7）で偽の失敗になる。
mid_lat = round(mid[1], 5)
fc = m.bake_stop(oneway_graph(True, False), 'x', 'x', mid, 1000.0)
lats = [c[1] for f in fc['features'] if f['properties']['role'] == 'segment'
        for c in f['geometry']['coordinates']]
assert lats and min(lats) >= mid_lat - 1e-9, f'a→b のみ歩けるのに始点側へ伸びた: {min(lats)}'

fc = m.bake_stop(oneway_graph(False, True), 'x', 'x', mid, 1000.0)
lats = [c[1] for f in fc['features'] if f['properties']['role'] == 'segment'
        for c in f['geometry']['coordinates']]
assert lats and max(lats) <= mid_lat + 1e-9, f'b→a のみ歩けるのに終点側へ伸びた: {max(lats)}'

print('bake_stop checks passed (over 12 assertions).')

# タイル番号の自己整合。あるタイルの中心座標は、そのタイル自身を指すはず。
z, tx, ty = 14, 14547, 6463
n = 2 ** z
lon = (tx + 0.5) / n * 360 - 180
lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (ty + 0.5) / n))))
x, y, px, py = m.tile_index(lon, lat, z)
assert (x, y) == (tx, ty), (x, y)
assert 0 <= px < 256 and 0 <= py < 256

# 無効値 'e' は None になる。
assert m.parse_tile('e,1.5\n2.5,e')[0][0] is None
assert m.parse_tile('e,1.5\n2.5,e')[0][1] == 1.5

# --- 取得の作法を検証する。実際の通信はせず、取得関数を差し替える。
import tempfile
import urllib.error

class FakeFetch:
    """呼ばれたURLを記録する。scripted に例外を並べると順に投げる。"""
    def __init__(self, scripted=()):
        self.calls = []
        self.scripted = list(scripted)
    def __call__(self, url, timeout=60):
        self.calls.append(url)
        if self.scripted:
            error = self.scripted.pop(0)
            if error is not None:
                raise error
        return '\n'.join(','.join(['5.00'] * 256) for _ in range(256))

# 一度取ったタイルは二度と取りに行かない。メモリでもディスクでも効く。
fetch = FakeFetch()
e = m.Elevation(tempfile.mkdtemp(), pause=0, fetch=fetch)   # gzipで保存される
assert e.at(131.17, 33.98) == 5.0
before = len(fetch.calls)
e.at(131.1701, 33.9801)                          # 同じタイル内
assert len(fetch.calls) == before, fetch.calls
e2 = m.Elevation(e.dir, pause=0, fetch=fetch)    # 別インスタンスでもgzipから読む
assert e2.at(131.17, 33.98) == 5.0
assert len(fetch.calls) == before, fetch.calls

# 総数の上限を超えたら中断する。実装の誤りが取得の洪水になるのを防ぐ。
capped = m.Elevation(tempfile.mkdtemp(), pause=0, max_requests=1, fetch=FakeFetch())
capped.at(131.0, 33.9)
try:
    capped.at(132.0, 34.4)
    raise AssertionError('上限を超えても中断しなかった')
except RuntimeError as error:
    assert '上限' in str(error), error

# 503 は間隔を空けて再試行し、回復すれば続行する。
flaky = FakeFetch([urllib.error.HTTPError('u', 503, 'busy', {}, None), None])
recovered = m.Elevation(tempfile.mkdtemp(), pause=0, backoff=(0, 0, 0), fetch=flaky)
assert recovered.at(131.17, 33.98) == 5.0
assert len(flaky.calls) == 2, flaky.calls

# 404 は「そのタイルは無い」として次の精度へ落ちるだけ。再試行しない。
absent = FakeFetch([urllib.error.HTTPError('u', 404, 'none', {}, None), None])
fallback = m.Elevation(tempfile.mkdtemp(), pause=0, backoff=(0, 0, 0), fetch=absent)
assert fallback.at(131.17, 33.98) == 5.0
assert len(absent.calls) == 2 and 'dem5a' in absent.calls[0] and '/dem/' in absent.calls[1], absent.calls

# 404以外の400番台は再試行せずそのまま失敗させる。叩き続けない。
forbidden = m.Elevation(tempfile.mkdtemp(), pause=0, backoff=(0, 0, 0),
                        fetch=FakeFetch([urllib.error.HTTPError('u', 403, 'no', {}, None)]))
try:
    forbidden.at(131.17, 33.98)
    raise AssertionError('403で止まらなかった')
except urllib.error.HTTPError:
    pass

print('elevation tile and fetch-manners checks passed (16 assertions).')
