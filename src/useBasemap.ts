import { useEffect, useState } from 'react';
import L from 'leaflet';
import type { BasemapMode } from './basemapPreferences';

const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const VECTOR = '<a href="https://openfreemap.org/">OpenFreeMap</a> · <a href="https://openmaptiles.org/">OpenMapTiles</a>';
const GSI = '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>';

export default function useBasemap(map: L.Map | null, mode: BasemapMode, attempt: number) {
  const [error,setError] = useState(false);
  const [fallback,setFallback] = useState(false);
  useEffect(()=>{
    if (!map) return;
    let disposed = false, failed = false;
    let vector: L.MaplibreGL | undefined;
    let raster: L.TileLayer | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setError(false); setFallback(false);
    map.attributionControl.addAttribution(mode.startsWith('gsi-') ? GSI : OSM);
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
        showRaster(); setFallback(true);
      });
    };
    if (mode.startsWith('gsi-')) {
      const photo = mode === 'gsi-photo';
      raster = L.tileLayer(`https://cyberjapandata.gsi.go.jp/xyz/${photo ? 'seamlessphoto' : 'pale'}/{z}/{x}/{y}.${photo ? 'jpg' : 'png'}`,{minZoom:photo ? 14 : 2,maxZoom:18});
      raster.on('tileerror',()=>{if(!disposed)setError(true);});
      raster.addTo(map);
    }
    else if (mode === 'standard') showRaster();
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
        // Leaflet owns keyboard/pointer interaction and the accessible region.
        vector.getContainer().setAttribute('aria-hidden','true');
        vector.getCanvas().setAttribute('tabindex','-1');
      }).catch(fail);
    }
    return ()=>{
      disposed = true; clearTimeout(timer);
      vector?.remove(); raster?.remove();
      map.attributionControl.removeAttribution(OSM);
      map.attributionControl.removeAttribution(GSI);
      map.attributionControl.removeAttribution(VECTOR);
    };
  },[map,mode,attempt]);
  return {error,fallback};
}
