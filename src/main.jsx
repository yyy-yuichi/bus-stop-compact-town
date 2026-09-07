import React, { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';

const INITIAL_VIEW = { center: [34.17, 131.58], zoom: 9 };
const stopName = (feature) => feature.properties?.['name:ja'] || feature.properties?.name || '名称未登録';

function App() {
  const container = useRef(null);
  const mapRef = useRef(null);
  const tilesRef = useRef(null);
  const stopsRef = useRef(null);
  const markersRef = useRef(new Map());
  const [stops, setStops] = useState([]);
  const [dataState, setDataState] = useState('loading');
  const [dataTimestamp, setDataTimestamp] = useState('');
  const [selected, setSelected] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [tileError, setTileError] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const map = L.map(container.current, {
      zoomControl: false,
      minZoom: 3,
      maxZoom: 19,
      worldCopyJump: true,
      preferCanvas: true,
    }).setView(INITIAL_VIEW.center, INITIAL_VIEW.zoom);
    mapRef.current = map;
    L.control.zoom({ position: 'bottomright', zoomInTitle: '地図を拡大', zoomOutTitle: '地図を縮小' }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    tiles.on('tileerror', () => setTileError(true));
    tiles.addTo(map);
    tilesRef.current = tiles;
    const abort = new AbortController();
    setDataState('loading');
    setStops([]);
    setSelected('');
    fetch(`${import.meta.env.BASE_URL}data/bus_stop.geojson`, { signal: abort.signal })
      .then(response => { if (!response.ok) throw new Error('GeoJSON unavailable'); return response.json(); })
      .then(data => {
        if (abort.signal.aborted) return;
        if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length || data.features.some(f =>
          f.geometry?.type !== 'Point' || !Array.isArray(f.geometry.coordinates) || f.geometry.coordinates.length !== 2 ||
          !f.geometry.coordinates.every(Number.isFinite) || Math.abs(f.geometry.coordinates[0]) > 180 || Math.abs(f.geometry.coordinates[1]) > 90
        )) throw new Error('Invalid GeoJSON');
        const layer = L.geoJSON(data, {
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
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(container.current);
    const onOffline = () => setOffline(true);
    const onOnline = () => { setOffline(false); setTileError(false); tiles.redraw(); };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      resize.disconnect();
      abort.abort();
      markersRef.current.clear();
      stopsRef.current = null;
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      map.remove();
      mapRef.current = null;
      tilesRef.current = null;
    };
  }, [loadAttempt]);

  const reset = () => {
    setSelected('');
    mapRef.current?.closePopup();
    if (stopsRef.current) mapRef.current?.fitBounds(stopsRef.current.getBounds(), { paddingTopLeft: [24, 230], paddingBottomRight: [24, 100] });
    else mapRef.current?.setView(INITIAL_VIEW.center, INITIAL_VIEW.zoom);
  };
  const selectStop = (event) => {
    const id = event.target.value;
    setSelected(id);
    const marker = markersRef.current.get(id);
    if (marker) { mapRef.current.setView(marker.getLatLng(), 16); marker.openPopup(); }
  };
  const retry = () => { setTileError(false); tilesRef.current?.redraw(); };

  return (
    <main className="app">
      <div className="map" ref={container} role="region" aria-label="まちの地図。矢印キーで移動、プラス・マイナスキーで拡大縮小。" />
      <header className="map-heading">
        <div className="brand-icon" aria-hidden="true">町</div>
        <div><p className="eyebrow">COMPACT TOWN</p><h1>まちの地図</h1></div>
        <span className="phase">山口県のバス停</span>
      </header>
      <button className="reset" onClick={reset} aria-label="山口県のバス停全体を表示">
        <span aria-hidden="true">↺</span> 全体を表示
      </button>
      <section className="stop-panel" aria-label="バス停データ">
        <div role="status">{dataState === 'loading' ? 'バス停を読み込み中…' : dataState === 'error' ? 'バス停データを読み込めませんでした。' : `山口県 · ${stops.length.toLocaleString('ja-JP')}地点`}</div>
        {dataState === 'error' && <button onClick={() => setLoadAttempt(n => n + 1)}>データを再読み込み</button>}
        {dataState === 'ready' && <>
          <label htmlFor="stop-choice">バス停を選択</label>
          <select id="stop-choice" value={selected} onChange={selectStop}>
            <option value="">地図の青い点、または一覧から選択</option>
            {stops.map(feature => { const id = String(feature.id || feature.properties?.['@id']); return <option key={id} value={id}>{stopName(feature)} · {id}</option>; })}
          </select>
        </>}
        <p>OSM由来の試用データ · 正確性未確認<br />
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors / ODbL</a>
          {dataTimestamp && <span className="data-time">データ時点：{dataTimestamp}</span>}
        </p>
      </section>
      {(offline || tileError) && <div className="notice" role="status">
        <span>{offline ? 'オフラインです。地図の表示には通信が必要です。' : '地図の一部を読み込めませんでした。'}</span>
        {!offline && <button onClick={retry}>再読み込み</button>}
      </div>}
      <div className="hint"><span className="hint-dot" />ドラッグで移動 · ピンチ / ＋− で拡大縮小</div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
