import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { BusFeature } from './types';

interface BusStopDrawerProps {
  stop: BusFeature;
  timestamp: string;
  onClose: () => void;
  children?: ReactNode;
}

export default function BusStopDrawer({ stop, timestamp, onClose, children }: BusStopDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const name = stop.properties?.['name:ja'] || stop.properties?.name || '名称未登録';
  const id = String(stop.id || stop.properties?.['@id']);
  const [longitude, latitude] = stop.geometry.coordinates;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const drawer = drawerRef.current;
    closeRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected &&
          (drawer?.contains(document.activeElement) || document.activeElement === document.body)) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [onClose]);

  return <aside ref={drawerRef} role="dialog" aria-labelledby="bus-drawer-title"
    className="bus-stop-drawer absolute inset-y-0 right-0 z-[1200] flex w-[380px] max-w-[calc(100%-32px)] translate-x-0 flex-col border-l border-sky-200 bg-white shadow-2xl transition-transform duration-200 starting:translate-x-full motion-reduce:transition-none">
    <header className="flex items-start justify-between gap-4 border-b border-sky-100 bg-sky-50 px-6 pb-5 pt-[max(24px,env(safe-area-inset-top))]">
      <div className="min-w-0">
        <p className="mb-2 text-[10px] font-bold tracking-[0.18em] text-sky-700">BUS STOP</p>
        <h2 id="bus-drawer-title" className="break-words text-xl font-bold leading-relaxed text-sky-950">{name}</h2>
        <p className="mt-1 text-xs text-sky-800">このバス停を起点に、まちを見る</p>
      </div>
      <button ref={closeRef} onClick={onClose} aria-label="バス停の詳細を閉じる"
        className="grid size-11 shrink-0 place-items-center rounded-full border border-sky-200 bg-white text-xl text-sky-950 hover:bg-sky-100">
        <span aria-hidden="true">×</span>
      </button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-[max(24px,env(safe-area-inset-bottom))]">
      {children}
      <details className="border-t border-stone-200 pt-4">
      <summary className="mb-5 min-h-11 py-2 text-sm font-semibold text-stone-600">バス停の登録情報・出典</summary>
      <dl className="space-y-6 text-sm">
        <div><dt className="text-xs font-semibold text-stone-500">運行事業者（OSM登録情報）</dt>
          <dd className="mt-2 break-words font-medium text-stone-900">{stop.properties?.operator || '登録情報なし'}</dd></div>
        <div><dt className="text-xs font-semibold text-stone-500">OSM ID</dt>
          <dd className="mt-2 font-mono text-stone-800">{id}</dd></div>
        <div><dt className="text-xs font-semibold text-stone-500">位置（緯度・経度）</dt>
          <dd className="mt-2 font-mono text-stone-800">{latitude.toFixed(6)}, {longitude.toFixed(6)}</dd></div>
      </dl>
      {/^(node|way|relation)\/\d+$/.test(id) && <a href={`https://www.openstreetmap.org/${id}`} target="_blank" rel="noopener noreferrer"
        className="mt-7 flex min-h-11 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-3 text-sm font-semibold text-sky-900 hover:bg-sky-100">OpenStreetMapで確認 ↗</a>}
      <div className="mt-7 rounded-xl bg-stone-50 p-4 text-xs leading-relaxed text-stone-600">
        <p>OSM由来の試用データです。位置・運行情報の正確性、最新性は未確認です。</p>
        <p className="mt-2 break-all">データ時点：{timestamp || '不明'}</p>
        <a className="mt-3 inline-block text-sky-800 underline underline-offset-2" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors / ODbL</a>
      </div>
      </details>
    </div>
  </aside>;
}
