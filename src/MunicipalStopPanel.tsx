import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import type { BusFeature } from './types';
import { nearbyNationalStops } from './stopCatalog';
import { focusContent } from './mapLayout';

export default function MunicipalStopPanel({ map, stop, stops, unreachable, active, onStop }: {
  map: L.Map | null; stop: BusFeature; stops: BusFeature[]; active: boolean;
  unreachable: Record<string, number | null> | null; onStop: (id: string) => void;
}) {
  const nearby = useMemo(() => nearbyNationalStops(stop, stops, unreachable), [stop, stops, unreachable]);
  useEffect(() => {
    if (!map || !active) return;
    const [lon, lat] = stop.geometry.coordinates;
    const focus = () => focusContent(map, L.latLngBounds([[lat, lon]]), 16);
    focus();
    map.on('resize', focus);
    return () => { map.off('resize', focus); };
  }, [map, stop, active]);
  return nearby.length > 0 ? <details className="municipal-walking source-details">
      <summary>近くのバス停から徒歩圏を見る</summary>
      <p className="helper-text">選ぶと、別の出発点から計算した徒歩圏を表示します。</p>
      {nearby.map(({ stop: target, meters }) => <button key={String(target.id)} className="place-row" onClick={() => onStop(String(target.id))}>
        <span><strong>{target.properties.name}</strong><small>別の出発点 · 直線{Math.round(meters)}m</small></span><span className="row-arrow" aria-hidden="true">›</span>
      </button>)}
  </details> : null;
}
