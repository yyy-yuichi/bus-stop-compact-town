import { FACILITY_GROUPS } from './facilityCatalog';
import { useEffect, useRef, useState } from 'react';
import type { FacilityGroup } from './bakedWalking';
import type { EntranceCandidate } from './entranceRouteStudy';
import type { BakedWalkingMinutes } from './placeLink';
import type { LoadState, ShoppingFeature } from './types';
import { categoryOf } from './shoppingData';
import FacilityIcon from './FacilityIcon';
import { mapLocationExclusionNote } from './facilityMapLocation';
import { walkingTimeSummary } from './EntranceRouteNotice';
import { displayStudyMinutes } from './entranceRouteStudy';

const GROUPS = [
  { id: 'all', name: 'すべて' },
  FACILITY_GROUPS[0],
  { id: 'supermarket', name: '食品スーパー' },
  ...FACILITY_GROUPS.slice(1),
] as const;
export type FacilityListFilter = FacilityGroup | 'all' | 'supermarket';

export function matchesFacilityFilter(candidate: EntranceCandidate, filter: FacilityListFilter) {
  if (filter === 'all') return true;
  if (filter === 'supermarket') return categoryOf(candidate.facility).id === 'supermarket';
  return candidate.group === filter;
}

export default function BakedFacilityList({ candidates, group, onGroup, minutes, state, retry, onFacility, hasExcludedLocations = false, entranceOnly = false }: {
  candidates: EntranceCandidate[]; minutes: BakedWalkingMinutes;
  state: LoadState; retry: () => void; onFacility: (facility: ShoppingFeature, roadMinutes?: number) => void;
  group: FacilityListFilter; onGroup: (group: FacilityListFilter) => void;
  hasExcludedLocations?: boolean;
  entranceOnly?: boolean;
}) {
  const [limit, setLimit] = useState(12);
  const nextFocus = useRef('');
  useEffect(() => { setLimit(12); }, [group, minutes]);
  useEffect(() => {
    if (nextFocus.current) document.getElementById(nextFocus.current)?.focus();
    nextFocus.current = '';
  }, [limit]);
  if (state === 'loading') return <p className="mt-5 text-sm" role="status">施設候補を準備しています…</p>;
  if (state === 'error') return <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4" role="status">
    <p className="text-sm">施設データを読み込めませんでした。徒歩圏の道路は地図で確認できます。</p>
    <button className="mt-3 min-h-11 rounded-lg border bg-white px-4 text-sm" onClick={retry}>施設データを再読み込み</button>
  </div>;
  const filtered = entranceOnly ? candidates : candidates.filter(candidate => matchesFacilityFilter(candidate, group));
  const label = GROUPS.find(g => g.id === group)!.name;
  const supermarketCount = group === 'shopping' ? filtered.filter(candidate => matchesFacilityFilter(candidate, 'supermarket')).length : 0;
  return <section className="mt-6" aria-labelledby="baked-facilities-title">
    <h4 id="baked-facilities-title" className="text-base font-bold">{entranceOnly ? '確認した入口経路' : `${minutes}分圏の施設候補`}</h4>
    {!entranceOnly && hasExcludedLocations && <p className="helper-text">{mapLocationExclusionNote}</p>}
    {!entranceOnly && <label className="mt-3 block text-xs text-stone-600">施設候補の種類
      <select aria-label="施設候補の種類" className="mt-1 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-800" value={group} onChange={e => onGroup(e.target.value as FacilityListFilter)}>
        {GROUPS.map(g => <option key={g.id} value={g.id}>{g.name}（{candidates.filter(candidate => matchesFacilityFilter(candidate, g.id)).length}件）</option>)}
      </select>
    </label>}
    {!entranceOnly && <p className="mt-3 text-xs text-stone-600" role="status" aria-live="polite">{label} {filtered.length}件 · {filtered.some(candidate => candidate.entranceRoute) ? '入口経路の試算を含む時間順' : '道路までの時間順'}</p>}
    {!entranceOnly && (group === 'shopping' || group === 'supermarket') && <button type="button" className="mt-2 min-h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold" onClick={() => onGroup(group === 'supermarket' ? 'shopping' : 'supermarket')}>
      {group === 'supermarket' ? 'すべての買い物候補を表示' : `食品スーパーに絞る（${supermarketCount}件）`}
    </button>}
    {filtered.some(candidate => !candidate.entranceRoute) && <p className="helper-text">「近くの道路まで」の時間は、施設の入口までの区間を含みません。</p>}
    {filtered.length ? filtered.slice(0, limit).map(({ facility, meters, entranceRoute }) => {
      const category = categoryOf(facility);
      const summary = walkingTimeSummary(meters, entranceRoute);
      const descriptionId = `baked-walk-time-${facility.id}`;
      return <button key={String(facility.id)} id={`baked-facility-${facility.id}`} className="place-row walk-facility-row" aria-label={`${facility.properties.name}の詳細を見る`} aria-describedby={descriptionId} onClick={() => onFacility(facility, entranceRoute ? undefined : displayStudyMinutes(meters))}>
        <span className="category-symbol" style={{ background: category.color }}><FacilityIcon category={category.id} /></span>
        <span>
          <strong>{facility.properties.name}</strong>
          {facility.properties.visitor_note && !(entranceRoute?.scope === 'entrance' && !entranceRoute.provisional && facility.properties.visitor_note.label === '施設の代表点・入口未確認') && <small>{facility.properties.visitor_note.label}</small>}
          {facility.properties.guide_review?.visit_purpose === 'school_contact' && <small>来校・相談先（事前確認）</small>}
          {facility.properties.guide_review?.shared_destination && <small>{facility.properties.guide_review.shared_destination.kind === 'scoped_park_place' ? '同じ公園の概略案内：' : '現在の来訪先：'}{facility.properties.guide_review.shared_destination.display_name ?? facility.properties.guide_review.shared_destination.expected.name}</small>}
          {!facility.properties.guide_review?.shared_destination && facility.properties.guide_review?.decision === 'ready' && facility.properties.guide_review.display.type !== facility.properties.name && <small>今回の案内：{facility.properties.guide_review.display.type}</small>}
          <small>{category.name}{facility.properties.classification_review?.status === 'pending' ? ' · 情報確認中' : ''}</small>
          <small id={descriptionId} className="font-semibold">{summary}</small>
        </span>
        <span className="row-arrow" aria-hidden="true">›</span>
      </button>;
    }) : <div className="mt-4 space-y-2 text-sm leading-relaxed">
      <p>{group === 'all' ? `地図に登録された施設のうち、徒歩${minutes}分圏の候補は0件です。` : `地図に登録された施設のうち、徒歩${minutes}分圏の「${label}」候補は0件です。`}</p>
      <p className="text-stone-600">未登録の施設や、道路データで経路を計算できない施設は一覧に出ません。</p>
      {minutes < 15 && <p>時間を広げて探せます。</p>}
    </div>}
    {filtered.length > limit && <button className="mt-3 min-h-11 w-full rounded-xl border border-stone-300 bg-white text-sm font-semibold" onClick={() => { nextFocus.current = `baked-facility-${filtered[limit].facility.id}`; setLimit(n => n + 12); }}>さらに{Math.min(12, filtered.length - limit)}件を表示</button>}
  </section>;
}
