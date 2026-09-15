import { useEffect, useMemo, useRef, useState } from 'react';
import { nearbyFacilityCandidates, prepareFacilities } from './bakedWalking';
import type { Coordinate, FacilityGroup } from './bakedWalking';
import { FACILITY_GROUPS, categoryOf } from './facilityCatalog';
import type { LoadState, ShoppingFeature } from './types';
import FacilityIcon from './FacilityIcon';

const GROUPS = [{ id: 'all', name: 'すべて' }, ...FACILITY_GROUPS] as const;

export default function NearbyFacilitiesPanel({ origin, facilities, state, retry, onFacility, scope, onMapFacilities }: {
  origin: Coordinate; facilities: ShoppingFeature[]; state: LoadState; retry: () => void;
  onFacility: (facility: ShoppingFeature) => void;
  scope: string; onMapFacilities: (scope: string, ids: string[]) => void;
}) {
  const prepared = useMemo(() => prepareFacilities(facilities), [facilities]);
  const candidates = useMemo(() => state === 'ready' ? nearbyFacilityCandidates(origin, prepared) : [], [origin, prepared, state]);
  const [group, setGroup] = useState<FacilityGroup | 'all'>('all');
  const [limit, setLimit] = useState(12);
  const nextFocus = useRef('');
  const filtered = useMemo(() => candidates.filter(c => group === 'all' || c.group === group), [candidates, group]);
  useEffect(() => { onMapFacilities(scope, filtered.map(c => String(c.facility.id))); }, [scope, filtered, onMapFacilities]);
  useEffect(() => { setLimit(12); }, [group]);
  useEffect(() => { if (nextFocus.current) document.getElementById(nextFocus.current)?.focus(); nextFocus.current = ''; }, [limit]);

  return <section className="nearby-facilities" aria-label="周辺の施設">
    <h3 className="text-base font-bold">周辺の施設</h3>
    <p className="helper-text">この乗り場から直線1km以内。徒歩経路・所要時間は未計算です。</p>
    {state === 'loading' ? <p role="status">施設を読み込んでいます…</p> : state === 'error' ? <div role="status">
      <p>施設データを読み込めませんでした。</p><button className="place-row" onClick={retry}>施設データを再読み込み</button>
    </div> : <>
      <label className="nearby-filter">施設の種類
        <select aria-label="周辺施設の種類" value={group} onChange={e => setGroup(e.target.value as FacilityGroup | 'all')}>
          {GROUPS.map(g => <option key={g.id} value={g.id}>{g.name}（{candidates.filter(c => g.id === 'all' || c.group === g.id).length}件）</option>)}
        </select>
      </label>
      <p className="helper-text" role="status">{filtered.length}件 · 直線距離が近い順</p>
      {filtered.length ? filtered.slice(0, limit).map(({ facility, meters }) => {
        const category = categoryOf(facility);
        return <button key={String(facility.id)} id={`nearby-facility-${facility.id}`} className="place-row walk-facility-row" aria-label={`${facility.properties.name}の詳細を見る`} onClick={() => onFacility(facility)}>
          <span className="category-symbol" style={{ background: category.color }}><FacilityIcon category={category.id} /></span>
          <span><strong>{facility.properties.name}</strong><small>{category.name}</small><small>直線 約{Math.round(meters)}m</small></span>
          <span className="row-arrow" aria-hidden="true">›</span>
        </button>;
      }) : <p>直線1km以内に、この種類の施設の登録がありません。</p>}
      {filtered.length > limit && <button className="place-row" onClick={() => { nextFocus.current = `nearby-facility-${filtered[limit].facility.id}`; setLimit(n => n + 12); }}>さらに{Math.min(12, filtered.length - limit)}件を表示</button>}
    </>}
  </section>;
}
