import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { BusCollection, BusFeature, LoadState } from './types';
import { INITIAL_VIEW } from './mapConfig';

const stopName = (feature: Pick<BusFeature, 'properties'>) => feature.properties?.['name:ja'] || feature.properties?.name || '名称未登録';

export default function BusStopLayer({ map }: { map: L.Map | null }) {
  const stopsRef = useRef<L.GeoJSON | null>(null);
  const markersRef = useRef(new Map<string, L.Layer>());
  const [stops, setStops] = useState<BusFeature[]>([]);
  const [dataState, setDataState] = useState<LoadState>('loading');
  const [dataTimestamp, setDataTimestamp] = useState('');
  const [selected, setSelected] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busVisible, setBusVisible] = useState(true);

  useEffect(() => {
    if (!map) return;
    setBusVisible(true);
    setDataTimestamp('');
    const abort = new AbortController();
    setDataState('loading');
    setStops([]);
    setSelected('');
    fetch(`${import.meta.env.BASE_URL}data/bus_stop.geojson`, { signal: abort.signal })
      .then(response => { if (!response.ok) throw new Error('GeoJSON unavailable'); return response.json() as Promise<BusCollection>; })
      .then(data => {
        if (abort.signal.aborted) return;
        if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length || data.features.some(f =>
          f.geometry?.type !== 'Point' || !Array.isArray(f.geometry.coordinates) || f.geometry.coordinates.length !== 2 ||
          !f.geometry.coordinates.every(Number.isFinite) || Math.abs(f.geometry.coordinates[0]) > 180 || Math.abs(f.geometry.coordinates[1]) > 90
        )) throw new Error('Invalid GeoJSON');
        const layer = L.geoJSON<BusFeature['properties']>(data, {
          pointToLayer: (_feature, latlng) => L.circleMarker(latlng, { radius: 6, color: '#fff', weight: 2, fillColor: '#174f9d', fillOpacity: 0.9 }),
          onEachFeature: (feature, marker) => {
            const id = String(feature.id || feature.properties?.['@id']);
            const content = document.createElement('div');
            const heading = document.createElement('strong');
            heading.textContent = stopName(feature);
            content.append(heading);
            for (const value of [feature.properties?.operator, `OSM ID: ${id}`, 'OSM由来の試用データ・正確性未確認']) {
              if (!value) continue;
              const line = document.createElement('p'); line.textContent = value; content.append(line);
            }
            marker.bindPopup(content);
            marker.on('click', () => setSelected(id));
            markersRef.current.set(id, marker);
          },
        }).addTo(map);
        stopsRef.current = layer;
        setStops(data.features);
        setDataTimestamp(typeof data.timestamp === 'string' ? data.timestamp : '不明');
        setDataState('ready');
        map.fitBounds(layer.getBounds(), { paddingTopLeft: [24, 230], paddingBottomRight: [24, 100] });
      }).catch(error => { if (error.name !== 'AbortError' && !abort.signal.aborted) setDataState('error'); });
    return () => {
      abort.abort();
      stopsRef.current?.remove();
      stopsRef.current = null;
      markersRef.current.clear();
    };
  }, [map, loadAttempt]);

  const reset = () => {
    setSelected('');
    map?.closePopup();
    if (stopsRef.current) map?.fitBounds(stopsRef.current.getBounds(), { paddingTopLeft: [24, 230], paddingBottomRight: [24, 100] });
    else map?.setView(INITIAL_VIEW.center, INITIAL_VIEW.zoom);
  };
  const selectStop = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const id = event.target.value;
    setSelected(id);
    const marker = markersRef.current.get(id);
    if (marker instanceof L.CircleMarker) { map?.setView(marker.getLatLng(), 16); marker.openPopup(); }
  };

  return <>
      <button className="reset absolute right-6 top-6 flex min-h-12 items-center gap-2 rounded-xl border border-emerald-900/10 bg-emerald-900 px-4 text-xs font-semibold text-white shadow-lg shadow-emerald-950/15 transition-colors hover:bg-emerald-800 max-[600px]:right-3.5 max-[600px]:top-5 max-[600px]:px-3" onClick={reset} aria-label="山口県のバス停全体を表示">
        <span aria-hidden="true">↺</span> 全体を表示
      </button>
      <section className="stop-panel absolute left-6 top-28 w-[330px] max-w-[calc(100%-28px)] rounded-2xl border border-sky-200 bg-white/95 p-4 text-sm shadow-lg shadow-sky-950/10 backdrop-blur-sm max-[600px]:left-3.5 max-[600px]:top-[88px] max-[600px]:w-[290px] max-[600px]:p-3 [@media(max-height:600px)]:max-h-[calc(100dvh-170px)] [@media(max-height:600px)]:overflow-y-auto" aria-label="バス停データ">
        <label className="layer-switch flex min-h-10 cursor-pointer items-center gap-2 text-xs font-semibold"><input className="size-5 shrink-0 accent-sky-700 disabled:cursor-wait disabled:opacity-50" type="checkbox" checked={busVisible} disabled={dataState !== 'ready'} onChange={event => {
          const show = event.target.checked; setBusVisible(show);
          if (show && map) stopsRef.current?.addTo(map);
          else { stopsRef.current?.remove(); setSelected(''); }
        }} /> 青：バス停を表示</label>
        <div className="mt-1 text-sm font-bold text-sky-900" role="status">{dataState === 'loading' ? 'バス停を読み込み中…' : dataState === 'error' ? 'バス停データを読み込めませんでした。' : `山口県 · ${stops.length.toLocaleString('ja-JP')}地点`}</div>
        {dataState === 'error' && <button className="mt-2 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-xs font-semibold hover:bg-stone-100" onClick={() => setLoadAttempt(n => n + 1)}>データを再読み込み</button>}
        {dataState === 'ready' && <>
          <label className="mt-2 block text-xs font-medium" htmlFor="stop-choice">バス停を選択</label>
          <select className="mt-1 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-2 text-xs text-stone-800 shadow-sm transition-colors hover:border-emerald-600" id="stop-choice" value={selected} onChange={event => { setBusVisible(true); if (map) stopsRef.current?.addTo(map); selectStop(event); }}>
            <option value="">地図の青い点、または一覧から選択</option>
            {stops.map(feature => { const id = String(feature.id || feature.properties?.['@id']); return <option key={id} value={id}>{stopName(feature)} · {id}</option>; })}
          </select>
        </>}
        <p className="mt-2 text-[11px] leading-relaxed text-stone-600">OSM由来の試用データ · 正確性未確認<br />
          <a className="text-[11px] text-sky-800 underline decoration-sky-300 underline-offset-2 hover:text-sky-950" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors / ODbL</a>
          {dataTimestamp && <span className="data-time mt-1 block text-[10px] text-stone-500">データ時点：{dataTimestamp}</span>}
        </p>
      </section>
  </>;
}
