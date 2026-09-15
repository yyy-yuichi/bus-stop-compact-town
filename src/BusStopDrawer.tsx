import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { BusFeature } from './types';
import MapIcon from './MapIcon';
import SharePlace from './SharePlace';
import type { BakedWalkingMinutes, WalkingConditions } from './placeLink';
import { boardingTitle } from './boardingGuide';

interface BusStopDrawerProps {
  stop: BusFeature;
  timestamp: string;
  onClose: () => void;
  hidden: boolean;
  onNational: () => void;
  walkingConditions: WalkingConditions;
  bakedMinutes: BakedWalkingMinutes;
  children?: ReactNode;
}

export default function BusStopDrawer({ stop, timestamp, onClose, hidden, onNational, walkingConditions, bakedMinutes, children }: BusStopDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const name = boardingTitle(stop);
  const id = String(stop.id || stop.properties?.['@id']);
  const [longitude, latitude] = stop.geometry.coordinates;
  const national = stop.properties.source_kind === 'national';
  const municipal = stop.properties.source_kind === 'municipal';
  const boarding = stop.properties.source_kind === 'boarding-study';
  const ownSource = boarding && (id.startsWith('jr-chugoku:') || id.startsWith('sentetsu:') || ['official-platform-coordinate', 'official-diagram-derived'].includes(stop.properties.boarding_guide?.evidence || ''));

  useEffect(() => {
    if (hidden) return;
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
  }, [onClose, hidden]);

  useEffect(() => {
    drawerRef.current?.querySelector('.detail-body')?.scrollTo(0, 0);
  }, [id]);

  return <aside ref={drawerRef} hidden={hidden} role="dialog" aria-labelledby="bus-drawer-title"
    className="detail-drawer bus-stop-drawer">
    <header className="detail-header">
      <div className="min-w-0">
        <p className="detail-eyebrow"><span className={`stop-symbol${municipal ? ' municipal-symbol' : ''}`}><MapIcon name="bus" /></span>{municipal ? `${stop.properties.city}の停留所` : boarding ? 'バス停の乗り場' : national ? 'バス停' : 'バス停 · 徒歩圏試作'}</p>
        <h2 id="bus-drawer-title">{name}</h2>
      </div>
      <button ref={closeRef} onClick={onClose} aria-label="バス停の詳細を閉じる"
        className="icon-button">
        <MapIcon name="close" />
      </button>
    </header>
    {!national && !municipal && !boarding && <button className="drawer-return" onClick={onNational}>← 県全体のバス停に戻る</button>}
    <div className="detail-body">
      {children}
      <SharePlace place={municipal ? { kind: 'municipal', id, ...(stop.properties.boarding_walk ? { minutes: bakedMinutes } : {}) } : boarding ? { kind: 'boarding', id, ...(stop.properties.boarding_walk ? { minutes: bakedMinutes } : {}) } : national ? { kind: 'national', id, minutes: bakedMinutes } : { kind: 'pilot', id, walking: walkingConditions }} />
      <details className="source-details">
      <summary>登録情報・出典</summary>
      {national && <div className="mb-5 text-xs leading-relaxed text-stone-600">
        <p>停留所の代表位置です。原則として上下の乗り場が集約されており、乗り場別の位置・方向は未確認です。</p>
        <p className="mt-2">2022年度版の情報です。現在の運行・乗り場は事業者の案内をご確認ください。</p>
      </div>}
      {municipal && <p className="mb-5 text-xs leading-relaxed">市が公開した停留所の登録点です。国の代表点との重複は統合していません。{stop.properties.boarding_guide ? '方面は停車順から整理しています。標柱の位置・現在の運行状況は未確認です。' : '乗り場の方向・現在の運行状況・現地の入口は未確認です。'}</p>}
      <dl className="space-y-6 text-sm">
        {!municipal && <div><dt className="text-xs font-semibold text-stone-500">運行事業者（{national ? '国土数値情報' : ownSource ? '案内資料' : 'OSM登録情報'}）</dt>
          <dd className="mt-2 break-words font-medium text-stone-900">{stop.properties?.operator || '登録情報なし'}</dd></div>}
        {national && <div><dt className="text-xs font-semibold text-stone-500">収録路線（2022年度版）</dt><dd className="mt-2 break-words">{stop.properties.routes?.join(' / ') || '記載なし'}</dd></div>}
        {municipal && <div><dt className="text-xs font-semibold text-stone-500">収録路線（{stop.properties.source_date}）</dt><dd className="mt-2 break-words">{stop.properties.routes?.join(' / ') || '記載なし'}</dd></div>}
        <div><dt className="text-xs font-semibold text-stone-500">{ownSource ? (stop.properties.boarding_guide?.review ? '確認候補ID' : '出典レコードID') : national || municipal ? '出典レコードID' : 'OSM ID'}</dt>
          <dd className="mt-2 font-mono text-stone-800">{id}</dd></div>
        <div><dt className="text-xs font-semibold text-stone-500">{stop.properties.boarding_guide?.review ? '候補位置' : '位置'}（緯度・経度）</dt>
          <dd className="mt-2 font-mono text-stone-800">{latitude.toFixed(6)}, {longitude.toFixed(6)}</dd></div>
      </dl>
      {/^(node|way|relation)\/\d+$/.test(id) && <a href={`https://www.openstreetmap.org/${id}`} target="_blank" rel="noopener noreferrer"
        className="mt-7 flex min-h-11 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-3 text-sm font-semibold text-sky-900 hover:bg-sky-100">OpenStreetMapで確認 ↗</a>}
      <div className="mt-7 rounded-xl bg-stone-50 p-4 text-xs leading-relaxed text-stone-600">
        {!municipal && <p>{national ? '国土数値情報を加工しています。位置・運行情報の現在の正確性は未確認です。' : ownSource ? stop.properties.boarding_guide?.location_description : stop.properties.boarding_guide?.assignment_hold ? '原ID・原座標を保持した位置です。公式のりば番号との対応は未確認です。' : stop.properties.boarding_guide?.cross_source_reference ? 'OSMの原座標を公式GTFSの停車順・経路・道路側と照合しています。現地の標柱位置は未確認です。' : boarding ? '公式のりば案内と照合したOSM位置候補です。現地の標柱位置は未確認です。' : 'OSM由来の試用データです。国の停留所との対応・上下線は未確認です。'}</p>}
        <p className="mt-2 break-all">{boarding ? '資料照合日' : 'データ時点'}：{municipal || boarding ? stop.properties.source_date : timestamp || '不明'}</p>
        {municipal ? <><a href={stop.properties.source_url} target="_blank" rel="noreferrer">{stop.properties.city}のデータ出典</a><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></> : national ? <><a className="mt-3 inline-block text-sky-800 underline underline-offset-2" href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P11-2022.html" target="_blank" rel="noreferrer">国土数値情報・バス停留所2022</a><p><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></p></> : ownSource ? <a href={stop.properties.source_url} target="_blank" rel="noreferrer">乗り場情報の出典</a> : <a className="mt-3 inline-block text-sky-800 underline underline-offset-2" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors / ODbL</a>}
      </div>
      </details>
    </div>
  </aside>;
}
