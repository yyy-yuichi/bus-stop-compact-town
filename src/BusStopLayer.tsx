import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import type { BusCollection, BusFeature, ShoppingFeature } from './types';
import { INITIAL_VIEW } from './mapConfig';
import BusStopDrawer from './BusStopDrawer';
import WalkingPanel, { useWalkingData } from './WalkingPanel';
import BakedWalkingPanel, { useUnreachableStops } from './BakedWalkingPanel';
import type { Coordinate } from './walking';
import { nationalCatalog, nationalCatchmentId, municipalCatalog, pilotCatalog } from './stopCatalog';
import MunicipalStopPanel from './MunicipalStopPanel';
import MapPanel from './MapPanel';
import ShoppingLayer from './ShoppingLayer';
import FacilityDrawer from './FacilityDrawer';
import { categoryOf, SHOPPING_CATEGORIES, useShoppingData } from './shoppingData';
import type { ShoppingCategory } from './shoppingData';
import { fitContent, focusContent } from './mapLayout';
import MapIcon from './MapIcon';
import { DEFAULT_BAKED_MINUTES, DEFAULT_WALKING_CONDITIONS, placeLink, readPlaceLink } from './placeLink';
import type { BakedWalkingMinutes, SharedPlace, WalkingConditions } from './placeLink';
import StopMarkers from './StopMarkers';
import { mapFacilities } from './facilityVisibility';
import type { WalkFacilities } from './facilityVisibility';
import { attachBoardingGuides, attachLocationReviews, findBoardingStop } from './boardingGuide';
import type { BoardingStudy } from './boardingGuide';
import BoardingGuidePanel from './BoardingGuidePanel';
import NearbyFacilitiesPanel from './NearbyFacilitiesPanel';
import LocationReviewPanel from './LocationReviewPanel';
import { StopSelectionProvider } from './StopSelection';

const boardingStudy = import.meta.env.VITE_BOARDING_STUDY === '1';

