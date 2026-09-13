import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { bakedFacilityCandidates, catchmentFile, clipCatchment, distance, interpolate, parseCatchment, prepareFacilities, walkDataBaseUrl, WALKING_METERS_PER_MINUTE } from './bakedWalking';
import type { Catchment, Coordinate, Segment, FacilityGroup } from './bakedWalking';
import { fitContent } from './mapLayout';
import type { LoadState, ShoppingFeature } from './types';
import type { BakedWalkingMinutes } from './placeLink';
import BakedFacilityList from './BakedFacilityList';

interface SteepPiece { a: Coordinate; b: Coordinate; grade: number }

const MIN_STEEP_RUN_M = 25;

function steepRuns(segments: Segment[], budget: number): { pieces: SteepPiece[] } {
  const trimmed: (SteepPiece & { length: number })[] = [];
  for (const { a, b, d1, d2, grade } of segments) {
    if (Math.abs(grade) < 5) continue;
    if (d1 > budget && d2 > budget) continue;
    let pa = a, pb = b;
    if (!(d1 <= budget && d2 <= budget)) {
      const t = (budget - d1) / (d2 - d1);
      if (d1 <= budget) pb = interpolate(a, b, t); else pa = interpolate(a, b, t);
    }
    trimmed.push({ a: pa, b: pb, grade, length: distance(pa, pb) });
  }
  if (!trimmed.length) return { pieces: [] };

  // Union-Find: 端点のキー（丸め済み座標の文字列）が一致するセグメント同士を同じrunにまとめる。
  const parent = trimmed.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) i = parent[i]; return i; };
  const key = (p: Coordinate) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  const byEndpoint = new Map<string, number[]>();
  trimmed.forEach((seg, i) => {
    for (const p of [seg.a, seg.b]) {
      const k = key(p);
      const at = byEndpoint.get(k);
      if (at) { for (const j of at) { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; } at.push(i); }
      else byEndpoint.set(k, [i]);
    }
  });
  const runLength = new Map<number, number>();
  trimmed.forEach((seg, i) => { const r = find(i); runLength.set(r, (runLength.get(r) ?? 0) + seg.length); });

  const qualifies = (i: number) => (runLength.get(find(i)) ?? 0) >= MIN_STEEP_RUN_M;
  const pieces = trimmed.filter((_, i) => qualifies(i)).map(({ a, b, grade }) => ({ a, b, grade }));
  return { pieces };
}

// Near to far uses the same distance budget and a muted green ramp.
const RAMP_STOPS: [number, string][] = [
  [0, '#285f4d'],
  [1 / 3, '#508c6b'],
  [2 / 3, '#86ad86'],
  [1, '#b9cba3'],
];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}
function rampColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 1; i < RAMP_STOPS.length; i++) {
    const [t0, c0] = RAMP_STOPS[i - 1];
    const [t1, c1] = RAMP_STOPS[i];
    if (clamped <= t1) {
      const local = t1 === t0 ? 0 : (clamped - t0) / (t1 - t0);
      const rgb0 = hexToRgb(c0), rgb1 = hexToRgb(c1);
      return rgbToHex([0, 1, 2].map(k => rgb0[k] + (rgb1[k] - rgb0[k]) * local) as [number, number, number]);
    }
  }
  return RAMP_STOPS[RAMP_STOPS.length - 1][1];
}

const DISTANCE_BUCKETS = 12;
// The thin slope stripe leaves the distance color visible on either side.
const BASE_WEIGHT = 3;

function bucketByMid(items: { a: Coordinate; b: Coordinate; mid: number }[], budget: number): Coordinate[][][] {
  const buckets: Coordinate[][][] = Array.from({ length: DISTANCE_BUCKETS }, () => []);
  for (const { a, b, mid } of items) {
    const idx = Math.min(DISTANCE_BUCKETS - 1, Math.max(0, Math.floor((mid / budget) * DISTANCE_BUCKETS)));
    buckets[idx].push([a, b]);
  }
  return buckets;
}

function bucketSegments(catchment: Catchment, colorBudget: number): { color: string; lines: Coordinate[][] }[] {
  const items = catchment.segments.map(({ a, b, d1, d2 }) => ({ a, b, mid: (d1 + d2) / 2 }));
  return bucketByMid(items, colorBudget)
    .map((lines, i) => ({ color: rampColor((i + 0.5) / DISTANCE_BUCKETS), lines }))
    .filter(bucket => bucket.lines.length > 0);
}

