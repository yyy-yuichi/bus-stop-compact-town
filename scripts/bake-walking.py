"""バス停ごとの徒歩圏を事前計算する。標準ライブラリのみで動く。"""
import math
from pathlib import Path
import gzip
import urllib.request
import urllib.error
import time
import importlib.util
_spec = importlib.util.spec_from_file_location('builder', Path(__file__).with_name('build-walking-pilot.py'))
_builder = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_builder)
builder_node_open = _builder.node_open

def equivalent_flat(length_m, grade):
    """Toblerの登山関数を平坦時で正規化し、勾配ぶんを距離に織り込む。

    往復の厳しいほうを採るため max(f(i), f(-i)) = exp(3.5*|i|) となり、
    上りと下りが同じ倍率になる。平坦ではちょうど等倍。
    """
    return length_m * math.exp(3.5 * abs(grade))

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

def build_adjacency(graph):
    adjacency = [[] for _ in graph['nodes']]
    for e in graph['edges']:
        le = _l_eff(e)
        if e[FWD]:
            adjacency[e[A]].append((e[B], le))
        if e[BWD]:
            adjacency[e[B]].append((e[A], le))
    return adjacency

def _dijkstra(graph, snap, budget, adjacency=None):
    import heapq
    edge_i, t, _, gap = snap
    if adjacency is None:
        adjacency = build_adjacency(graph)
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

def stop_id(lon, lat):
    """P11は一意IDを持たないため、座標5桁から合成する。約1m四方の粒度。"""
    return f'{round(lon, 5)}_{round(lat, 5)}'

def stop_filename(sid):
    return sid + '.geojson'

def bake_stop(graph, stop_id, name, origin, budget, index=None, snap_limit=30.0, adjacency=None):
    """1停留所ぶんの徒歩圏を GeoJSON FeatureCollection で返す。届かなければ None。"""
    snap = nearest_edge(graph, origin[0], origin[1], snap_limit, index)
    if snap is None or snap[3] > budget:
        return None
    snap_i, snap_t, snap_point, snap_gap = snap
    d = _dijkstra(graph, snap, budget, adjacency)
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

GSI_TILES = (('dem5a', 15), ('dem', 14))   # DEM5A(5mメッシュ) を優先し、欠測は DEM10B で埋める
RETRY_CODES = {429, 500, 502, 503, 504}

