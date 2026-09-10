import { useEffect, useState } from 'react';
import L from 'leaflet';
import type { ShoppingCollection, ShoppingFeature } from './types';
import { catchmentFile, distance, interpolate, parseCatchment, reachableLines } from './walking';
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
 * 選択中の徒歩時間帯（budget）の範囲に切り詰めた上で、|grade|>=5%のセグメントを
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
  const [minutes, setMinutes] = useState<5 | 10 | 15>(10);
  const [speed, setSpeed] = useState(4);
  const [showSteep, setShowSteep] = useState(false);
  const { catchment, loading, error: catchmentError, retry: retryCatchment } = useCatchment(id);
  const budget = speed * 1000 / 60 * minutes;
  const steepSummary = showSteep && catchment ? steepRuns(catchment.segments, budget) : null;

  useEffect(() => {
    if (!map || !catchment) return;
    const group = L.layerGroup().addTo(map);
    const toLatLng = (line: Coordinate[]) => line.map(([lon, lat]) => L.latLng(lat, lon));
    const bands = ([[15, '#b45309'], [10, '#c47b13'], [5, '#047857']] as const).filter(([n]) => n <= minutes);
    for (const [n, color] of bands) {
      L.polyline(reachableLines(catchment, speed * 1000 / 60 * n).map(toLatLng), { color, weight: 7, opacity: 0.9, interactive: false }).addTo(group);
    }
    if (steepSummary) {
      // 帯の色（残り時間）の上に急坂を重ねる。5%はバリアフリー道路の縦断勾配の上限、
      // 8%は手動車いすの自走限界の目安。選択中の時間帯（budget）の外は塗らない。
      // 断片を間引いた後の run から、セグメントごとの実勾配で色を分ける。
      const mild = steepSummary.pieces.filter(p => Math.abs(p.grade) < 8).map(p => toLatLng([p.a, p.b]));
      const severe = steepSummary.pieces.filter(p => Math.abs(p.grade) >= 8).map(p => toLatLng([p.a, p.b]));
      L.polyline(mild, { color: '#dc2626', weight: 4, dashArray: '1 6', lineCap: 'round', opacity: 1, interactive: false }).addTo(group);
      L.polyline(severe, { color: '#7f1d1d', weight: 5, opacity: 1, interactive: false }).addTo(group);
    }
    L.polyline(toLatLng([origin, catchment.snap]), { color: '#334155', weight: 3, dashArray: '3 5', interactive: false }).addTo(group);
    L.circleMarker([origin[1], origin[0]], { radius: 10, fillColor: '#174f9d', fillOpacity: 1, color: 'white', weight: 3, interactive: false }).addTo(group);
    return () => { group.remove(); };
  }, [map, catchment, speed, minutes, origin, steepSummary]);

  useEffect(() => {
    if (!map || !catchment) return;
    const lines = reachableLines(catchment, speed * 1000 / 60 * 15);
    const points = lines.flat().map(([lon, lat]) => L.latLng(lat, lon));
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
    <p className="mt-2 text-xs leading-relaxed text-stone-600">道路に沿った徒歩時間の目安です。</p>
    {catchmentError ? <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4" role="status">
      <p className="text-sm">徒歩圏のデータを読み込めませんでした。</p><button className="mt-3 min-h-11 rounded-lg border bg-white px-4 text-sm" onClick={retryCatchment}>再読み込み</button>
    </section> : loading ? <p className="mt-4 text-sm" role="status">徒歩圏を準備しています…</p> : <>
      <div className="mt-5 grid grid-cols-3 gap-2" role="group" aria-label="徒歩時間">
        {([5, 10, 15] as const).map(n => <button key={n} aria-pressed={minutes === n} onClick={() => setMinutes(n)} className={`min-h-12 rounded-xl border text-sm font-bold ${minutes === n ? 'border-emerald-900 bg-emerald-900 text-white' : 'border-stone-200 bg-white text-stone-700'}`}>徒歩 {n} 分</button>)}
      </div>
      <label className="mt-4 flex items-center justify-between gap-3 text-xs text-stone-600">歩く速さ
        <select aria-label="歩く速さ" value={speed} onChange={e => setSpeed(Number(e.target.value))} className="min-h-11 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-900">
          <option value={4}>ふつう · 時速4km</option><option value={3}>ゆっくり · 時速3km</option>
        </select>
      </label>
      <label className="mt-2 flex min-h-11 items-center gap-2 text-xs text-stone-600">
        <input type="checkbox" checked={showSteep} onChange={e => setShowSteep(e.target.checked)} className="h-4 w-4" />
        急坂を表示
      </label>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-stone-600">
        <span><i className="mr-1.5 inline-block h-1.5 w-5 rounded-full bg-emerald-700" />5分以内</span>
        {minutes >= 10 && <span><i className="mr-1.5 inline-block h-1.5 w-5 rounded-full bg-amber-600" />5〜10分</span>}
        {minutes === 15 && <span><i className="mr-1.5 inline-block h-1.5 w-5 rounded-full bg-amber-700" />10〜15分</span>}
        {showSteep && <span><i className="mr-1.5 inline-block h-1.5 w-5 rounded-full" style={{ background: 'repeating-linear-gradient(90deg, #dc2626 0 3px, transparent 3px 6px)' }} />勾配5%以上（バリアフリー道路の基準超）</span>}
        {showSteep && <span><i className="mr-1.5 inline-block h-1.5 w-5 rounded-full bg-red-900" />勾配8%以上（車いす自走の限界目安超）</span>}
      </div>
      {steepSummary && steepSummary.totalLength > 0 && <p className="mt-2 text-xs text-stone-600">この帯でまとまって続く急坂は合計約{Math.round(steepSummary.totalLength)}mです。</p>}
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
