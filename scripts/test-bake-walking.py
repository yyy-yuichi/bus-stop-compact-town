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
assert fc['v'] == 1 and fc['id'] == stop['id'] and fc['budget'] == 1000.0
assert len(fc['origin']) == 2 and len(fc['snap']) == 2
assert isinstance(fc['gap'], float)
segs = fc['seg']
assert len(segs) > 100, len(segs)
for row in segs:
    assert len(row) == 8, row
    lon1, lat1, lon2, lat2, d1, d2, grade, steps = row
    assert isinstance(d1, int) and isinstance(d2, int)
    assert d1 <= 1000 and d2 <= 1000
    assert grade == 0 and steps == 0
    for c in (lon1, lat1, lon2, lat2):
        assert round(c, 5) == c

# 30mより遠い地点はスナップできない。
assert m.bake_stop(g, 'x', 'x', [131.0, 33.0], 1000.0) is None
assert m.stop_filename('131.17228_33.98546') == '131.17228_33.98546.json'
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
lats = [row[i] for row in fc['seg'] for i in (1, 3)]
assert lats and min(lats) >= mid_lat - 1e-9, f'a→b のみ歩けるのに始点側へ伸びた: {min(lats)}'

fc = m.bake_stop(oneway_graph(False, True), 'x', 'x', mid, 1000.0)
lats = [row[i] for row in fc['seg'] for i in (1, 3)]
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

class Naps:
    """間隔をあけたかを記録する。実際には眠らない。"""
    def __init__(self):
        self.seconds = []
    def __call__(self, seconds):
        self.seconds.append(seconds)

# 取得できたときも必ず間隔をあける。ここが抜けても他のテストは通ってしまう。
naps = Naps()
e = m.Elevation(tempfile.mkdtemp(), pause=1.0, fetch=FakeFetch(), sleep=naps)
assert e.at(131.17, 33.98) == 5.0
assert naps.seconds and all(s >= 1.0 for s in naps.seconds), naps.seconds

# 404 で粗い方式へ落ちるときも、2本のリクエストの間に間隔をあける。
naps = Naps()
absent = FakeFetch([urllib.error.HTTPError('u', 404, 'none', {}, None), None])
e = m.Elevation(tempfile.mkdtemp(), pause=1.0, backoff=(0, 0, 0), fetch=absent, sleep=naps)
assert e.at(131.17, 33.98) == 5.0
assert len(absent.calls) == 2, absent.calls
assert len(naps.seconds) >= 2, f'404 のあと間隔をあけずに次を叩いている: {naps.seconds}'

print('elevation tile and fetch-manners checks passed (18 assertions).')

# --- ElevationTableは並び順の指紋が合わないと使わせない。
def small_graph(coords):
    return {'nodes': [list(c) for c in coords], 'edges': []}

g1 = small_graph([[131.000, 33.000], [131.001, 33.001], [131.002, 33.002]])
g2 = small_graph([[131.001, 33.001], [131.000, 33.000], [131.002, 33.002]])  # 先頭2件を入替、件数は同じ
fp1 = m.graph_fingerprint(g1)
assert fp1['nodes'] == 3, fp1
# 並び順だけが変わっても指紋は別物になる（件数チェックだけでは検知できない回帰）。
assert m.graph_fingerprint(g2)['sha256'] != fp1['sha256'], '並び順を変えても指紋が変わらない'

table_dir = Path(tempfile.mkdtemp())
table_path = table_dir / 'elevations.json'
table_path.write_text(json.dumps({'fingerprint': fp1, 'values': [1.0, 2.0, 3.0]}), encoding='utf-8')

# 指紋が一致すれば、書いた順どおりに返す。
et = m.ElevationTable(table_path, g1)
assert et.at(0, 0) == 1.0
assert et.at(0, 0) == 2.0
assert et.at(0, 0) == 3.0

# 同じ表を、並び順だけ違うグラフ(g2)に対して使おうとすると弾かれること。
try:
    m.ElevationTable(table_path, g2)
    raise AssertionError('並び順がずれた表を弾かなかった')
except RuntimeError as error:
    assert 'extract-elevations.py' in str(error), error

print('elevation table checks passed (6 assertions).')

DEG = 180 / (math.pi * 6371000)   # 1メートルあたりの度数

def tiny_graph(length_m, flat=False, steps=False):
    return {'nodes': [[0.0, 0.0], [0.0, length_m * DEG]],
            'edges': [[0, 1, length_m, True, True, 'w1', 0, steps, flat]]}

# 200mの区間は50m以下の4本に割れる。端のノードは保たれる。
g = m.subdivide(tiny_graph(200.0), 50.0)
assert len(g['edges']) == 4, len(g['edges'])
assert all(e[m.LEN] <= 50.0 + 1e-6 for e in g['edges'])
assert g['edges'][0][m.A] == 0 and g['edges'][-1][m.B] == 1

# 50m以下は割らない。
assert len(m.subdivide(tiny_graph(40.0), 50.0)['edges']) == 1

class FakeElevation:
    def __init__(self, values): self.values = values
    def at(self, lon, lat): return self.values.get(round(lat, 9))

# 100mで10m上る -> 勾配 +10%
g = tiny_graph(100.0)
m.apply_grades(g, FakeElevation({0.0: 5.0, round(100.0 * DEG, 9): 15.0}))
assert g['edges'][0][m.GRADE] == 10, g['edges'][0][m.GRADE]

