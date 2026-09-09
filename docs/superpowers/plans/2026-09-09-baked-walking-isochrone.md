# 徒歩圏の事前焼き込み 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 山口県内3,946バス停の徒歩圏（勾配込み）を事前計算してGeoJSONで配信し、クライアントから経路探索を撤去する。

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
- **バス停の出典** 国土数値情報 P11（`raw_data/P11-22_35.geojson`、2022年度・山口県）。
  4,418件を座標5桁で統合して**3,946件**にする
- **停留所ID** 座標を小数5桁で表した `<経度>_<緯度>`（例 `131.17228_33.98546`）
- **出力先** `work/walk/<stop-id>.geojson` を tar にまとめ、**Releaseアセットで配布**。
  gitには版を指すマニフェスト `public/data/walk-release.json` だけを置く
- **ライセンス** 成果物はODbL 1.0。国土地理院（標高）と国土数値情報（バス停）の
  出典と加工事実を併記。どちらもPDL1.0で継承条項を持たず、ODbLと衝突しない
- **Pythonの依存** PBF読み取りの `osmium` のみ。それ以外は標準ライブラリで書く。**CIで走るテストは osmium に依存させない**
- **npmの依存追加は禁止**（`package.json` の dependencies は leaflet / react / react-dom のまま）

### 原データの保存

**取得元のURLは不変ではない。** Geofabrikのファイルは毎日更新され、
国土地理院の標高タイルは過去版を取得できない。取得したものを残さなければ
同じ結果を再現できないため、焼き込みの入力を `raw_data/` に置いてgitで管理する。

- `work/` は使い捨ての中間物（`.gitignore` 済み）
- **`raw_data/` は保存すべき原データ（gitで管理）**

| データ | 置き場所 | git内 |
|---|---|---|
| バス停（P11） | `raw_data/P11-22_35.geojson` | 7.5MB |
| 標高タイル | `raw_data/dem/*.txt.gz` | 約73MB |
| 抽出済み道路 | `raw_data/yamaguchi-roads.json` | 30〜50MB（Task 7で実測して判断） |
| PBF原本 | Releaseアセット | — |
| isochrone出力 | Releaseアセット | — |

これにより、**リポジトリを持っていれば焼き直しに外部通信が一切不要**になる。

### 外部データ取得の作法（厳守）

国土地理院とGeofabrikは無償の公開サービスである。**一度きりの焼き込みのために、
繰り返し叩いてよい理由はない。**

- **逐次取得のみ。並列化しない。** 1リクエストごとに1秒以上あける
- **取得したものは必ず `raw_data/` へ残し、二度と取りに行かない。**
  焼き込みをやり直しても再取得が起きないこと
- **総リクエスト数に上限を設ける。** 上限に達したら中断する。
  実装の誤りが取得の洪水に化けるのを防ぐ
- **429・5xx のみ、間隔を指数的に空けて最大3回まで。** それ以外は再試行せず失敗させる
- **User-Agent は既定のままでよい。** 国土地理院の標高タイルは素の `urllib` で
  問題なく応答する（本設計中に14タイルで確認済み）。
  通らない相手にわざわざ名乗って通しにいかない
- **CIでは絶対に取得しない。** CIが走るたびに外部へ出ていくことになる
- **Geofabrikのファイルは1日1回しか更新されない。** 手元にあれば再取得しない。
  取得途中のファイルを「取得済み」と誤認しないよう、一時名で書いてから改名する

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
| `scripts/build-bus-stops.py`（新規） | P11 → `public/data/bus_stop.geojson`（重複統合・ID生成） |
| `scripts/fetch-walk-data.mjs`（新規） | Releaseから徒歩圏データを取得・検証・展開 |
| `public/about.html`（変更） | 計算方法と出典 |
| `requirements.txt`（新規） | `osmium==4.3.1` |
| `.gitignore`（変更） | `public/data/walk/` を除外 |
| `raw_data/dem/`（新規） | 標高タイルのgzip保存先。gitで管理 |
| `raw_data/yamaguchi-roads.json`（新規） | 抽出済み道路。gitで管理（50MB超ならRelease） |

## 作業の順序

Phase A（Task 1-3）は既存の試作グラフだけで完結し、外部通信を一切せずに
焼き込みの骨格を固める。正しさの錨は**式から導いた期待値**（Task 1の折り返し点、
Task 2の正規化）と**焼いたデータ自身の不変条件**に置く。
現行の `calculateWalk` は試作なので、それとの一致は厳密には求めない。

Phase B（Task 4-5）で初めて外部へ通信する。**取得の作法は上のGlobal Constraintsを厳守すること。**

---

### Task 1: クリップと折り返し分割

区間上の距離関数を折れ点で切り、各断片の内部が線形になることを保証する純関数。仕様5.3節。

距離関数は最大3つの候補の `min` である（始点から歩く直線・終点から歩く直線・
スナップ点を底とするV字）。**折れ点は、これらの分枝どうしが交わるすべての点**であり、
山型の頂点はその特殊ケースにすぎない。個別に列挙すると取りこぼすため、
分枝を「傾き・切片・定義域」で表して総当たりで交点を求める。

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

