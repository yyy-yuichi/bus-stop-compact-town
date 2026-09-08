import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

import type { ShoppingCollection, ShoppingProperties } from './types';

export default function ShoppingLayer({ map }: { map: L.Map | null }) {
  const layerRef = useRef<L.GeoJSON | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!map) return;
    const abort = new AbortController();
    setFailed(false);
    fetch(`${import.meta.env.BASE_URL}data/shopping.geojson`, { signal: abort.signal })
      .then(r => { if (!r.ok) throw new Error('Shopping data unavailable'); return r.json() as Promise<ShoppingCollection>; })
      .then(data => {
        if (abort.signal.aborted) return;
        if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length) throw new Error('Invalid shopping data');
        const layer = L.geoJSON<ShoppingProperties>(data, {
          interactive: false,
          style: feature => ({ color: '#9c4600', weight: 3, fillColor: '#f3a13b', fillOpacity: feature?.properties.geometry_kind === 'facility_area' ? 0.2 : 0.45, dashArray: feature?.properties.geometry_kind === 'facility_area' ? '6 4' : undefined }),
          pointToLayer: (_f, latlng) => L.circleMarker(latlng, { interactive: false, radius: 10, color: '#9c4600', weight: 3, fillColor: '#f3a13b', fillOpacity: 0.9 }),
        }).addTo(map);
        layerRef.current = layer;
      }).catch(error => { if (error.name !== 'AbortError' && !abort.signal.aborted) setFailed(true); });
    return () => {
      abort.abort();
      layerRef.current?.remove();
      layerRef.current = null;
    };
  }, [map, attempt]);

  return failed ? <button className="absolute right-4 top-28 rounded-xl bg-white p-3 text-sm text-red-800 shadow" onClick={() => setAttempt(n => n + 1)}>商業施設を読み込めませんでした。再読み込み</button> : null;
}
