import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import type { BusCollection, BusFeature, ShoppingFeature } from './types';
import { INITIAL_VIEW } from './mapConfig';
import BusStopDrawer from './BusStopDrawer';
import WalkingPanel, { useWalkingData } from './WalkingPanel';
import type { Coordinate } from './walking';
import { nationalCatalog, pilotCatalog, NATIONAL_ATTRIBUTION } from './stopCatalog';
import MapPanel from './MapPanel';
import ShoppingLayer from './ShoppingLayer';
import FacilityDrawer from './FacilityDrawer';
import { categoryOf, SHOPPING_CATEGORIES, useShoppingData } from './shoppingData';
import type { ShoppingCategory } from './shoppingData';
import { fitContent } from './mapLayout';
import MapIcon from './MapIcon';
import { placeLink, readPlaceLink } from './placeLink';
import type { SharedPlace } from './placeLink';

export default function BusStopLayer({ map, onSelectionChange }: { map: L.Map | null; onSelectionChange: (selected: boolean) => void }) {
  const stopsRef = useRef<L.GeoJSON | null>(null);
  const markersRef = useRef(new Map<string, L.Layer>());
  const [stops, setStops] = useState<BusFeature[]>([]);
  const [dataTimestamp, setDataTimestamp] = useState('');
  const [selected, setSelected] = useState('');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sharedPlace, setSharedPlace] = useState<SharedPlace | null>(() => readPlaceLink(window.location.hash));
  const [shareWarning, setShareWarning] = useState(() => Boolean(window.location.hash) && !readPlaceLink(window.location.hash));
  const [mode, setMode] = useState<'national' | 'pilot'>(() => readPlaceLink(window.location.hash)?.kind === 'pilot' ? 'pilot' : 'national');
  const pendingSelection = useRef('');
  const shopping = useShoppingData();
  const walking = useWalkingData(shopping.features, shopping.loading ? 'loading' : shopping.error ? 'error' : 'ready');
  const [categories, setCategories] = useState<ShoppingCategory[]>(SHOPPING_CATEGORIES.map(c => c.id));
  const [selectedFacility, setSelectedFacility] = useState<ShoppingFeature | null>(null);
  const shownFacilities = useMemo(() => shopping.features.filter(f => f.properties.category === 'reference' ? f.id === selectedFacility?.id : categories.includes(categoryOf(f).id)), [shopping.features, categories, selectedFacility]);

  useEffect(() => {
    const read = () => {
      const place = readPlaceLink(window.location.hash);
      setSharedPlace(place);
      setShareWarning(Boolean(window.location.hash) && !place);
      setSelected(''); setSelectedFacility(null);
      pendingSelection.current = '';
      setMode(place?.kind === 'pilot' ? 'pilot' : 'national');
    };
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

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
            marker.on('click', () => { map.closePopup(); setSharedPlace(null); setShareWarning(false); setSelectedFacility(null); setSelected(id); });
            markersRef.current.set(id, marker);
          },
        }).addTo(map);
        stopsRef.current = layer;
        setStops(data.features);
        setSelected(pendingSelection.current || (mode === 'pilot' && !sharedPlace ? String(data.features[0].id || data.features[0].properties['@id']) : ''));
        pendingSelection.current = '';
        setDataTimestamp(typeof data.timestamp === 'string' ? data.timestamp : '不明');
        fitContent(map, layer.getBounds());
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
    setSharedPlace(null); setShareWarning(false);
    setSelectedFacility(null);
    if (mode === 'national' && /^(node|way|relation)\//.test(id)) {
      pendingSelection.current = id;
      setMode('pilot');
    } else setSelected(id);
  };

  const closeDrawer = useCallback(() => setSelected(''), []);
  const closeFacility = useCallback(() => setSelectedFacility(null), []);
  const selectFacility = useCallback((feature: ShoppingFeature) => {
    setSharedPlace(null); setShareWarning(false);
    setSelectedFacility(feature);
    const category = categoryOf(feature).id;
    if (category !== 'reference') setCategories(previous => previous.includes(category) ? previous : [...previous, category]);
  }, []);
  const selectedStop = stops.find(feature => String(feature.id || feature.properties?.['@id']) === selected);

  useEffect(() => {
    if (!sharedPlace || !stops.length) return;
    if (stops[0].properties.source_kind !== (mode === 'pilot' ? 'osm-pilot' : 'national')) return;
    if (sharedPlace.kind === 'facility') {
      if (shopping.loading || shopping.error) return;
      const facility = shopping.features.find(f => String(f.id) === sharedPlace.id);
      if (facility) selectFacility(facility); else { setShareWarning(true); setSharedPlace(null); }
      return;
    }
    if ((sharedPlace.kind === 'pilot') !== (mode === 'pilot')) return;
    const stop = stops.find(f => String(f.id || f.properties['@id']) === sharedPlace.id);
    if (stop) { setSelectedFacility(null); setSelected(sharedPlace.id); }
    else setShareWarning(true);
    setSharedPlace(null);
  }, [sharedPlace, stops, mode, shopping.features, shopping.loading, shopping.error, selectFacility]);

  useEffect(() => {
    if (sharedPlace || shareWarning || !stops.length || stops[0].properties.source_kind !== (mode === 'pilot' ? 'osm-pilot' : 'national')) return;
    const place: SharedPlace | null = selectedFacility ? { kind: 'facility', id: String(selectedFacility.id) }
      : selectedStop ? { kind: mode, id: String(selectedStop.id || selectedStop.properties['@id']) } : null;
    const url = new URL(window.location.href);
    url.hash = place ? new URL(placeLink(url.href, place)).hash : '';
    if (url.hash !== window.location.hash) window.history.replaceState(window.history.state, '', url);
  }, [sharedPlace, shareWarning, stops, mode, selectedFacility, selectedStop]);

  useEffect(() => { onSelectionChange(Boolean(selectedStop || selectedFacility)); }, [selectedStop, selectedFacility, onSelectionChange]);
  useEffect(() => {
    if (!map) return;
    const focus = () => {
      if (selectedFacility) fitContent(map, L.geoJSON(selectedFacility).getBounds(), true, 17);
      else if (selectedStop && mode === 'national') {
        const [lon, lat] = selectedStop.geometry.coordinates;
        fitContent(map, L.latLngBounds([[lat, lon]]), true, Math.max(15, map.getZoom()));
      }
    };
    focus();
    map.on('resize', focus);
    return () => { map.off('resize', focus); };
  }, [map, selectedFacility, selectedStop, mode]);

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
    setSharedPlace(null); setShareWarning(false);
    setSelected('');
    setSelectedFacility(null);
    map?.closePopup();
    if (stopsRef.current && map) fitContent(map, stopsRef.current.getBounds());
    else map?.setView(INITIAL_VIEW.center, INITIAL_VIEW.zoom);
  };
  const changeMode = () => {
    setSharedPlace(null); setShareWarning(false); setSelectedFacility(null); setSelected('');
    pendingSelection.current = '';
    setMode(mode === 'national' ? 'pilot' : 'national');
  };
  const returnToSearch = () => { setSelected(''); setSelectedFacility(null); };
  return <>
      <MapPanel selection={String(selectedFacility?.id || selected)} stops={stops} facilities={shopping.features} categories={categories} onCategories={values => { setCategories(values); if (selectedFacility && !values.includes(categoryOf(selectedFacility).id)) setSelectedFacility(null); }} onStop={selectStop} onFacility={selectFacility} mode={mode} busy={!stops.length && !failed} shoppingError={shopping.error} shoppingLoading={shopping.loading} retryShopping={shopping.retry} onMode={changeMode} onReturnSearch={returnToSearch} />
      <ShoppingLayer map={map} features={shownFacilities} selected={String(selectedFacility?.id || '')} onSelect={selectFacility} />
      <button className="reset icon-button" onClick={reset} aria-label={mode === 'national' ? '山口県のバス停全体を表示' : '徒歩圏試作の7地点全体を表示'} title="全体を表示"><MapIcon name="reset" /></button>
      {failed && <button className="data-error" onClick={() => setAttempt(n => n + 1)}>バス停を読み込めませんでした。再読み込み</button>}
      {shareWarning && <div className="link-notice" role="status"><p>リンクの場所が見つかりませんでした。名前で検索できます。</p><button className="icon-button" aria-label="リンクの案内を閉じる" onClick={() => setShareWarning(false)}><MapIcon name="close" /></button></div>}
      {selectedStop && <BusStopDrawer stop={selectedStop} timestamp={dataTimestamp} onClose={closeDrawer} hidden={!!selectedFacility} onNational={changeMode}>
        <WalkingPanel map={map} id={selected} origin={selectedStop.geometry.coordinates as Coordinate} {...walking} retry={() => { walking.retry(); shopping.retry(); }} onSelect={selectStop} onFacility={selectFacility} active={!selectedFacility} />
      </BusStopDrawer>}
      {selectedFacility && <FacilityDrawer facility={selectedFacility} onClose={closeFacility} returnStop={selectedStop ? { name: selectedStop.properties['name:ja'] || selectedStop.properties.name || '名称未登録', pilot: mode === 'pilot' } : undefined} />}
  </>;
}
