import React, { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import MapIcon from './MapIcon';

import BusStopLayer from './BusStopLayer';
import { INITIAL_VIEW } from './mapConfig';

function App() {
  const container = useRef<HTMLDivElement | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const [busSelected, setBusSelected] = useState(false);
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
    <main className={`app ${busSelected ? 'app-with-selection' : ''} relative h-dvh w-full overflow-hidden bg-stone-100 text-emerald-950`}>
      <header className="app-header"><div className="brand"><span className="brand-symbol"><MapIcon name="bus" /></span><h1>バス停と買い物マップ</h1><span className="region-label">山口県</span></div><a href={`${import.meta.env.BASE_URL}about.html`}>使い方・出典 <span aria-hidden="true">↗</span></a></header>
      <div className="map absolute inset-0 z-0 bg-stone-100" ref={container} role="region" aria-label="まちの地図。矢印キーで移動、プラス・マイナスキーで拡大縮小。" />
      <BusStopLayer map={mapInstance} onSelectionChange={setBusSelected} />
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
