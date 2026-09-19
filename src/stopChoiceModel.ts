import type { BusFeature } from './types';

export type StopChoiceKind = 'overlap' | 'related';

export interface StopChoiceSession {
  ids: string[];
  kind: StopChoiceKind;
  listOpen: boolean;
  available: boolean | null;
}

export type StopChoiceAction =
  | { type: 'close' }
  | { type: 'open'; ids: string[]; kind: StopChoiceKind; list?: boolean }
  | { type: 'selection'; id: string }
  | { type: 'list'; open: boolean }
  | { type: 'layout'; available: boolean };

export const stopId = (stop: BusFeature) => String(stop.id ?? stop.properties['@id'] ?? '');
export const stopName = (stop: BusFeature) => stop.properties.boarding_guide?.stop_name
  || stop.properties['name:ja'] || stop.properties.name || '名称未登録';

/** Related choices come only from a reviewed group ID, never from proximity. */
export function relatedStops(stop: BusFeature, stops: BusFeature[]): BusFeature[] {
  const group = stop.properties.boarding_guide?.group_id;
  return group ? stops.filter(other => other.properties.boarding_guide?.group_id === group) : [];
}

export function choiceText(stop: BusFeature) {
  const guide = stop.properties.boarding_guide;
  const source = stop.properties.source_kind === 'national' ? '国の代表点'
    : stop.properties.source_kind === 'municipal' ? `${stop.properties.city || '自治体'}の登録点`
    : /^(node|way|relation)\//.test(stopId(stop)) ? 'OSMの原点' : '出典の登録点';
  const notes: string[] = [];
  if (guide?.assignment_hold) notes.push('番号対応未確認');
  if (guide?.review) notes.push('位置候補');
  if (guide?.roadside_review?.status === 'hold') notes.push('乗り場位置：一部保留');
  else if (guide?.roadside_review?.status === 'confirmed') notes.push('乗り場位置：机上照合済み');
  if (guide?.role === 'alighting') notes.push('降車専用');
  if (stop.properties.source_kind === 'national') notes.push('乗り場別ではない代表点');
  const direction = guide?.summary || '方面未確認';
  const bracket = direction.indexOf('（');
  const headline = bracket > 0 && direction.slice(0, bracket).includes('方面')
    ? direction.slice(0, bracket) : direction;
  return {
    id: stopId(stop), name: stopName(stop), direction, headline,
    number: guide?.assignment_hold ? null : guide?.number || null,
    source, notes,
  };
}

/** Keep map hover text short; the selected-stop panel carries directions and source details. */
export function choiceHoverLabel(stop: BusFeature): string {
  const text = choiceText(stop);
  return `${text.name}${text.number ? ` ${text.number}のりば` : ''}`;
}

/** Screen readers retain the full context that is intentionally omitted from the visual tooltip. */
export function choiceAccessibleLabel(stop: BusFeature): string {
  const text = choiceText(stop);
  return `${choiceHoverLabel(stop)} ${text.direction} ${text.notes.join(' ')} ${text.source} ${text.id}`;
}

/** Selecting one record keeps the other choices available until the chooser is closed. */
export function choiceReducer(state: StopChoiceSession | null, action: StopChoiceAction): StopChoiceSession | null {
  if (action.type === 'close') return null;
  if (action.type === 'open') {
    const ids = [...new Set(action.ids.filter(Boolean))];
    return ids.length < 2 ? null : {
      ids, kind: action.kind,
      listOpen: action.list ?? action.kind === 'related', available: null,
    };
  }
  if (!state) return state;
  if (action.type === 'selection') return state.ids.includes(action.id) ? state : null;
  if (action.type === 'list') return state.listOpen === action.open ? state : { ...state, listOpen: action.open };
  if (state.available === action.available) return state;
  return {
    ...state, available: action.available,
    listOpen: state.listOpen || (state.available === null && !action.available),
  };
}
