import { useEffect, useState } from 'react';
import L from 'leaflet';
import { STANDARD_BASEMAP } from './mapConfig';

export default function useBasemap(map: L.Map | null, attempt: number) {
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!map) return;
    let disposed = false;
    setError(false);
    map.attributionControl.addAttribution(STANDARD_BASEMAP.attribution);
    const layer = L.tileLayer(STANDARD_BASEMAP.url, { maxZoom: STANDARD_BASEMAP.maxZoom });
    layer.on('tileerror', () => { if (!disposed) setError(true); });
    layer.addTo(map);
    return () => {
      disposed = true;
      layer.remove();
      map.attributionControl.removeAttribution(STANDARD_BASEMAP.attribution);
    };
  }, [map, attempt]);
  return { error };
}
