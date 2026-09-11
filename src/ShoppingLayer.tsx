import { useEffect } from 'react';
import L from 'leaflet';
import type { ShoppingFeature } from './types';
import { categoryOf } from './shoppingData';

export default function ShoppingLayer({ map, features, selected, onSelect }: {
  map: L.Map | null; features: ShoppingFeature[]; selected: string; onSelect: (feature: ShoppingFeature) => void;
}) {
  useEffect(() => {
    if (!map) return;
    const group = L.layerGroup().addTo(map);
    for (const feature of features) {
      const category = categoryOf(feature);
      const active = String(feature.id) === selected;
      const area = L.geoJSON(feature, {
        style: { color: category.color, weight: active ? 3 : 2, fillColor: category.color, fillOpacity: 0.15, dashArray: feature.properties.geometry_kind === 'facility_area' ? '5 4' : undefined },
      });
      const center = feature.geometry.type === 'Point'
        ? L.latLng(feature.geometry.coordinates[1], feature.geometry.coordinates[0]) : area.getBounds().getCenter();
      if (feature.geometry.type !== 'Point') { area.on('click', () => onSelect(feature)); group.addLayer(area); }
      const marker = L.marker(center, {
        icon: L.divIcon({ className: `shop-marker${active ? ' is-selected' : ''}`, html: `<span style="background:${category.color}">${category.short}</span>`, iconSize: [30, 36], iconAnchor: [15, 33] }),
        title: `${feature.properties.name}（${category.name}）`, keyboard: true,
        zIndexOffset: active ? 900 : 100,
      }).on('click', () => onSelect(feature)).addTo(group);
      marker.getElement()?.setAttribute('aria-label', `${feature.properties.name}（${category.name}）`);
    }
    return () => { group.remove(); };
  }, [map, features, selected, onSelect]);
  return null;
}
