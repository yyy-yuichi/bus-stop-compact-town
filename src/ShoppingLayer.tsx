import { useEffect } from 'react';
import L from 'leaflet';
import type { ShoppingFeature } from './types';
import { categoryOf } from './shoppingData';
import { facilityIconMarkup } from './facilityIcons';

export default function ShoppingLayer({ map, features, selected, onSelect }: {
  map: L.Map | null; features: ShoppingFeature[]; selected: string; onSelect: (feature: ShoppingFeature) => void;
}) {
  useEffect(() => {
    if (!map) return;
    const group = L.layerGroup().addTo(map);
    const entries = features.map(feature => {
      const bounds = feature.geometry.type === 'Point'
        ? L.latLngBounds([feature.geometry.coordinates[1], feature.geometry.coordinates[0]], [feature.geometry.coordinates[1], feature.geometry.coordinates[0]])
        : L.geoJSON(feature).getBounds();
      return { feature, bounds, center: bounds.getCenter() };
    });
    const draw = () => {
      group.clearLayers();
      const view = map.getBounds().pad(0.15);
      const detailed = map.getZoom() >= 13;
      for (const { feature, bounds, center } of entries) {
        const active = String(feature.id) === selected;
        if (!active && !view.intersects(bounds)) continue;
        const category = categoryOf(feature);
        if (!detailed && !active) {
          L.circleMarker(center, { radius: 4, weight: 1.5, color: '#fff', fillColor: category.color, fillOpacity: 0.95 })
            .on('click', () => onSelect(feature)).addTo(group);
          continue;
        }
        if (feature.geometry.type !== 'Point') {
          L.geoJSON(feature, { style: { color: category.color, weight: active ? 3 : 2, fillColor: category.color, fillOpacity: 0.15, dashArray: feature.properties.geometry_kind === 'facility_area' ? '5 4' : undefined } })
            .on('click', () => onSelect(feature)).addTo(group);
        }
        const marker = L.marker(center, {
          icon: L.divIcon({ className: `shop-marker${active ? ' is-selected' : ''}`, html: `<span style="background:${category.color}">${facilityIconMarkup(category.id)}</span>`, iconSize: [30, 36], iconAnchor: [15, 33] }),
          title: `${feature.properties.name}（${category.name}）`, keyboard: true,
          zIndexOffset: active ? 900 : 100,
        }).on('click', () => onSelect(feature)).addTo(group);
        marker.getElement()?.setAttribute('aria-label', `${feature.properties.name}（${category.name}）`);
      }
    };
    draw();
    map.on('moveend resize', draw);
    return () => { map.off('moveend resize', draw); group.remove(); };
  }, [map, features, selected, onSelect]);
  return null;
}
