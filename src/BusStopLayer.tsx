import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { BusCollection, BusFeature } from './types';
import { INITIAL_VIEW } from './mapConfig';
import BusStopDrawer from './BusStopDrawer';
import WalkingPanel, { useWalkingData } from './WalkingPanel';
import type { Coordinate } from './walking';
import { nationalCatalog, pilotCatalog, NATIONAL_ATTRIBUTION } from './stopCatalog';

export default function BusStopLayer({ map, onSelectionChange }: { map: L.Map | null; onSelectionChange: (selected: boolean) => void }) {
  const stopsRef = useRef<L.GeoJSON | null>(null);
  const markersRef = useRef(new Map<string, L.Layer>());
  const [stops, setStops] = useState<BusFeature[]>([]);
  const [dataTimestamp, setDataTimestamp] = useState('');
  const [selected, setSelected] = useState('');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<'national' | 'pilot'>('national');
  const pendingSelection = useRef('');
  const walking = useWalkingData();

  useEffect(() => {
    if (!map) return;
    setDataTimestamp('');
    const abort = new AbortController();
    setFailed(false);
    setStops([]);
    setSelected('');
    const get = async (name: string) => {
      const response = await fetch(`${import.meta.env.BASE_URL}data/${name}`, { signal: abort.signal });
      if (!response.ok) throw Error('Data unavailable'); return response.json();
    };
    const request: Promise<BusCollection> = mode === 'national'
      ? get('review-national.geojson').then(nationalCatalog)
      : Promise.all([get('bus_stop.geojson'), get('walking-onoda.json')]).then(([data, graph]) => pilotCatalog(data, graph.pilot_stops.map((s: { id: string }) => s.id)));
    request
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
        setSelected(pendingSelection.current || (mode === 'pilot' ? String(data.features[0].id || data.features[0].properties['@id']) : ''));
        pendingSelection.current = '';
        setDataTimestamp(typeof data.timestamp === 'string' ? data.timestamp : '不明');
        map.fitBounds(layer.getBounds(), { paddingTopLeft: [24, 100], paddingBottomRight: [24, 100] });
      }).catch(error => { if (error.name !== 'AbortError' && !abort.signal.aborted) setFailed(true); });
    return () => {
      abort.abort();
      stopsRef.current?.remove();
      stopsRef.current = null;
      markersRef.current.clear();
    };
  }, [map, attempt, mode]);

  useEffect(() => {
    if (!map || mode !== 'national') return;
    map.attributionControl.addAttribution(NATIONAL_ATTRIBUTION);
    return () => { map.attributionControl.removeAttribution(NATIONAL_ATTRIBUTION); };
  }, [map, mode]);

  const selectStop = (id: string) => {
    if (mode === 'national' && /^(node|way|relation)\//.test(id)) {
      pendingSelection.current = id;
      setMode('pilot');
    } else setSelected(id);
  };

  const closeDrawer = useCallback(() => setSelected(''), []);
  const selectedStop = stops.find(feature => String(feature.id || feature.properties?.['@id']) === selected);

  useEffect(() => { onSelectionChange(Boolean(selectedStop)); }, [selectedStop, onSelectionChange]);

  useEffect(() => {
    if (!map) return;
    const styleMarkers = () => {
      const radius = mode === 'national' && map.getZoom() <= 9 ? 3 : 6;
      const weight = radius === 3 ? 1 : 2;
      for (const marker of markersRef.current.values()) {
        if (marker instanceof L.CircleMarker) marker.setRadius(radius).setStyle({ fillColor: '#174f9d', weight });
      }
      const marker = markersRef.current.get(selected);
      if (marker instanceof L.CircleMarker) marker.setRadius(10).setStyle({ fillColor: '#0284c7', weight: 3 }).bringToFront();
    };
    styleMarkers();
    map.on('zoomend', styleMarkers);
    return () => { map.off('zoomend', styleMarkers); };
  }, [map, stops, selected, mode]);

  const reset = () => {
    setSelected('');
    map?.closePopup();
    if (stopsRef.current) map?.fitBounds(stopsRef.current.getBounds(), { paddingTopLeft: [24, 100], paddingBottomRight: [24, 100] });
    else map?.setView(INITIAL_VIEW.center, INITIAL_VIEW.zoom);
  };
  return <>
      <div className="absolute left-6 top-28 z-[1000] max-w-[calc(100%-48px)] rounded-xl border border-stone-200 bg-white/95 px-3 py-2 shadow-sm max-[600px]:left-3.5 max-[600px]:top-24">
        <p className="text-xs font-semibold">{mode === 'national' ? '国土数値情報 · 2022年度版 · 4,418件' : '徒歩圏の試作 · OSMの7地点'}</p>
        <button className="mt-1 min-h-9 text-xs text-sky-800 underline underline-offset-2" onClick={() => { pendingSelection.current = ''; setMode(mode === 'national' ? 'pilot' : 'national'); }}>
          {mode === 'national' ? 'おのだサンパーク周辺で試す' : '国のデータで県全体を見る'}
        </button>
      </div>
      <button className="reset absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-white/95 text-xl text-emerald-900 shadow-sm hover:bg-emerald-50 max-[600px]:right-3.5 max-[600px]:top-5" onClick={reset} aria-label="山口県のバス停全体を表示" title="全体を表示">
        <span aria-hidden="true">↺</span>
      </button>
      {failed && <button className="absolute left-4 top-28 rounded-xl bg-white p-3 text-sm text-red-800 shadow" onClick={() => setAttempt(n => n + 1)}>バス停を読み込めませんでした。再読み込み</button>}
      {selectedStop && <BusStopDrawer stop={selectedStop} timestamp={dataTimestamp} onClose={closeDrawer}>
        <WalkingPanel map={map} id={selected} origin={selectedStop.geometry.coordinates as Coordinate} {...walking} onSelect={selectStop} />
      </BusStopDrawer>}
  </>;
}
