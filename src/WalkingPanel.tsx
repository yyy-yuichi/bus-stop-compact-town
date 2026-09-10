import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import type { ShoppingCollection, ShoppingFeature } from './types';
import { catchmentFile, distance, interpolate, parseCatchment } from './walking';
import type { Catchment, Coordinate, Segment } from './walking';

interface SteepPiece { a: Coordinate; b: Coordinate; grade: number }

/**
 * 「谷る」と読める最小の連続長。焼き込み済みの急坂区間を接続長の分布で見ると、
 * 10m未満が全体長の2.0%、10-25mが10.3%、25-50mが27.7%、50-100mが31.6%、
 * 100m以上が28.3%（連結区間ごとの合計長で集計）。25m（10-25mバケットの上限）
 * で切ると、捨てるのは<25mの合計12.3%だけで、信号待ち程度で終わる単発の
 * フラグメントはほぼ消える一方、実際に体感する坂はほぼ全部残る。
 */
const MIN_STEEP_RUN_M = 25;

/**
 * 指定範囲（budget。通常は焼き込み全体、1000m）に切り詰めた上で、|grade|>=5%のセグメントを
 * 端点の座標一致（焼き込み時に5桁精度で丸め済み）でつないで連続区間（run）を作る。
 * run の合計長が MIN_STEEP_RUN_M 未満の断片は間引く。色分けは9%→7%→9%のような
 * 一続きの坂をしきい値で切り刻んで見せないよう、run 単位ではなくセグメント単位の
 * 勾配で行う（呼び出し側で処理）。
 */
function steepRuns(segments: Segment[], budget: number): { pieces: SteepPiece[]; totalLength: number } {
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
  if (!trimmed.length) return { pieces: [], totalLength: 0 };

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
  let totalLength = 0;
  const seenRoots = new Set<number>();
  trimmed.forEach((_, i) => {
    if (!qualifies(i)) return;
    const r = find(i);
    if (seenRoots.has(r)) return;
    seenRoots.add(r);
    totalLength += runLength.get(r) ?? 0;
  });
  const pieces = trimmed.filter((_, i) => qualifies(i)).map(({ a, b, grade }) => ({ a, b, grade }));
  return { pieces, totalLength };
}

/**
 * 停留所からの距離（坂道込みの平地換算）を色に変える連続レンジ。緑→黄→赤は
 * 「近い＝良い／遠い＝悪い」に読めてしまうため避け、単一ハイの連続階調にした。
 *
 * 最初は寒色（インディゴ→ブルー→ティール）で検討したが、OSM標準スタイルは
 * 水域を淡い灰青で塗るため、遠端の水色〜シアンが川・池・海岸線と competing
 * してしまう（青系は読みにくいというフィードバックも受けた）。山口県は
 * 森林・河川・海岸のいずれも多いため、緑系に変更した。
 *
 * ただし緑には別の罠がある。OSM標準は公園（明度88%・#c8facc付近）も森林
 * （明度72%・#add19e付近）も緑で塗るため、山口県の大部分では地図の下地が
 * すでに緑になる。そこを生き残る条件は「明るい緑」ではなく「彩度が高く沈んだ
 * 緑」であること。そこでdeep forest green（近端）→emerald→bright
 * yellow-green（遠端）というviridisの緑側半分に近い配色にし、彩度を65%→80%
 * まで上げる一方で明度は22%→52%に抑えた。OSM側の公園・森林は明度72〜88%・
 * 彩度は場所により36〜83%とまちまちだが明るく霞んだ配色なので、明度を終始
 * 50%台以下に沈めておけば、色相が多少近づいても「地図の下地」ではなく
 * 「上に乗った線」として見えるはずだという判断。遠端をyellow-green
 * （色相75°、彩度80%、明度52%）というOSMが使わない鮮やかさで止め、
 * 純粋な黄色までは寄せずに「遠いほど色が薄れて消える」のではなく
 * 「遠いほど色相が変わって主張が強くなる」ことで連続性と遠端の存在感を
 * 両立させた。実機の地図では未確認（このタスクではブラウザ検証を行っていない）。
 * 特に遠端の黄緑が森林ポリゴンの上でどう見えるかはユーザーの目視確認が要る。
 */
