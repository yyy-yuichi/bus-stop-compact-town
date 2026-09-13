import { setWorkerCount, setWorkerUrl } from 'maplibre-gl';
import { MaplibreGL } from '@maplibre/maplibre-gl-leaflet';
import type L from 'leaflet';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

// A single worker and bounded tile cache keep this background layer modest.
setWorkerCount(1);
setWorkerUrl(workerUrl);
// The adapter assumes construction succeeded when removing a layer. A device
// without WebGL can throw mid-construction; still let Leaflet release the layer.
class RemovableVector extends MaplibreGL {
  onRemove(map: L.Map) {
    if (this.getMaplibreMap()) super.onRemove(map);
    else this.getContainer()?.remove();
    return this;
  }
}
export function vectorBasemap(): L.MaplibreGL {
  return new RemovableVector({
    style: `${import.meta.env.BASE_URL}maps/soft.json`,
    attributionControl: false,
    maxTileCacheSize: 32,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
    fadeDuration: 0,
  });
}
