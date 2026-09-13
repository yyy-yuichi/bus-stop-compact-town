import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import type { BusFeature } from './types';
import { nearbyNationalStops } from './stopCatalog';
import { fitContent } from './mapLayout';

export default function MunicipalStopPanel({ map, stop, stops, unreachable, active, onStop }: {
  map: L.Map | null; stop: BusFeature; stops: BusFeature[]; active: boolean;
  unreachable: Record<string, number | null> | null; onStop: (id: string) => void;
}) {
  const nearby = useMemo(() => nearbyNationalStops(stop, stops, unreachable), [stop, stops, unreachable]);
  useEffect(() => {
    if (!map || !active) return;
    const [lon, lat] = stop.geometry.coordinates;
    const focus = () => fitContent(map, L.latLngBounds([[lat, lon]]), true, 16);
    focus();
    map.on('resize', focus);
    return () => { map.off('resize', focus); };
  }, [map, stop, active]);
  return <section className="municipal-walking" aria-labelledby="municipal-walking-title">
    <p id="municipal-walking-title" className="text-sm text-stone-600">この乗り場の徒歩圏は未作成です。</p>
    {nearby.length > 0 && <>
      <h3 className="mt-4 text-sm font-semibold">近くのバス停から徒歩圏を見る</h3>
      {nearby.map(({ stop: target, meters }) => <button key={String(target.id)} className="place-row" onClick={() => onStop(String(target.id))}>
        <span><strong>{target.properties.name}</strong><small>別の出発点 · 直線{Math.round(meters)}m</small></span><span className="row-arrow" aria-hidden="true">›</span>
      </button>)}
    </>}
  </section>;
}