const STEEP_WEIGHT = 1.3;
const STEEP_TIERS = [
  { min: 5, max: 8, color: '#dc2626' },
  { min: 8, max: Infinity, color: '#7f1d1d' },
];

function groupSteepPieces(pieces: SteepPiece[]): { color: string; lines: Coordinate[][] }[] {
  return STEEP_TIERS
    .map(tier => ({
      color: tier.color,
      lines: pieces.filter(p => Math.abs(p.grade) >= tier.min && Math.abs(p.grade) < tier.max).map(p => [p.a, p.b] as Coordinate[]),
    }))
    .filter(tier => tier.lines.length > 0);
}

function createLegendControl(budget: number, minutes: BakedWalkingMinutes): L.Control {
  const control = new L.Control({ position: 'bottomleft' });
  control.onAdd = () => {
    const div = L.DomUtil.create('div', 'walking-legend');
    div.setAttribute('role', 'group');
    div.setAttribute('aria-label', '徒歩距離と坂道の凡例');
    const gradient = RAMP_STOPS.map(([t, c]) => `${c} ${Math.round(t * 100)}%`).join(', ');
    // 時速4km換算（分→m）をbudgetに対する割合にして、バーの目盛り位置にする。
    const pct = (minutes: number) => Math.min(100, ((minutes * (4000 / 60)) / budget) * 100);
    // 15分の目盛りはpct=100%になり得る（budgetちょうどか、それを超える換算距離）。
    // 目盛りのspanはabsolute+leftのみでwidthを指定していないため、shrink-to-fit幅は
    // 「コンテナ幅－left」で決まる。left=100%だとその値が0になり、幅の下限は
    // 最小単語幅まで縮む——だが日本語はどの文字の間でも折り返せるので「最小単語」＝
    // 1文字になり、「15分」が1文字ずつ縦に積まれる。whitespace-nowrapで折り返し
    // そのものを禁止して直す（幅の計算結果に関わらず1行を強制する）。
    //
    // 目盛りは -translate-x-1/2 でleft位置に中央揃えする。中間の目盛りはこれで
    // 正しく中央に来るが、両端（left:0%/100%）だとラベルの中心が目盛りぴったりに
    // 来て、幅の半分がバーの外にはみ出す。それ自体はバー上の位置としては正しいが、
    // 見た目上「右にずれて」見え、収まる余白がないと凡例カードの端で詰まる。
    // 目盛り行を余白付きラッパーで包み、行自体の幅・left%の基準（w-40）は変えずに
    // ラッパーだけ左右に広げることで、はみ出す半分を空白側に逃がす。
    // （行そのものにpx-*を足しても効果はない——border-box固定幅では
    // padding分だけcontent areaが狭くなるだけで、絶対配置の基準となる
    // padding boxの幅＝要素の外形幅は変わらないため、はみ出す余白は増えない。）
    //
    // Enlarge both strokes equally so the legend retains their actual ratio.
    div.innerHTML = `
      <details><summary class="legend-summary">徒歩${minutes}分 · 色の見方</summary>
      <p class="text-[10px]">坂道を考慮・時速4km相当</p>
      <div class="walking-legend-ramp">
        <div class="h-2 rounded-full" style="background:linear-gradient(to right, ${gradient})"></div>
        <div class="relative mt-1 h-4 text-[10px]">
          ${[5, 10, 15].map(m => `<span class="absolute -translate-x-1/2 whitespace-nowrap" style="left:${pct(m)}%">${m}分</span>`).join('')}
        </div>
      </div>
      <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="font-semibold">坂道</span>
        <span class="inline-flex items-center gap-1"><i class="relative inline-block w-5 shrink-0 rounded-full" style="height:${BASE_WEIGHT * 2}px;background:${rampColor(0.5)}">
          <span class="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full" style="height:${STEEP_WEIGHT * 2}px;background:${STEEP_TIERS[0].color}"></span>
        </i>
        <span>5%以上</span></span>
        <span class="inline-flex items-center gap-1"><i class="relative inline-block w-5 shrink-0 rounded-full" style="height:${BASE_WEIGHT * 2}px;background:${rampColor(0.5)}">
          <span class="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full" style="height:${STEEP_WEIGHT * 2}px;background:${STEEP_TIERS[1].color}"></span>
        </i>
        <span>8%以上</span></span>
      </div>
      </details>
    `;
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  return control;
}

export function useUnreachableStops() {
  const [unreachable, setUnreachable] = useState<Record<string, number | null> | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    // This local catalog distinguishes roads that could not be connected from
    // missing files or a failed request to the external data host.
    fetch(`${import.meta.env.BASE_URL}data/walk-unreachable.json`, { signal: abort.signal })
      .then(r => { if (!r.ok) throw Error('unavailable'); return r.json(); })
      .then((data: { stops?: Record<string, number | null> }) => {
        if (!abort.signal.aborted && data?.stops && !Array.isArray(data.stops) && typeof data.stops === 'object' &&
            Object.values(data.stops).every(value => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0))) setUnreachable(data.stops);
      }).catch(() => {});
    return () => abort.abort();
  }, []);
  return unreachable;
}

