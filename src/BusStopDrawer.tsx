import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { BusFeature } from './types';
import MapIcon from './MapIcon';

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
  const national = stop.properties.source_kind === 'national';

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
      if (drawer?.contains(document.activeElement) || document.activeElement === document.body) {
        const target = previousFocus instanceof HTMLElement && previousFocus.isConnected ? previousFocus : document.getElementById('place-search');
        target?.focus({ preventScroll: true });
      }
    };
  }, [onClose]);

  return <aside ref={drawerRef} role="dialog" aria-labelledby="bus-drawer-title"
    className="detail-drawer bus-stop-drawer">
    <header className="detail-header">
      <div className="min-w-0">
        <p className="detail-eyebrow"><span className="stop-symbol"><MapIcon name="bus" /></span>バス停</p>
        <h2 id="bus-drawer-title">{name}</h2>
        <p className="detail-subtitle">このバス停を起点に、まちを見る</p>
      </div>
      <button ref={closeRef} onClick={onClose} aria-label="バス停の詳細を閉じる"
        className="icon-button">
        <MapIcon name="close" />
      </button>
    </header>
    <div className="detail-body">
      {children}
      {national && <div className="mb-5 rounded-xl bg-sky-50 p-4 text-xs leading-relaxed text-sky-950">
        <p>停留所の代表位置です。原則として上下の乗り場が集約されており、乗り場別の位置・方向は未確認です。</p>
        <p className="mt-2">2022年度版の情報です。現在の運行・乗り場は事業者の案内をご確認ください。</p>
      </div>}
      <details className="border-t border-stone-200 pt-4">
      <summary className="mb-5 min-h-11 py-2 text-sm font-semibold text-stone-600">バス停の登録情報・出典</summary>
      <dl className="space-y-6 text-sm">
        <div><dt className="text-xs font-semibold text-stone-500">運行事業者（{national ? '国土数値情報' : 'OSM登録情報'}）</dt>
          <dd className="mt-2 break-words font-medium text-stone-900">{stop.properties?.operator || '登録情報なし'}</dd></div>
        {national && <div><dt className="text-xs font-semibold text-stone-500">収録路線（2022年度版）</dt><dd className="mt-2 break-words">{stop.properties.routes?.join(' / ') || '記載なし'}</dd></div>}
        <div><dt className="text-xs font-semibold text-stone-500">{national ? '出典レコードID' : 'OSM ID'}</dt>
          <dd className="mt-2 font-mono text-stone-800">{id}</dd></div>
        <div><dt className="text-xs font-semibold text-stone-500">位置（緯度・経度）</dt>
          <dd className="mt-2 font-mono text-stone-800">{latitude.toFixed(6)}, {longitude.toFixed(6)}</dd></div>
      </dl>
      {/^(node|way|relation)\/\d+$/.test(id) && <a href={`https://www.openstreetmap.org/${id}`} target="_blank" rel="noopener noreferrer"
        className="mt-7 flex min-h-11 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-3 text-sm font-semibold text-sky-900 hover:bg-sky-100">OpenStreetMapで確認 ↗</a>}
      <div className="mt-7 rounded-xl bg-stone-50 p-4 text-xs leading-relaxed text-stone-600">
        <p>{national ? '国土数値情報を加工しています。位置・運行情報の現在の正確性は未確認です。' : 'OSM由来の試用データです。国の停留所との対応・上下線は未確認です。'}</p>
        <p className="mt-2 break-all">データ時点：{timestamp || '不明'}</p>
        {national ? <><a className="mt-3 inline-block text-sky-800 underline underline-offset-2" href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P11-2022.html" target="_blank" rel="noreferrer">国土数値情報・バス停留所2022</a><p><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></p></> : <a className="mt-3 inline-block text-sky-800 underline underline-offset-2" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors / ODbL</a>}
      </div>
      </details>
    </div>
  </aside>;
}
