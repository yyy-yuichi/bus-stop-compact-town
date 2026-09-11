import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import type { LoadState, ShoppingFeature } from './types';
import { calculateWalk, inPilot, reachFacility, reachableLines, validateGraph } from './walking';
import type { Coordinate, WalkingGraph } from './walking';
import { fitContent } from './mapLayout';

export function useWalkingData(facilities: ShoppingFeature[], facilityState: LoadState) {
  const [graph, setGraph] = useState<WalkingGraph | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setError(false); setGraph(null);
    fetch(`${import.meta.env.BASE_URL}data/walking-onoda.json`, { signal: abort.signal })
      .then(r => { if (!r.ok) throw Error('Walking data unavailable'); return r.json(); })
      .then(value => { validateGraph(value); if (!abort.signal.aborted) setGraph(value); })
      .catch(() => { if (!abort.signal.aborted) setError(true); });
    return () => abort.abort();
  }, [attempt]);
  const joined = useMemo(() => {
    if (!graph || facilityState !== 'ready') return { data: null, error: false };
    const selected = facilities.filter(f => graph.facility_ids.includes(String(f.id)));
    if (selected.length !== graph.facility_ids.length || selected.some(f => !f.geometry || !['Point', 'MultiPolygon'].includes(f.geometry.type))) return { data: null, error: true };
    return { data: { graph, facilities: selected }, error: false };
  }, [graph, facilities, facilityState]);
  return { data: joined.data, error: error || joined.error || facilityState === 'error', retry: () => setAttempt(n => n + 1) };
}