print('clip_edge checks passed (18 assertions).')
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
    # 各分枝を (傾き, 切片, 定義域の下限, 上限) で表す。距離はこれらの min。
    branches = []
    if forward and d_a < math.inf:
        branches.append((l_eff, d_a, 0.0, 1.0))
    if backward and d_b < math.inf:
        branches.append((-l_eff, d_b + l_eff, 0.0, 1.0))
    if snap is not None:
        t_s, gap = snap
        # 出発点から左（始点a側）へ進むのは b→a 方向なので backward が要る。
        if backward:
            branches.append((-l_eff, gap + t_s * l_eff, 0.0, t_s))   # スナップ点の左側
        # 出発点から右（終点b側）へ進むのは a→b 方向なので forward が要る。
        if forward:
            branches.append((l_eff, gap - t_s * l_eff, t_s, 1.0))    # 右側
    if not branches:
        return []

    def value(t):
        return min((m * t + c for m, c, lo, hi in branches if lo - 1e-12 <= t <= hi + 1e-12),
                   default=math.inf)

    cuts = {0.0, 1.0}
    if snap is not None:
        cuts.add(snap[0])
    # 分枝どうしが交わる点はすべて折れ点になる。ひとつでも取りこぼすと
    # その断片の内部が直線でなくなり、端点からの補間が誤差を生む。
    for i, (m1, c1, lo1, hi1) in enumerate(branches):
        for m2, c2, lo2, hi2 in branches[i + 1:]:
            if m1 == m2:
                continue
            t = (c2 - c1) / (m1 - m2)
            if max(lo1, lo2) < t < min(hi1, hi2):
                cuts.add(t)
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
            if math.isinf(v_lo):
                # 定義域の外（一方通行で逆側の分枝が無い等）は幅ゼロまで縮める。
                # (v_lo-budget)/(v_lo-v_hi) は inf/inf で nan になるため比例配分できない。
                lo, v_lo = hi, v_hi
            else:
                lo = lo + span * (v_lo - budget) / (v_lo - v_hi)
                v_lo = budget
        elif v_hi > budget:
            if math.isinf(v_hi):
                hi, v_hi = lo, v_lo
            else:
                hi = lo + (hi - lo) * (budget - v_lo) / (v_hi - v_lo)
                v_hi = budget
        if hi - lo < 1e-9:
            continue
        out.append((lo, hi, v_lo, v_hi))
    return out

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
    # 始点a側へ着くには b→a (backward) が要る。ただし出発点が端a上にあるなら
    # そもそも歩く必要がないので常に着く。bも同様にforwardと端点の例外を見る。
    seeds = []
    if e[BWD] or t < 1e-10:
        seeds.append((e[A], gap + t * le))
    if e[FWD] or t > 1 - 1e-10:
        seeds.append((e[B], gap + (1 - t) * le))
    for node, cost in seeds:
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

