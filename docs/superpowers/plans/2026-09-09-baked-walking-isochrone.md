# 徒歩圏の事前焼き込み 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 山口県内1,085バス停の徒歩圏（勾配込み）を事前計算してGeoJSONで配信し、クライアントから経路探索を撤去する。

**Architecture:** オフラインの焼き込みスクリプト（Python）が、OSM道路網と国土地理院の標高から「等価平坦距離の場」をバス停ごとに計算し、1停留所1GeoJSONとして出力する。クライアントは選択された停留所のファイルだけを遅延取得し、距離場をバジェットで切って描画し、任意の施設が徒歩圏に入るかをその場で判定する。

**Tech Stack:** Python 3.12+（焼き込み。PBF読み取りのみ pyosmium、他は標準ライブラリ）/ TypeScript + React 19 + Leaflet 1.9（クライアント）/ Node 24（テスト・ビルド）

**Spec:** `docs/superpowers/specs/2026-09-09-baked-walking-isochrone-design.md`

## Global Constraints

- **バジェット** 1000m（時速4km × 15分）。全バンドをこの1ファイルから切り出す
- **バンド** 徒歩5分・10分・15分／**歩行速度** 時速3kmまたは4km
- **勾配モデル** 等価平坦距離 `L_eff = L × exp(3.5 × |勾配|)`（往復の悪いほう、方向対称）
- **勾配クランプ** ±30%。**急勾配の警告閾値** ±5%（クライアント側で判定）
- **標高サンプリング** 区間は50m以下に分割してから標高を引く
- **スナップ閾値** バス停から最寄り道路まで30m以内。超えたらファイルを生成しない
- **施設判定** 道路上の点から施設外形まで25m以内
- **座標精度** 小数5桁（約1.1m）。距離は整数メートル
- **出力先** `public/data/walk/<stop-id の / を - に置換>.geojson`
- **ライセンス** 成果物はODbL 1.0。国土地理院の出典と加工事実を併記
- **Pythonの依存** PBF読み取りの `osmium` のみ。それ以外は標準ライブラリで書く。**CIで走るテストは osmium に依存させない**
- **npmの依存追加は禁止**（`package.json` の dependencies は leaflet / react / react-dom のまま）

### 外部データ取得の作法（厳守）

国土地理院とGeofabrikは無償の公開サービスである。**一度きりの焼き込みのために、
繰り返し叩いてよい理由はない。**

- **逐次取得のみ。並列化しない。** 1リクエストごとに1秒以上あける
- **取得したものは必ずディスクへ残し、二度と取りに行かない。**
  焼き込みをやり直しても再取得が起きないこと
- **総リクエスト数に上限を設ける。** 上限に達したら中断する。
  実装の誤りが取得の洪水に化けるのを防ぐ
- **429・5xx のみ、間隔を指数的に空けて最大3回まで。** それ以外は再試行せず失敗させる
- **User-Agent に連絡先を含める。** 匿名で大量取得しない
- **CIでは絶対に取得しない。** CIが走るたびに外部へ出ていくことになる
- **Geofabrikのファイルは1日1回しか更新されない。** 手元にあれば再取得しない

## ファイル構成

| ファイル | 責務 |
|---|---|
| `scripts/extract-roads.py`（新規） | Geofabrik PBF → 山口県範囲の生の道路データJSON。osmium を使うのはここだけ |
| `scripts/bake-walking.py`（新規） | 標準ライブラリのみ。標高・勾配・グリッド索引・Dijkstra・クリップ・GeoJSON出力 |
| `scripts/test-bake-walking.py`（新規） | Python側の単体テスト（既存 `test-walking-source.py` と同じ素の assert 形式） |
| `scripts/test-walking.mjs`（変更） | 勾配ゼロ回帰テストとクライアント関数のテスト |
| `scripts/verify-release.mjs`（変更） | `data/walk/*.geojson` を許可し、廃止するファイルの検査を外す |
| `src/walking.ts`（変更） | 経路探索を撤去し、焼いた距離場を読む関数群に縮小 |
| `src/WalkingPanel.tsx`（変更） | 遅延取得・3バンド・試作UIの撤去・警告表示 |
| `public/about.html`（変更） | 計算方法と出典 |
| `requirements.txt`（新規） | `osmium==4.3.1` |

## 作業の順序

Phase A（Task 1-3）は既存の試作グラフだけで完結し、外部通信を一切せずに
焼き込みの骨格を固める。正しさの錨は**式から導いた期待値**（Task 1の折り返し点、
Task 2の正規化）と**焼いたデータ自身の不変条件**に置く。
現行の `calculateWalk` は試作なので、それとの一致は厳密には求めない。

Phase B（Task 4-5）で初めて外部へ通信する。**取得の作法は上のGlobal Constraintsを厳守すること。**

---

### Task 1: クリップと折り返し分割

区間上の距離関数を折れ点で切り、各断片の内部が線形になることを保証する純関数。仕様5.3節。

**Files:**
- Create: `scripts/bake-walking.py`
- Test: `scripts/test-bake-walking.py`

**Interfaces:**
- Consumes: なし
- Produces: `clip_edge(d_a, d_b, l_eff, forward, backward, budget, snap=None) -> list[tuple[float,float,float,float]]`
  - `d_a` / `d_b`: 両端ノードまでの等価平坦距離。未到達は `math.inf`
  - `l_eff`: 区間の等価平坦長
  - `forward` / `backward`: a→b / b→a に歩けるか（bool）
  - `snap`: この区間が出発点を含むとき `(t, gap)`、含まないとき `None`
  - 返り値: `(lo, hi, v_lo, v_hi)` のリスト。`lo`/`hi` は区間内の位置（0〜1）、`v_lo`/`v_hi` はその位置の距離

- [ ] **Step 1: 失敗するテストを書く**

`scripts/test-bake-walking.py` を新規作成する。

```python
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

print('clip_edge checks passed (14 assertions).')
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `python3 scripts/test-bake-walking.py`
Expected: FAIL — `FileNotFoundError` もしくは `AttributeError: module 'bake' has no attribute 'clip_edge'`

- [ ] **Step 3: 最小の実装を書く**

`scripts/bake-walking.py` を新規作成する。

```python
"""バス停ごとの徒歩圏を事前計算する。標準ライブラリのみで動く。"""
import math

def clip_edge(d_a, d_b, l_eff, forward, backward, budget, snap=None):
    """区間上の距離関数を折れ点で分割し、バジェットで切る。
    各断片の内部で距離が線形になることを保証する。"""
    def value(t):
        best = math.inf
        if forward and d_a < math.inf:
            best = min(best, d_a + t * l_eff)
        if backward and d_b < math.inf:
            best = min(best, d_b + (1 - t) * l_eff)
        if snap is not None:
            best = min(best, snap[1] + abs(t - snap[0]) * l_eff)
        return best

    cuts = {0.0, 1.0}
    # 両側から到達の波が来てぶつかる点（山型の頂点）
    if forward and backward and d_a < math.inf and d_b < math.inf and abs(d_a - d_b) < l_eff:
        cuts.add((d_b - d_a + l_eff) / (2 * l_eff))
    # 出発点そのもの（谷型の底）
    if snap is not None:
        cuts.add(snap[0])
    cuts = sorted(t for t in cuts if 0.0 <= t <= 1.0)

    out = []
    for lo, hi in zip(cuts, cuts[1:]):
        if hi - lo < 1e-9:
            continue
        v_lo, v_hi = value(lo), value(hi)
        if v_lo > budget and v_hi > budget:
            continue
        span = hi - lo
        if v_lo > budget:
            lo = lo + span * (v_lo - budget) / (v_lo - v_hi)
            v_lo = budget
        elif v_hi > budget:
            hi = lo + (hi - lo) * (budget - v_lo) / (v_hi - v_lo)
            v_hi = budget
        if hi - lo < 1e-9:
            continue
        out.append((lo, hi, v_lo, v_hi))
    return out
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `python3 scripts/test-bake-walking.py`
Expected: PASS — `clip_edge checks passed (14 assertions).`

- [ ] **Step 5: コミット**

```bash
git add scripts/bake-walking.py scripts/test-bake-walking.py
git commit -m "Add fold-aware edge clipping for baked walking catchments"
```

---

### Task 2: Toblerによる等価平坦距離

勾配を歩行時間に変換する。仕様4.2・4.3節。

**Files:**
- Modify: `scripts/bake-walking.py`
- Test: `scripts/test-bake-walking.py`

**Interfaces:**
- Consumes: なし
- Produces: `equivalent_flat(length_m, grade) -> float`（`grade` は勾配の比。8%なら `0.08`）

- [ ] **Step 1: 失敗するテストを書く**

`scripts/test-bake-walking.py` の `print(...)` の直前に追記する。

```python
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
```

`print('clip_edge checks passed (14 assertions).')` は残したまま、この追記をその後ろに置く。

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `python3 scripts/test-bake-walking.py`
Expected: FAIL — `AttributeError: module 'bake' has no attribute 'equivalent_flat'`

- [ ] **Step 3: 最小の実装を書く**

`scripts/bake-walking.py` の `clip_edge` の上に追記する。

