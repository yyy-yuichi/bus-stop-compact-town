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