export default function BusStopLayer({ map, onSelectionChange }: { map: L.Map | null; onSelectionChange: (selected: boolean) => void }) {
  const [stops, setStops] = useState<BusFeature[]>([]);
  const [selected, setSelected] = useState('');
  const [located, setLocated] = useState('');
  const [locateVersion, setLocateVersion] = useState(0);
  const [failed, setFailed] = useState(false);
  const [municipalFailed, setMunicipalFailed] = useState(false);
  const [boardingFailed, setBoardingFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sharedPlace, setSharedPlace] = useState<SharedPlace | null>(() => readPlaceLink(window.location.hash));
  const [walkingConditions, setWalkingConditions] = useState<WalkingConditions>(() => sharedPlace?.kind === 'pilot' ? sharedPlace.walking ?? DEFAULT_WALKING_CONDITIONS : DEFAULT_WALKING_CONDITIONS);
  const bakedMinutes: BakedWalkingMinutes = DEFAULT_BAKED_MINUTES;
  const [shareWarning, setShareWarning] = useState(() => Boolean(window.location.hash) && !readPlaceLink(window.location.hash));
  const [mode, setMode] = useState<'national' | 'pilot'>(() => readPlaceLink(window.location.hash)?.kind === 'pilot' ? 'pilot' : 'national');
  const pendingSelection = useRef('');
  const pendingDetail = useRef(false);
  const initialOverview = useRef(true);
  const shopping = useShoppingData();
  const walking = useWalkingData(shopping.features, shopping.loading ? 'loading' : shopping.error ? 'error' : 'ready');
  const unreachable = useUnreachableStops();
  const [categories, setCategories] = useState<ShoppingCategory[]>(SHOPPING_CATEGORIES.map(c => c.id));
  const [selectedFacility, setSelectedFacility] = useState<ShoppingFeature | null>(null);
  const [walkFacilities, setWalkFacilities] = useState<WalkFacilities | null>(null);
  const walkScope = selected ? `${selected}:${mode === 'national' ? bakedMinutes : `${walkingConditions.minutes}:${walkingConditions.speed}`}` : '';
  const shownFacilities = useMemo(() => mapFacilities(shopping.features, categories, selectedFacility, walkScope, walkFacilities), [shopping.features, categories, selectedFacility, walkScope, walkFacilities]);
  const showWalkFacilities = useCallback((scope: string, ids: string[]) => setWalkFacilities({ scope, ids }), []);

  useEffect(() => {
    const read = () => {
      const place = readPlaceLink(window.location.hash);
      setSharedPlace(place);
      setWalkingConditions(place?.kind === 'pilot' ? place.walking ?? DEFAULT_WALKING_CONDITIONS : DEFAULT_WALKING_CONDITIONS);
      setShareWarning(Boolean(window.location.hash) && !place);
      setLocated(''); setLocateVersion(value => value + 1);
      setSelected(''); setSelectedFacility(null); setWalkFacilities(null);
      pendingSelection.current = '';
      setMode(place?.kind === 'pilot' ? 'pilot' : 'national');
    };
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  useEffect(() => {
    if (!map) return;
    const abort = new AbortController();
    setFailed(false);
    setMunicipalFailed(false);
    setBoardingFailed(false);
    setStops([]);
    setSelected('');
    setLocated('');
    const get = async (name: string) => {
      const response = await fetch(`${import.meta.env.BASE_URL}data/${name}`, { signal: abort.signal });
      if (!response.ok) throw Error('Data unavailable'); return response.json();
    };
    const request: Promise<BusCollection> = mode === 'national'
      ? Promise.all([
          get('review-national.geojson').then(nationalCatalog),
          Promise.all([get('review-stops.geojson'), get('review-routes.json')])
            .then(([data, routes]) => municipalCatalog(data, routes))
            .catch(error => { if (error.name !== 'AbortError' && !abort.signal.aborted) setMunicipalFailed(true); return []; }),
        ]).then(([data, municipal]) => ({ ...data, features: [...data.features, ...municipal] }))
      : Promise.all([get('bus_stop.geojson'), get('walking-onoda.json')]).then(([data, graph]) => pilotCatalog(data, graph.pilot_stops.map((s: { id: string }) => s.id)));
    const annotated = boardingStudy && mode === 'national' ? request.then(async data => {
      try {
        const features = attachBoardingGuides(data.features, (await import('./data/boarding-guide-study.json')).default as BoardingStudy);
        const { attachStudyWalks } = await import('./boardingWalkingStudy');
        const reviews = (await import('./data/boarding-location-review.json')).default;
        return { ...data, features: attachLocationReviews(attachStudyWalks(features), reviews as { version: number; points: BusFeature[] }) };
      }
      catch (error) { if (!abort.signal.aborted) setBoardingFailed(true); return data; }
    }) : request;
    annotated
      .then(data => {
        if (abort.signal.aborted) return;
        if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length || data.features.some(f =>
          f.geometry?.type !== 'Point' || !Array.isArray(f.geometry.coordinates) || f.geometry.coordinates.length !== 2 ||
          !f.geometry.coordinates.every(Number.isFinite) || Math.abs(f.geometry.coordinates[0]) > 180 || Math.abs(f.geometry.coordinates[1]) > 90
        )) throw new Error('Invalid GeoJSON');
        setStops(data.features);
        const pendingId = pendingSelection.current;
        setLocated(pendingId);
        setSelected(pendingDetail.current ? pendingId : '');
        pendingDetail.current = false;
        pendingSelection.current = '';
        fitContent(map, L.latLngBounds(data.features.map(stop => [stop.geometry.coordinates[1], stop.geometry.coordinates[0]])));
        if (initialOverview.current && mode === 'national' && !sharedPlace && window.matchMedia('(max-width: 1000px)').matches) {
          map.setView([34.22, 131.55], 9.5, { animate: false });
        }
        initialOverview.current = false;
      }).catch(error => { if (error.name !== 'AbortError' && !abort.signal.aborted) setFailed(true); });
    return () => {
      abort.abort();
    };
  }, [map, attempt, mode]);

  const selectStop = useCallback((id: string) => {
    setSharedPlace(null); setShareWarning(false);
    setSelectedFacility(null);
    setLocated(id);
    if (mode === 'national' && /^(node|way|relation)\//.test(id) && !stops.some(s => s.id === id && s.properties.source_kind === 'boarding-study')) {
      pendingSelection.current = id;
      pendingDetail.current = true;
      setMode('pilot');
    } else setSelected(id);
  }, [mode, stops]);

  const closeDrawer = useCallback(() => { setSelected(''); setWalkFacilities(null); }, []);
  const closeFacility = useCallback(() => setSelectedFacility(null), []);
  const selectFacility = useCallback((feature: ShoppingFeature) => {
    setSharedPlace(null); setShareWarning(false);
    setSelectedFacility(feature);
    const category = categoryOf(feature).id;
    if (category !== 'reference') setCategories(previous => previous.includes(category) ? previous : [...previous, category]);
  }, []);
  const selectedStop = stops.find(feature => String(feature.id || feature.properties?.['@id']) === selected);
  const linkedStop = selectedStop || stops.find(feature => String(feature.id || feature.properties?.['@id']) === located);

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
    if (sharedPlace.kind === 'municipal' && municipalFailed) return;
    const stop = sharedPlace.kind === 'boarding' ? findBoardingStop(stops, sharedPlace.id) : stops.find(f => String(f.id || f.properties['@id']) === sharedPlace.id);
    if (stop) {
      setSelectedFacility(null); setSelected(''); setWalkFacilities(null);
      setLocated(String(stop.id || stop.properties['@id'])); setLocateVersion(value => value + 1);
    }
    else setShareWarning(true);
    setSharedPlace(null);
  }, [sharedPlace, stops, mode, shopping.features, shopping.loading, shopping.error, selectFacility, municipalFailed]);

  useEffect(() => {
    if (sharedPlace || shareWarning || !stops.length || stops[0].properties.source_kind !== (mode === 'pilot' ? 'osm-pilot' : 'national')) return;
    const stopId = String(linkedStop?.id || linkedStop?.properties['@id'] || '');
    const place: SharedPlace | null = selectedFacility ? { kind: 'facility', id: String(selectedFacility.id) }
      : linkedStop ? mode === 'pilot' ? { kind: 'pilot', id: stopId, walking: walkingConditions }
        : linkedStop.properties.source_kind === 'municipal' ? { kind: 'municipal', id: stopId, ...(linkedStop.properties.boarding_walk ? { minutes: bakedMinutes } : {}) }
        : linkedStop.properties.source_kind === 'boarding-study' ? { kind: 'boarding', id: stopId, ...(linkedStop.properties.boarding_walk ? { minutes: bakedMinutes } : {}) }
        : { kind: 'national', id: stopId, minutes: bakedMinutes } : null;
    const url = new URL(window.location.href);
    url.hash = place ? new URL(placeLink(url.href, place)).hash : '';
    if (url.hash !== window.location.hash) window.history.replaceState(window.history.state, '', url);
  }, [sharedPlace, shareWarning, stops, mode, selectedFacility, linkedStop, walkingConditions, bakedMinutes]);

  useEffect(() => { onSelectionChange(Boolean(selectedStop || selectedFacility)); }, [selectedStop, selectedFacility, onSelectionChange]);
  useEffect(() => {
    if (!map) return;
    const focus = () => {
      if (selectedFacility) focusContent(map, L.geoJSON(selectedFacility).getBounds(), 17);
    };
    focus();
    map.on('resize', focus);
    return () => { map.off('resize', focus); };
  }, [map, selectedFacility, selectedStop, mode]);

  const locateStop = useCallback((id: string) => {
    setSharedPlace(null); setShareWarning(false);
    setSelected(''); setSelectedFacility(null); setWalkFacilities(null);
    setLocated(id); setLocateVersion(value => value + 1);
    if (mode === 'national' && /^(node|way|relation)\//.test(id)
      && !stops.some(stop => stop.id === id && stop.properties.source_kind === 'boarding-study')) {
      pendingSelection.current = id;
      pendingDetail.current = false;
      setMode('pilot');
    }
  }, [mode, stops]);

  useEffect(() => {
    if (!map || selected || selectedFacility || !located) return;
    const stop = stops.find(item => String(item.id || item.properties?.['@id']) === located);
    if (!stop) return;
    map.closePopup();
    fitContent(map, L.latLngBounds([[stop.geometry.coordinates[1], stop.geometry.coordinates[0]]]), false, 18);
  }, [map, stops, located, locateVersion, selected, selectedFacility]);

  const reset = () => {
    setLocated(''); setLocateVersion(value => value + 1);
    setSharedPlace(null); setShareWarning(false);
    setWalkFacilities(null);
    setSelected('');
    setSelectedFacility(null);
    map?.closePopup();
    if (stops.length && map) fitContent(map, L.latLngBounds(stops.map(stop => [stop.geometry.coordinates[1], stop.geometry.coordinates[0]])));
    else map?.setView(INITIAL_VIEW.center, INITIAL_VIEW.zoom);
  };
  const changeMode = () => {
    setLocated(''); setLocateVersion(value => value + 1);
    setSharedPlace(null); setShareWarning(false); setSelectedFacility(null); setSelected('');
    setWalkFacilities(null);
    pendingSelection.current = '';
    setMode(mode === 'national' ? 'pilot' : 'national');
  };
  const returnToSearch = () => {
    setLocated(''); setLocateVersion(value => value + 1);
    setSelected(''); setSelectedFacility(null); setWalkFacilities(null);
  };
  return <StopSelectionProvider map={map} stops={stops} selected={selected} onSelect={selectStop}
    active={!selectedFacility} browseKey={locateVersion}>
      <StopMarkers map={map} stops={stops} selected={selected} onSelect={selectStop} />
      <MapPanel selection={String(selectedFacility?.id || selected || located)} stops={stops} facilities={shopping.features} categories={categories} onCategories={values => { setCategories(values); if (selectedFacility && !values.includes(categoryOf(selectedFacility).id)) setSelectedFacility(null); }} onStop={locateStop} onFacility={selectFacility} mode={mode} busy={!stops.length && !failed} shoppingError={shopping.error} shoppingLoading={shopping.loading} retryShopping={shopping.retry} onMode={changeMode} onReturnSearch={returnToSearch} municipalFailed={municipalFailed} retryMunicipal={() => setAttempt(n => n + 1)} />
      <ShoppingLayer map={map} features={shownFacilities} selected={String(selectedFacility?.id || '')} onSelect={selectFacility} />
      <button className="reset icon-button" onClick={reset} aria-label={mode === 'national' ? '山口県のバス停全体を表示' : '徒歩圏試作の7地点全体を表示'} title="全体を表示"><MapIcon name="reset" /></button>
      {failed && <button className="data-error" onClick={() => setAttempt(n => n + 1)}>バス停を読み込めませんでした。再読み込み</button>}
      {boardingFailed && <button className="data-error" onClick={() => setAttempt(n => n + 1)}>乗り場の方面を読み込めませんでした。再読み込み</button>}
      {shareWarning && <div className="link-notice" role="status"><p>リンクの場所または徒歩条件を確認できませんでした。名前で検索できます。</p><button className="icon-button" aria-label="リンクの案内を閉じる" onClick={() => setShareWarning(false)}><MapIcon name="close" /></button></div>}
      {selectedStop && <BusStopDrawer stop={selectedStop} onClose={closeDrawer} hidden={!!selectedFacility} onNational={changeMode} walkingConditions={walkingConditions} bakedMinutes={bakedMinutes}>
        <BoardingGuidePanel stop={selectedStop} map={map} active={!selectedFacility && !selectedStop.properties.boarding_walk} />
        {selectedStop.properties.boarding_guide?.review || selectedStop.properties.boarding_guide?.assignment_hold
          ? <LocationReviewPanel stop={selectedStop} map={map} scope={walkScope} onMapFacilities={showWalkFacilities} />
          : selectedStop.properties.boarding_walk
          ? <BakedWalkingPanel scope={walkScope} onMapFacilities={showWalkFacilities} map={map} id={selectedStop.properties.boarding_walk.id} dataUrl={selectedStop.properties.boarding_walk.url} origin={selectedStop.geometry.coordinates as Coordinate} unreachable={selectedStop.properties.boarding_walk.url ? null : { [selected]: selectedStop.properties.boarding_walk.gap ?? null }} focused={!selectedFacility} facilities={shopping.features} facilityState={shopping.loading ? 'loading' : shopping.error ? 'error' : 'ready'} retryFacilities={shopping.retry} onFacility={selectFacility} minutes={bakedMinutes} />
          : selectedStop.properties.source_kind === 'municipal' || selectedStop.properties.source_kind === 'boarding-study'
          ? <>
            <NearbyFacilitiesPanel key={selected} scope={walkScope} origin={selectedStop.geometry.coordinates as Coordinate} facilities={shopping.features} state={shopping.loading ? 'loading' : shopping.error ? 'error' : 'ready'} retry={shopping.retry} onFacility={selectFacility} onMapFacilities={showWalkFacilities} />
            {selectedStop.properties.source_kind === 'municipal' && <MunicipalStopPanel map={map} stop={selectedStop} stops={stops} unreachable={unreachable} active={!selectedFacility} onStop={selectStop} />}
          </>
          : mode === 'national'
          ? <BakedWalkingPanel scope={walkScope} onMapFacilities={showWalkFacilities} map={map} id={nationalCatchmentId(selectedStop)} origin={selectedStop.geometry.coordinates as Coordinate} unreachable={unreachable} focused={!selectedFacility} facilities={shopping.features} facilityState={shopping.loading ? 'loading' : shopping.error ? 'error' : 'ready'} retryFacilities={shopping.retry} onFacility={selectFacility} minutes={bakedMinutes} />
          : <WalkingPanel scope={walkScope} onMapFacilities={showWalkFacilities} map={map} id={selected} origin={selectedStop.geometry.coordinates as Coordinate} {...walking} retry={() => { walking.retry(); shopping.retry(); }} onSelect={selectStop} onFacility={selectFacility} focused={!selectedFacility} conditions={walkingConditions} onConditions={setWalkingConditions} />}
      </BusStopDrawer>}
      {selectedFacility && <FacilityDrawer facility={selectedFacility} onClose={closeFacility} returnStop={selectedStop ? { name: selectedStop.properties.boarding_guide?.stop_name || selectedStop.properties['name:ja'] || selectedStop.properties.name || '名称未登録' } : undefined} />}
  </StopSelectionProvider>;
}
