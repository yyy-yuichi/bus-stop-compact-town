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

print('clip_edge checks passed (18 assertions).')

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
