import { useEffect, useState } from 'react';
import L from 'leaflet';
import type { ShoppingCollection, ShoppingFeature } from './types';
import { catchmentFile, parseCatchment, reachableLines } from './walking';
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

export default function WalkingPanel({ map, id, origin, facilities, error, retry }: {
  map: L.Map | null; id: string; origin: Coordinate;
  facilities: ShoppingFeature[] | null; error: boolean; retry: () => void;
}) {
  const [minutes, setMinutes] = useState<5 | 10 | 15>(10);
  const [speed, setSpeed] = useState(4);
  const { catchment, loading, error: catchmentError, retry: retryCatchment } = useCatchment(id);

  useEffect(() => {
    if (!map || !catchment) return;
    const group = L.layerGroup().addTo(map);
    const toLatLng = (line: Coordinate[]) => line.map(([lon, lat]) => L.latLng(lat, lon));
    const bands = ([[15, '#b45309'], [10, '#c47b13'], [5, '#047857']] as const).filter(([n]) => n <= minutes);
    for (const [n, color] of bands) {
      L.polyline(reachableLines(catchment, speed * 1000 / 60 * n).map(toLatLng), { color, weight: 7, opacity: 0.9, interactive: false }).addTo(group);
    }
    L.polyline(toLatLng([origin, catchment.snap]), { color: '#334155', weight: 3, dashArray: '3 5', interactive: false }).addTo(group);
    L.circleMarker([origin[1], origin[0]], { radius: 10, fillColor: '#174f9d', fillOpacity: 1, color: 'white', weight: 3, interactive: false }).addTo(group);
    return () => { group.remove(); };
  }, [map, catchment, speed, minutes, origin]);

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
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-stone-600">
        <span><i className="mr-1.5 inline-block h-1.5 w-5 rounded-full bg-emerald-700" />5分以内</span>
        {minutes >= 10 && <span><i className="mr-1.5 inline-block h-1.5 w-5 rounded-full bg-amber-600" />5〜10分</span>}
        {minutes === 15 && <span><i className="mr-1.5 inline-block h-1.5 w-5 rounded-full bg-amber-700" />10〜15分</span>}
      </div>
      {!catchment ? <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm" role="status">この停留所と歩ける道路の接続を確認できませんでした。別の停留所をお試しください。</p> : (
        // ponytail: 買い物候補（reachFacility・坂/階段の警告・候補カード）は
        // facility judgement を実装する後続タスクで戻す。ここはその置き場所。
        null
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-stone-500">信号待ち、工事や現地の横断可否、車いす対応は反映していません。坂は地形データからの概算です。現地の通行状況を確認してください。</p>
      <a className="mt-2 inline-block text-[11px] text-sky-800 underline" href={`${import.meta.env.BASE_URL}about.html#walking`}>計算方法とデータについて</a>
    </>}
  </section>;
}
