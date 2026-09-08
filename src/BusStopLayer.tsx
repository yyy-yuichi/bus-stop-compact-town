import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { BusCollection, BusFeature } from './types';
import { INITIAL_VIEW } from './mapConfig';
import BusStopDrawer from './BusStopDrawer';
import WalkingPanel, { useWalkingData } from './WalkingPanel';
import type { Coordinate } from './walking';

export default function BusStopLayer({ map, onSelectionChange }: { map: L.Map | null; onSelectionChange: (selected: boolean) => void }) {
  const stopsRef = useRef<L.GeoJSON | null>(null);
  const markersRef = useRef(new Map<string, L.Layer>());
  const [stops, setStops] = useState<BusFeature[]>([]);
  const [dataTimestamp, setDataTimestamp] = useState('');
  const [selected, setSelected] = useState('');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const walking = useWalkingData();

  useEffect(() => {
    if (!map) return;
    setDataTimestamp('');
    const abort = new AbortController();
    setFailed(false);
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
            marker.on('click', () => { map.closePopup(); setSelected(id); });
            markersRef.current.set(id, marker);
          },
        }).addTo(map);
        stopsRef.current = layer;
        setStops(data.features);
        setDataTimestamp(typeof data.timestamp === 'string' ? data.timestamp : '不明');
        map.fitBounds(layer.getBounds(), { paddingTopLeft: [24, 100], paddingBottomRight: [24, 100] });
      }).catch(error => { if (error.name !== 'AbortError' && !abort.signal.aborted) setFailed(true); });
    return () => {
      abort.abort();
      stopsRef.current?.remove();
      stopsRef.current = null;
      markersRef.current.clear();
    };
  }, [map, attempt]);

  const closeDrawer = useCallback(() => setSelected(''), []);
  const selectedStop = stops.find(feature => String(feature.id || feature.properties?.['@id']) === selected);

  useEffect(() => { onSelectionChange(Boolean(selectedStop)); }, [selectedStop, onSelectionChange]);

  useEffect(() => {
    const marker = markersRef.current.get(selected);
    if (!(marker instanceof L.CircleMarker)) return;
    marker.setRadius(10).setStyle({ fillColor: '#0284c7', weight: 3 }).bringToFront();
    return () => { marker.setRadius(6).setStyle({ fillColor: '#174f9d', weight: 2 }); };
  }, [selected]);

  const reset = () => {
    setSelected('');
    map?.closePopup();
    if (stopsRef.current) map?.fitBounds(stopsRef.current.getBounds(), { paddingTopLeft: [24, 100], paddingBottomRight: [24, 100] });
    else map?.setView(INITIAL_VIEW.center, INITIAL_VIEW.zoom);
  };
  return <>
      <button className="reset absolute right-6 top-6 flex min-h-12 items-center gap-2 rounded-xl border border-emerald-900/10 bg-emerald-900 px-4 text-xs font-semibold text-white shadow-lg shadow-emerald-950/15 transition-colors hover:bg-emerald-800 max-[600px]:right-3.5 max-[600px]:top-5 max-[600px]:px-3" onClick={reset} aria-label="山口県のバス停全体を表示">
        <span aria-hidden="true">↺</span> 全体を表示
      </button>
      {failed && <button className="absolute left-4 top-28 rounded-xl bg-white p-3 text-sm text-red-800 shadow" onClick={() => setAttempt(n => n + 1)}>バス停を読み込めませんでした。再読み込み</button>}
      {!selectedStop && <section className="walking-intro absolute bottom-24 left-6 z-[900] w-80 max-w-[calc(100%-100px)] rounded-2xl border border-white bg-white/95 p-5 shadow-xl shadow-emerald-950/15 max-[600px]:bottom-24 max-[600px]:left-3.5 max-[600px]:p-4">
        <p className="text-[10px] font-bold tracking-widest text-emerald-700">バス停から、歩いて買い物へ</p>
        <h2 className="mt-2 text-lg font-bold">徒歩5分・10分のまち</h2>
        <p className="mt-2 text-xs leading-relaxed text-stone-600">バス停を選ぶと、歩ける道路と買い物候補が分かります。まずはおのだサンパーク周辺で。</p>
        {walking.error ? <button className="mt-4 min-h-12 w-full rounded-xl border border-amber-300 bg-amber-50 text-sm" onClick={walking.retry}>徒歩圏データを再読み込み</button> : <button disabled={!walking.data || !stops.length} className="mt-4 min-h-12 w-full rounded-xl bg-emerald-900 text-sm font-bold text-white hover:bg-emerald-800" onClick={() => { if (walking.data) setSelected(walking.data.graph.pilot_stops[0].id); }}>{walking.data ? 'おのだサンパーク周辺で試す →' : '徒歩圏を準備中…'}</button>}
      </section>}
      {selectedStop && <BusStopDrawer stop={selectedStop} timestamp={dataTimestamp} onClose={closeDrawer}>
        <WalkingPanel map={map} id={selected} origin={selectedStop.geometry.coordinates as Coordinate} {...walking} onSelect={setSelected} />
      </BusStopDrawer>}
  </>;
}