```python
def equivalent_flat(length_m, grade):
    """Toblerの登山関数を平坦時で正規化し、勾配ぶんを距離に織り込む。

    往復の厳しいほうを採るため max(f(i), f(-i)) = exp(3.5*|i|) となり、
    上りと下りが同じ倍率になる。平坦ではちょうど等倍。
    """
    return length_m * math.exp(3.5 * abs(grade))
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `python3 scripts/test-bake-walking.py`
Expected: PASS — 2行の合格メッセージが出る

- [ ] **Step 5: コミット**

```bash
git add scripts/bake-walking.py scripts/test-bake-walking.py
git commit -m "Add Tobler-normalised equivalent flat distance"
```

---

### Task 3: 焼き込みコアと勾配ゼロ回帰テスト

**この計画の要。** 焼いた距離場が、帯の単調性とバジェット上限という不変条件を満たすことを確かめる。現行の `calculateWalk` は試作なので、突き合わせは桁の確認にとどめる。

**Files:**
- Modify: `scripts/bake-walking.py`
- Modify: `scripts/test-walking.mjs`
- Test: `scripts/test-bake-walking.py`

**Interfaces:**
- Consumes: `clip_edge`（Task 1）、`equivalent_flat`（Task 2）
- Produces:
  - 内部グラフ形式。`{'nodes': [[lon, lat], ...], 'edges': [[a, b, length_m, forward, backward, way_id, grade_pct, steps, flat], ...]}`
    添字定数 `A, B, LEN, FWD, BWD, WAY, GRADE, STEPS, FLAT = range(9)`
    `grade_pct` は整数の百分率、`steps` と `flat` は bool
  - `load_pilot_graph(path) -> graph`（既存 `walking-onoda.json` を内部形式へ変換）
  - `nearest_edge(graph, lon, lat, max_gap, index=None) -> (edge_i, t, point, gap) | None`
  - `bake_stop(graph, stop_id, name, origin, budget, index=None) -> dict | None`（GeoJSON FeatureCollection）
  - `stop_filename(stop_id) -> str`

- [ ] **Step 1: 失敗するテストを書く（Python側）**

`scripts/test-bake-walking.py` の末尾に追記する。

```python
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
assert m.stop_filename('node/5127585172') == 'node-5127585172.geojson'
print('bake_stop checks passed (over 10 assertions).')
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `python3 scripts/test-bake-walking.py`
Expected: FAIL — `AttributeError: module 'bake' has no attribute 'load_pilot_graph'`

- [ ] **Step 3: 最小の実装を書く**

`scripts/bake-walking.py` に追記する。

```python
import json

A, B, LEN, FWD, BWD, WAY, GRADE, STEPS, FLAT = range(9)

def meters(a, b):
    x = math.radians(b[0] - a[0]) * math.cos(math.radians((a[1] + b[1]) / 2))
    y = math.radians(b[1] - a[1])
    return math.hypot(x, y) * 6371000

def project(p, a, b):
    """点 p を線分 ab に投影し、(位置0〜1, 投影点, 垂線距離) を返す。"""
    scale = math.cos(math.radians(p[1]))
    dx = (b[0] - a[0]) * scale
    dy = b[1] - a[1]
    den = dx * dx + dy * dy
    t = 0.0 if den == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * scale * dx + (p[1] - a[1]) * dy) / den))
    q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    return t, q, meters(p, q)

def load_pilot_graph(path):
    """既存の試作グラフを内部形式へ読み込む。勾配は0のまま。"""
    raw = json.loads(Path(path).read_text(encoding='utf-8')) if hasattr(path, 'read_text') \
        else json.loads(open(path, encoding='utf-8').read())
    nodes = [[x, y] for x, y, _ in raw['nodes']]
    edges = [[a, b, length, bool(f), bool(bk), way, 0, False, False]
             for a, b, length, f, bk, way in raw['edges']]
    return {'nodes': nodes, 'edges': edges}

def nearest_edge(graph, lon, lat, max_gap, index=None):
    candidates = range(len(graph['edges'])) if index is None else index.candidates(lon, lat)
    best = None
    for i in candidates:
        e = graph['edges'][i]
        t, q, gap = project([lon, lat], graph['nodes'][e[A]], graph['nodes'][e[B]])
        if best is None or gap < best[3]:
            best = (i, t, q, gap)
    if best is None or best[3] > max_gap:
        return None
    return best

def _l_eff(edge):
    return equivalent_flat(edge[LEN], edge[GRADE] / 100)

def _dijkstra(graph, snap, budget):
    import heapq
    edge_i, t, _, gap = snap
    adjacency = [[] for _ in graph['nodes']]
    for i, e in enumerate(graph['edges']):
        le = _l_eff(e)
        if e[FWD]:
            adjacency[e[A]].append((e[B], le))
        if e[BWD]:
            adjacency[e[B]].append((e[A], le))
    d = [math.inf] * len(graph['nodes'])
    heap = []
    e = graph['edges'][edge_i]
    le = _l_eff(e)
    for node, cost in ((e[A], gap + t * le), (e[B], gap + (1 - t) * le)):
        if cost < d[node]:
            d[node] = cost
            heapq.heappush(heap, (cost, node))
    while heap:
        cost, node = heapq.heappop(heap)
        if cost != d[node] or cost > budget:
            continue
        for target, length in adjacency[node]:
            if cost + length < d[target] and cost + length <= budget:
                d[target] = cost + length
                heapq.heappush(heap, (cost + length, target))
    return d

def stop_filename(stop_id):
    return stop_id.replace('/', '-') + '.geojson'

def bake_stop(graph, stop_id, name, origin, budget, index=None, snap_limit=30.0):
    """1停留所ぶんの徒歩圏を GeoJSON FeatureCollection で返す。届かなければ None。"""
    snap = nearest_edge(graph, origin[0], origin[1], snap_limit, index)
    if snap is None or snap[3] > budget:
        return None
    snap_i, snap_t, snap_point, snap_gap = snap
    d = _dijkstra(graph, snap, budget)
    r5 = lambda p: [round(p[0], 5), round(p[1], 5)]
    features = [
        {'type': 'Feature',
         'properties': {'role': 'stop', 'name': name, 'stop_id': stop_id},
         'geometry': {'type': 'Point', 'coordinates': r5(origin)}},
        {'type': 'Feature',
         'properties': {'role': 'snap', 'gap': round(snap_gap, 1)},
         'geometry': {'type': 'LineString', 'coordinates': [r5(origin), r5(snap_point)]}},
    ]
    for i, e in enumerate(graph['edges']):
        le = _l_eff(e)
        if le <= 0:
            continue
        pieces = clip_edge(d[e[A]], d[e[B]], le, e[FWD], e[BWD], budget,
                           snap=(snap_t, snap_gap) if i == snap_i else None)
        if not pieces:
            continue
        pa, pb = graph['nodes'][e[A]], graph['nodes'][e[B]]
        at = lambda t: r5([pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t])
        for lo, hi, v_lo, v_hi in pieces:
            features.append({
                'type': 'Feature',
                'properties': {'role': 'segment', 'd1': round(v_lo), 'd2': round(v_hi),
                               'grade': e[GRADE], 'steps': e[STEPS]},
                'geometry': {'type': 'LineString', 'coordinates': [at(lo), at(hi)]}})
    return {'type': 'FeatureCollection', 'version': 1, 'stop_id': stop_id,
            'budget': budget, 'features': features}
```

`from pathlib import Path` をファイル冒頭の import に加える。

- [ ] **Step 4: Python側のテストが通ることを確認する**

Run: `python3 scripts/test-bake-walking.py`
Expected: PASS — 3行の合格メッセージ

- [ ] **Step 5: 勾配ゼロ回帰テストの生成コマンドを足す**

`scripts/bake-walking.py` の末尾に追記する。

```python
if __name__ == '__main__':
    import sys
    root = Path(__file__).resolve().parents[1]
    if sys.argv[1:2] == ['--pilot']:
        # 勾配ゼロ回帰テスト用。既存の試作グラフをそのまま焼く。
        graph = load_pilot_graph(root / 'public/data/walking-onoda.json')
        pilot = json.loads((root / 'public/data/walking-onoda.json').read_text(encoding='utf-8'))
        out = root / 'work/pilot-bake'
        out.mkdir(parents=True, exist_ok=True)
        made = 0
        for stop in pilot['pilot_stops']:
            fc = bake_stop(graph, stop['id'], stop['name'], stop['coordinate'], 1000.0)
            if fc is None:
                continue
            (out / stop_filename(stop['id'])).write_text(
                json.dumps(fc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
            made += 1
        print(json.dumps({'baked': made, 'dir': str(out)}, ensure_ascii=False))
```

Run: `python3 scripts/bake-walking.py --pilot`
Expected: `{"baked": 7, "dir": ".../work/pilot-bake"}`

- [ ] **Step 6: 勾配ゼロ回帰テストを書く（Node側）**

`scripts/test-walking.mjs` の末尾、`console.log(...)` の**直前**に追記する。

```js
// 焼いた結果が満たすべき不変条件を確かめ、あわせて現行実装と桁が合うかだけ見る。
// 事前に `python3 scripts/bake-walking.py --pilot` を実行しておく。
// calculateWalk との突き合わせは、Task 9 でそれが消えるまでの暫定。
const bakeDir = 'work/pilot-bake';
if (fs.existsSync(bakeDir)) {
  const total = lines => lines.reduce((s, l) => s + distance(...l), 0);
  for (const stop of pilot.pilot_stops) {
    const file = `${bakeDir}/${stop.id.replaceAll('/', '-')}.geojson`;
    const fc = JSON.parse(fs.readFileSync(file, 'utf8'));
    const segments = fc.features.filter(f => f.properties.role === 'segment');
    const banded = budget => segments.reduce((sum, f) => {
      const { d1, d2 } = f.properties;
      const [p, q] = f.geometry.coordinates;
      if (d1 > budget && d2 > budget) return sum;
      const len = distance(p, q);
      if (d1 <= budget && d2 <= budget) return sum + len;
      return sum + len * Math.min(1, (budget - Math.min(d1, d2)) / Math.abs(d2 - d1));
    }, 0);

    // 帯は広げるほど伸びる。焼いたデータだけで閉じた検査で、現行実装に依存しない。
    const bands = [250, 500, 750, 1000].map(banded);
    for (let i = 1; i < bands.length; i++) {
      assert(bands[i] >= bands[i - 1] - 1e-6, `${stop.name}: 帯が縮んだ ${bands}`);
    }
    assert(bands[0] > 0 && bands[3] > bands[0], `${stop.name}: 帯が広がらない ${bands}`);
    assert(segments.every(f => f.properties.d1 <= fc.budget && f.properties.d2 <= fc.budget),
      `${stop.name}: バジェットを超える距離が残っている`);

    // 現行の calculateWalk は試作なので、桁違いのずれだけを見る参考比較にとどめる。
    const live = total(reachableLines(calculateWalk(pilot, stop.coordinate, 1000), 1000));
    assert(Math.abs(bands[3] - live) < live * 0.10,
      `${stop.name}: baked ${bands[3].toFixed(0)}m vs provisional ${live.toFixed(0)}m`);
  }
  console.log(`Baked catchment invariants held for ${pilot.pilot_stops.length} stops.`);
} else {
  throw Error('Run `python3 scripts/bake-walking.py --pilot` before the walking tests');
}
```