def stop_filename(sid):
    return sid + '.geojson'

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
            # 試作データの停留所IDは node/… 形式。ファイル名だけ無害化する。
            (out / stop_filename(stop['id'].replace('/', '-'))).write_text(
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
// calculateWalk との突き合わせは、Task 11 でそれが消えるまでの暫定。
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
  - `class Elevation` — `Elevation(cache_dir, pause=1.0, max_requests=4000, backoff=(5,15,45), fetch=http_text, sleep=time.sleep)`
    **`sleep` も差し替え可能にする。** さもないと間隔をあけているかを検証できず、
    成功パスから間隔を削っても全テストが通ってしまう
    キャッシュ先は `raw_data/dem/`。**1タイル1ファイルのgzip**で保存する
    / `.at(lon, lat) -> float | None` / `.stats() -> dict`
  - `tile_index(lon, lat, z) -> (x, y, px, py)` / `parse_tile(text) -> list[list[float|None]]`

**取得の作法:** 逐次・1秒間隔・ディスクキャッシュ・総数上限・
429と5xxのみ最大3回の指数バックオフ。Global Constraintsを実装へ落とす。

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
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `python3 scripts/test-bake-walking.py`
Expected: FAIL — `AttributeError: module 'bake' has no attribute 'tile_index'`

- [ ] **Step 3: 最小の実装を書く**

`scripts/bake-walking.py` に追記する。

```python
import gzip
import urllib.request
import urllib.error
import time

GSI_TILES = (('dem5a', 15), ('dem', 14))   # DEM5A(5mメッシュ) を優先し、欠測は DEM10B で埋める
RETRY_CODES = {429, 500, 502, 503, 504}

def http_text(url, timeout=60):
    return urllib.request.urlopen(url, timeout=timeout).read().decode()
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
e=m.Elevation('raw_data/dem')
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
            elevation = Elevation(root / 'raw_data/dem')
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
- Produces: `raw_data/yamaguchi-roads.json`（gitで管理。仕様3.3節）
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
```

- [ ] **Step 5: PBFを取得して実行する**

スクリプトが無ければ取得し、あれば使い回す。**224MBを二度取りに行かせない。**

Run: `python3 scripts/extract-roads.py`
Expected: 初回は224MB前後のダウンロード。`ways` が10万件前後、`nodes` が100万件前後。
抽出そのものは数分

- [ ] **Step 6: 二度目は取得しないことを確かめる**

Run: `python3 scripts/extract-roads.py`
Expected: `既にある: work/chugoku-latest.osm.pbf (224MB)` と出て、**ダウンロードが走らない**

PBFの読み取りは同じファイルを2周する（1周目でwayと必要なノードIDを集め、
2周目でノードの座標とタグを拾う）が、どちらもローカル読み込みで通信は発生しない。

`extract-roads.py` は同じファイルを2周する（1周目でwayと必要なノードIDを集め、
2周目でノードの座標とタグを拾う）。**どちらもローカルファイルの読み込みであり、
通信は発生しない。**

- [ ] **Step 7: 抽出結果の妥当性を確かめる**

Run:
```bash
python3 -c "
import json
d=json.load(open('raw_data/yamaguchi-roads.json'))
lons=[p[0] for p in d['nodes'].values()];lats=[p[1] for p in d['nodes'].values()]
print('bbox:', min(lons), min(lats), max(lons), max(lats))
print('橋:', sum(1 for w in d['ways'] if w['tags'].get('bridge')))
print('階段:', sum(1 for w in d['ways'] if w['tags'].get('highway')=='steps'))
"
```
Expected: bboxが山口県を覆い、橋と階段がどちらも0件でないこと

- [ ] **Step 8: gitに入れてよいサイズか測る**

抽出済み道路はgitで管理する方針だが、サイズを実測してから確定する（仕様3.3節）。

Run:
```bash
python3 -c "
import os,zlib
f='raw_data/yamaguchi-roads.json'
raw=os.path.getsize(f); z=len(zlib.compress(open(f,'rb').read(),6))
print(f'生 {raw/1024/1024:.0f}MB / git内(zlib) {z/1024/1024:.0f}MB')
print('→ gitへ' if z < 50*1024*1024 else '→ 50MB超。Releaseへ回し .gitignore に追加する')
"
```

**git内が50MB以下ならそのままコミットする。** 超える場合は `.gitignore` に
`raw_data/yamaguchi-roads.json` を足し、Task 10 でPBF原本と一緒に
Releaseアセットへ回すこと。

- [ ] **Step 9: PBF原本のハッシュを控える**

PBFはgitに入れない（224MBがまったく縮まないうえ、大半が不要な中間生成物）。
Task 10 でReleaseアセットとして保管する。

Run: `ls -lh work/chugoku-latest.osm.pbf && shasum -a 256 work/chugoku-latest.osm.pbf`
Expected: 224MB前後。SHA256が `raw_data/yamaguchi-roads.json` の
`source_sha256` と一致すること

- [ ] **Step 10: コミット**

```bash
git add scripts/extract-roads.py requirements.txt scripts/sanitize-walking-source.py \
  raw_data/yamaguchi-roads.json
git commit -m "Extract prefecture-wide walkable roads from the Geofabrik PBF"
```

---

### Task 8: 国土数値情報からバス停データを生成する

仕様4.6節。P11の4,418件を座標5桁で統合して3,946件にし、`bus_stop.geojson` を作り直す。

**Files:**
- Create: `scripts/build-bus-stops.py`
- Modify: `public/data/bus_stop.geojson`（OSM由来1,085件 → P11由来3,946件）
- Test: `scripts/test-bake-walking.py`

**Interfaces:**
- Consumes: `raw_data/P11-22_35.geojson`、`stop_id`（Task 3）
- Produces: `public/data/bus_stop.geojson`
  ```json
  { "type": "Feature", "id": "131.17228_33.98546",
    "properties": { "name": "堀越", "names": ["堀越"],
                    "operators": ["宇部市", "美祢市"], "routes": ["…"] },
    "geometry": { "type": "Point", "coordinates": [131.17228, 33.98546] } }
  ```
  `name` は `names` の先頭。既存UIが `properties.name` をそのまま使えるようにする

- [ ] **Step 1: 失敗するテストを書く**

`scripts/test-bake-walking.py` の末尾に追記する。

```python
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
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `python3 scripts/test-bake-walking.py`
Expected: FAIL — `assert len(feats) == 3946` が 1085 で落ちる

- [ ] **Step 3: 変換スクリプトを書く**

`scripts/build-bus-stops.py` を新規作成する。

```python
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
    out = ROOT / 'public/data/bus_stop.geojson'
    out.write_text(json.dumps({
        'type': 'FeatureCollection',
        'source': '国土数値情報 バス停留所データ（P11-22_35）',
        'source_url': 'https://nlftp.mlit.go.jp/ksj/',
        'attribution': '出典：国土交通省国土数値情報ダウンロードサイト',
        'license': 'PDL-1.0',
        'note': '同一座標（小数5桁）の記録を1件に統合し、名称・事業者・系統をまとめた',
        'features': features,
    }, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(json.dumps({'source': len(raw), 'stops': len(features),
                      'merged': len(raw) - len(features),
                      'bytes': out.stat().st_size}, ensure_ascii=False))


if __name__ == '__main__':
    main()
```

- [ ] **Step 4: 変換を実行する**

Run: `python3 scripts/build-bus-stops.py`
Expected: `{"source": 4418, "stops": 3946, "merged": 472, ...}`

- [ ] **Step 5: テストが通ることを確認する**

Run: `python3 scripts/test-bake-walking.py`
Expected: PASS — `bus stop conversion checks passed (over 10 assertions).`

- [ ] **Step 6: 配信物の検査で件数を合わせる**

`scripts/verify-release.mjs` のバス停件数の検査を差し替える。

置換前:
```js
if(bus.features.length!==1085)throw Error('Unexpected bus stop count');
```

置換後:
```js
if(bus.features.length!==3946)throw Error('Unexpected bus stop count');
```

同ファイルの `console.log` の `1085 bus stops` も `3946 bus stops` にする。

- [ ] **Step 7: コミット**

```bash
git add scripts/build-bus-stops.py scripts/test-bake-walking.py public/data/bus_stop.geojson scripts/verify-release.mjs
git commit -m "Rebuild bus stops from the national bus stop dataset"
```

---

### Task 9: 全3,946停留所の焼き込み

**Files:**
- Modify: `scripts/bake-walking.py`

**Interfaces:**
- Consumes: Task 1-8のすべて
- Produces: `work/walk/<stop-id>.geojson` と `work/walk/index.json`（焼けたID一覧）
  - **`public/` ではなく `work/` へ出す。** 配布はTask 10のReleaseアセットで行う

- [ ] **Step 1: 焼き込みの本番コマンドを書く**

`scripts/bake-walking.py` の `__main__` 分岐に追記する（`--pilot` の分岐の後ろ、`else` として）。

```python
    else:
        roads = json.loads((root / 'raw_data/yamaguchi-roads.json').read_text(encoding='utf-8'))
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
        elevation = Elevation(root / 'raw_data/dem')
        apply_grades(graph, elevation)
        grid = GridIndex(graph)
        stops = json.loads((root / 'public/data/bus_stop.geojson').read_text(encoding='utf-8'))
        out = root / 'work/walk'
        out.mkdir(parents=True, exist_ok=True)
        baked = []
        for feature in stops['features']:
            sid = feature['id']
            name = feature['properties'].get('name', '名称未登録')
            fc = bake_stop(graph, sid, name, feature['geometry']['coordinates'], 1000.0, grid)
            if fc is None:
                continue
            (out / stop_filename(sid)).write_text(
                json.dumps(fc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
            baked.append(sid)
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
初回は取得だけで20分前後かかる。`raw_data/dem/` にgzipで残り**gitで管理する**ので、
2回目以降はこのリポジトリを持つ誰も国土地理院へ通信しない。

Run: `python3 scripts/bake-walking.py`
Expected: `stops` が3946、`baked` が3,800件前後（30m以内に道路がない停留所は除かれる）。
`elevation.requests` が実際に投げた回数

途中で止まった場合、キャッシュは残っているのでそのまま再実行してよい。

- [ ] **Step 3: 二度目は標高を取りに行かないことを確かめる**

Run: `python3 scripts/bake-walking.py`
Expected: `elevation` の `requests` が **0** であること

- [ ] **Step 4: 出力を検査する**

Run:
```bash
python3 -c "
import json,glob,os
files=[f for f in glob.glob('work/walk/*.geojson')]
total=sum(os.path.getsize(f) for f in files)
print(f'{len(files)}ファイル / {total/1024/1024:.0f}MB / 中央値{sorted(os.path.getsize(f) for f in files)[len(files)//2]/1024:.0f}KB')
d=json.load(open(files[0]))
assert d['type']=='FeatureCollection' and d['budget']==1000.0
segs=[f for f in d['features'] if f['properties']['role']=='segment']
assert segs and all(isinstance(f['properties']['d1'],int) for f in segs)
print('先頭ファイルの構造 OK / セグメント', len(segs))
"
```
Expected: 3,800件前後・**合計が1024MBを大きく下回ること**（見込み400〜610MB）。
仕様2節の見積りは市街地基準なので、実測がこれより小さければそのまま進む。
**もし800MBを超えていたら、コンパクトな配列形式への切り替えを検討する**（仕様9節）

- [ ] **Step 5: 取得した標高タイルをコミットする**

`raw_data/dem/` に溜まったタイルをgitへ入れる。これで国土地理院への通信が
このリポジトリから消える（仕様3.3節）。

Run:
```bash
du -sh raw_data/dem && ls raw_data/dem | wc -l
git add raw_data/dem
git commit -m "Store the fetched GSI elevation tiles so no one refetches them"
```
Expected: 1,000枚前後・約73MB。**300MBを大きく超えていたらgzip保存が効いていない**ので
Task 4 の実装を確認すること

- [ ] **Step 6: コミット**

```bash
git add scripts/bake-walking.py
git commit -m "Bake walking catchments for every bus stop in the prefecture"
```

`work/` は `.gitignore` 済みなので、焼いたデータ自体はコミットされない。

---

### Task 10: Releaseアセットでの配布と取得

仕様3.2節。609MBをgitに置かず、Releaseアセットで配る。

**Files:**
- Create: `scripts/fetch-walk-data.mjs`
- Create: `public/data/walk-release.json`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `scripts/verify-release.mjs`
- Modify: `.github/workflows/build.yml`, `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: `work/walk/`（Task 9）
- Produces:
  - `work/walk-data-<日付>.tar.gz`（Releaseアセット）
  - `public/data/walk-release.json` = `{tag, asset, sha256, count}`（gitに置く唯一のもの）
  - `npm run data:fetch` が `public/data/walk/` を用意する

- [ ] **Step 1: 焼いたデータをまとめる**

Run:
```bash
DATE=$(date +%Y%m%d)
tar -czf "work/walk-data-$DATE.tar.gz" -C work walk
ls -lh "work/walk-data-$DATE.tar.gz"
shasum -a 256 "work/walk-data-$DATE.tar.gz"
```
Expected: gzipで50MB前後。**2GB（Releaseアセットの上限）を大きく下回ること**

- [ ] **Step 2: Releaseへ上げる**

徒歩圏データと、gitに入れないPBF原本をまとめて添付する。PBFは保管目的であり、
`npm run data:fetch` は取りに行かない。

Run:
```bash
DATE=$(date +%Y%m%d)
gh release create "walk-data-$DATE" \
  "work/walk-data-$DATE.tar.gz" \
  work/chugoku-latest.osm.pbf \
  --title "徒歩圏データ $DATE" \
  --notes "OSM(ODbL 1.0)と国土地理院標高タイルから生成した、山口県内バス停の徒歩圏データ。chugoku-latest.osm.pbf は抽出元の原本（保管用）。"
```
Expected: Releaseが作成され、2つのアセットのURLが表示される

Task 7 Step 8 で `raw_data/yamaguchi-roads.json` が50MBを超えていた場合は、
それもここへ添付し `.gitignore` に加えること。

- [ ] **Step 3: マニフェストを書く**

`public/data/walk-release.json` を作成する。値はStep 1・2の実測に置き換えること。

```json
{
  "tag": "walk-data-20260909",
  "asset": "walk-data-20260909.tar.gz",
  "sha256": "（Step 1 で出た値）",
  "count": 3800
}
```

- [ ] **Step 4: 取得スクリプトを書く**

`scripts/fetch-walk-data.mjs` を新規作成する。

```js
// Releaseアセットから徒歩圏データを取得して public/data/walk/ へ展開する。
// 取得先はGitHub自身であり、国土地理院やGeofabrikを叩くものではない。
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const REPO = process.env.WALK_DATA_REPO ?? 'gunsow/bus-stop-compact-town';
const manifest = JSON.parse(fs.readFileSync('public/data/walk-release.json', 'utf8'));
const dest = 'public/data/walk';

if (fs.existsSync(`${dest}/index.json`)) {
  const have = JSON.parse(fs.readFileSync(`${dest}/index.json`, 'utf8'));
  if (have.length === manifest.count) {
    console.log(`Walk data already present: ${have.length} catchments.`);
    process.exit(0);
  }
}

const url = `https://github.com/${REPO}/releases/download/${manifest.tag}/${manifest.asset}`;
console.log(`Fetching ${url}`);
const response = await fetch(url, { redirect: 'follow' });
if (!response.ok) throw Error(`Download failed: ${response.status} ${url}`);
const body = Buffer.from(await response.arrayBuffer());

const digest = crypto.createHash('sha256').update(body).digest('hex');
if (digest !== manifest.sha256) throw Error(`Checksum mismatch: ${digest} != ${manifest.sha256}`);

fs.mkdirSync('work', { recursive: true });
fs.writeFileSync(`work/${manifest.asset}`, body);
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync('public/data', { recursive: true });
execFileSync('tar', ['-xzf', `work/${manifest.asset}`, '-C', 'public/data'], { stdio: 'inherit' });

const index = JSON.parse(fs.readFileSync(`${dest}/index.json`, 'utf8'));
if (index.length !== manifest.count) throw Error(`Expected ${manifest.count} catchments, got ${index.length}`);
console.log(`Walk data ready: ${index.length} catchments.`);
```

- [ ] **Step 5: gitから除外し、npmスクリプトを足す**

`.gitignore` に追記する。

```
public/data/walk/
```

`package.json` の `scripts` に追記する。`build` の前段で取得するようにはしない
（ビルドのたびに落としに行かせない）。CIとローカルで明示的に呼ぶ。

```json
    "data:fetch": "node scripts/fetch-walk-data.mjs",
```

- [ ] **Step 6: 取得を試す**

Run:
```bash
rm -rf public/data/walk
npm run data:fetch
ls public/data/walk | head -3
ls public/data/walk | wc -l
```
Expected: マニフェストの `count` と同じ件数が展開される

- [ ] **Step 7: 二度目は取得しないことを確かめる**

Run: `npm run data:fetch`
Expected: `Walk data already present: … catchments.` と出て、**ダウンロードが走らない**

- [ ] **Step 8: 配信物の許可リストを更新する**

`scripts/verify-release.mjs` の1つ目の正規表現に `data/walk/...` と
`data/walk-release.json` を加え、廃止する `walking-onoda.json` の検査を外す。

置換前:
```js
 if(!/^(index\.html|review\.html|about\.html|third-party-notices\.txt|data\/(bus_stop|shopping|review-stops)\.geojson|data\/(walking-onoda|review-routes)\.json|assets\/[\w.-]+\.(js|css|png))$/.test(f.replaceAll('\\','/'))) throw Error(`Unexpected release file: ${f}`);
```

置換後:
```js
 if(!/^(index\.html|review\.html|about\.html|third-party-notices\.txt|data\/(bus_stop|shopping|review-stops)\.geojson|data\/(review-routes|walk-release)\.json|data\/walk\/(index\.json|[\w.\-]+\.geojson)|assets\/[\w.-]+\.(js|css|png))$/.test(f.replaceAll('\\','/'))) throw Error(`Unexpected release file: ${f}`);
```

`walking-onoda.json` を参照する2行を差し替える。

削除する行:
```js
for(const file of ['index.html','about.html','third-party-notices.txt','data/bus_stop.geojson','data/shopping.geojson','data/walking-onoda.json']) if(!files.includes(file)&&!files.includes(file.replaceAll('/','\\')))throw Error(`Missing release file ${file}`);
if(!fs.readFileSync('public/data/walking-onoda.json').equals(fs.readFileSync('dist/data/walking-onoda.json')))throw Error('Stale walking graph');
```

置き換える行:
```js
for(const file of ['index.html','about.html','third-party-notices.txt','data/bus_stop.geojson','data/shopping.geojson','data/walk/index.json','data/walk-release.json']) if(!files.includes(file)&&!files.includes(file.replaceAll('/','\\')))throw Error(`Missing release file ${file}`);
const manifest=JSON.parse(fs.readFileSync('public/data/walk-release.json','utf8'));
const baked=JSON.parse(fs.readFileSync('dist/data/walk/index.json','utf8'));
if(baked.length!==manifest.count)throw Error(`Catchment count ${baked.length} != manifest ${manifest.count}`);
for(const id of baked) if(!files.includes(`data/walk/${id}.geojson`)&&!files.includes(`data\\walk\\${id}.geojson`))throw Error(`Missing catchment ${id}`);
```

- [ ] **Step 9: 試作グラフを配信物から外し、テスト用の基準として残す**

`public/data/walking-onoda.json` はクライアントから使われなくなるが、
**Task 3の突き合わせの基準として残す価値がある**。配信物からだけ外す。

```bash
mkdir -p test/fixtures
git mv public/data/walking-onoda.json test/fixtures/walking-onoda.json
```

参照している3か所を書き換える。

`scripts/bake-walking.py` の `--pilot` 分岐（2か所）:
```python
        graph = load_pilot_graph(root / 'test/fixtures/walking-onoda.json')
        pilot = json.loads((root / 'test/fixtures/walking-onoda.json').read_text(encoding='utf-8'))
```

`scripts/test-bake-walking.py`（`load_pilot_graph` 2回、`pilot` の読み込み1回）:
```python
g = m.load_pilot_graph(ROOT / 'test/fixtures/walking-onoda.json')
pilot = json.loads((ROOT / 'test/fixtures/walking-onoda.json').read_text(encoding='utf-8'))
```

`scripts/test-walking.mjs` の `pilot` を読む行:
```js
const pilot=JSON.parse(fs.readFileSync('test/fixtures/walking-onoda.json','utf8'));
```

- [ ] **Step 10: CIに取得ステップを足す**

`.github/workflows/build.yml` と `.github/workflows/pages.yml` の両方で、
`- run: npm run build` の**直前**に追記する。

```yaml
      - run: npm run data:fetch
```

あわせて、`- run: npm run test:walking` の**前**に次を足す。

```yaml
      - run: python3 scripts/test-bake-walking.py
      - run: python3 scripts/bake-walking.py --pilot
```

`bake-walking.py --pilot` は標準ライブラリだけで動き、リポジトリ内の
`test/fixtures/walking-onoda.json` しか読まないため、CIで osmium も外部通信も不要である。
`data:fetch` の取得先はGitHub自身であり、外部データ取得の作法には抵触しない。

- [ ] **Step 11: ビルドと検査を通す**

Run: `npm run data:fetch && npm run build && node scripts/verify-release.mjs`
Expected: PASS

この時点ではクライアントがまだ旧データを読むため型エラーになる可能性がある。
その場合はTask 11-14を終えてから本Stepへ戻る。

- [ ] **Step 12: コミット**

```bash
git add .gitignore package.json public/data/walk-release.json scripts/fetch-walk-data.mjs \
  scripts/verify-release.mjs .github/workflows test/fixtures \
  scripts/bake-walking.py scripts/test-bake-walking.py scripts/test-walking.mjs
git commit -m "Distribute baked catchments as a release asset"
```

---


### Task 11: クライアントの読み込みと帯の描画

仕様6.1・6.2節。`src/walking.ts` から経路探索を撤去する。

**Files:**
- Modify: `src/walking.ts`
- Modify: `scripts/test-walking.mjs`

**Interfaces:**
- Consumes: Task 9が出力するGeoJSON
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

assert.equal(catchmentFile('131.17228_33.98546'), '131.17228_33.98546.geojson');
// URLを組み立てるので、想定外の形のIDは通さない。
assert.throws(() => catchmentFile('../../etc/passwd'));
assert.throws(() => catchmentFile('131.1/33.9'));

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

既存の合成グラフ検証（`calculateWalk` を使う部分）は、対応する関数が消えるためこの書き換えで取り除かれる。到達性・一方通行・交差非接続の担保は焼き込み側（Task 3）へ移る。

**Task 3 が入れた不変条件ブロックは残すこと。** `work/pilot-bake` を読んで
帯の単調性とバジェット上限を確かめる部分は、焼いたデータだけで閉じており
`calculateWalk` に依存しない。CIの `bake-walking.py --pilot` ステップが
検証しているのはこのブロックなので、消すとCIが何も確かめなくなる。

Task 3 のブロックから**削るのは次の3行だけ**。

```js
    // 現行の calculateWalk は試作なので、桁違いのずれだけを見る参考比較にとどめる。
    const live = total(reachableLines(calculateWalk(pilot, stop.coordinate, 1000), 1000));
    assert(Math.abs(bands[3] - live) < live * 0.10,
      `${stop.name}: baked ${bands[3].toFixed(0)}m vs provisional ${live.toFixed(0)}m`);
```

あわせて、使われなくなる `const total = …` の行と、`pilot` を読む行も
不要になれば整理してよい。`bands` の検査と `work/pilot-bake` の存在検査は残す。

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

const ID = /^-?\d+(\.\d+)?_-?\d+(\.\d+)?$/;

/** IDは座標由来。URLに使うので、想定の形以外は弾く。 */
export function catchmentFile(stopId: string): string {
  if (!ID.test(stopId)) throw Error(`Invalid stop id: ${stopId}`);
  return stopId + '.geojson';
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

### Task 12: 施設の到達判定

仕様6.2節。任意の地物が徒歩圏に入るかを、焼いた距離場の上で判定する。

**Files:**
- Modify: `src/walking.ts`
- Modify: `scripts/test-walking.mjs`

**Interfaces:**
- Consumes: Task 11の `Catchment` / `Segment`
- Produces:
  - `interface FacilityReach { meters: number; point: Coordinate; gap: number; maxGrade: number; steps: boolean; path: Coordinate[] }`
  - `reachFacility(catchment: Catchment, outlines: Coordinate[][]): FacilityReach | null`
  - `path` はTask 13で埋める。本Taskでは `[origin, snap, point]` の暫定で構わない

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

### Task 13: 距離場を降下して経路を復元する

仕様6.3節(a)。親ポインタが無くなるため、距離場を下ることで最短経路を復元する。

**Files:**
- Modify: `src/walking.ts`
- Modify: `scripts/test-walking.mjs`

**Interfaces:**
- Consumes: Task 11の `Catchment`、Task 12の `reachFacility`
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

### Task 14: パネルの遅延読み込みと3バンド化

仕様6.2・6.3・6.4節。

**Files:**
- Modify: `src/WalkingPanel.tsx`
- Modify: `src/BusStopLayer.tsx:17,79`

**Interfaces:**
- Consumes: Task 11-11のすべて
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

### Task 15: 説明の更新

仕様6.5節と10節。国土地理院の出典明示は、標高由来のデータを出荷するこの時点で入れる。

**Files:**
- Modify: `public/about.html`
- Modify: `src/BusStopDrawer.tsx`

**Interfaces:**
- Consumes: Task 8が生成した `bus_stop.geojson`（P11由来）
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
  <p>バス停の位置：<a href="https://nlftp.mlit.go.jp/ksj/">国土数値情報（バス停留所データ）</a>（国土交通省、2022年度）を加工して作成しています。出典：国土交通省国土数値情報ダウンロードサイト。同一地点に重複する記録を統合し、名称・事業者・系統をまとめました。</p>
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
  <p>県内3,946のバス停について、道路と坂に沿った徒歩5分・10分・15分の到達範囲を表示できます。買い物候補の判定は収録済みの商業施設19件が対象です。時刻表検索、乗換案内には対応していません。</p>
```

29行目（収録データ）— バス停の件数と出典を直す:
```html
  <p>山口県のバス停3,946地点と商業施設19件を表示する試作マップです。バス停は国土数値情報（2022年度）由来で、同一地点の重複を統合しています。施設情報照合日：2026年9月8日。</p>
```

31行目の末尾の一文を差し替える。
```html
徒歩圏の候補判定は収録済みの19件が対象です。
```

- [ ] **Step 5: バス停の出典表示を直す**

**バス停がP11由来になったのに、ドロワーはOSM由来だと表示し続けている。**
出典の誤表示はライセンス上の問題でもあるため、`src/BusStopDrawer.tsx` を直す。

現状の問題は4点。

- `properties.operator`（単数）を読んでいるが、P11由来のデータは
  `operators`（配列）を持つ。このままでは常に「登録情報なし」と表示される
- 「OSM ID」というラベルだが、IDは座標由来の合成IDになった
- 「OSM由来の試用データです」「© OpenStreetMap contributors / ODbL」が事実と違う
- 「OpenStreetMapで確認」リンクは `/^(node|way|relation)\/\d+$/` で守られており
  座標IDでは描画されない。**死んだ分岐なので削除する**

`<dl>` の中身を差し替える。

```tsx
        <div><dt className="text-xs font-semibold text-stone-500">運行事業者</dt>
          <dd className="mt-2 break-words font-medium text-stone-900">{stop.properties?.operators?.join('・') || '登録情報なし'}</dd></div>
        <div><dt className="text-xs font-semibold text-stone-500">系統</dt>
          <dd className="mt-2 break-words text-stone-800">{stop.properties?.routes?.join('・') || '登録情報なし'}</dd></div>
        <div><dt className="text-xs font-semibold text-stone-500">停留所ID</dt>
          <dd className="mt-2 font-mono text-stone-800">{id}</dd></div>
        <div><dt className="text-xs font-semibold text-stone-500">位置（緯度・経度）</dt>
          <dd className="mt-2 font-mono text-stone-800">{latitude.toFixed(6)}, {longitude.toFixed(6)}</dd></div>
```

OpenStreetMapへのリンク行（`{/^(node|way|relation)\/\d+$/.test(id) && <a href=…OpenStreetMapで確認…}`）を削除する。

出典の箱を差し替える。

```tsx
      <div className="mt-7 rounded-xl bg-stone-50 p-4 text-xs leading-relaxed text-stone-600">
        <p>国土数値情報（バス停留所データ）由来の試用データです。位置・運行情報の正確性、最新性は未確認です。</p>
        <p className="mt-2 break-all">データ時点：{timestamp || '不明'}</p>
        <a className="mt-3 inline-block text-sky-800 underline underline-offset-2" href="https://nlftp.mlit.go.jp/ksj/" target="_blank" rel="noreferrer">出典：国土交通省国土数値情報ダウンロードサイト</a>
      </div>
```

`timestamp` は `BusStopLayer.tsx:44` が `bus_stop.geojson` のトップレベル
`timestamp` から取っている。**Task 8 の変換スクリプトはこれを出力していない**ため、
`scripts/build-bus-stops.py` の出力に次を加えること。

```python
        'timestamp': '2022年度（令和4年度）',
```

`src/types.ts` の `BusProperties` に `operators?: string[]` と `routes?: string[]`
を加える必要がある場合は、あわせて対応する。

- [ ] **Step 6: ビルドと配信物の検査を通す**

Run: `npm run build && node scripts/verify-release.mjs`
Expected: PASS

- [ ] **Step 7: すべてのテストを通す**

Run: `python3 scripts/test-bake-walking.py && python3 scripts/test-walking-source.py && python3 scripts/bake-walking.py --pilot && npm run test:walking && npm run typecheck`
Expected: すべてPASS

- [ ] **Step 8: コミット**

```bash
git add public/about.html src/BusStopDrawer.tsx src/types.ts scripts/build-bus-stops.py
git commit -m "Describe the slope model and credit GSI elevation tiles"
```

---

## 完了の確認

すべてのTaskを終えたら、次がすべて成り立つこと。

- [ ] `python3 scripts/test-bake-walking.py` が通る
- [ ] `python3 scripts/test-walking-source.py` が通る
- [ ] `python3 scripts/bake-walking.py --pilot && npm run test:walking` が通る（勾配ゼロ回帰を含む）
- [ ] `npm run data:fetch && npm run build && node scripts/verify-release.mjs` が通る
- [ ] `public/data/bus_stop.geojson` が3,946件で、北部（緯度34.43以上）が100件以上ある
- [ ] `public/data/walk/` はgit管理外で、`npm run data:fetch` で用意される
- [ ] gitに入っている徒歩圏関連は `public/data/walk-release.json` だけである
- [ ] `dist` の合計が1024MBを下回っている
- [ ] `test/fixtures/walking-onoda.json` へ移した試作グラフで `--pilot` が動く
- [ ] `raw_data/` に P11・標高タイル・抽出済み道路があり、gitで管理されている
- [ ] `raw_data/dem/` を消さずに `python3 scripts/bake-walking.py` を再実行すると
      `elevation.requests` が0になる（外部通信ゼロで焼き直せる）
- [ ] `src/walking.ts` に `calculateWalk` / `MinHeap` / `validateGraph` / `inPilot` が残っていない
- [ ] 地図上で任意のバス停を選ぶと、3バンドの徒歩圏と坂・階段の警告が出る
- [ ] `about.html` にODbLの継承条項、国土地理院、国土数値情報の出典・加工事実がある

## CIについて

**焼き込み自体はCIで走らせない**（PBFと標高タイルの取得が必要なため）。
CIが外部から取るのは、Releaseアセット（GitHub自身）だけである。

Task 10 Step 10 を終えると、両ワークフローは次の形になる。

```yaml
      - run: python3 scripts/test-bake-walking.py
      - run: python3 scripts/bake-walking.py --pilot
      - run: npm run test:walking
      - run: python3 scripts/test-walking-source.py
      - run: npm run data:fetch
      - run: npm run build
      - run: node scripts/verify-release.mjs
```

`bake-walking.py --pilot` は標準ライブラリだけで動き、リポジトリ内の
`test/fixtures/walking-onoda.json` しか読まないため、CIで osmium も外部通信も不要である。

試作グラフは Task 10 Step 9 で `test/fixtures/walking-onoda.json` へ移し、
配信物から外したうえで回帰テストの基準として残す。`public/` の外にあるため
`dist/` へはコピーされない。
