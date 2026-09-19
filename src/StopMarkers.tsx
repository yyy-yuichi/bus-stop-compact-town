import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { BusFeature } from './types';
import { clusterStops, stopCellSize } from './stopClusters';
import { fitContent } from './mapLayout';
import { choiceAccessibleLabel, choiceHoverLabel, choiceText, stopId } from './stopChoiceModel';
import { CHOICE_HEIGHT, CHOICE_WIDTH, STOP_TARGET, contains, overlapGroups, pointRect, spiderLayout, touches } from './stopSpiderLayout';
import type { DisplayPoint, DisplayRect } from './stopSpiderLayout';
import { useStopSelection } from './StopSelection';

const busIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M8 19v2m8-2v2M8 15h1m6 0h1M9 6h6"/></svg>';
const coordinate = (stop: BusFeature): [number, number] => [stop.geometry.coordinates[1], stop.geometry.coordinates[0]];

/** Use the panels that are actually visible instead of guessed desktop/mobile padding. */
function panelRects(map: L.Map): DisplayRect[] {
  const origin = map.getContainer().getBoundingClientRect();
  return [...document.querySelectorAll<HTMLElement>('.map-panel, .detail-drawer:not([hidden]), .reset, .leaflet-control, .stop-choice-toolbar')]
    .filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
    .map(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left - origin.left, top: rect.top - origin.top,
        right: rect.right - origin.left, bottom: rect.bottom - origin.top };
    });
}

const center = (points: DisplayPoint[]): DisplayPoint => ({
  id: points.map(point => point.id).join('|'),
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
});