# クランプ。10mで20m上っても±30%に収まる。
g = tiny_graph(10.0)
m.apply_grades(g, FakeElevation({0.0: 0.0, round(10.0 * DEG, 9): 20.0}))
assert g['edges'][0][m.GRADE] == 30, g['edges'][0][m.GRADE]

# 橋・トンネルは地表面標高を無視して平坦にする。
g = tiny_graph(100.0, flat=True)
m.apply_grades(g, FakeElevation({0.0: 0.0, round(100.0 * DEG, 9): 50.0}))
assert g['edges'][0][m.GRADE] == 0, g['edges'][0][m.GRADE]

# 階段もDEMから勾配を取らない。steps フラグだけ残す。
g = tiny_graph(10.0, steps=True)
m.apply_grades(g, FakeElevation({0.0: 0.0, round(10.0 * DEG, 9): 5.0}))
assert g['edges'][0][m.GRADE] == 0 and g['edges'][0][m.STEPS] is True

# 標高が取れない区間は平坦扱い。
g = tiny_graph(100.0)
m.apply_grades(g, FakeElevation({}))
assert g['edges'][0][m.GRADE] == 0

# 下りの勾配は負で出る。符号を落とす実装（abs）を捕まえる。
g = tiny_graph(100.0)
m.apply_grades(g, FakeElevation({0.0: 15.0, round(100.0 * DEG, 9): 5.0}))
assert g['edges'][0][m.GRADE] == -10, g['edges'][0][m.GRADE]

# クランプは下り側にも同じだけ効く。
g = tiny_graph(10.0)
m.apply_grades(g, FakeElevation({0.0: 20.0, round(10.0 * DEG, 9): 0.0}))
assert g['edges'][0][m.GRADE] == -30, g['edges'][0][m.GRADE]

# 片端だけ標高が取れない場合も平坦扱いにする。データ範囲の境界で実際に起きる。
for known in (0.0, round(100.0 * DEG, 9)):
    g = tiny_graph(100.0)
    m.apply_grades(g, FakeElevation({known: 5.0}))
    assert g['edges'][0][m.GRADE] == 0, (known, g['edges'][0][m.GRADE])

# 長さ0の区間でゼロ除算しない。
g = tiny_graph(100.0)
g['edges'][0][m.LEN] = 0.0
m.apply_grades(g, FakeElevation({0.0: 0.0, round(100.0 * DEG, 9): 50.0}))
assert g['edges'][0][m.GRADE] == 0, g['edges'][0][m.GRADE]

print('subdivide and grade checks passed (14 assertions).')

# 索引を使っても使わなくても、同じ最寄り区間を返さなければならない。
g = m.load_pilot_graph(ROOT / 'public/data/walking-onoda.json')
grid = m.GridIndex(g)
for stop in pilot['pilot_stops']:
    lon, lat = stop['coordinate']
    slow = m.nearest_edge(g, lon, lat, 30.0)
    fast = m.nearest_edge(g, lon, lat, 30.0, grid)
    assert (slow is None) == (fast is None), stop['name']
    if slow:
        assert abs(slow[3] - fast[3]) < 1e-9, stop['name']
        # 垂線距離だけでは、等距離の別区間へすり替わっても気づけない。
        # 交差点や行き止まりでは区間どうしが端点を共有し、等距離になる。
        # 投影点まで一致すれば、同じ場所に落ちていることが言える。
        assert abs(slow[2][0] - fast[2][0]) < 1e-12 and abs(slow[2][1] - fast[2][1]) < 1e-12, stop['name']

# マスより長い区間でも、その中ほどから見つかる。
long_edge = {'nodes': [[131.0, 33.0], [131.2, 33.0]],
             'edges': [[0, 1, 18000.0, True, True, 'w', 0, False, False]]}
mid = m.GridIndex(long_edge)
assert mid.candidates(131.1, 33.0) == {0}

# 遠すぎれば見つからない。
assert m.nearest_edge(g, 131.0, 33.0, 30.0, grid) is None

print('grid index checks passed (23 assertions).')

stops = json.loads((ROOT / 'public/data/bus_stop.geojson').read_text(encoding='utf-8'))
assert stops['type'] == 'FeatureCollection'
feats = stops['features']
assert len(feats) == 3946, len(feats)

ids = [f['id'] for f in feats]
assert len(set(ids)) == len(ids), 'IDが重複している'
for f in feats[:200]:
    lon, lat = f['geometry']['coordinates']
    assert f['id'] == m.stop_id(lon, lat), f['id']
    assert round(lon, 5) == lon and round(lat, 5) == lat
    p = f['properties']
    assert p['name'] and p['name'] == p['names'][0]
    assert isinstance(p['names'], list) and isinstance(p['operators'], list)
    assert p['operators'], f['id']

# 表記ゆれを含む統合が起きていること。同一座標に載っていた別表記が1件にまとまる。
merged = [f for f in feats if len(f['properties']['names']) > 1]
assert len(merged) >= 20, len(merged)

# 北部（OSMが0件だった緯度帯）が入っていること。
north = [f for f in feats if f['geometry']['coordinates'][1] >= 34.43]
assert len(north) >= 100, len(north)

print('bus stop conversion checks passed (over 10 assertions).')
