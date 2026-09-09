"""バス停ごとの徒歩圏を事前計算する。標準ライブラリのみで動く。"""
import math

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
        branches.append((-l_eff, gap + t_s * l_eff, 0.0, t_s))   # スナップ点の左側
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
            lo = lo + span * (v_lo - budget) / (v_lo - v_hi)
            v_lo = budget
        elif v_hi > budget:
            hi = lo + (hi - lo) * (budget - v_lo) / (v_hi - v_lo)
            v_hi = budget
        if hi - lo < 1e-9:
            continue
        out.append((lo, hi, v_lo, v_hi))
    return out
