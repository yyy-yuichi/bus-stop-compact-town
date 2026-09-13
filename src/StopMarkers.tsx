import { useEffect } from 'react';
import L from 'leaflet';
import type { BusFeature } from './types';
import { clusterStops, stopCellSize } from './stopClusters';
import { fitContent } from './mapLayout';

export default function StopMarkers({ map, stops, selected, onSelect }: {
  map: L.Map | null; stops: BusFeature[]; selected: string; onSelect: (id: string) => void;
}) {
  useEffect(() => {
    if (!map) return;
    const group = L.layerGroup().addTo(map);
    const drawStop = (stop: BusFeature) => {
      const id = String(stop.id || stop.properties['@id']);
      const active = id === selected;
      const name = stop.properties['name:ja'] || stop.properties.name || '名称未登録';
      const marker = L.marker([stop.geometry.coordinates[1], stop.geometry.coordinates[0]], {
        icon: L.divIcon({ className: `stop-marker${active ? ' is-selected' : ''}${stop.properties.source_kind === 'municipal' ? ' is-municipal' : ''}`,
          html: '<span aria-hidden="true"></span>', iconSize: [28, 28], iconAnchor: [14, 14] }),
        title: name, keyboard: true, zIndexOffset: active ? 800 : 0,
      }).on('click', () => { map.closePopup(); onSelect(id); }).addTo(group);
      marker.getElement()?.setAttribute('aria-label', `${active ? '選択中のバス停' : 'バス停'} ${name}`);
      if (active) {
        const label = document.createElement('span');
        label.textContent = name;
        marker.bindTooltip(label, { permanent: true, direction: 'left', offset: [-11, 0], className: 'guide-stop-label' });
      }
    };
    const draw = () => {
      group.clearLayers();
      const zoom = map.getZoom();
      const points = stops.filter(stop => String(stop.id || stop.properties['@id']) !== selected).map(stop => {
        const p = map.project([stop.geometry.coordinates[1], stop.geometry.coordinates[0]], zoom);
        return { stop, x: p.x, y: p.y };
      });
      const view = map.getBounds().pad(0.15);
      for (const cluster of clusterStops(points, stopCellSize(zoom))) {
        const position = map.unproject([cluster.x, cluster.y], zoom);
        if (!view.contains(position)) continue;
        if (cluster.stops.length === 1) { drawStop(cluster.stops[0]); continue; }
        const count = cluster.stops.length;
        const label = `バス停の登録 ${count}件、拡大`;
        const marker = L.marker(position, {
          icon: L.divIcon({ className: `stop-cluster${count >= 100 ? ' is-large' : ''}`, html: `<span>${count.toLocaleString('ja-JP')}</span>`, iconSize: [44, 44], iconAnchor: [22, 22] }),
          title: label, keyboard: true,
        }).on('click', () => {
          const bounds = L.latLngBounds(cluster.stops.map(stop => [stop.geometry.coordinates[1], stop.geometry.coordinates[0]]));
          fitContent(map, bounds, !!selected, Math.min(14, zoom + 2));
          // Even coincident registrations must reach the individual-marker level.
          if (map.getZoom() <= zoom) map.setView(position, Math.min(14, zoom + 1));
        }).addTo(group);
        marker.getElement()?.setAttribute('aria-label', label);
      }
      const chosen = stops.find(stop => String(stop.id || stop.properties['@id']) === selected);
      if (chosen) drawStop(chosen);
    };
    draw();
    map.on('moveend resize', draw);
    return () => { map.off('moveend resize', draw); group.remove(); };
  }, [map, stops, selected, onSelect]);
  return null;
}
