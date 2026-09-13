import { useEffect, useRef, useState } from 'react';
import type { BakedFacilityCandidate, FacilityGroup } from './bakedWalking';
import type { BakedWalkingMinutes } from './placeLink';
import type { LoadState, ShoppingFeature } from './types';
import { categoryOf } from './shoppingData';
import FacilityIcon from './FacilityIcon';

const GROUPS = [
  { id: 'all', name: 'すべて' },
  { id: 'shopping', name: '買い物' },
  { id: 'medical', name: '医療' },
  { id: 'services', name: '暮らし' },
] as const;

export default function BakedFacilityList({ candidates, group, onGroup, minutes, state, retry, onFacility }: {
  candidates: BakedFacilityCandidate[]; minutes: BakedWalkingMinutes;
  state: LoadState; retry: () => void; onFacility: (facility: ShoppingFeature) => void;
  group: FacilityGroup | 'all'; onGroup: (group: FacilityGroup | 'all') => void;
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
  const filtered = candidates.filter(c => group === 'all' || c.group === group);
  const label = GROUPS.find(g => g.id === group)!.name;
  return <section className="mt-6" aria-labelledby="baked-facilities-title">
    <h4 id="baked-facilities-title" className="text-base font-bold">{minutes}分圏の施設候補</h4>
    <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="施設候補の種類">
      {GROUPS.map(g => <button key={g.id} aria-pressed={group === g.id} onClick={() => onGroup(g.id)}
        className={`min-h-11 rounded-xl border px-1 text-xs font-semibold ${group === g.id ? 'border-emerald-800 bg-emerald-50 text-emerald-950' : 'border-stone-200 bg-white text-stone-600'}`}>
        {g.name} <span className="ml-1">{candidates.filter(c => g.id === 'all' || c.group === g.id).length}</span>
      </button>)}
    </div>
    <p className="mt-3 text-xs text-stone-600" role="status" aria-live="polite">{label} {filtered.length}件 · 道路までの時間順</p>
    {filtered.length ? filtered.slice(0, limit).map(({ facility, meters }) => {
      const category = categoryOf(facility);
      return <button key={String(facility.id)} id={`baked-facility-${facility.id}`} className="place-row walk-facility-row" aria-label={`${facility.properties.name}の詳細を見る`} onClick={() => onFacility(facility)}>
        <span className="category-symbol" style={{ background: category.color }}><FacilityIcon category={category.id} /></span>
        <span><strong>{facility.properties.name}</strong><small>{category.name}{facility.properties.classification_review?.status === 'pending' ? ' · 情報確認中' : ''}</small><small>近くの道路まで 約{Math.max(1, Math.ceil(meters / (4000 / 60)))}分</small></span>
        <span className="row-arrow" aria-hidden="true">›</span>
      </button>;
    }) : <p className="mt-4 text-sm leading-relaxed">この条件の候補はありません。{minutes < 15 ? '時間を広げて探せます。' : ''}</p>}
    {filtered.length > limit && <button className="mt-3 min-h-11 w-full rounded-xl border border-stone-300 bg-white text-sm font-semibold" onClick={() => { nextFocus.current = `baked-facility-${filtered[limit].facility.id}`; setLimit(n => n + 12); }}>さらに{Math.min(12, filtered.length - limit)}件を表示</button>}
    <details className="mt-4 text-xs leading-relaxed text-stone-600">
      <summary className="min-h-11 cursor-pointer py-3 font-semibold">候補の判定について</summary>
      <p>徒歩圏の道路と施設の登録位置・範囲が25m以内にあるものを候補にしています。表示時間は坂道を考慮した道路上の地点までの目安です。入口への経路や、その間を横断・通行できるかは未確認です。</p>
      <p className="mt-2">参考施設は除いています。同じ施設の登録が重複している場合があります。施設名・営業状況・診療内容などは詳細からご確認ください。</p>
      <p className="mt-2">候補0件は、周辺に施設がないという意味ではありません。</p>
    </details>
  </section>;
}
