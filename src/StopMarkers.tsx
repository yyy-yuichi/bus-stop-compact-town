import { useEffect } from 'react';
import L from 'leaflet';
import type { BusFeature } from './types';
import { clusterStops, stopCellSize } from './stopClusters';
import { fitContent } from './mapLayout';
import { boardingTitle, hasOverlappingChoice } from './boardingGuide';

const busIcon = '<span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M8 19v2m8-2v2M8 15h1m6 0h1M9 6h6"/></svg></span>';

export default function StopMarkers({ map, stops, selected, onSelect }: {
  map: L.Map | null; stops: BusFeature[]; selected: string; onSelect: (id: string) => void;
}) {
  useEffect(() => {
    if (!map) return;
    const group = L.layerGroup().addTo(map);
    const drawStop = (stop: BusFeature) => {
      const id = String(stop.id || stop.properties['@id']);
      const active = id === selected;
      const name = boardingTitle(stop);
      const guide = stop.properties.boarding_guide;
      const overlap = !!guide && hasOverlappingChoice(stop, stops, s => map.project([s.geometry.coordinates[1], s.geometry.coordinates[0]], map.getZoom()));
      const accessibleName = `${overlap ? '乗り場を選ぶ' : active ? '選択中のバス停' : 'バス停'} ${name}${guide ? ` ${guide.summary}` : ''}`;
      const iconContent = document.createElement('div');
      iconContent.innerHTML = busIcon;
      if (guide?.number) {
        const badge = document.createElement('b');
        badge.className = 'stop-number'; badge.textContent = guide.number;
        iconContent.firstElementChild?.append(badge);
      }
      const marker = L.marker([stop.geometry.coordinates[1], stop.geometry.coordinates[0]], {
        icon: L.divIcon({ className: `stop-marker${active ? ' is-selected' : ''}${stop.properties.source_kind === 'municipal' ? ' is-municipal' : ''}${guide?.review || guide?.assignment_hold ? ' is-location-review' : ''}`,
          html: iconContent.firstElementChild as HTMLElement, iconSize: [36, 36], iconAnchor: [18, 18] }),
        title: accessibleName, keyboard: true, zIndexOffset: active ? 800 : guide ? 200 : 0,
      }).on('click', () => { map.closePopup(); onSelect(id); }).addTo(group);
      marker.getElement()?.setAttribute('aria-label', accessibleName);
      if (active) {
        const label = document.createElement('span');
        label.textContent = name;
        marker.bindTooltip(label, { permanent: true, direction: 'left', offset: [-17, 0], className: 'guide-stop-label' });
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