const RAMP_STOPS: [number, string][] = [
  [0, '#145d38'],
  [1 / 3, '#188b22'],
  [2 / 3, '#50bb1b'],
  [1, '#b6e723'],
];

/**
 * 急坂オーバーレイ（勾配5%以上を#dc2626の破線、8%以上を#7f1d1d の実線）は
 * どちらも色相0°（赤）で、暖色・寒色の対比で目立たせる設計だった。寒色ランプ
 * （色相250°〜178°）のときは赤との色相差が150°以上あったが、緑ランプ
 * （色相150°〜75°）では遠端との色相差が最短75°まで縮む。75°はまだ赤と
 * 黄緑を混同するほど近くはないが、寒色のときほど余裕はない。そのため色は
 * 変えず、破線（勾配5%以上）と実線＋太め（勾配8%以上、weight5 vs 本体の
 * weight3）という色相以外の手がかりを従来どおり残し、色相が万一近く見えても
 * 太さ・線種で層として区別できるようにしてある。ここも実機では未確認。
 */

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

/**
 * 651〜3,355本ものセグメントを1本ずつ描くと重い。距離を12段のバケツに
 * まとめて、バケツごとに1本のポリライン（複数の線分をまとめた1レイヤー）
 * として描く。地図上の縮尺では連続したグラデーションに見えつつ、レイヤー数は
 * 停留所あたり十数枚に収まる。セグメント長は中央値約10m・最大約49mで
 * バケツ幅（1000m/12≒83m）よりずっと短いため、セグメント単位（中点の距離で
 * バケツ分け）で十分連続に見える。
 */
const DISTANCE_BUCKETS = 12;

function bucketSegments(catchment: Catchment): { color: string; lines: Coordinate[][] }[] {
  const budget = catchment.budget;
  const buckets: Coordinate[][][] = Array.from({ length: DISTANCE_BUCKETS }, () => []);
  for (const { a, b, d1, d2 } of catchment.segments) {
    const mid = (d1 + d2) / 2;
    const idx = Math.min(DISTANCE_BUCKETS - 1, Math.max(0, Math.floor((mid / budget) * DISTANCE_BUCKETS)));
    buckets[idx].push([a, b]);
  }
  return buckets
    .map((lines, i) => ({ color: rampColor((i + 0.5) / DISTANCE_BUCKETS), lines }))
    .filter(bucket => bucket.lines.length > 0);
}

/**
 * 色の意味（距離のグラデーションと急坂の凡例）は、ドロワーに置くとスクロールで
 * 隠れてしまうため、地図に固定されるLeafletコントロールにした。停留所を切り替
 * えても内容は変わらないので、徒歩圏レイヤーと一緒に付け外しするだけでよい。
 */
function createLegendControl(budget: number): L.Control {
  const control = new L.Control({ position: 'bottomleft' });
  control.onAdd = () => {
    const div = L.DomUtil.create('div', 'walking-legend rounded-xl border border-stone-200 bg-white/95 px-3 py-2.5 text-[11px] leading-relaxed text-stone-600 shadow-sm');
    const gradient = RAMP_STOPS.map(([t, c]) => `${c} ${Math.round(t * 100)}%`).join(', ');
    // 時速4km換算（分→m）をbudgetに対する割合にして、バーの目盛り位置にする。
    const pct = (minutes: number) => Math.min(100, ((minutes * (4000 / 60)) / budget) * 100);
    div.innerHTML = `
      <p class="font-semibold text-stone-800">色は徒歩の距離</p>
      <p class="mt-0.5 text-stone-500">坂道は平地換算・全体で${Math.round(budget)}m（時速4kmで15分）</p>
      <div class="relative mt-2.5 h-2 w-36 rounded-full" style="background:linear-gradient(to right, ${gradient})"></div>
      <div class="relative mt-1 h-3 w-36 text-[10px] text-stone-500">
        ${[5, 10, 15].map(m => `<span class="absolute -translate-x-1/2" style="left:${pct(m)}%">${m}分</span>`).join('')}
      </div>
      <div class="mt-2.5 flex items-center gap-1.5">
        <i class="inline-block h-0 w-5 border-t-2 border-dashed" style="border-color:#dc2626"></i>
        <span>勾配5%以上</span>
      </div>
      <div class="mt-1 flex items-center gap-1.5">
        <i class="inline-block h-[3px] w-5 rounded-full" style="background:#7f1d1d"></i>
        <span>勾配8%以上</span>
      </div>
    `;
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  return control;
}

export function useWalkingData() {
  const [facilities, setFacilities] = useState<ShoppingFeature[] | null>(null);
  const [unreachable, setUnreachable] = useState<Record<string, number | null> | null>(null);
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
    // Best-effort: this only sharpens the "no catchment" message, so a failure here
    // must not trip the facilities error/retry UI. Leave `unreachable` null on any problem.
    fetch(`${import.meta.env.BASE_URL}data/walk-unreachable.json`, { signal: abort.signal })
      .then(r => { if (!r.ok) throw Error('unavailable'); return r.json(); })
      .then((data: { stops?: Record<string, number | null> }) => {
        if (!abort.signal.aborted && data && typeof data.stops === 'object') setUnreachable(data.stops);
      }).catch(() => {});
    return () => abort.abort();
  }, [attempt]);
  return { facilities, unreachable, error, retry: () => setAttempt(n => n + 1) };
}