export default function WalkingPanel({ map, id, origin, data, error, retry, onSelect, onFacility, active }: {
  map: L.Map | null; id: string; origin: Coordinate;
  data: ReturnType<typeof useWalkingData>['data']; error: boolean; retry: () => void; onSelect: (id: string) => void;
  onFacility: (facility: ShoppingFeature) => void; active: boolean;
}) {
  const [minutes, setMinutes] = useState<5 | 10>(10);
  const [speed, setSpeed] = useState(4);
  const [showPath, setShowPath] = useState(false);
  const supported = !!data && inPilot(data.graph, id);
  const result = useMemo(() => supported && data ? calculateWalk(data.graph, origin, speed * 1000 / 60 * 10) : null, [data, supported, origin, speed]);
  const candidates = useMemo(() => result && data ? data.facilities.map(f => {
    const rings: Coordinate[][] = f.geometry.type === 'Point' ? [[f.geometry.coordinates as Coordinate]] : f.geometry.coordinates.map(polygon => polygon[0] as Coordinate[]);
    return { facility: f, reach: reachFacility(result, rings) };
  }) : [], [result, data]);
  const visible = candidates.filter(c => c.reach && c.reach.meters <= speed * 1000 / 60 * minutes);
  useEffect(() => { setShowPath(false); }, [id, speed, minutes]);

  useEffect(() => {
    if (!map || !result) return;
    const group = L.layerGroup().addTo(map);
    const toLatLng = (line: Coordinate[]) => line.map(([lon, lat]) => L.latLng(lat, lon));
    const outer = reachableLines(result, speed * 1000 / 60 * minutes);
    L.polyline(outer.map(toLatLng), { color: minutes === 5 ? '#047857' : '#c47b13', weight: 7, opacity: 0.8, interactive: false }).addTo(group);
    if (minutes === 10) L.polyline(reachableLines(result, speed * 1000 / 60 * 5).map(toLatLng), { color: '#047857', weight: 7, opacity: 0.95, interactive: false }).addTo(group);
    L.polyline(toLatLng([origin, result.snap.point]), { color: '#334155', weight: 3, dashArray: '3 5', interactive: false }).addTo(group);
    L.circleMarker([origin[1], origin[0]], { radius: 10, fillColor: '#174f9d', fillOpacity: 1, color: 'white', weight: 3, interactive: false }).addTo(group);
    for (const c of visible) if (c.reach) {
      L.circleMarker([c.reach.point[1], c.reach.point[0]], { radius: 8, color: '#fff', weight: 3, fillColor: '#9c4600', fillOpacity: 1, interactive: false }).addTo(group);
      if (showPath) L.polyline(toLatLng(c.reach.path), { color: '#4f46e5', weight: 4, opacity: 1, dashArray: '8 5', interactive: false }).addTo(group);
    }
    return () => { group.remove(); };
  }, [map, result, speed, minutes, origin, visible.map(c => c.facility.id).join(','), showPath]);

  useEffect(() => {
    if (!map || !result || !active) return;
    const lines = reachableLines(result, speed * 1000 / 60 * 10);
    const points = lines.flat().map(([lon, lat]) => L.latLng(lat, lon));
    if (!points.length) return;
    const bounds = L.latLngBounds(points).extend([origin[1], origin[0]]);
    const focus = () => fitContent(map, bounds, true, 17);
    focus();
    map.on('resize', focus);
    return () => { map.off('resize', focus); };
  }, [map, id, result, active]);

  if (error) return <section className="walking-panel mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4" role="status">
    <p className="text-sm">徒歩圏のデータを読み込めませんでした。</p><button className="mt-3 min-h-11 rounded-lg border bg-white px-4 text-sm" onClick={retry}>再読み込み</button>
  </section>;
  if (!data) return <p className="mb-6 text-sm" role="status">徒歩圏を準備しています…</p>;
  if (!supported) return <section className="mb-6 rounded-2xl bg-emerald-50 p-4">
    <h3 className="font-bold">徒歩圏を試す</h3><p className="mt-2 text-sm leading-relaxed">この地点の徒歩圏は未対応です。おのだサンパーク周辺のOSMの7地点に切り替えて試せます。</p>
    <button className="mt-3 min-h-11 rounded-xl bg-emerald-900 px-4 text-sm font-semibold text-white" onClick={() => onSelect(data.graph.pilot_stops[0].id)}>おのだ周辺の徒歩圏試作へ</button>
  </section>;
  return <section className="walking-panel mb-7" aria-labelledby="walk-title">
    <div className="flex items-center justify-between gap-2"><h3 id="walk-title" className="text-lg font-bold">ここから歩いて行ける範囲</h3><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800">試作</span></div>
    <p className="mt-2 text-xs leading-relaxed text-stone-600">道路に沿った徒歩時間の目安です。</p>
    {result && <button className="mt-3 flex min-h-11 w-full items-center justify-between rounded-lg bg-emerald-50 px-3 text-xs font-semibold text-emerald-900" onClick={() => { const target = document.getElementById('walking-candidates'); target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}>{minutes}分圏の買い物候補 {visible.length}件 <span>結果を見る ↓</span></button>}
    <label className="mt-5 block text-xs font-semibold text-stone-600" htmlFor="walking-stop">出発するバス停を変える</label>
    <select id="walking-stop" className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm" value={id} onChange={e => onSelect(e.target.value)}>
      {data.graph.pilot_stops.map((s, i) => <option key={s.id} value={s.id}>{s.name}{data.graph.pilot_stops.filter(p => p.name === s.name).length > 1 ? `（地点${i + 1}）` : ''}</option>)}
    </select>
    <div className="mt-5 grid grid-cols-2 gap-2" role="group" aria-label="徒歩時間">
      {([5, 10] as const).map(n => <button key={n} aria-pressed={minutes === n} onClick={() => setMinutes(n)} className={`min-h-12 rounded-xl border text-sm font-bold ${minutes === n ? 'border-emerald-900 bg-emerald-900 text-white' : 'border-stone-200 bg-white text-stone-700'}`}>徒歩 {n} 分</button>)}
    </div>
    <label className="mt-4 flex items-center justify-between gap-3 text-xs text-stone-600">歩く速さ
      <select aria-label="歩く速さ" value={speed} onChange={e => setSpeed(Number(e.target.value))} className="min-h-11 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-900">
        <option value={4}>ふつう · 時速4km</option><option value={3}>ゆっくり · 時速3km</option>
      </select>
    </label>
    <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-stone-600"><span><i className="mr-1.5 inline-block h-1.5 w-5 rounded-full bg-emerald-700" />5分以内の道路</span>{minutes === 10 && <span><i className="mr-1.5 inline-block h-1.5 w-5 rounded-full bg-amber-600" />5〜10分の道路</span>}</div>
    {!result ? <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm" role="status">この停留所と歩ける道路の接続を確認できませんでした。別の停留所をお試しください。</p> : <>
      <div id="walking-candidates" tabIndex={-1} className="mt-6 flex scroll-mt-4 items-baseline justify-between"><h4 className="font-bold">{minutes}分圏の買い物候補</h4><span className="text-sm font-bold text-emerald-800" role="status" aria-live="polite">{visible.length}件</span></div>
      {visible.length ? visible.map(({ facility, reach }) => <article key={String(facility.id)} className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
        <p className="text-[11px] font-semibold text-amber-800">ショッピングモール</p><h5 className="mt-1 text-base font-bold">{facility.properties.name}</h5>
        <p className="mt-3 text-sm font-semibold text-emerald-900">建物付近まで 約{Math.max(1, Math.ceil(reach!.meters / (speed * 1000 / 60)))}分 <span className="font-normal text-stone-500">/ 約{Math.round(reach!.meters / 10) * 10}m</span></p>
        <p className="mt-1 text-xs text-stone-600">出入口までの経路は未確認です。</p>
        <button className="primary-link mt-3" onClick={() => onFacility(facility)}>施設の詳細を確認 <span aria-hidden="true">→</span></button>
        <button className="mt-3 min-h-11 w-full rounded-xl border border-indigo-200 bg-white text-sm font-semibold text-indigo-800" aria-pressed={showPath} onClick={() => setShowPath(p => !p)}>{showPath ? '経路の強調を消す' : '建物付近までの経路を見る'}</button>
        <a className="mt-2 flex min-h-11 items-center justify-center text-xs font-semibold text-amber-900 underline underline-offset-2" href={facility.properties.official_url} target="_blank" rel="noreferrer">施設の公式サイト ↗</a>
      </article>) : <p className="mt-3 rounded-xl bg-stone-50 p-4 text-sm leading-relaxed">登録済みの施設では、{minutes}分以内に到達する候補を確認できませんでした。{minutes === 5 ? '10分に広げると結果が変わることがあります。' : '周辺にお店がないことを意味するものではありません。'}</p>}
    </>}
    <p className="mt-4 text-[11px] leading-relaxed text-stone-500">この試作はおのだサンパーク1施設が対象です。信号待ち・坂道・道路の未登録部分は反映していません。現地の通行状況を確認してください。</p>
    <a className="mt-2 inline-block text-[11px] text-sky-800 underline" href={`${import.meta.env.BASE_URL}about.html#walking`}>計算方法とデータについて</a>
  </section>;
}
