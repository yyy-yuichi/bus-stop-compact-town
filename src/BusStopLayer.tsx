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
      <button className="reset" onClick={reset} aria-label="山口県のバス停全体を表示">
        <span aria-hidden="true">↺</span> 全体を表示
      </button>
      <section className="stop-panel" aria-label="バス停データ">
        <label className="layer-switch"><input type="checkbox" checked={busVisible} disabled={dataState !== 'ready'} onChange={event => {
          const show = event.target.checked; setBusVisible(show);
          if (show && map) stopsRef.current?.addTo(map);
          else { stopsRef.current?.remove(); setSelected(''); }
        }} /> 青：バス停を表示</label>
        <div role="status">{dataState === 'loading' ? 'バス停を読み込み中…' : dataState === 'error' ? 'バス停データを読み込めませんでした。' : `山口県 · ${stops.length.toLocaleString('ja-JP')}地点`}</div>
        {dataState === 'error' && <button onClick={() => setLoadAttempt(n => n + 1)}>データを再読み込み</button>}
        {dataState === 'ready' && <>
          <label htmlFor="stop-choice">バス停を選択</label>
          <select id="stop-choice" value={selected} onChange={event => { setBusVisible(true); if (map) stopsRef.current?.addTo(map); selectStop(event); }}>
            <option value="">地図の青い点、または一覧から選択</option>
            {stops.map(feature => { const id = String(feature.id || feature.properties?.['@id']); return <option key={id} value={id}>{stopName(feature)} · {id}</option>; })}
          </select>
        </>}
        <p>OSM由来の試用データ · 正確性未確認<br />
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors / ODbL</a>
          {dataTimestamp && <span className="data-time">データ時点：{dataTimestamp}</span>}
        </p>
      </section>
  </>;
}
