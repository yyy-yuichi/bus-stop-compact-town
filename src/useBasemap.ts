import { useEffect, useState } from 'react';
import L from 'leaflet';
import type { BasemapMode } from './basemapPreferences';

const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const VECTOR = '<a href="https://openfreemap.org/">OpenFreeMap</a> · <a href="https://openmaptiles.org/">OpenMapTiles</a>';

export default function useBasemap(map: L.Map | null, mode: BasemapMode, attempt: number) {
  const [error,setError] = useState(false);
  const [fallback,setFallback] = useState(false);
  useEffect(()=>{
    if (!map) return;
    let disposed = false, failed = false;
    let vector: L.MaplibreGL | undefined;
    let raster: L.TileLayer | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const styleCredit = `<a href="${import.meta.env.BASE_URL}about.html#basemap">地図デザイン</a>`;
    setError(false); setFallback(false);
    map.attributionControl.addAttribution(OSM);
    const showRaster = () => {
      if (disposed || raster) return;
      raster = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19});
      raster.on('tileerror',()=>{if(!disposed)setError(true);});
      raster.addTo(map);
    };
    const fail = () => {
      if (disposed || failed) return;
      failed = true;
      clearTimeout(timer);
      // Dispose outside a MapLibre event dispatch / construction stack.
      queueMicrotask(()=>{
        if (disposed) return;
        vector?.remove(); vector = undefined;
        map.attributionControl.removeAttribution(VECTOR);
        map.attributionControl.removeAttribution(styleCredit);
        showRaster(); setFallback(true);
      });
    };
    if (mode === 'standard') showRaster();
    else {
      timer = setTimeout(fail,20000);
      import('./vectorBasemap').then(({vectorBasemap})=>{
        if (disposed || failed) return;
        vector = vectorBasemap();
        vector.addTo(map);
        const gl = vector.getMaplibreMap();
        gl.on('error',fail);
        gl.on('webglcontextlost',fail);
        gl.once('load',()=>{clearTimeout(timer);});
        map.attributionControl.addAttribution(VECTOR);
        map.attributionControl.addAttribution(styleCredit);
        // Leaflet owns keyboard/pointer interaction and the accessible region.
        vector.getContainer().setAttribute('aria-hidden','true');
        vector.getCanvas().setAttribute('tabindex','-1');
      }).catch(fail);
    }
    return ()=>{
      disposed = true; clearTimeout(timer);
      vector?.remove(); raster?.remove();
      map.attributionControl.removeAttribution(OSM);
      map.attributionControl.removeAttribution(VECTOR);
      map.attributionControl.removeAttribution(styleCredit);
    };
  },[map,mode,attempt]);
  return {error,fallback};
}
