import type { LatLngTuple, MapOptions } from 'leaflet';

export const INITIAL_VIEW = { center: [34.17, 131.58] as LatLngTuple, zoom: 9 };

export const MAP_OPTIONS: MapOptions = {
  zoomControl: false,
  // Leaflet 1.9 ignores a new fitBounds while a CSS zoom is in progress,
  // even with animate:false. Apply zooms immediately so reset always wins.
  zoomAnimation: false,
  zoomSnap: 0.25,
  minZoom: 3,
  maxZoom: 19,
  worldCopyJump: true,
  preferCanvas: true,
  maxBounds: [[-85, -Infinity], [85, Infinity]],
  maxBoundsViscosity: 1,
};