def http_text(url, timeout=60):
    return urllib.request.urlopen(url, timeout=timeout).read().decode()

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
                 backoff=(5, 15, 45), fetch=http_text, sleep=time.sleep):
        self.dir = Path(cache_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.pause = pause
        self.max_requests = max_requests
        self.backoff = backoff
        self.fetch = fetch
        self.sleep = sleep
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
                self.sleep(self.pause)      # 取得できたときも必ず間隔をあける
                return text
            except urllib.error.HTTPError as error:
                if error.code == 404:
                    # そのタイルは無いだけで、呼び出し元がすぐ次の精度で
                    # 別のリクエストを送る。実在するタイルと同じく間隔をあけないと
                    # 404→次の精度が無間隔の2連続リクエストになってしまう。
                    self.sleep(self.pause)
                    return ''               # 次の精度へ落ちる
                if error.code not in RETRY_CODES or attempt == len(self.backoff) - 1:
                    raise                   # 叩き続けない
                self.sleep(wait)
            except urllib.error.URLError:
                if attempt == len(self.backoff) - 1:
                    raise
                self.sleep(wait)
        raise RuntimeError('unreachable')

    def _tile(self, kind, z, x, y):
        key = (kind, z, x, y)
        if key in self.tiles:
            return self.tiles[key]
        # gzipで持つ。git内の容量は生と変わらないが、作業ツリーが287MB→73MBになる。
        path = self.dir / f'{kind}-{z}-{x}-{y}.txt.gz'
        if path.exists():
            with gzip.open(path, 'rt', encoding='utf-8') as handle:
                text = handle.read()                     # 取得済みなら通信しない
        else:
            text = self._download(f'https://cyberjapandata.gsi.go.jp/xyz/{kind}/{z}/{x}/{y}.txt')
            with gzip.open(path, 'wt', encoding='utf-8') as handle:
                handle.write(text)
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

class ElevationTable:
    """Elevationの代わりに、事前に抜き出した標高の並びを順番に返すだけの読み手。

    タイルは持たない。呼び出し順は apply_grades がグラフを辿る順そのものに
    依存するため、表を作ったときと同じ prepare_graph の結果に対してしか使えない
    （extract-elevations.py が同じ関数で表を作るのはそのため）。
    """

    def __init__(self, path):
        self.values = json.loads(Path(path).read_text(encoding='utf-8'))
        self.i = 0
        self.missing = 0

    def at(self, lon, lat):
        if self.i >= len(self.values):
            raise RuntimeError(
                '標高表を使い切った。prepare_graphの結果が表を作ったときと変わっていないか確認すること。')
        value = self.values[self.i]
        self.i += 1
        if value is None:
            self.missing += 1
        return value

    def stats(self):
        return {'source': 'table', 'entries': len(self.values), 'missing': self.missing}

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

def build_road_graph(roads):
    """OSMのway/nodeから内部形式の (nodes, edges) を組み立てる。"""
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
    return nodes, edges

def prune_edges_near_stops(nodes, edges, stops, prune_lon=0.0130, prune_lat=0.0108, prune_radius=1200.0):
    """徒歩圏はバジェット1000m+スナップ30mが上限。equivalent_flatは常に実距離以上
    なので、届く区間は必ず停留所から直線1200m以内にある。標高取得と後段の
    全走査を全県ぶんではなく、停留所の周りだけに絞る。"""
    stop_cells = {}
    for feature in stops['features']:
        lon, lat = feature['geometry']['coordinates']
        stop_cells.setdefault((int(lon / prune_lon), int(lat / prune_lat)), []).append((lon, lat))
    def near_a_stop(p):
        cx, cy = int(p[0] / prune_lon), int(p[1] / prune_lat)
        for x in range(cx - 1, cx + 2):
            for y in range(cy - 1, cy + 2):
                for q in stop_cells.get((x, y), ()):
                    if meters(p, q) <= prune_radius:
                        return True
        return False
    return [e for e in edges if near_a_stop(nodes[e[A]]) or near_a_stop(nodes[e[B]])]

def prepare_graph(root):
    """県全域の道路から、焼き込みが実際に使う刈り込み済み・50m分割済みグラフを作る。

    バス停の座標が入力に含まれるため、ここで決まるノード列・辺列・その走査順は
    prepare_graph の呼び出し側が変わらない限り再現する。extract-elevations.py が
    同じ関数を呼ぶことで、標高表の並び順を焼き込み本番と一致させている。
    """
    roads = json.loads((root / 'raw_data/yamaguchi-roads.json').read_text(encoding='utf-8'))
    nodes, edges = build_road_graph(roads)
    edges_before_prune = len(edges)
    stops = json.loads((root / 'public/data/bus_stop.geojson').read_text(encoding='utf-8'))
    edges = prune_edges_near_stops(nodes, edges, stops)
    edges_after_prune = len(edges)
    graph = subdivide({'nodes': nodes, 'edges': edges}, 50.0)
    return graph, stops, edges_before_prune, edges_after_prune

if __name__ == '__main__':
    import sys
    root = Path(__file__).resolve().parents[1]
    if sys.argv[1:2] == ['--pilot']:
        # 勾配ゼロ回帰テスト用。既存の試作グラフをそのまま焼く。
        graph = load_pilot_graph(root / 'public/data/walking-onoda.json')
        if '--slope' in sys.argv:
            graph = subdivide(graph, 50.0)
            elevation = Elevation(root / 'raw_data/dem')
            apply_grades(graph, elevation)
            print(json.dumps({'elevation': elevation.stats(),
                              'edges': len(graph['edges'])}, ensure_ascii=False), file=sys.stderr)
        pilot = json.loads((root / 'public/data/walking-onoda.json').read_text(encoding='utf-8'))
        out = root / 'work/pilot-bake'
        out.mkdir(parents=True, exist_ok=True)
        made = 0
        for stop in pilot['pilot_stops']:
            fc = bake_stop(graph, stop['id'], stop['name'], stop['coordinate'], 1000.0)
            if fc is None:
                continue
            (out / stop_filename(stop['id'].replace('/', '-'))).write_text(
                json.dumps(fc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
            made += 1
        print(json.dumps({'baked': made, 'dir': str(out)}, ensure_ascii=False))
    else:
        graph, stops, edges_before_prune, edges_after_prune = prepare_graph(root)
        table_path = root / 'raw_data/elevations.json'
        if table_path.exists():
            # 抜き出し済みの標高表があれば、タイル無しでそれを使う。
            elevation = ElevationTable(table_path)
        else:
            # 逐次0.25秒間隔=毎秒4リクエストは、地理院地図を1人が普通に操作する時の
            # ペース（1接続あたり)より十分遅い。規約に数値上限は無いため、この比較が判断基準。
            elevation = Elevation(root / 'raw_data/dem', pause=0.25, max_requests=8000)
        apply_grades(graph, elevation)
        grid = GridIndex(graph)
        adjacency = build_adjacency(graph)
        out = root / 'work/walk'
        out.mkdir(parents=True, exist_ok=True)
        baked = []
        for feature in stops['features']:
            sid = feature['id']
            name = feature['properties'].get('name', '名称未登録')
            fc = bake_stop(graph, sid, name, feature['geometry']['coordinates'], 1000.0,
                           grid, adjacency=adjacency)
            if fc is None:
                continue
            (out / stop_filename(sid)).write_text(
                json.dumps(fc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
            baked.append(sid)
        (out / 'index.json').write_text(json.dumps(baked, ensure_ascii=False,
                                                   separators=(',', ':')), encoding='utf-8')
        print(json.dumps({'stops': len(stops['features']), 'baked': len(baked),
                          'edges_before_prune': edges_before_prune, 'edges_after_prune': edges_after_prune,
                          'elevation': elevation.stats()}, ensure_ascii=False))
