import L from 'leaflet';

export function fitContent(map: L.Map, bounds: L.LatLngBounds, detail = false, maxZoom?: number) {
  const mobile = window.matchMedia('(max-width: 1000px)').matches;
  map.fitBounds(bounds, {
    paddingTopLeft: mobile ? [18, 68] : [340, 24],
    paddingBottomRight: mobile ? [18, detail ? Math.min(window.innerHeight * 0.48, 430) + 28 : 50] : [detail ? 410 : 36, 45],
    maxZoom,
    animate: false,
  });
}
