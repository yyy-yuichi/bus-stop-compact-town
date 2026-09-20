import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { BusFeature } from './types';
import MapIcon from './MapIcon';
import SharePlace from './SharePlace';
import type { BakedWalkingMinutes, WalkingConditions } from './placeLink';
import { boardingTitle } from './boardingGuide';
import { StopChoiceButton } from './StopSelection';

interface BusStopDrawerProps {
  stop: BusFeature;
  onClose: () => void;
  hidden: boolean;
  onNational: () => void;
  walkingConditions: WalkingConditions;
  bakedMinutes: BakedWalkingMinutes;
  children?: ReactNode;
}

export default function BusStopDrawer({ stop, onClose, hidden, onNational, walkingConditions, bakedMinutes, children }: BusStopDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const name = boardingTitle(stop);
  const id = String(stop.id || stop.properties?.['@id']);
  const national = stop.properties.source_kind === 'national';
  const municipal = stop.properties.source_kind === 'municipal';
  const boarding = stop.properties.source_kind === 'boarding-study';

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
      <StopChoiceButton stop={stop} />
      {children}
      <SharePlace place={municipal ? { kind: 'municipal', id, ...(stop.properties.boarding_walk ? { minutes: bakedMinutes } : {}) } : boarding ? { kind: 'boarding', id, ...(stop.properties.boarding_walk ? { minutes: bakedMinutes } : {}) } : national ? { kind: 'national', id, minutes: bakedMinutes } : { kind: 'pilot', id, walking: walkingConditions }} />
      <a className="detail-about-link" href={`${import.meta.env.BASE_URL}about.html#sources`}>使い方・出典を見る ↗</a>
    </div>
  </aside>;
}
