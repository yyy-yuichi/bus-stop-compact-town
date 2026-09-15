import React, { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import MapIcon from './MapIcon';

import BusStopLayer from './BusStopLayer';
import { INITIAL_VIEW, MAP_OPTIONS } from './mapConfig';
import { BasemapPreferences, type BasemapMode } from './basemapPreferences';
import useBasemap from './useBasemap';

function App() {
  const container = useRef<HTMLDivElement | null>(null);
  const [busSelected, setBusSelected] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [basemap,setBasemap] = useState<BasemapMode>(()=>{ try { return localStorage.getItem('basemap') === 'standard' ? 'standard' : 'soft'; } catch { return 'soft'; } });
  const [mapAttempt,setMapAttempt] = useState(0);
  const {error:tileError,fallback} = useBasemap(mapInstance,basemap,mapAttempt);
  const changeBasemap = (value: BasemapMode)=>{ setBasemap(value); setMapAttempt(n=>n+1); try {localStorage.setItem('basemap',value);} catch {/* Private storage may be unavailable. */} };

  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, MAP_OPTIONS).setView(INITIAL_VIEW.center, INITIAL_VIEW.zoom);
    setMapInstance(map);
    L.control.zoom({ position: 'bottomright', zoomInTitle: '地図を拡大', zoomOutTitle: '地図を縮小' }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);
    // Licenses (CC BY 4.0 / ODbL) allow crediting via a link; the full list lives in about.html.
    map.attributionControl.setPrefix(`<a href="${import.meta.env.BASE_URL}about.html#sources">出典</a>`);
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(container.current);
    const onOffline = () => setOffline(true);
    const onOnline = () => { setOffline(false); setMapAttempt(n=>n+1); };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      resize.disconnect();
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      map.remove();
    };
  }, []);

  const retry = () => setMapAttempt(n=>n+1);

  return (
    <BasemapPreferences.Provider value={{mode:basemap,onMode:changeBasemap,fallback}}><main className={`app ${busSelected ? 'app-with-selection' : ''} relative h-dvh w-full overflow-hidden bg-stone-100 text-emerald-950`}>
      <header className="app-header"><div className="brand"><span className="brand-symbol"><MapIcon name="bus" /></span><h1>バス停と暮らしマップ</h1><span className="region-label">{import.meta.env.VITE_BOARDING_STUDY === '1' ? '乗り場表示の試作' : '山口県'}</span></div><a href={`${import.meta.env.BASE_URL}about.html`}>使い方・出典 <span aria-hidden="true">↗</span></a></header>
      <div className="map absolute inset-0 z-0 bg-stone-100" ref={container} role="region" aria-label="まちの地図。矢印キーで移動、プラス・マイナスキーで拡大縮小。" />
      <BusStopLayer map={mapInstance} onSelectionChange={setBusSelected} />
      {(offline || tileError) && <div className="notice absolute bottom-24 left-1/2 z-[1100] flex w-max max-w-[calc(100%-28px)] -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg max-[600px]:bottom-44" role="status">
        <span>{offline ? 'オフラインです。地図の表示には通信が必要です。' : '地図の一部を読み込めませんでした。'}</span>
        {!offline && <button className="mt-2 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-xs font-semibold hover:bg-stone-100" onClick={retry}>再読み込み</button>}
      </div>}
    </main></BasemapPreferences.Provider>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
createRoot(root).render(<StrictMode><App /></StrictMode>);