- [ ] **Step 7: 突き合わせを実行する**

Run: `python3 scripts/bake-walking.py --pilot && npm run test:walking`
Expected: PASS — `Baked catchment invariants held for 7 stops.`

失敗した場合は `clip_edge` の分割漏れかスナップ区間の扱いを疑う。
失敗した停留所を絞り、`reachableLines` の出力と焼いたセグメントを突き合わせること。

**ただし `calculateWalk` との突き合わせは補助にすぎない。** 正しさの根拠は、
Task 1・2で式から導いた期待値と、上の不変条件（帯の単調性・バジェット上限）にある。
`calculateWalk` 自体が試作であり、厳密一致を求めると仮実装の癖まで写してしまう。

- [ ] **Step 8: コミット**

```bash
git add scripts/bake-walking.py scripts/test-bake-walking.py scripts/test-walking.mjs
git commit -m "Bake per-stop catchments with band and budget invariants"
```

---

### Task 4: 国土地理院の標高タイル読み取り

仕様4.1節。DEM5Aを第一候補、欠測時にDEM10Bへ落とす。

**Files:**
- Modify: `scripts/bake-walking.py`
- Test: `scripts/test-bake-walking.py`

**Interfaces:**
- Consumes: なし
- Produces:
  - `http_text(url, timeout=60) -> str`（既定の取得関数。差し替え可能にしてテストする）
  - `class Elevation` — `Elevation(cache_dir, pause=1.0, max_requests=4000, backoff=(5,15,45), fetch=http_text)`
    / `.at(lon, lat) -> float | None` / `.stats() -> dict`
  - `tile_index(lon, lat, z) -> (x, y, px, py)` / `parse_tile(text) -> list[list[float|None]]`

**取得の作法:** 逐次・1秒間隔・ディスクキャッシュ・総数上限・
429と5xxのみ最大3回の指数バックオフ・連絡先入りUser-Agent。Global Constraintsを実装へ落とす。

- [ ] **Step 1: 失敗するテストを書く**

`scripts/test-bake-walking.py` の末尾に追記する。

```python
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
e = m.Elevation(tempfile.mkdtemp(), pause=0, fetch=fetch)
assert e.at(131.17, 33.98) == 5.0
before = len(fetch.calls)
e.at(131.1701, 33.9801)                          # 同じタイル内
assert len(fetch.calls) == before, fetch.calls
e2 = m.Elevation(e.dir, pause=0, fetch=fetch)    # 別インスタンスでもディスクから読む
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
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `python3 scripts/test-bake-walking.py`
Expected: FAIL — `AttributeError: module 'bake' has no attribute 'tile_index'`

- [ ] **Step 3: 最小の実装を書く**

`scripts/bake-walking.py` に追記する。

```python
import urllib.request
import urllib.error
import time

GSI_TILES = (('dem5a', 15), ('dem', 14))   # DEM5A(5mメッシュ) を優先し、欠測は DEM10B で埋める
# 連絡先を含めること。匿名で公開サービスから大量に取得しない。
USER_AGENT = 'bus-stop-compact-town/0.1 (UDC2026 walking catchment; https://github.com/gunsow/bus-stop-compact-town)'
RETRY_CODES = {429, 500, 502, 503, 504}

def http_text(url, timeout=60):
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    return urllib.request.urlopen(request, timeout=timeout).read().decode()

def tile_index(lon, lat, z):
    """経緯度から (タイルX, タイルY, タイル内の列, タイル内の行) を返す。"""
    n = 2 ** z
    xf = (lon + 180) / 360 * n
    yf = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    x, y = int(xf), int(yf)
    return x, y, int((xf - x) * 256), int((yf - y) * 256)

def parse_tile(text):
    """標高タイルのテキストを 256x256 の二次元配列にする。'e' は None。"""
    return [[None if v == 'e' else float(v) for v in row.split(',')]
            for row in text.strip().split('\n')]