/**
 * Stops within this many metres of a walkable road read as "just missed the
 * snap threshold" (position/road-data noise); beyond it, as "nothing nearby".
 * 150m = 5x the 30m snap_limit — roughly a short block, and where the 289
 * unreachable stops' distance distribution stops looking like noise and
 * starts looking like a real gap (30-200m: 232 stops bunched near the
 * threshold; 200m+: 57 stops trailing off toward "not found").
 */
const NEARBY_ROAD_LIMIT_M = 150;
const GENERIC_NO_CATCHMENT_MESSAGE = 'この停留所と歩ける道路の接続を確認できませんでした。別の停留所をお試しください。';

function noCatchmentMessage(distance: number | null | undefined): string {
  if (distance === undefined) return GENERIC_NO_CATCHMENT_MESSAGE;
  if (distance === null || distance > NEARBY_ROAD_LIMIT_M) return 'この停留所の近くに歩ける道路が見つかりませんでした。別の停留所をお試しください。';
  return `この停留所から最も近い歩ける道路まで約${Math.round(distance)}mありました（自動判定の基準は30m）。停留所の位置や道路データのわずかなずれによるものと考えられます。別の停留所をお試しください。`;
}

/**
 * 選択中のバス停の徒歩圏だけを取りに行く。焼いていない停留所（道路まで30m超）は
 * 404になる想定で、それは「未対応」であって「エラー」ではない。
 */
function useCatchment(id: string) {
  const [state, setState] = useState<{ catchment: Catchment | null; loading: boolean; error: boolean }>({ catchment: null, loading: true, error: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setState({ catchment: null, loading: true, error: false });
    fetch(`${import.meta.env.BASE_URL}data/walk/${catchmentFile(id)}`, { signal: abort.signal })
      .then(r => {
        if (r.status === 404) return null;
        if (!r.ok) throw Error('Walking catchment unavailable');
        return r.json();
      })
      .then(raw => { if (!abort.signal.aborted) setState({ catchment: raw ? parseCatchment(raw) : null, loading: false, error: false }); })
      .catch(() => { if (!abort.signal.aborted) setState({ catchment: null, loading: false, error: true }); });
    return () => abort.abort();
  }, [id, attempt]);
  return { ...state, retry: () => setAttempt(n => n + 1) };
}

