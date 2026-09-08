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
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
    <main className="app">
      <div className="map" ref={container} role="region" aria-label="まちの地図。矢印キーで移動、プラス・マイナスキーで拡大縮小。" />
      <header className="map-heading">
        <div className="brand-icon" aria-hidden="true">町</div>
        <div><p className="eyebrow">COMPACT TOWN</p><h1>まちの地図</h1></div>
        <span className="phase">山口県のバス停</span>
      </header>
      <BusStopLayer map={mapInstance} />
      <ShoppingLayer map={mapInstance} />
      {(offline || tileError) && <div className="notice" role="status">
        <span>{offline ? 'オフラインです。地図の表示には通信が必要です。' : '地図の一部を読み込めませんでした。'}</span>
        {!offline && <button onClick={retry}>再読み込み</button>}
      </div>}
      <div className="hint"><span className="hint-dot" />ドラッグで移動 · ピンチ / ＋− で拡大縮小</div>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
createRoot(root).render(<StrictMode><App /></StrictMode>);


