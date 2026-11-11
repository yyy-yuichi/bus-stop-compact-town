import { useEffect, useState } from 'react';
import L from 'leaflet';
import { STANDARD_BASEMAP } from './mapConfig';
import savedBackground from './data/entrance-study-background.json';

export default function useBasemap(map: L.Map | null, attempt: number) {
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!map) return;
    if (import.meta.env.VITE_LOCAL_ONLY === '1') {
      const group = L.layerGroup().addTo(map);
      for (const item of savedBackground) {
        const points = item.points.map(([lon, lat]) => L.latLng(lat, lon));
        L.polyline(points, { color: item.kind === 'road' ? '#cbd5e1' : '#a8a29e', weight: item.kind === 'road' ? 3 : 1, opacity: 0.8, interactive: false }).addTo(group);
      }
      map.attributionControl.addAttribution('保存済み背景 © OpenStreetMap contributors（ODbL）');
      return () => {
        group.remove();
        map.attributionControl.removeAttribution('保存済み背景 © OpenStreetMap contributors（ODbL）');
      };
    }
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