export default function WalkingPanel({ map, id, origin, facilities, unreachable, error, retry }: {
  map: L.Map | null; id: string; origin: Coordinate;
  facilities: ShoppingFeature[] | null; unreachable: Record<string, number | null> | null; error: boolean; retry: () => void;
}) {
  const { catchment, loading, error: catchmentError, retry: retryCatchment } = useCatchment(id);
  const steepSummary = useMemo(() => catchment ? steepRuns(catchment.segments, catchment.budget) : null, [catchment]);

  useEffect(() => {
    if (!map || !catchment) return;
    const group = L.layerGroup().addTo(map);
    const toLatLng = (line: Coordinate[]) => line.map(([lon, lat]) => L.latLng(lat, lon));
    for (const { color, lines } of bucketSegments(catchment)) {
      L.polyline(lines.map(toLatLng), { color, weight: 3, opacity: 0.9, interactive: false }).addTo(group);
    }
    if (steepSummary) {
      // 距離の色の上に急坂を重ねる。5%はバリアフリー道路の縦断勾配の上限、
      // 8%は手動車いすの自走限界の目安。断片を間引いた後の run から、
      // セグメントごとの実勾配で色を分ける。
      const mild = steepSummary.pieces.filter(p => Math.abs(p.grade) < 8).map(p => toLatLng([p.a, p.b]));
      const severe = steepSummary.pieces.filter(p => Math.abs(p.grade) >= 8).map(p => toLatLng([p.a, p.b]));
      L.polyline(mild, { color: '#dc2626', weight: 4, dashArray: '1 6', lineCap: 'round', opacity: 1, interactive: false }).addTo(group);
      L.polyline(severe, { color: '#7f1d1d', weight: 5, opacity: 1, interactive: false }).addTo(group);
    }
    L.polyline(toLatLng([origin, catchment.snap]), { color: '#334155', weight: 3, dashArray: '3 5', interactive: false }).addTo(group);
    L.circleMarker([origin[1], origin[0]], { radius: 10, fillColor: '#174f9d', fillOpacity: 1, color: 'white', weight: 3, interactive: false }).addTo(group);
    const legend = createLegendControl(catchment.budget);
    legend.addTo(map);
    return () => { group.remove(); legend.remove(); };
  }, [map, catchment, origin, steepSummary]);

  useEffect(() => {
    if (!map || !catchment) return;
    const points = catchment.segments.flatMap(s => [s.a, s.b]).map(([lon, lat]) => L.latLng(lat, lon));
    if (!points.length) return;
    const mobile = window.matchMedia('(max-width: 600px)').matches;
    const bounds = L.latLngBounds(points).extend([origin[1], origin[0]]);
    map.fitBounds(bounds, { paddingTopLeft: [30, 112], paddingBottomRight: mobile ? [30, Math.min(window.innerHeight * 0.48, 430) + 25] : [420, 65], maxZoom: 17, animate: false });
  }, [map, id, catchment]);

  if (error) return <section className="walking-panel mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4" role="status">
    <p className="text-sm">徒歩圏のデータを読み込めませんでした。</p><button className="mt-3 min-h-11 rounded-lg border bg-white px-4 text-sm" onClick={retry}>再読み込み</button>
  </section>;
  if (!facilities) return <p className="mb-6 text-sm" role="status">徒歩圏を準備しています…</p>;

  return <section className="walking-panel mb-7" aria-labelledby="walk-title">
    <h3 id="walk-title" className="text-lg font-bold">ここから歩いて行ける範囲</h3>
    <p className="mt-2 text-xs leading-relaxed text-stone-600">道路に沿った徒歩距離の目安です。色の説明は地図の凡例をご覧ください。</p>
    {catchmentError ? <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4" role="status">
      <p className="text-sm">徒歩圏のデータを読み込めませんでした。</p><button className="mt-3 min-h-11 rounded-lg border bg-white px-4 text-sm" onClick={retryCatchment}>再読み込み</button>
    </section> : loading ? <p className="mt-4 text-sm" role="status">徒歩圏を準備しています…</p> : <>
      {steepSummary && steepSummary.totalLength > 0 && <p className="mt-4 text-xs text-stone-600">まとまって続く急坂は合計約{Math.round(steepSummary.totalLength)}mです。</p>}
      {!catchment ? <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm" role="status">{noCatchmentMessage(unreachable?.[id])}</p> : (
        // ponytail: 買い物候補（reachFacility・坂/階段の警告・候補カード）は
        // facility judgement を実装する後続タスクで戻す。ここはその置き場所。
        null
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-stone-500">信号待ち、工事や現地の横断可否、車いす対応は反映していません。坂は地形データからの概算です。現地の通行状況を確認してください。</p>
      <a className="mt-2 inline-block text-[11px] text-sky-800 underline" href={`${import.meta.env.BASE_URL}about.html#walking`}>計算方法とデータについて</a>
    </>}
  </section>;
}
