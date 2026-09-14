import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { INITIAL_VIEW, MAP_OPTIONS } from '../src/mapConfig';
import { fitContent } from '../src/mapLayout';

const result = document.querySelector<HTMLPreElement>('#result')!;
const current = document.querySelector<HTMLButtonElement>('#current')!;
const previous = document.querySelector<HTMLButtonElement>('#previous')!;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const bounds = L.latLngBounds([[33.8, 130.9], [34.7, 132.2]]);

async function run(reproduce: boolean) {
  current.disabled = previous.disabled = true;
  result.textContent = '実行中';
  const map = L.map('map', { ...MAP_OPTIONS, ...(reproduce ? { zoomAnimation: true } : {}) })
    .setView(INITIAL_VIEW.center, INITIAL_VIEW.zoom);
  L.marker(INITIAL_VIEW.center, { icon: L.divIcon({ html: '●', className: 'test-marker' }) }).addTo(map);
  const checks: { gap: number; sequence: string; passed: boolean; zoom: number; expectedZoom: number; errorMeters: number }[] = [];
  try {
    fitContent(map, bounds);
    const expected = { center: map.getCenter(), zoom: map.getZoom() };
    // Include queued animation frames and an already running CSS transition.
    for (const gap of [0, 20, 80, 160]) {
      for (const sequence of ['zoom-reset', 'zoom-out-reset', 'zoom-reset-reset']) {
        fitContent(map, bounds);
        map.zoomIn();
        if (gap) await delay(gap);
        if (sequence === 'zoom-out-reset') map.zoomOut();
        fitContent(map, bounds);
        if (sequence === 'zoom-reset-reset') fitContent(map, bounds);
        await delay(350);
        const errorMeters = map.getCenter().distanceTo(expected.center);
        checks.push({ gap, sequence, passed: map.getZoom() === expected.zoom && errorMeters < 1,
          zoom: map.getZoom(), expectedZoom: expected.zoom, errorMeters: Math.round(errorMeters) });
      }
    }
    const failed = checks.filter(c => !c.passed).length;
    result.textContent = JSON.stringify({ mode: reproduce ? 'before' : 'current',
      passed: checks.length - failed, failed, checks }, null, 2);
  } catch (error) {
    result.textContent = `テスト実行失敗: ${String(error)}`;
  } finally {
    map.remove();
    current.disabled = previous.disabled = false;
  }
}
current.addEventListener('click', () => void run(false));
previous.addEventListener('click', () => void run(true));