const NEARBY_ROAD_LIMIT_M = 150;
const GENERIC_NO_CATCHMENT_MESSAGE = 'この停留所と歩ける道路の接続を確認できませんでした。別の停留所をお試しください。';

function noCatchmentMessage(distance: number | null | undefined): string {
  if (distance === undefined) return GENERIC_NO_CATCHMENT_MESSAGE;
  if (distance === null || distance > NEARBY_ROAD_LIMIT_M) return 'この停留所の近くに歩ける道路が見つかりませんでした。別の停留所をお試しください。';
  return `この停留所から最も近い歩ける道路まで約${Math.round(distance)}mありました（自動判定の基準は30m）。停留所の位置や道路データのわずかなずれによるものと考えられます。別の停留所をお試しください。`;
}

function useCatchment(id: string, knownUnreachable: boolean) {
  const [state, setState] = useState<{ id: string; catchment: Catchment | null; loading: boolean; error: boolean }>({ id, catchment: null, loading: true, error: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    if (knownUnreachable) {
      setState({ id, catchment: null, loading: false, error: false });
      return () => abort.abort();
    }
    setState({ id, catchment: null, loading: true, error: false });
    fetch(`${walkDataBaseUrl()}${catchmentFile(id)}`, { signal: abort.signal })
      .then(r => {
        if (!r.ok) throw Error('Walking catchment unavailable');
        return r.json();
      })
      .then(raw => {
        const catchment = parseCatchment(raw);
        if (catchment.stopId !== id) throw Error('Walking catchment origin mismatch');
        if (!abort.signal.aborted) setState({ id, catchment, loading: false, error: false });
      })
      .catch(() => { if (!abort.signal.aborted) setState({ id, catchment: null, loading: false, error: true }); });
    return () => abort.abort();
  }, [id, attempt, knownUnreachable]);
  const current = state.id === id ? state : { id, catchment: null, loading: true, error: false };
  return { ...current, retry: () => setAttempt(n => n + 1) };
}

