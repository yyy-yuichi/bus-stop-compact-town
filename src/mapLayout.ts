import L from 'leaflet';

function contentOptions(detail: boolean, maxZoom?: number): L.FitBoundsOptions {
  const mobile = window.matchMedia('(max-width: 1000px)').matches;
  return {
    paddingTopLeft: mobile ? [18, 68] : [340, 24],
    paddingBottomRight: mobile ? [18, detail ? Math.min(window.innerHeight * 0.48, 430) + 28 : 50] : [detail ? 410 : 36, 45],
    maxZoom,
  };
}

export function fitContent(map: L.Map, bounds: L.LatLngBounds, detail = false, maxZoom?: number) {
  // setView (inside fitBounds) cancels a pending flyTo, so overview always wins.
  map.fitBounds(bounds, { ...contentOptions(detail, maxZoom), animate: false });
}

export function focusContent(map: L.Map, bounds: L.LatLngBounds, maxZoom: number) {
  map.flyToBounds(bounds, {
    ...contentOptions(true, maxZoom),
    animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    duration: 0.6,
  });
}
