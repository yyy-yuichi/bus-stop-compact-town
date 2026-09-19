import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';
import type L from 'leaflet';
import type { BusFeature } from './types';
import { choiceReducer, choiceText, relatedStops, stopId } from './stopChoiceModel';
import type { StopChoiceKind, StopChoiceSession } from './stopChoiceModel';
import { overlapGroups } from './stopSpiderLayout';
import './stopSelection.css';

interface StopSelectionValue {
  session: StopChoiceSession | null;
  relatedIds: Set<string>;
  open: (choices: BusFeature[], kind: StopChoiceKind, list?: boolean) => void;
  options: (stop: BusFeature) => { stops: BusFeature[]; kind: StopChoiceKind };
  select: (id: string) => void;
  layout: (available: boolean) => void;
  close: () => void;
}

const Context = createContext<StopSelectionValue | null>(null);

export function useStopSelection(): StopSelectionValue {
  const value = useContext(Context);
  if (!value) throw new Error('StopSelectionProvider is required');
  return value;
}

export function StopSelectionProvider({ map, stops, selected, onSelect, active = true, browseKey = 0, children }: {
  map: L.Map | null; stops: BusFeature[]; selected: string; onSelect: (id: string) => void;
  active?: boolean; browseKey?: number; children: ReactNode;
}) {
  const [session, dispatch] = useReducer(choiceReducer, null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const restoreId = useRef('');
  const byId = useMemo(() => new Map(stops.map(stop => [stopId(stop), stop])), [stops]);
  const relatedIds = useMemo(() => new Set(session?.kind === 'related' ? session.ids : []), [session]);
  useEffect(() => { dispatch({ type: 'close' }); }, [stops, active, browseKey]);
  useEffect(() => { dispatch({ type: 'selection', id: selected }); }, [selected]);
  const close = useCallback(() => dispatch({ type: 'close' }), []);
  const layout = useCallback((available: boolean) => dispatch({ type: 'layout', available }), []);
  const open = useCallback((choices: BusFeature[], kind: StopChoiceKind, list?: boolean) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dispatch({ type: 'open', ids: choices.map(stopId), kind, list });
  }, []);
  const select = useCallback((id: string) => {
    if (!byId.has(id)) return;
    restoreId.current = id;
    onSelect(id);
    dispatch({ type: 'list', open: false });
  }, [byId, onSelect]);
  const options = useCallback((stop: BusFeature) => {
    const related = relatedStops(stop, stops);
    if (related.length > 1) return { stops: related, kind: 'related' as const };
    if (session?.ids.includes(stopId(stop))) return {
      stops: session.ids.map(id => byId.get(id)).filter((value): value is BusFeature => !!value), kind: session.kind,
    };
    if (!map) return { stops: [], kind: 'overlap' as const };
    const zoom = Math.max(14, map.getZoom());
    const points = stops.map(item => {
      const p = map.project([item.geometry.coordinates[1], item.geometry.coordinates[0]], zoom);
      return { id: stopId(item), x: p.x, y: p.y };
    });
    const group = overlapGroups(points).find(items => items.some(p => p.id === stopId(stop))) || [];
    return { stops: group.map(p => byId.get(p.id)).filter((value): value is BusFeature => !!value), kind: 'overlap' as const };
  }, [map, stops, byId, session]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    let raf = 0;
    if (session?.listOpen && !dialog.open) {
      dialog.showModal();
      const chosen = [...dialog.querySelectorAll<HTMLButtonElement>('[data-choice-id]')]
        .find(button => button.dataset.choiceId === selected);
      (chosen || dialog.querySelector<HTMLElement>('[data-choice-id]') || dialog.querySelector<HTMLElement>('button'))?.focus();
    } else if (!session?.listOpen && dialog.open) {
      dialog.close();
      raf = requestAnimationFrame(() => {
        const id = restoreId.current || selected;
        const marker = [...document.querySelectorAll<HTMLElement>('[data-stop-id]')]
          .find(element => element.dataset.stopId === id);
        const target = marker || (opener.current?.isConnected ? opener.current : null)
          || document.querySelector<HTMLElement>('.stop-choice-toggle') || map?.getContainer();
        target?.focus({ preventScroll: true });
        restoreId.current = '';
      });
    }
    return () => cancelAnimationFrame(raf);
  }, [session?.listOpen, map, selected]);

  useEffect(() => {
    if (!session) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (session.listOpen) dispatch({ type: 'list', open: false });
      else {
        close();
        requestAnimationFrame(() => map?.getContainer().focus({ preventScroll: true }));
      }
    };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [session, close, map]);

  const choices = session?.ids.map(id => byId.get(id)).filter((value): value is BusFeature => !!value) || [];
  return <Context.Provider value={{ session, relatedIds, open, options, select, layout, close }}>
    {children}
    {active && session && <div className="stop-choice-toolbar" role="region" aria-label="バス停の選択">
      <span role="status">{session.kind === 'overlap'
        ? session.available ? '選択用に表示を広げています。線の先が元位置です。' : '重なる登録は一覧から選べます。'
        : '同じ停留所の登録地点を選べます。'}</span>
      <button type="button" className="stop-choice-toggle" aria-haspopup="dialog" aria-controls="stop-choice-dialog"
        onClick={() => { opener.current = document.activeElement as HTMLElement; dispatch({ type: 'list', open: true }); }}>{choices.length}件から選ぶ</button>
      <button type="button" onClick={close} aria-label="乗り場の選択を終了">終了</button>
    </div>}
    <dialog ref={dialogRef} id="stop-choice-dialog" className="stop-choice-dialog"
      aria-labelledby="stop-choice-title" aria-describedby="stop-choice-description"
      onCancel={event => { event.preventDefault(); dispatch({ type: 'list', open: false }); }}
      onClick={event => { if (event.target === event.currentTarget) dispatch({ type: 'list', open: false }); }}>
      <div className="stop-choice-dialog-inner">
        <header><h2 id="stop-choice-title">{session?.kind === 'related' ? '別の乗り場を選ぶ' : '重なる登録を選ぶ'}（{choices.length}件）</h2>
          <button type="button" aria-label="選択一覧を閉じる" onClick={() => dispatch({ type: 'list', open: false })}>×</button></header>
        <p id="stop-choice-description">{session?.kind === 'overlap'
          ? '画面上で重なる登録情報です。件数は実際の乗り場数とは限りません。'
          : '既存資料で関連付けた地点です。選ぶと、その1地点の詳細へ切り替わります。'}</p>
        <div className="stop-choice-list">{choices.map(stop => {
          const text = choiceText(stop);
          return <button type="button" key={text.id} data-choice-id={text.id} aria-pressed={text.id === selected} onClick={() => select(text.id)}>
            <span className="choice-direction">{text.headline}</span>
            <span>{text.name}{text.number ? ` ${text.number}のりば` : ''}</span>
            {text.notes.length > 0 && <span className={text.notes.some(note => /未確認|保留|候補/.test(note)) ? 'choice-notice' : 'choice-confirmed'}>{text.notes.join(' / ')}</span>}
            <small>{text.source} · {text.id === selected ? '選択中' : 'この地点を見る'}</small>
            <small className="choice-id">{text.id}</small>
          </button>;
        })}</div>
      </div>
    </dialog>
  </Context.Provider>;
}

export function StopChoiceButton({ stop }: { stop: BusFeature }) {
  const { options, open } = useStopSelection();
  const choices = options(stop);
  if (choices.stops.length < 2) return null;
  return <button type="button" className="other-stop-button" aria-haspopup="dialog" aria-controls="stop-choice-dialog"
    onClick={() => open(choices.stops, choices.kind, true)}>
    {choices.kind === 'related' ? '別の乗り場を選ぶ' : '重なる登録を選ぶ'} <span>{choices.stops.length}件</span>
  </button>;
}