class Elevation:
    """国土地理院の標高タイルを読む。

    無償の公開サービスなので、逐次・間隔をあけて取り、取ったものは残して
    二度と取りに行かない。総数に上限を設け、実装の誤りが取得の洪水に
    化けないようにする。
    """

    def __init__(self, cache_dir, pause=1.0, max_requests=4000,
                 backoff=(5, 15, 45), fetch=http_text):
        self.dir = Path(cache_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.pause = pause
        self.max_requests = max_requests
        self.backoff = backoff
        self.fetch = fetch
        self.tiles = {}
        self.hits = {}
        self.requests = 0
        self.missing = 0

    def _download(self, url):
        """429と5xxのみ間隔を空けて再試行する。404は空、それ以外はそのまま失敗させる。"""
        for attempt, wait in enumerate(self.backoff):
            if self.requests >= self.max_requests:
                raise RuntimeError(
                    f'標高タイルの取得が上限{self.max_requests}件に達した。'
                    '対象範囲か実装を疑うこと。上限を上げる前に原因を確かめる。')
            self.requests += 1
            try:
                text = self.fetch(url)
                time.sleep(self.pause)      # 取得できたときも必ず間隔をあける
                return text
            except urllib.error.HTTPError as error:
                if error.code == 404:
                    return ''               # そのタイルは無い。次の精度へ落ちる
                if error.code not in RETRY_CODES or attempt == len(self.backoff) - 1:
                    raise                   # 叩き続けない
                time.sleep(wait)
            except urllib.error.URLError:
                if attempt == len(self.backoff) - 1:
                    raise
                time.sleep(wait)
        raise RuntimeError('unreachable')

    def _tile(self, kind, z, x, y):
        key = (kind, z, x, y)
        if key in self.tiles:
            return self.tiles[key]
        path = self.dir / f'{kind}-{z}-{x}-{y}.txt'
        if path.exists():
            text = path.read_text(encoding='utf-8')      # 取得済みなら通信しない
        else:
            text = self._download(f'https://cyberjapandata.gsi.go.jp/xyz/{kind}/{z}/{x}/{y}.txt')
            path.write_text(text, encoding='utf-8')
        grid = parse_tile(text) if text.strip() else None
        self.tiles[key] = grid
        return grid

    def at(self, lon, lat):
        for kind, z in GSI_TILES:
            x, y, px, py = tile_index(lon, lat, z)
            grid = self._tile(kind, z, x, y)
            if not grid:
                continue
            value = grid[py][px]
            if value is not None:
                self.hits[kind] = self.hits.get(kind, 0) + 1
                return value
        self.missing += 1
        return None

    def stats(self):
        return {'by_source': dict(self.hits), 'missing': self.missing,
                'tiles': sum(1 for v in self.tiles.values() if v), 'requests': self.requests}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `python3 scripts/test-bake-walking.py`
Expected: PASS — 4行の合格メッセージ

- [ ] **Step 5: 実際のタイルで1点だけ確かめる**

**ここが外部への最初の通信になる。1タイルだけ取る。**

Run:
```bash
python3 -c "
import importlib.util,pathlib
s=importlib.util.spec_from_file_location('b','scripts/bake-walking.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
e=m.Elevation('work/dem-cache')
print('サンパークおのだ 標高:', e.at(131.1722795, 33.9854622), 'm')
print(e.stats())
"
```
Expected: 標高が 0〜50m 程度の実数で出て、`by_source` に `dem5a` が入る

- [ ] **Step 6: コミット**

```bash
git add scripts/bake-walking.py scripts/test-bake-walking.py
git commit -m "Read GSI elevation tiles with DEM5A to DEM10B fallback"
```

---

### Task 5: 50m分割と勾配の算出

仕様4.4節。橋・トンネルの平坦化、±30%クランプ、階段の扱い。

**Files:**
- Modify: `scripts/bake-walking.py`
- Test: `scripts/test-bake-walking.py`

**Interfaces:**
- Consumes: Task 3の内部グラフ形式、Task 4の `Elevation`
- Produces:
  - `subdivide(graph, max_len=50.0) -> graph`（区間を50m以下に割る。新しいノードを末尾に足す）
  - `apply_grades(graph, elevation, clamp=0.30) -> None`（各区間の `GRADE` を埋める。破壊的）

- [ ] **Step 1: 失敗するテストを書く**

`scripts/test-bake-walking.py` の末尾に追記する。

```python
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

print('subdivide and grade checks passed (10 assertions).')
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `python3 scripts/test-bake-walking.py`
Expected: FAIL — `AttributeError: module 'bake' has no attribute 'subdivide'`

- [ ] **Step 3: 最小の実装を書く**

`scripts/bake-walking.py` に追記する。

```python
def subdivide(graph, max_len=50.0):
    """長い区間を分割する。標高を区間の平均で済ませると起伏が消えるため。"""
    nodes = [list(p) for p in graph['nodes']]
    edges = []
    for e in graph['edges']:
        parts = max(1, math.ceil(e[LEN] / max_len))
        if parts == 1:
            edges.append(list(e))
            continue
        pa, pb = graph['nodes'][e[A]], graph['nodes'][e[B]]
        previous = e[A]
        for i in range(1, parts + 1):
            if i < parts:
                t = i / parts
                nodes.append([pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t])
                current = len(nodes) - 1
            else:
                current = e[B]
            piece = list(e)
            piece[A], piece[B], piece[LEN] = previous, current, e[LEN] / parts
            edges.append(piece)
            previous = current
    return {'nodes': nodes, 'edges': edges}

def apply_grades(graph, elevation, clamp=0.30):
    """各区間の勾配を百分率で埋める。橋・トンネル・階段は平坦のままにする。"""
    cache = {}
    def height(i):
        if i not in cache:
            cache[i] = elevation.at(graph['nodes'][i][0], graph['nodes'][i][1])
        return cache[i]
    for e in graph['edges']:
        if e[FLAT] or e[STEPS] or e[LEN] <= 0:
            e[GRADE] = 0
            continue
        ha, hb = height(e[A]), height(e[B])
        if ha is None or hb is None:
            e[GRADE] = 0
            continue
        grade = max(-clamp, min(clamp, (hb - ha) / e[LEN]))
        e[GRADE] = round(grade * 100)
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `python3 scripts/test-bake-walking.py`
Expected: PASS — 5行の合格メッセージ

- [ ] **Step 5: 試作範囲で実データを通す**

`scripts/bake-walking.py` の `--pilot` 分岐に `--slope` オプションを足す。`graph = load_pilot_graph(...)` の直後に挿入する。

```python
        if '--slope' in sys.argv:
            graph = subdivide(graph, 50.0)
            elevation = Elevation(root / 'work/dem-cache')
            apply_grades(graph, elevation)
            print(json.dumps({'elevation': elevation.stats(),
                              'edges': len(graph['edges'])}, ensure_ascii=False), file=sys.stderr)
```

Run: `python3 scripts/bake-walking.py --pilot --slope`
Expected: `edges` が3,600前後、`by_source` に `dem5a` と `dem` の両方が入り、`missing` が0

- [ ] **Step 6: コミット**

```bash
git add scripts/bake-walking.py scripts/test-bake-walking.py
git commit -m "Derive per-edge gradient from elevation with 50m subdivision"
```

---

### Task 6: グリッドバケットによる最寄り道路探索

仕様5.2節。県全域では全区間の線形走査が成立しないため、空間索引を挟む。

**Files:**
- Modify: `scripts/bake-walking.py`
- Test: `scripts/test-bake-walking.py`

**Interfaces:**
- Consumes: Task 3の内部グラフ形式
- Produces: `class GridIndex` — `GridIndex(graph, cell_lon=0.0055, cell_lat=0.0045)` / `.candidates(lon, lat) -> set[int]`
  - `nearest_edge(..., index=grid)` から使う（Task 3で受け口は用意済み）

- [ ] **Step 1: 失敗するテストを書く**

`scripts/test-bake-walking.py` の末尾に追記する。

```python
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

# マスより長い区間でも、その中ほどから見つかる。
long_edge = {'nodes': [[131.0, 33.0], [131.2, 33.0]],
             'edges': [[0, 1, 18000.0, True, True, 'w', 0, False, False]]}
mid = m.GridIndex(long_edge)
assert mid.candidates(131.1, 33.0) == {0}

# 遠すぎれば見つからない。
assert m.nearest_edge(g, 131.0, 33.0, 30.0, grid) is None

print('grid index checks passed (over 15 assertions).')
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `python3 scripts/test-bake-walking.py`
Expected: FAIL — `AttributeError: module 'bake' has no attribute 'GridIndex'`

- [ ] **Step 3: 最小の実装を書く**

`scripts/bake-walking.py` に追記する。

```python
class GridIndex:
    """区間を約500m四方のマスへ仕分ける。検索半径が30mに固定なので3x3で必ず足りる。

    北緯34度では経度1度が約92km、緯度1度が約111km。
    """

    def __init__(self, graph, cell_lon=0.0055, cell_lat=0.0045):
        self.cell_lon = cell_lon
        self.cell_lat = cell_lat
        self.cells = {}
        for i, e in enumerate(graph['edges']):
            pa, pb = graph['nodes'][e[A]], graph['nodes'][e[B]]
            # マスより長い区間があるため、外接矩形が触れる全マスへ登録する。
            x0, x1 = sorted((int(pa[0] / cell_lon), int(pb[0] / cell_lon)))
            y0, y1 = sorted((int(pa[1] / cell_lat), int(pb[1] / cell_lat)))
            for x in range(x0, x1 + 1):
                for y in range(y0, y1 + 1):
                    self.cells.setdefault((x, y), []).append(i)

    def candidates(self, lon, lat):
        cx, cy = int(lon / self.cell_lon), int(lat / self.cell_lat)
        found = set()
        for x in range(cx - 1, cx + 2):
            for y in range(cy - 1, cy + 2):
                found.update(self.cells.get((x, y), ()))
        return found
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `python3 scripts/test-bake-walking.py`
Expected: PASS — 6行の合格メッセージ

- [ ] **Step 5: コミット**

```bash
git add scripts/bake-walking.py scripts/test-bake-walking.py
git commit -m "Add grid bucket index for nearest-road lookup at prefecture scale"
```

---

### Task 7: 県全域のOSM道路抽出

仕様5.1節。Geofabrikの中国地方PBFから山口県範囲の歩ける道路を抜く。**osmiumを使うのはこのファイルだけ。**

**Files:**
- Create: `scripts/extract-roads.py`
- Create: `requirements.txt`
- Modify: `scripts/build-walking-pilot.py`（`bridge` / `tunnel` / `layer` を保持タグへ追加）
- Modify: `scripts/sanitize-walking-source.py`（同上）

**Interfaces:**
- Consumes: `can_walk(tags)` / `node_open(tags)`（既存 `build-walking-pilot.py`。`test-walking-source.py` が検証済み）
- Produces: `work/yamaguchi-roads.json`
  ```json
  { "source_url": "...", "source_sha256": "...", "retrieved_at": "2026-09-09",
    "bbox": [130.8, 33.85, 132.4, 34.5],
    "nodes": {"12345": [131.1, 34.0]},
    "ways": [{"id": "678", "refs": ["12345"], "tags": {"highway": "residential"}}] }
  ```

- [ ] **Step 1: 保持タグを増やす**

`scripts/sanitize-walking-source.py` の `fields` 集合に `'bridge'`, `'tunnel'`, `'layer'` を加える。

```python
fields={'highway','area','foot','access','foot:conditional','access:conditional','oneway:foot:conditional','barrier','oneway:foot','foot:forward','foot:backward','bridge','tunnel','layer'}
```

- [ ] **Step 2: 既存のタグ判定テストが壊れていないことを確認する**

Run: `python3 scripts/test-walking-source.py`
Expected: PASS — `Walking source access and barrier checks passed (13 assertions).`

- [ ] **Step 3: 依存を宣言する**

`requirements.txt` を新規作成する。

```
osmium==4.3.1
```

Run: `python3 -m pip install -r requirements.txt`
Expected: インストール成功（Python 3.10〜3.14 のホイールあり）

- [ ] **Step 4: 抽出スクリプトを書く**

`scripts/extract-roads.py` を新規作成する。

```python
"""Geofabrikの中国地方PBFから、山口県範囲の歩ける道路を抜き出す。

osmium を使うのはこのファイルだけ。以降の処理は標準ライブラリで動く。
    python3 -m pip install -r requirements.txt
    curl -O https://download.geofabrik.de/asia/japan/chugoku-latest.osm.pbf
    python3 scripts/extract-roads.py work/chugoku-latest.osm.pbf
"""
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import osmium

ROOT = Path(__file__).resolve().parents[1]
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

    def way(self, w):
        tags = {k: v for k, v in w.tags if k in KEEP}
        if 'highway' not in tags or not builder.can_walk(tags):
            return
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


def main(pbf):
    pbf = Path(pbf)
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
    out = ROOT / 'work/yamaguchi-roads.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(json.dumps({'ways': len(result['ways']), 'nodes': len(result['nodes']),
                      'bytes': out.stat().st_size}, ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1])
```

- [ ] **Step 5: PBFを取得して実行する**

**Geofabrikのファイルは1日1回しか更新されない。手元にあれば取り直さない。**

Run:
```bash
mkdir -p work
test -f work/chugoku-latest.osm.pbf || curl -L --fail -o work/chugoku-latest.osm.pbf \
  https://download.geofabrik.de/asia/japan/chugoku-latest.osm.pbf
ls -lh work/chugoku-latest.osm.pbf
python3 scripts/extract-roads.py work/chugoku-latest.osm.pbf
```
Expected: 224MB前後のファイルが1つ。`ways` が10万件前後、`nodes` が100万件前後。処理は数分

`extract-roads.py` は同じファイルを2周する（1周目でwayと必要なノードIDを集め、
2周目でノードの座標とタグを拾う）。**どちらもローカルファイルの読み込みであり、
通信は発生しない。**

- [ ] **Step 6: 抽出結果の妥当性を確かめる**

Run:
```bash
python3 -c "
import json
d=json.load(open('work/yamaguchi-roads.json'))
lons=[p[0] for p in d['nodes'].values()];lats=[p[1] for p in d['nodes'].values()]
print('bbox:', min(lons), min(lats), max(lons), max(lats))
print('橋:', sum(1 for w in d['ways'] if w['tags'].get('bridge')))
print('階段:', sum(1 for w in d['ways'] if w['tags'].get('highway')=='steps'))
"
```
Expected: bboxが山口県を覆い、橋と階段がどちらも0件でないこと

- [ ] **Step 7: コミット**

```bash
git add scripts/extract-roads.py requirements.txt scripts/sanitize-walking-source.py
git commit -m "Extract prefecture-wide walkable roads from the Geofabrik PBF"
```

---

### Task 8: 全1,085停留所の焼き込みと配信物の検査

**Files:**
- Modify: `scripts/bake-walking.py`
- Modify: `scripts/verify-release.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1-7のすべて
- Produces: `public/data/walk/*.geojson`、`public/data/walk/index.json`（焼けた停留所IDの一覧）

- [ ] **Step 1: 焼き込みの本番コマンドを書く**

`scripts/bake-walking.py` の `__main__` 分岐に追記する（`--pilot` の分岐の後ろ、`else` として）。

```python
    else:
        roads = json.loads((root / 'work/yamaguchi-roads.json').read_text(encoding='utf-8'))
        index_of = {}
        nodes = []
        def node_index(key):
            if key not in index_of:
                index_of[key] = len(nodes)
                nodes.append(roads['nodes'][key][:2])
            return index_of[key]
        edges = []
        for way in roads['ways']:
            tags = way['tags']
            forward = tags.get('oneway:foot') != '-1'
            backward = tags.get('oneway:foot') not in {'yes', '1', 'true'}
            if not (forward or backward):
                continue
            is_flat = bool(tags.get('bridge')) or bool(tags.get('tunnel')) or tags.get('layer', '0') != '0'
            is_steps = tags.get('highway') == 'steps'
            for a, b in zip(way['refs'], way['refs'][1:]):
                if a not in roads['nodes'] or b not in roads['nodes']:
                    continue
                ta = roads['nodes'][a][2] if len(roads['nodes'][a]) > 2 else {}
                tb = roads['nodes'][b][2] if len(roads['nodes'][b]) > 2 else {}
                if not builder_node_open(ta) or not builder_node_open(tb):
                    continue
                ia, ib = node_index(a), node_index(b)
                length = meters(nodes[ia], nodes[ib])
                if length <= 0:
                    continue
                edges.append([ia, ib, length, forward, backward, way['id'], 0, is_steps, is_flat])
        graph = subdivide({'nodes': nodes, 'edges': edges}, 50.0)
        elevation = Elevation(root / 'work/dem-cache')
        apply_grades(graph, elevation)
        grid = GridIndex(graph)
        stops = json.loads((root / 'public/data/bus_stop.geojson').read_text(encoding='utf-8'))
        out = root / 'public/data/walk'
        out.mkdir(parents=True, exist_ok=True)
        baked = []
        for feature in stops['features']:
            stop_id = feature['id']
            name = feature['properties'].get('name', '名称未登録')
            fc = bake_stop(graph, stop_id, name, feature['geometry']['coordinates'], 1000.0, grid)
            if fc is None:
                continue
            (out / stop_filename(stop_id)).write_text(
                json.dumps(fc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
            baked.append(stop_id)
        (out / 'index.json').write_text(json.dumps(baked, ensure_ascii=False,
                                                   separators=(',', ':')), encoding='utf-8')
        print(json.dumps({'stops': len(stops['features']), 'baked': len(baked),
                          'elevation': elevation.stats()}, ensure_ascii=False))
```

`node_open` を使うため、ファイル冒頭付近に読み込みを足す。

```python
import importlib.util
_spec = importlib.util.spec_from_file_location('builder', Path(__file__).with_name('build-walking-pilot.py'))
_builder = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_builder)
builder_node_open = _builder.node_open
```

- [ ] **Step 2: 焼き込みを実行する**

**ここが外部通信の最大の山になる。** 標高タイルを約1,000枚、1秒間隔で逐次取得するため、
初回は取得だけで20分前後かかる。`work/dem-cache` に残るので、2回目以降は通信しない。

Run: `python3 scripts/bake-walking.py`
Expected: `baked` が1,000件前後（30m以内に道路がない停留所は除かれる）。
`elevation.requests` が実際に投げた回数。**2回目の実行ではこれが0になること**を確かめる

途中で止まった場合、キャッシュは残っているのでそのまま再実行してよい。
取得済みのタイルは取り直さない。

- [ ] **Step 3: 出力を検査する**

Run:
```bash
python3 -c "
import json,glob,os
files=glob.glob('public/data/walk/*.geojson')
total=sum(os.path.getsize(f) for f in files)
print(f'{len(files)}ファイル / {total/1024/1024:.0f}MB / 平均{total/len(files)/1024:.0f}KB')
d=json.load(open(files[0]))
assert d['type']=='FeatureCollection' and d['budget']==1000.0
segs=[f for f in d['features'] if f['properties']['role']=='segment']
assert segs and all(isinstance(f['properties']['d1'],int) for f in segs)
print('先頭ファイルの構造 OK / セグメント', len(segs))
"
```
Expected: 1,000ファイル前後・150MB前後・平均160KB前後

- [ ] **Step 4: 配信物の許可リストを更新する**

`scripts/verify-release.mjs` の1つ目の正規表現に `data/walk/...` を加え、廃止する `walking-onoda.json` の検査を外す。

置換前:
```js
 if(!/^(index\.html|review\.html|about\.html|third-party-notices\.txt|data\/(bus_stop|shopping|review-stops)\.geojson|data\/(walking-onoda|review-routes)\.json|assets\/[\w.-]+\.(js|css|png))$/.test(f.replaceAll('\\','/'))) throw Error(`Unexpected release file: ${f}`);
```

置換後:
```js
 if(!/^(index\.html|review\.html|about\.html|third-party-notices\.txt|data\/(bus_stop|shopping|review-stops)\.geojson|data\/review-routes\.json|data\/walk\/(index\.json|[\w.-]+\.geojson)|assets\/[\w.-]+\.(js|css|png))$/.test(f.replaceAll('\\','/'))) throw Error(`Unexpected release file: ${f}`);
```

同ファイル内の `walking-onoda.json` を参照する2行を削除する。

削除する行:
```js
for(const file of ['index.html','about.html','third-party-notices.txt','data/bus_stop.geojson','data/shopping.geojson','data/walking-onoda.json']) if(!files.includes(file)&&!files.includes(file.replaceAll('/','\\')))throw Error(`Missing release file ${file}`);
if(!fs.readFileSync('public/data/walking-onoda.json').equals(fs.readFileSync('dist/data/walking-onoda.json')))throw Error('Stale walking graph');
```

置き換える行:
```js
for(const file of ['index.html','about.html','third-party-notices.txt','data/bus_stop.geojson','data/shopping.geojson','data/walk/index.json']) if(!files.includes(file)&&!files.includes(file.replaceAll('/','\\')))throw Error(`Missing release file ${file}`);
const baked=JSON.parse(fs.readFileSync('dist/data/walk/index.json','utf8'));
if(!Array.isArray(baked)||baked.length<900)throw Error(`Too few baked catchments: ${baked.length}`);
for(const id of baked) if(!files.includes(`data/walk/${id.replaceAll('/','-')}.geojson`.replaceAll('/','\\'))&&!files.includes(`data/walk/${id.replaceAll('/','-')}.geojson`))throw Error(`Missing catchment ${id}`);
```

- [ ] **Step 5: 試作グラフを配信物から外し、テスト用の基準として残す**

`public/data/walking-onoda.json` はクライアントから使われなくなるが、
**勾配ゼロ回帰テストの基準として残す価値がある**。配信物からだけ外す。
`public/` にある限り `dist/` へコピーされるため、ディレクトリごと移す。

```bash
mkdir -p test/fixtures
git mv public/data/walking-onoda.json test/fixtures/walking-onoda.json
```

参照している3か所をすべて書き換える。

`scripts/bake-walking.py` の `--pilot` 分岐（2か所）:
```python
        graph = load_pilot_graph(root / 'test/fixtures/walking-onoda.json')
        pilot = json.loads((root / 'test/fixtures/walking-onoda.json').read_text(encoding='utf-8'))
```

`scripts/test-bake-walking.py`（3か所。`load_pilot_graph` の呼び出しが2回、`pilot` の読み込みが1回）:
```python
g = m.load_pilot_graph(ROOT / 'test/fixtures/walking-onoda.json')
pilot = json.loads((ROOT / 'test/fixtures/walking-onoda.json').read_text(encoding='utf-8'))
```

`scripts/test-walking.mjs` の `pilot` を読む行:
```js
const pilot=JSON.parse(fs.readFileSync('test/fixtures/walking-onoda.json','utf8'));
```

Run: `python3 scripts/test-bake-walking.py && python3 scripts/bake-walking.py --pilot`
Expected: PASS — 移動後も両方が通る

- [ ] **Step 6: ビルドと検査を通す**

Run: `npm run build && node scripts/verify-release.mjs`
Expected: PASS — `Release verified: ... files; 1085 bus stops; source data matches dist.`

この時点ではクライアントがまだ旧データを読むためビルドは型エラーになる可能性がある。その場合はTask 9-12を終えてから本Stepへ戻る。

- [ ] **Step 7: コミット**

```bash
git add public/data/walk test/fixtures scripts/bake-walking.py scripts/test-bake-walking.py scripts/test-walking.mjs scripts/verify-release.mjs
git commit -m "Bake walking catchments for every bus stop in the prefecture"
```

---

### Task 9: クライアントの読み込みと帯の描画

仕様6.1・6.2節。`src/walking.ts` から経路探索を撤去する。

**Files:**
- Modify: `src/walking.ts`
- Modify: `scripts/test-walking.mjs`

**Interfaces:**
- Consumes: Task 8が出力するGeoJSON
- Produces:
  - `interface Segment { a: Coordinate; b: Coordinate; d1: number; d2: number; grade: number; steps: boolean }`
  - `interface Catchment { stopId: string; budget: number; origin: Coordinate; snap: Coordinate; snapGap: number; segments: Segment[] }`
  - `parseCatchment(value: unknown): Catchment`（不正なら throw）
  - `reachableLines(catchment: Catchment, budget: number): Coordinate[][]`
  - `catchmentFile(stopId: string): string`
  - 既存の `distance` / `interpolate` / `project` はそのまま公開を続ける

- [ ] **Step 1: 失敗するテストを書く**

`scripts/test-walking.mjs` を全面的に書き換える。冒頭のimportを差し替える。

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCatchment, reachableLines, catchmentFile, distance } from '../src/walking.ts';

const x = 180 / (Math.PI * 6371000);
const seg = (x1, y1, x2, y2, d1, d2, grade = 0, steps = false) => ({
  type: 'Feature',
  properties: { role: 'segment', d1, d2, grade, steps },
  geometry: { type: 'LineString', coordinates: [[x1, y1], [x2, y2]] },
});
const collection = (...segments) => ({
  type: 'FeatureCollection', version: 1, stop_id: 'node/1', budget: 1000,
  features: [
    { type: 'Feature', properties: { role: 'stop', name: 'テスト' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    { type: 'Feature', properties: { role: 'snap', gap: 0 }, geometry: { type: 'LineString', coordinates: [[0, 0], [0, 0]] } },
    ...segments,
  ],
});

assert.equal(catchmentFile('node/5127585172'), 'node-5127585172.geojson');

// 全体がバジェット内なら丸ごと残る。
let c = parseCatchment(collection(seg(0, 0, 200 * x, 0, 0, 200)));
assert.equal(reachableLines(c, 200).length, 1);
assert(Math.abs(distance(...reachableLines(c, 200)[0]) - 200) < 0.01);

// 距離場が線形なので、途中で正確に切れる。
let line = reachableLines(c, 100)[0];
assert(Math.abs(distance(...line) - 100) < 0.01, distance(...line));
assert(Math.abs(line[1][0] / x - 100) < 0.01);

// 両端ともバジェット超なら消える。
assert.equal(reachableLines(parseCatchment(collection(seg(0, 0, 10 * x, 0, 500, 510))), 400).length, 0);

// 逆向き（d1 > d2）でも正しく切れる。
line = reachableLines(parseCatchment(collection(seg(0, 0, 200 * x, 0, 200, 0))), 100)[0];
assert(Math.abs(distance(...line) - 100) < 0.01);

// 壊れた入力は受け付けない。
assert.throws(() => parseCatchment({ type: 'X' }));
assert.throws(() => parseCatchment(collection({ ...seg(0, 0, 1, 1, 0, 1), properties: { role: 'segment', d1: 'a', d2: 1, grade: 0, steps: false } })));
console.log('parseCatchment and reachableLines checks passed.');
```

既存の合成グラフ検証（`calculateWalk` を使う部分）は、対応する関数が消えるためこの書き換えで取り除かれる。到達性・一方通行・交差非接続の担保は焼き込み側（Task 3の勾配ゼロ回帰テスト）へ移る。

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm run test:walking`
Expected: FAIL — `parseCatchment is not exported` 系のエラー

- [ ] **Step 3: 最小の実装を書く**

`src/walking.ts` を書き換える。`Coordinate` / `PointLike` / `distance` / `interpolate` / `project` の定義はそのまま残し、`Edge` / `WalkingGraph` / `Projection` / `WalkResult` / `validateGraph` / `MinHeap` / `calculateWalk` / `inPilot` を削除して、以下を加える。

```ts
export interface Segment { a: Coordinate; b: Coordinate; d1: number; d2: number; grade: number; steps: boolean }
export interface Catchment {
  stopId: string; budget: number; origin: Coordinate; snap: Coordinate; snapGap: number; segments: Segment[];
}

export function catchmentFile(stopId: string): string {
  return stopId.replaceAll('/', '-') + '.geojson';
}

const coordinate = (value: unknown): Coordinate => {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(n => Number.isFinite(n)) ||
    Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) throw Error('Invalid coordinate');
  return [value[0], value[1]];
};

export function parseCatchment(value: unknown): Catchment {
  const fc = value as { type?: string; stop_id?: string; budget?: number; features?: unknown[] };
  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features) ||
    typeof fc.stop_id !== 'string' || !Number.isFinite(fc.budget)) throw Error('Invalid catchment');
  let origin: Coordinate | null = null, snap: Coordinate | null = null, snapGap = 0;
  const segments: Segment[] = [];
  for (const raw of fc.features) {
    const f = raw as { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } };
    const role = f?.properties?.role;
    if (role === 'stop') origin = coordinate(f.geometry?.coordinates);
    else if (role === 'snap') {
      const line = f.geometry?.coordinates as unknown[];
      if (!Array.isArray(line) || line.length !== 2) throw Error('Invalid snap');
      snap = coordinate(line[1]);
      snapGap = Number(f.properties?.gap) || 0;
    } else if (role === 'segment') {
      const line = f.geometry?.coordinates as unknown[];
      if (!Array.isArray(line) || line.length !== 2) throw Error('Invalid segment');
      const { d1, d2, grade, steps } = f.properties as Record<string, unknown>;
      if (!Number.isFinite(d1) || !Number.isFinite(d2) || !Number.isFinite(grade)) throw Error('Invalid segment');
      segments.push({ a: coordinate(line[0]), b: coordinate(line[1]),
        d1: d1 as number, d2: d2 as number, grade: grade as number, steps: steps === true });
    }
  }
  if (!origin || !snap || !segments.length) throw Error('Invalid catchment');
  return { stopId: fc.stop_id, budget: fc.budget as number, origin, snap, snapGap, segments };
}

/** 各セグメントの内部は距離が線形なので、補間するだけで正確に切れる。 */
export function reachableLines(catchment: Catchment, budget: number): Coordinate[][] {
  const lines: Coordinate[][] = [];
  for (const { a, b, d1, d2 } of catchment.segments) {
    if (d1 > budget && d2 > budget) continue;
    if (d1 <= budget && d2 <= budget) { lines.push([a, b]); continue; }
    const t = (budget - d1) / (d2 - d1);
    lines.push(d1 <= budget ? [a, interpolate(a, b, t)] : [interpolate(a, b, t), b]);
  }
  return lines;
}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `npm run test:walking`
Expected: PASS — `parseCatchment and reachableLines checks passed.`

- [ ] **Step 5: コミット**

```bash
git add src/walking.ts scripts/test-walking.mjs
git commit -m "Read baked catchments client-side and drop the routing engine"
```

---

### Task 10: 施設の到達判定

仕様6.2節。任意の地物が徒歩圏に入るかを、焼いた距離場の上で判定する。

**Files:**
- Modify: `src/walking.ts`
- Modify: `scripts/test-walking.mjs`

**Interfaces:**
- Consumes: Task 9の `Catchment` / `Segment`
- Produces:
  - `interface FacilityReach { meters: number; point: Coordinate; gap: number; maxGrade: number; steps: boolean; path: Coordinate[] }`
  - `reachFacility(catchment: Catchment, outlines: Coordinate[][]): FacilityReach | null`
  - `path` はTask 11で埋める。本Taskでは `[origin, snap, point]` の暫定で構わない

- [ ] **Step 1: 失敗するテストを書く**

`scripts/test-walking.mjs` の import 行に `reachFacility` を加える。

```js
import { parseCatchment, reachableLines, reachFacility, catchmentFile, distance } from '../src/walking.ts';
```

そのうえで `console.log(...)` の直前に追記する。

```js
// 道路から25m以内の施設に届く。距離は道路上の距離＋垂線ぶん。
c = parseCatchment(collection(seg(0, 0, 200 * x, 0, 0, 200)));
let hit = reachFacility(c, [[[100 * x, 5 * x]]]);
assert(hit && Math.abs(hit.meters - 105) < 1, hit && hit.meters);
assert(Math.abs(hit.gap - 5) < 0.1);

// 25mより離れていれば候補にならない。
assert.equal(reachFacility(c, [[[100 * x, 40 * x]]]), null);

// バジェットの外にある施設も候補にならない。
assert.equal(reachFacility(parseCatchment(collection(seg(0, 0, 200 * x, 0, 900, 1000))), [[[190 * x, 1 * x]]]), null);

// 経路上の最大勾配と階段の有無を返す。
c = parseCatchment(collection(seg(0, 0, 100 * x, 0, 0, 100, 12, true)));
hit = reachFacility(c, [[[50 * x, 2 * x]]]);
assert(hit.maxGrade === 12 && hit.steps === true, hit);

// 複数候補があるときは近いほうを採る。
c = parseCatchment(collection(seg(0, 0, 100 * x, 0, 0, 100), seg(0, 0, 0, 100 * x, 0, 100)));
hit = reachFacility(c, [[[10 * x, 1 * x]]]);
assert(hit.meters < 20, hit.meters);
```

そして最後の `console.log` を差し替える。

```js
console.log('parseCatchment, reachableLines and reachFacility checks passed.');
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm run test:walking`
Expected: FAIL — `reachFacility is not a function`

- [ ] **Step 3: 最小の実装を書く**

`src/walking.ts` に追記する。

```ts
export interface FacilityReach {
  meters: number; point: Coordinate; gap: number; maxGrade: number; steps: boolean; path: Coordinate[];
}

/** 候補は「徒歩圏の道路上で施設外形から25m以内の地点」であり、出入口の確認ではない。 */
export function reachFacility(catchment: Catchment, outlines: Coordinate[][]): FacilityReach | null {
  let best: FacilityReach | null = null;
  for (const s of catchment.segments) {
    for (const ring of outlines) {
      for (let i = 0; i < ring.length; i++) {
        const candidates = [project(ring[i], s.a, s.b)];
        // 長い壁が代表されるよう、道路の端も外形へ投影して見る。
        if (i) for (const [end, t] of [[s.a, 0], [s.b, 1]] as const) {
          candidates.push({ t, point: end, gap: project(end, ring[i - 1], ring[i]).gap });
        }
        for (const { t, point, gap } of candidates) {
          if (gap > 25) continue;
          const meters = s.d1 + (s.d2 - s.d1) * t + gap;
          if (meters > catchment.budget) continue;
          if (!best || meters < best.meters) best = {
            meters, point, gap, maxGrade: Math.abs(s.grade), steps: s.steps,
            path: [catchment.origin, catchment.snap, point],
          };
        }
      }
    }
  }
  return best;
}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `npm run test:walking`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/walking.ts scripts/test-walking.mjs
git commit -m "Judge facility reach against the baked distance field"
```

---

### Task 11: 距離場を降下して経路を復元する

仕様6.3節(a)。親ポインタが無くなるため、距離場を下ることで最短経路を復元する。

**Files:**
- Modify: `src/walking.ts`
- Modify: `scripts/test-walking.mjs`

**Interfaces:**
- Consumes: Task 9の `Catchment`、Task 10の `reachFacility`
- Produces: `pathTo(catchment: Catchment, from: Coordinate, fromDistance: number): Coordinate[]`
  - `reachFacility` の `path` をこの関数の結果に差し替える
  - 端点の突き合わせは座標を小数5桁へ丸めた文字列で行う（焼き込みと同じ精度なので厳密に一致する）

- [ ] **Step 1: 失敗するテストを書く**

`scripts/test-walking.mjs` の import 行に `pathTo` を加える。

```js
import { parseCatchment, reachableLines, reachFacility, pathTo, catchmentFile, distance } from '../src/walking.ts';
```

そのうえで最後の `console.log` の直前に追記する。

```js
// 直線を降りる。終点から出発点まで距離が単調に減る。
c = parseCatchment(collection(
  seg(0, 0, 100 * x, 0, 0, 100),
  seg(100 * x, 0, 200 * x, 0, 100, 200)));
let route = pathTo(c, [200 * x, 0], 200);
assert(route.length >= 3, route.length);
assert.deepEqual(route[0], c.origin);
assert(Math.abs(route.at(-1)[0] / x - 200) < 0.01, route.at(-1));

// 遠回りの枝は選ばない。分岐から短いほうを降りる。
c = parseCatchment(collection(
  seg(0, 0, 50 * x, 0, 0, 50),
  seg(50 * x, 0, 120 * x, 0, 50, 120),
  seg(0, 0, 0, 300 * x, 0, 300)));
route = pathTo(c, [120 * x, 0], 120);
assert(route.every(p => Math.abs(p[1]) < 1e-9), route);

// reachFacility の経路も距離場から作られている。
hit = reachFacility(c, [[[110 * x, 2 * x]]]);
assert(hit.path.length >= 3 && hit.path[0] === c.origin, hit.path);
```

最後の `console.log` を差し替える。

```js
console.log('parseCatchment, reachableLines, reachFacility and pathTo checks passed.');
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npm run test:walking`
Expected: FAIL — `pathTo is not a function`

- [ ] **Step 3: 最小の実装を書く**

`src/walking.ts` に追記する。

```ts
const key = (p: PointLike) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;

/** 焼いたものは最短距離場なので、距離を下り続ければ最短経路になる。 */
export function pathTo(catchment: Catchment, from: Coordinate, fromDistance: number): Coordinate[] {
  const vertices = new Map<string, { point: Coordinate; d: number; next: string[] }>();
  const add = (point: Coordinate, d: number, other: Coordinate) => {
    const k = key(point);
    const entry = vertices.get(k) ?? { point, d, next: [] };
    entry.d = Math.min(entry.d, d);
    entry.next.push(key(other));
    vertices.set(k, entry);
  };
  for (const s of catchment.segments) { add(s.a, s.d1, s.b); add(s.b, s.d2, s.a); }

  // 出発地点に最も近い端点から降り始める。
  let current: string | undefined;
  let bestGap = Infinity;
  for (const [k, v] of vertices) {
    const gap = distance(from, v.point);
    if (v.d <= fromDistance + 1e-6 && gap < bestGap) { bestGap = gap; current = k; }
  }
  const tail: Coordinate[] = [];
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = vertices.get(current)!;
    tail.push(node.point);
    let next: string | undefined;
    for (const candidate of node.next) {
      const other = vertices.get(candidate);
      if (other && other.d < node.d - 1e-9 && (!next || other.d < vertices.get(next)!.d)) next = candidate;
    }
    current = next;
  }
  return [catchment.origin, catchment.snap, ...tail.reverse(), from];
}
```

`reachFacility` の `path` を差し替える。

置換前:
```ts
            path: [catchment.origin, catchment.snap, point],
```

置換後:
```ts
            path: [],
```

そして `reachFacility` の `return best;` の直前に追記する。

```ts
  if (best) best.path = pathTo(catchment, best.point, best.meters);
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `npm run test:walking`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/walking.ts scripts/test-walking.mjs
git commit -m "Reconstruct the walking route by descending the baked field"
```

---

### Task 12: パネルの遅延読み込みと3バンド化

仕様6.2・6.3・6.4節。

**Files:**
- Modify: `src/WalkingPanel.tsx`
- Modify: `src/BusStopLayer.tsx:17,79`

**Interfaces:**
- Consumes: Task 9-11のすべて
- Produces: `useWalkingData()` は `{ facilities, error, retry }` を返す。徒歩圏は `WalkingPanel` 内で `id` ごとに遅延取得する

- [ ] **Step 1: 施設の取得と徒歩圏の遅延取得を分ける**

`src/WalkingPanel.tsx` の冒頭のimportと `useWalkingData` を差し替える。

```tsx
import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import type { ShoppingCollection, ShoppingFeature } from './types';
import { catchmentFile, parseCatchment, reachFacility, reachableLines } from './walking';
import type { Catchment, Coordinate } from './walking';

export function useWalkingData() {
  const [facilities, setFacilities] = useState<ShoppingFeature[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setError(false); setFacilities(null);
    fetch(`${import.meta.env.BASE_URL}data/shopping.geojson`, { signal: abort.signal })
      .then(r => { if (!r.ok) throw Error('unavailable'); return r.json(); })
      .then((shopping: ShoppingCollection) => {
        if (shopping.type !== 'FeatureCollection' || !Array.isArray(shopping.features)) throw Error('Invalid facilities');
        const usable = shopping.features.filter(f => f.geometry && ['Point', 'MultiPolygon'].includes(f.geometry.type));
        if (!abort.signal.aborted) setFacilities(usable);
      }).catch(() => { if (!abort.signal.aborted) setError(true); });
    return () => abort.abort();
  }, [attempt]);
  return { facilities, error, retry: () => setAttempt(n => n + 1) };
}

/** 選択中のバス停の徒歩圏だけを取りに行く。焼いていない停留所は404になる。 */
function useCatchment(id: string) {
  const [state, setState] = useState<{ catchment: Catchment | null; loading: boolean }>({ catchment: null, loading: true });
  useEffect(() => {
    const abort = new AbortController();
    setState({ catchment: null, loading: true });
    fetch(`${import.meta.env.BASE_URL}data/walk/${catchmentFile(id)}`, { signal: abort.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(raw => { if (!abort.signal.aborted) setState({ catchment: raw ? parseCatchment(raw) : null, loading: false }); })
      .catch(() => { if (!abort.signal.aborted) setState({ catchment: null, loading: false }); });
    return () => abort.abort();
  }, [id]);
  return state;
}
```

- [ ] **Step 2: 本体を3バンド化し、試作UIを外す**

`WalkingPanel` の引数と冒頭を差し替える。

```tsx
export default function WalkingPanel({ map, id, origin, facilities, error, retry }: {
  map: L.Map | null; id: string; origin: Coordinate;
  facilities: ShoppingFeature[] | null; error: boolean; retry: () => void;
}) {
  const [minutes, setMinutes] = useState<5 | 10 | 15>(10);
  const [speed, setSpeed] = useState(4);
  const [showPath, setShowPath] = useState(false);
  const { catchment, loading } = useCatchment(id);
  const result = catchment;
  const candidates = useMemo(() => result && facilities ? facilities.map(f => {
    const rings: Coordinate[][] = f.geometry.type === 'Point' ? [[f.geometry.coordinates as Coordinate]] : f.geometry.coordinates.map(polygon => polygon[0] as Coordinate[]);
    return { facility: f, reach: reachFacility(result, rings) };
  }) : [], [result, facilities]);
  const visible = candidates.filter(c => c.reach && c.reach.meters <= speed * 1000 / 60 * minutes);
  useEffect(() => { setShowPath(false); }, [id, speed, minutes]);
```

帯の描画（現行49〜51行目）を3本に差し替える。

```tsx
    const bands = ([[15, '#b45309'], [10, '#c47b13'], [5, '#047857']] as const)
      .filter(([n]) => n <= minutes);
    for (const [n, color] of bands) {
      L.polyline(reachableLines(result, speed * 1000 / 60 * n).map(toLatLng),
        { color, weight: 7, opacity: 0.9, interactive: false }).addTo(group);
    }
```

`result.snap.point` を参照している破線の行を差し替える。

```tsx
    L.polyline(toLatLng([origin, result.snap]), { color: '#334155', weight: 3, dashArray: '3 5', interactive: false }).addTo(group);
```

地図の当て込み（現行63行目）を差し替える。

```tsx
    const lines = reachableLines(result, speed * 1000 / 60 * 15);
```

- [ ] **Step 3: 表示部分を差し替える**

`if (error) return ...` から `if (!supported) return ...` までを差し替える。

```tsx
  if (error) return <section className="walking-panel mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4" role="status">
    <p className="text-sm">徒歩圏のデータを読み込めませんでした。</p><button className="mt-3 min-h-11 rounded-lg border bg-white px-4 text-sm" onClick={retry}>再読み込み</button>
  </section>;
  if (loading || !facilities) return <p className="mb-6 text-sm" role="status">徒歩圏を準備しています…</p>;
```

停留所セレクタ（`<label ... htmlFor="walking-stop">` と直後の `<select id="walking-stop">`）を削除する。

バンドのボタンを3つにする。

```tsx
    <div className="mt-5 grid grid-cols-3 gap-2" role="group" aria-label="徒歩時間">
      {([5, 10, 15] as const).map(n => <button key={n} aria-pressed={minutes === n} onClick={() => setMinutes(n)} className={`min-h-12 rounded-xl border text-sm font-bold ${minutes === n ? 'border-emerald-900 bg-emerald-900 text-white' : 'border-stone-200 bg-white text-stone-700'}`}>徒歩 {n} 分</button>)}
    </div>
```

凡例を3色にする。

```tsx
    <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-stone-600">
      <span><i className="mr-1.5 inline-block h-1.5 w-5 rounded-full bg-emerald-700" />5分以内</span>
      {minutes >= 10 && <span><i className="mr-1.5 inline-block h-1.5 w-5 rounded-full bg-amber-600" />5〜10分</span>}
      {minutes === 15 && <span><i className="mr-1.5 inline-block h-1.5 w-5 rounded-full bg-amber-700" />10〜15分</span>}
    </div>
```

時間表示に、上り側で計算している旨と警告を足す。施設カードの `<p className="mt-1 text-xs text-stone-600">出入口までの経路は未確認です。</p>` を差し替える。

```tsx
        <p className="mt-1 text-xs text-stone-600">行きと帰りの、坂がきつい側で計算しています。出入口までの経路は未確認です。</p>
        {reach!.maxGrade > 5 && <p className="mt-1 text-xs font-semibold text-amber-800">経路に約{reach!.maxGrade}%の急な坂があります。</p>}
        {reach!.steps && <p className="mt-1 text-xs font-semibold text-amber-800">経路に階段があります。</p>}
```

0件時の案内文を3バンドに合わせる。

```tsx
      {visible.length ? ... : <p className="mt-3 rounded-xl bg-stone-50 p-4 text-sm leading-relaxed">登録済みの施設では、{minutes}分以内に到達する候補を確認できませんでした。{minutes < 15 ? 'より長い時間に広げると結果が変わることがあります。' : '周辺にお店がないことを意味するものではありません。'}</p>}
```

末尾の注意書きを差し替える。

```tsx
    <p className="mt-4 text-[11px] leading-relaxed text-stone-500">信号待ち、工事や現地の横断可否、車いす対応は反映していません。坂は地形データからの概算です。現地の通行状況を確認してください。</p>
```

`<span className="...">試作</span>` のバッジを削除する。

- [ ] **Step 4: 呼び出し側を合わせる**

`src/BusStopLayer.tsx:79` を差し替える。

```tsx
        <WalkingPanel map={map} id={selected} origin={selectedStop.geometry.coordinates as Coordinate} {...walking} />
```

`onSelect={setSelected}` を渡していた記述を取り除く。`walking` の中身が `{ facilities, error, retry }` に変わっている。

- [ ] **Step 5: 型検査とテストを通す**

Run: `npm run typecheck && npm run test:walking`
Expected: PASS — 型エラーなし

- [ ] **Step 6: 実際に動かして確認する**

Run: `npm run dev`
確認すること:
- バス停を選ぶと徒歩圏が3色の帯で出る
- 5分・10分・15分を切り替えると帯が増減する
- 歩く速さを変えると帯の広がりが変わる
- 焼かれていない停留所では「接続を確認できませんでした」が出る
- 買い物候補のカードに、坂・階段の警告が該当時のみ出る

- [ ] **Step 7: コミット**

```bash
git add src/WalkingPanel.tsx src/BusStopLayer.tsx
git commit -m "Load catchments lazily and offer 5/10/15 minute bands"
```

---

### Task 13: 説明の更新

仕様6.5節と10節。国土地理院の出典明示は、標高由来のデータを出荷するこの時点で入れる。

**Files:**
- Modify: `public/about.html`

**Interfaces:**
- Consumes: Task 8が出力したデータ
- Produces: なし

- [ ] **Step 1: 計算方法を書き換える**

`public/about.html` の23〜27行目（`<h2 id="walking">` 以下の4段落）を差し替える。

```html
  <h2 id="walking">徒歩圏の計算方法</h2>
  <p>OpenStreetMapの道路網と国土地理院の標高データを使い、選んだバス停から歩いて行ける範囲をあらかじめ計算しています。時速4km（ふつう）または3km（ゆっくり）で、徒歩5分・10分・15分の3段階を表示します。緑の線は5分以内、黄土色は5〜10分、濃い橙色は10〜15分で届く道路です。線に囲まれた敷地全体が歩けるという意味ではありません。</p>
  <p>坂の影響を歩く速さに反映しています。上りは遅く、下りはゆるやかなら少し速くなるという関係（Toblerの式）を使い、平坦な道に換算した距離で範囲を決めています。<strong>行きと帰りのうち、坂がきつい側で計算します。</strong>下り坂で遠くまで行けても帰りは上りになるためです。標高は国土地理院の標高タイル（5mまたは10mメッシュ）から求め、橋やトンネルは地表面ではなく両端を結んだ高さとして扱っています。階段は坂として計算せず、経路に含まれる場合に注意として表示します。</p>
  <p>道路はOSMの共通ノードでのみ接続し、図上で交差するだけの道路を接続しません。徒歩禁止・私有などの通行制限、歩行者の一方通行を参照し、自動車専用道路や条件付き通行で判断できない道路等を除外しています。バス停から最寄り道路への接続は30m以内に限り、その接続距離も時間に含めます。道路データが未登録・未接続の場合は範囲が狭くなることがあります。最寄り道路が30mより遠いバス停は徒歩圏を表示できません。</p>
  <p>買い物候補は、施設の建物外形から25m以内にある道路上の地点まで届くかで判定しています。表示時間・経路の終点は建物付近の道路です。入口や敷地内通路の接続を確認したものではありません。他の店舗を含む網羅調査ではないため、0件でも周辺に買い物先がないとは限りません。</p>
  <p>信号待ち、工事や現地の横断可否、車いす対応は反映していません。日常の移動やまちづくりを考えるための概算で、現地で使う確定した経路案内ではありません。</p>
```

- [ ] **Step 2: 国土地理院の出典と加工事実を入れる**

36行目のODbLの段落の直後に追記する。

```html
  <p>標高データ：<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院 標高タイル</a>（DEM5A・DEM10B）を使用しています。出典：国土地理院ウェブサイト。徒歩圏データは国土地理院の標高タイルをもとに勾配を算出して作成したものであり、国土地理院が作成したものではありません。</p>
```

- [ ] **Step 3: 配布リンクを差し替える**

40行目を差し替える。

```html
    <li><a href="data/walk/index.json" download>徒歩圏データの一覧（JSON）</a>／個別のバス停は <code>data/walk/&lt;バス停ID&gt;.geojson</code>（OSMと国土地理院標高タイルを加工、ODbL 1.0）</li>
```

- [ ] **Step 4: 試作前提の記述を直す**

17行目・22行目・31行目の「試作対象の7停留所」「おのだサンパーク周辺の7停留所」「試作地域のおのだサンパーク1施設」という記述を、県内全域に対応した現状へ書き換える。

17行目:
```html
    <li>青いバス停をクリックすると、右側（スマホでは下側）に詳細を表示します。徒歩5分・10分・15分と歩く速さを変更できます。×ボタンかEscキーで閉じられます。</li>
```

22行目:
```html
  <p>県内のバス停について、道路と坂に沿った徒歩5分・10分・15分の到達範囲を表示できます。買い物候補の判定は収録済みの商業施設19件が対象です。時刻表検索、乗換案内には対応していません。</p>
```

31行目の末尾の一文を差し替える。
```html
徒歩圏の候補判定は収録済みの19件が対象です。
```

- [ ] **Step 5: ビルドと配信物の検査を通す**

Run: `npm run build && node scripts/verify-release.mjs`
Expected: PASS

- [ ] **Step 6: すべてのテストを通す**

Run: `python3 scripts/test-bake-walking.py && python3 scripts/test-walking-source.py && python3 scripts/bake-walking.py --pilot && npm run test:walking && npm run typecheck`
Expected: すべてPASS

- [ ] **Step 7: コミット**

```bash
git add public/about.html
git commit -m "Describe the slope model and credit GSI elevation tiles"
```

---

## 完了の確認

すべてのTaskを終えたら、次がすべて成り立つこと。

- [ ] `python3 scripts/test-bake-walking.py` が通る
- [ ] `python3 scripts/test-walking-source.py` が通る
- [ ] `python3 scripts/bake-walking.py --pilot && npm run test:walking` が通る（勾配ゼロ回帰を含む）
- [ ] `npm run build && node scripts/verify-release.mjs` が通る
- [ ] `public/data/walk/` に1,000件前後のGeoJSONと `index.json` がある
- [ ] `public/data/walking-onoda.json` が消えている
- [ ] `src/walking.ts` に `calculateWalk` / `MinHeap` / `validateGraph` / `inPilot` が残っていない
- [ ] 地図上で任意のバス停を選ぶと、3バンドの徒歩圏と坂・階段の警告が出る
- [ ] `about.html` にODbLの継承条項と国土地理院の出典・加工事実の両方がある

## CIについて

`.github/workflows/build.yml` と `pages.yml` は次を実行する。**焼き込み自体はCIで走らせない**（PBFと標高タイルの取得が必要なため）。

```yaml
      - run: npm run test:walking
      - run: python3 scripts/test-walking-source.py
```

`npm run test:walking` は `work/pilot-bake` を要求するようになるため、両ワークフローの `npm run test:walking` の**前に**次の行を足すこと。

```yaml
      - run: python3 scripts/test-bake-walking.py
      - run: python3 scripts/bake-walking.py --pilot
```

`bake-walking.py` は標準ライブラリだけで動き、`--pilot` はリポジトリ内の `walking-onoda.json` しか読まないため、CIで osmium も外部通信も不要である。

試作グラフは Task 8 Step 5 で `test/fixtures/walking-onoda.json` へ移し、
配信物から外したうえで回帰テストの基準として残す。`public/` の外にあるため
`dist/` へはコピーされない。
