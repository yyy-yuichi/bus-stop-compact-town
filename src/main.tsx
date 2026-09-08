import React, { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import ShoppingLayer from './ShoppingLayer';

import BusStopLayer from './BusStopLayer';
import { INITIAL_VIEW } from './mapConfig';

function App() {
  const container = useRef<HTMLDivElement | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const [tileError, setTileError] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, {
      zoomControl: false,
      minZoom: 3,
      maxZoom: 19,
      worldCopyJump: true,
      preferCanvas: true,
    }).setView(INITIAL_VIEW.center, INITIAL_VIEW.zoom);
    setMapInstance(map);
    L.control.zoom({ position: 'bottomright', zoomInTitle: '地図を拡大', zoomOutTitle: '地図を縮小' }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a className="text-[11px] text-sky-800 underline decoration-sky-300 underline-offset-2 hover:text-sky-950" href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    tiles.on('tileerror', () => setTileError(true));
    tiles.addTo(map);
    tilesRef.current = tiles;
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(container.current);
    const onOffline = () => setOffline(true);
    const onOnline = () => { setOffline(false); setTileError(false); tiles.redraw(); };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      resize.disconnect();
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      map.remove();
      tilesRef.current = null;
    };
  }, []);

  const retry = () => { setTileError(false); tilesRef.current?.redraw(); };

  return (
    <main className="app relative h-dvh w-full overflow-hidden bg-stone-100 text-emerald-950">
      <div className="map absolute inset-0 z-0 bg-stone-100" ref={container} role="region" aria-label="まちの地図。矢印キーで移動、プラス・マイナスキーで拡大縮小。" />
      <header className="map-heading pointer-events-none absolute left-6 top-6 flex items-center gap-3 rounded-2xl border border-white bg-white/95 p-3 shadow-lg shadow-emerald-950/10 backdrop-blur-sm max-[600px]:left-3.5 max-[600px]:top-3.5 max-[600px]:gap-2">
        <div className="brand-icon grid size-11 place-items-center rounded-xl bg-emerald-900 text-2xl font-semibold text-white max-[600px]:size-9 max-[600px]:text-xl" aria-hidden="true">町</div>
        <div><p className="eyebrow mb-0.5 text-[9px] font-bold tracking-[0.2em] text-emerald-700">COMPACT TOWN</p><h1 className="text-lg font-bold tracking-wide max-[600px]:text-base">まちの地図</h1></div>
        <span className="phase ml-4 border-l border-stone-200 px-4 text-xs text-stone-600 max-[600px]:hidden">山口県のバス停</span>
      </header>
      <BusStopLayer map={mapInstance} />
      <ShoppingLayer map={mapInstance} />
      <a href={`${import.meta.env.BASE_URL}about.html`} className="absolute bottom-3 left-4 rounded-lg bg-white/95 px-3 py-2 text-[10px] text-sky-900 underline shadow-sm">この地図について・出典</a>
      {(offline || tileError) && <div className="notice absolute bottom-24 left-1/2 z-[1100] flex w-max max-w-[calc(100%-28px)] -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg max-[600px]:bottom-44" role="status">
        <span>{offline ? 'オフラインです。地図の表示には通信が必要です。' : '地図の一部を読み込めませんでした。'}</span>
        {!offline && <button className="mt-2 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-xs font-semibold hover:bg-stone-100" onClick={retry}>再読み込み</button>}
      </div>}
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
createRoot(root).render(<StrictMode><App /></StrictMode>);