export default function StopMarkers({ map, stops, selected }: {
  map: L.Map | null; stops: BusFeature[]; selected: string; onSelect: (id: string) => void;
}) {
  const { session, relatedIds, open, select, layout, close } = useStopSelection();
  const focusId = useRef('');
  useEffect(() => {
    if (!map) return;
    const group = L.layerGroup().addTo(map);
    const byId = new Map(stops.map(stop => [stopId(stop), stop]));
    let raf = 0;
    const addMarker = (position: L.LatLngExpression, element: HTMLElement, className: string, label: string,
      action: (keyboard: boolean) => void, width = STOP_TARGET, height = STOP_TARGET, zIndex = 0) => {
      const marker = L.marker(position, {
        icon: L.divIcon({ className, html: element, iconSize: [width, height], iconAnchor: [width / 2, height / 2] }),
        title: label, keyboard: true, autoPanOnFocus: false, bubblingMouseEvents: false, zIndexOffset: zIndex,
      }).on('click', event => { map.closePopup(); action(event.originalEvent?.type.startsWith('key') || false); }).addTo(group);
      const node = marker.getElement();
      node?.setAttribute('aria-label', label);
      node?.setAttribute('role', 'button');
      node?.addEventListener('keydown', event => {
        if (event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          action(true);
        }
      });
      return marker;
    };
    const drawStop = (stop: BusFeature, position: L.LatLngExpression = coordinate(stop), card = false) => {
      const text = choiceText(stop), active = text.id === selected;
      const icon = document.createElement('span');
      icon.className = card ? 'stop-spider-card-content' : 'stop-icon-face';
      const accessibleLabel = choiceAccessibleLabel(stop);
      const hoverLabel = choiceHoverLabel(stop);
      if (card) {
        const direction = document.createElement('strong'); direction.textContent = text.headline;
        const name = document.createElement('span'); name.textContent = `${text.name}${text.number ? ` ${text.number}のりば` : ''}`;
        const detail = document.createElement('small'); detail.textContent = `${text.notes.join(' / ') || text.source} · ${text.id}`;
        icon.append(direction, name, detail);
      } else {
        icon.innerHTML = busIcon;
        icon.setAttribute('aria-hidden', 'true');
        if (text.number) {
          const badge = document.createElement('b'); badge.className = 'stop-number'; badge.textContent = text.number; icon.append(badge);
        }
      }
      const marker = addMarker(position, icon,
        `${card ? 'stop-spider-card' : 'stop-marker stop-choice-marker'}${active ? ' is-selected' : ''}${relatedIds.has(text.id) ? ' is-related' : ''}${stop.properties.source_kind === 'municipal' ? ' is-municipal' : ''}${text.notes.some(note => /未確認|保留|候補/.test(note)) ? ' is-location-review' : ''}`,
        accessibleLabel, () => select(text.id), card ? CHOICE_WIDTH : STOP_TARGET, card ? CHOICE_HEIGHT : STOP_TARGET,
        card ? 1600 : active ? 800 : relatedIds.has(text.id) ? 400 : 0);
      const node = marker.getElement();
      if (node) {
        node.removeAttribute('title');
        node.dataset.stopId = text.id;
        node.dataset.displayKind = card ? 'spider' : 'origin';
        node.setAttribute('aria-pressed', String(active));
      }
      const tooltip = document.createElement('span'); tooltip.textContent = hoverLabel;
      marker.bindTooltip(tooltip, { direction: 'top', className: 'stop-choice-tooltip' });
      return marker;
    };
    const drawOverlap = (points: DisplayPoint[]) => {
      const point = center(points);
      const choices = points.map(item => byId.get(item.id)).filter((value): value is BusFeature => !!value);
      const icon = document.createElement('span');
      icon.innerHTML = busIcon; icon.setAttribute('aria-hidden', 'true');
      const count = document.createElement('b'); count.className = 'stop-overlap-count'; count.textContent = `${points.length}件`; icon.append(count);
      const hasSelected = points.some(item => item.id === selected);
      const marker = addMarker(map.containerPointToLatLng([point.x, point.y]), icon,
        `stop-marker stop-choice-marker stop-overlap${hasSelected ? ' is-selected' : ''}${points.some(item => relatedIds.has(item.id)) ? ' is-related' : ''}`,
        `重なる登録 ${points.length}件を選ぶ。実際の乗り場数とは限りません。`, keyboard => open(choices, 'overlap', keyboard));
      marker.getElement()?.setAttribute('aria-haspopup', 'dialog');
      marker.getElement()?.setAttribute('data-overlap-ids', JSON.stringify(points.map(item => item.id)));
    };
    const draw = () => {
      const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.stopId : '';
      if (focused) focusId.current = focused;
      group.clearLayers();
      const zoom = map.getZoom(), size = map.getSize();
      const view = { left: 8, top: 8, right: size.x - 8, bottom: size.y - 8 };
      const blockers = panelRects(map);
      const viewport = map.getBounds().pad(0.2);
      const points = stops.filter(stop => viewport.contains(coordinate(stop))).map(stop => {
        const point = map.latLngToContainerPoint(coordinate(stop));
        return { id: stopId(stop), x: point.x, y: point.y };
      });
      if (zoom < 14) {
        const projected = stops.map(stop => {
          const point = map.project(coordinate(stop), zoom);
          return { stop, x: point.x, y: point.y };
        });
        for (const cluster of clusterStops(projected, stopCellSize(zoom))) {
          const position = map.unproject([cluster.x, cluster.y], zoom);
          if (!viewport.contains(position)) continue;
          if (cluster.stops.length === 1) { drawStop(cluster.stops[0]); continue; }
          const icon = document.createElement('span'); icon.textContent = cluster.stops.length.toLocaleString('ja-JP');
          addMarker(position, icon, `stop-cluster${cluster.stops.some(stop => stopId(stop) === selected) ? ' is-selected' : ''}`,
            `バス停の登録 ${cluster.stops.length}件、拡大`, () => {
              fitContent(map, L.latLngBounds(cluster.stops.map(coordinate)), !!selected, Math.min(14, zoom + 2));
              if (map.getZoom() <= zoom) map.setView(position, Math.min(14, zoom + 1));
            }, 44, 44);
        }
        if (session?.kind === 'overlap') layout(false);
      } else {
        const ids = new Set(session?.kind === 'overlap' ? session.ids : []);
        const origins = session?.kind === 'overlap' ? session.ids.map(id => byId.get(id))
          .filter((value): value is BusFeature => !!value).map(stop => {
            const point = map.latLngToContainerPoint(coordinate(stop));
            return { id: stopId(stop), x: point.x, y: point.y };
          }) : [];
        const otherGroups = overlapGroups(points.filter(point => !ids.has(point.id)));
        const otherBoxes = otherGroups.map(items => pointRect(center(items)));
        const expanded = origins.length > 1 ? spiderLayout(origins, view, [...blockers, ...otherBoxes]) : null;
        if (session?.kind === 'overlap') layout(!!expanded);
        const groups = expanded ? otherGroups : overlapGroups(points);
        const labelBlocks = [...blockers, ...groups.map(items => pointRect(center(items)))];
        for (const items of groups) {
          if (items.length > 1) drawOverlap(items);
          else {
            const stop = byId.get(items[0].id);
            if (stop) drawStop(stop);
          }
        }
        if (expanded) {
          for (const display of expanded) {
            const stop = byId.get(display.id);
            if (!stop) continue;
            const shown = map.containerPointToLatLng([display.x, display.y]);
            L.polyline([coordinate(stop), shown], { color: '#466a5c', weight: 1.5, interactive: false, className: 'stop-spider-leg' }).addTo(group);
            L.circleMarker(coordinate(stop), { radius: 3, color: '#466a5c', weight: 1, fillOpacity: 1, interactive: false }).addTo(group);
            drawStop(stop, shown, true);
            labelBlocks.push(pointRect(display, CHOICE_WIDTH, CHOICE_HEIGHT));
          }
        }
        for (const items of [...groups].sort((a, b) => Number(b.some(point => point.id === selected)) - Number(a.some(point => point.id === selected)))) {
          if (!session || session.kind !== 'related' || session.listOpen || items.length !== 1 || !relatedIds.has(items[0].id)) continue;
          const point = items[0], stop = byId.get(point.id);
          if (!stop) continue;
          const text = choiceText(stop);
          for (const offset of [-60, 60]) {
            const labelPoint = { ...point, y: point.y + offset }, rect = pointRect(labelPoint, 168, 56);
            if (!contains(view, rect) || labelBlocks.some(block => touches(rect, block, 4))) continue;
            const label = document.createElement('span');
            const strong = document.createElement('strong'); strong.textContent = text.headline;
            const small = document.createElement('small'); small.textContent = `${text.name}${text.number ? ` ${text.number}のりば` : ''}`;
            label.append(strong, small);
            L.marker(map.containerPointToLatLng([labelPoint.x, labelPoint.y]), {
              icon: L.divIcon({ className: 'stop-direction-label', html: label, iconSize: [168, 56], iconAnchor: [84, 28] }),
              keyboard: false, interactive: false,
            }).addTo(group);
            labelBlocks.push(rect);
            break;
          }
        }
      }
      if (focusId.current && (document.activeElement === document.body || document.activeElement === map.getContainer())) {
        const target = [...map.getContainer().querySelectorAll<HTMLElement>('[data-stop-id]')]
          .find(element => element.dataset.stopId === focusId.current);
        target?.focus({ preventScroll: true });
      }
      focusId.current = '';
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
    draw();
    map.on('moveend zoomend resize', schedule);
    map.on('click dragstart', close);
    const observer = new ResizeObserver(schedule);
    document.querySelectorAll<HTMLElement>('.map-panel, .detail-drawer, .stop-choice-toolbar').forEach(element => observer.observe(element));
    return () => {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.stopId : '';
      if (active) focusId.current = active;
      cancelAnimationFrame(raf);
      observer.disconnect();
      map.off('moveend zoomend resize', schedule);
      map.off('click dragstart', close);
      group.remove();
    };
  }, [map, stops, selected, session, relatedIds, open, select, layout, close]);
  return null;
}