export default function BakedWalkingPanel({ map, id, origin, unreachable, active, facilities, facilityState, retryFacilities, onFacility, minutes, onMinutes, scope, onMapFacilities }: {
  map: L.Map | null; id: string; origin: Coordinate;
  unreachable: Record<string, number | null> | null;
  active: boolean;
  facilities: ShoppingFeature[]; facilityState: LoadState; retryFacilities: () => void;
  onFacility: (facility: ShoppingFeature) => void;
  minutes: BakedWalkingMinutes; onMinutes: (minutes: BakedWalkingMinutes) => void;
  scope: string; onMapFacilities: (scope: string, ids: string[]) => void;
}) {
  const { catchment, loading, error: catchmentError, retry: retryCatchment } = useCatchment(id, Object.hasOwn(unreachable ?? {}, id));
  const displayed = useMemo(() => catchment ? clipCatchment(catchment, minutes * WALKING_METERS_PER_MINUTE) : null, [catchment, minutes]);
  const steepSummary = useMemo(() => displayed ? steepRuns(displayed.segments, displayed.budget) : null, [displayed]);
  const preparedFacilities = useMemo(() => prepareFacilities(facilities), [facilities]);
  const candidates = useMemo(() => catchment && facilityState === 'ready' ? bakedFacilityCandidates(catchment, preparedFacilities) : [], [catchment, preparedFacilities, facilityState]);
  const visibleCandidates = useMemo(() => candidates.filter(c => c.meters <= minutes * WALKING_METERS_PER_MINUTE), [candidates, minutes]);
  const [facilityGroup, setFacilityGroup] = useState<FacilityGroup | 'all'>('all');
  useEffect(() => { setFacilityGroup('all'); }, [id]);
  useEffect(() => { onMapFacilities(scope, active ? visibleCandidates.filter(c => facilityGroup === 'all' || c.group === facilityGroup).map(c => String(c.facility.id)) : []); }, [scope, active, visibleCandidates, facilityGroup, onMapFacilities]);

  useEffect(() => {
    if (!map || !catchment || !displayed || !active) return;
    const group = L.layerGroup().addTo(map);
    const toLatLng = (line: Coordinate[]) => line.map(([lon, lat]) => L.latLng(lat, lon));

    for (const { color, lines } of bucketSegments(displayed, catchment.budget)) {
      L.polyline(lines.map(toLatLng), { color, weight: BASE_WEIGHT, opacity: 0.9, interactive: false }).addTo(group);
    }
    if (steepSummary) {
      // 5%はバリアフリー道路の縦断勾配の上限、8%は手動車いすの自走限界の目安。
      // 色相の違いだけで2階層を区別する（太さは共通）。
      for (const { color, lines } of groupSteepPieces(steepSummary.pieces)) {
        L.polyline(lines.map(toLatLng), { color, weight: STEEP_WEIGHT, lineCap: 'round', opacity: 1, interactive: false }).addTo(group);
      }
    }
    L.polyline(toLatLng([origin, catchment.snap]), { color: '#334155', weight: 3, dashArray: '3 5', interactive: false }).addTo(group);
    L.circleMarker([origin[1], origin[0]], { radius: 10, fillColor: '#174f9d', fillOpacity: 1, color: 'white', weight: 3, interactive: false }).addTo(group);
    const legend = createLegendControl(catchment.budget, minutes);
    legend.addTo(map);
    return () => { group.remove(); legend.remove(); };
  }, [map, catchment, displayed, origin, steepSummary, active, minutes]);

  useEffect(() => {
    if (!map || !active) return;
    const points = displayed?.segments.flatMap(s => [s.a, s.b]).map(([lon, lat]) => L.latLng(lat, lon)) ?? [];
    const bounds = L.latLngBounds([...points, L.latLng(origin[1], origin[0])]);
    const focus = () => fitContent(map, bounds, true, 17);
    focus();
    map.on('resize', focus);
    return () => { map.off('resize', focus); };
  }, [map, id, displayed, origin, active]);

  return <section className="walking-panel mb-7" aria-labelledby="walk-title">
    <h3 id="walk-title" className="text-sm font-semibold">徒歩圏</h3>
    {catchmentError ? <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4" role="status">
      <p className="text-sm">徒歩圏のデータを読み込めませんでした。</p><button className="mt-3 min-h-11 rounded-lg border bg-white px-4 text-sm" onClick={retryCatchment}>再読み込み</button>
    </section> : loading ? <p className="mt-4 text-sm" role="status">徒歩圏を準備しています…</p> : <>
      {!catchment ? <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm" role="status">{noCatchmentMessage(unreachable?.[id])}</p> : <>
        <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="徒歩時間">
          {([5, 10, 15] as const).map(n => <button key={n} aria-pressed={minutes === n} onClick={() => onMinutes(n)} className={`min-h-12 rounded-xl border text-sm font-bold ${minutes === n ? 'border-emerald-900 bg-emerald-900 text-white' : 'border-stone-200 bg-white text-stone-700'}`}>徒歩 {n} 分</button>)}
        </div>
        <BakedFacilityList key={id} candidates={visibleCandidates} group={facilityGroup} onGroup={setFacilityGroup} minutes={minutes} state={facilityState} retry={retryFacilities} onFacility={onFacility} />
      </>}
      <details className="text-xs leading-relaxed text-stone-500">
        <summary className="min-h-11 py-3 font-semibold">徒歩圏の計算について</summary>
        <p>坂道を考慮した、時速4km・徒歩{minutes}分相当の範囲です。緑の濃淡はバス停からの距離、赤い線は急な坂道を表します。</p>
        <p className="mt-2">信号待ち、工事や現地の横断可否、車いす対応は反映していません。坂は地形データからの概算です。現地の通行状況を確認してください。</p>
        <a className="mt-2 inline-block text-sky-800 underline" href={`${import.meta.env.BASE_URL}about.html#walking`}>計算方法とデータについて</a>
      </details>
    </>}
  </section>;
}
