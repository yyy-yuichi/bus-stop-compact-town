import L from 'leaflet';

export function fitContent(map: L.Map, bounds: L.LatLngBounds, detail = false, maxZoom?: number) {
  const mobile = window.matchMedia('(max-width: 1000px)').matches;
  map.fitBounds(bounds, {
    paddingTopLeft: mobile ? [22, 150] : [340, 36],
    paddingBottomRight: mobile ? [22, detail ? Math.min(window.innerHeight * 0.48, 430) + 35 : 85] : [detail ? 410 : 36, 50],
    maxZoom,
    animate: false,
  });
}
