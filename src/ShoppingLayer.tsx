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
      const visible = entries.filter(entry => view.intersects(entry.bounds));
      const canvas = map.getContainer().getBoundingClientRect();
      const drawer = document.querySelector('.detail-drawer:not([hidden])')?.getBoundingClientRect();
      const maxY = drawer && canvas.width <= 1000 ? drawer.top - canvas.top - 10 : canvas.height - 48;
      const maxX = drawer && canvas.width > 1000 ? drawer.left - canvas.left - 12 : canvas.width - 14;
      const occupied: {x:number;y:number;w:number;h:number}[] = visible.map(entry => {
        const p = map.latLngToContainerPoint(entry.center);
        return {x:p.x-20,y:p.y-31,w:40,h:42};
      });
      for (const element of document.querySelectorAll('.map-panel, .guide-stop-label, .stop-marker.is-selected, .leaflet-control')) {
        const rect = element.getBoundingClientRect();
        if (rect.width && rect.height) occupied.push({ x: rect.left - canvas.left, y: rect.top - canvas.top, w: rect.width, h: rect.height });
      }
      const collides = (a: {x:number;y:number;w:number;h:number}) => occupied.some(b=>a.x < b.x+b.w+5 && a.x+a.w+5 > b.x && a.y < b.y+b.h+5 && a.y+a.h+5 > b.y);
      let labelsShown = 0;
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
        if (detailed && (labelsShown < (canvas.width <= 1000 ? 6 : 12) || active)) {
          const p = map.latLngToContainerPoint(center);
          const width = Math.min(168, Math.max(72, feature.properties.name.length * 11 + 24));
          const offsets = [[20,-18],[-width-20,-18],[-width/2,22],[-width/2,-59],[35,31],[-width-35,31],[35,-64],[-width-35,-64],[16,63],[-width-16,63]];
          const position = offsets.map(([dx,dy])=>({x:p.x+dx,y:p.y+dy,w:width,h:26})).find(r=>r.x>=14 && r.x+r.w<=maxX && r.y>=74 && r.y+r.h<=maxY && !collides(r));
          if (position) {
            labelsShown++;
            occupied.push(position);
            const label = document.createElement('span');
            label.textContent = feature.properties.name;
            label.style.borderColor = category.color;
            const end = L.point(Math.max(position.x, Math.min(p.x,position.x+position.w)),Math.max(position.y,Math.min(p.y,position.y+position.h)));
            L.polyline([center,map.containerPointToLatLng(end)],{color:category.color,weight:1,opacity:0.5,interactive:false}).addTo(group);
            L.marker(center,{icon:L.divIcon({className:'guide-facility-label',html:label,iconSize:[width,26],iconAnchor:[p.x-position.x,p.y-position.y]}),keyboard:false,zIndexOffset:500,title:feature.properties.name})
              .on('click',()=>onSelect(feature)).addTo(group);
          }
        }
      }
    };
    draw();
    map.on('moveend resize', draw);
    // Drawer and search height can change without a map movement.
    const panels = new ResizeObserver(draw);
    document.querySelectorAll('.detail-drawer, .map-panel').forEach(panel => panels.observe(panel));
    return () => { panels.disconnect(); map.off('moveend resize', draw); group.remove(); };
  }, [map, features, selected, onSelect]);
  return null;
}
