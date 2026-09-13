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
] as const;

export default function BakedFacilityList({ candidates, minutes, state, retry, onFacility }: {
  candidates: BakedFacilityCandidate[]; minutes: BakedWalkingMinutes;
  state: LoadState; retry: () => void; onFacility: (facility: ShoppingFeature) => void;
}) {
  const [group, setGroup] = useState<FacilityGroup | 'all'>('all');
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
    <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="施設候補の種類">
      {GROUPS.map(g => <button key={g.id} aria-pressed={group === g.id} onClick={() => setGroup(g.id)}
        className={`min-h-11 rounded-xl border px-1 text-xs font-semibold ${group === g.id ? 'border-emerald-800 bg-emerald-50 text-emerald-950' : 'border-stone-200 bg-white text-stone-600'}`}>
        {g.name} <span className="ml-1">{candidates.filter(c => g.id === 'all' || c.group === g.id).length}</span>
      </button>)}
    </div>
    <p className="mt-3 text-xs text-stone-600" role="status" aria-live="polite">{label}の候補 {filtered.length}件 · 近くの道路までの時間順</p>
    <p className="mt-2 text-xs leading-relaxed text-stone-600">入口まで歩けることを確認した一覧ではありません。道路から施設への通行可否は現地でご確認ください。</p>
    {filtered.length ? filtered.slice(0, limit).map(({ facility, meters, gap }) => {
      const category = categoryOf(facility);
      return <article key={String(facility.id)} className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
        <p className="flex items-center gap-2 text-xs font-semibold" style={{ color: category.color }}><span className="h-4 w-4"><FacilityIcon category={category.id} /></span>{category.name}</p>
        <h5 className="mt-2 text-base font-bold">{facility.properties.name}</h5>
        {facility.properties.classification_review?.status === 'pending' && <p className="mt-1 text-xs text-amber-800">分類を確認中の登録です</p>}
        <p className="mt-3 text-sm font-semibold text-emerald-900">近くの道路まで 約{Math.max(1, Math.ceil(meters / (4000 / 60)))}分</p>
        <p className="mt-1 text-xs text-stone-500">そこから{facility.geometry.type === 'Point' ? '登録位置' : '建物・敷地'}まで直線で約{Math.round(gap)}m · 入口未確認</p>
        <button id={`baked-facility-${facility.id}`} className="primary-link mt-3" aria-label={`${facility.properties.name}の詳細を見る`} onClick={() => onFacility(facility)}>施設の詳細を見る <span aria-hidden="true">→</span></button>
      </article>;
    }) : <p className="mt-4 rounded-xl bg-stone-50 p-4 text-sm leading-relaxed">{minutes}分圏では{group === 'all' ? '施設' : label}の候補が見つかりませんでした。{minutes < 15 ? '時間を広げると候補が見つかる場合があります。' : '周辺に施設がないことを意味するものではありません。'}</p>}
    {filtered.length > limit && <button className="mt-3 min-h-11 w-full rounded-xl border border-stone-300 bg-white text-sm font-semibold" onClick={() => { nextFocus.current = `baked-facility-${filtered[limit].facility.id}`; setLimit(n => n + 12); }}>さらに{Math.min(12, filtered.length - limit)}件を表示</button>}
    <details className="mt-4 text-xs leading-relaxed text-stone-600">
      <summary className="min-h-11 cursor-pointer py-3 font-semibold">候補の判定について</summary>
      <p>徒歩圏の道路と施設の登録位置・範囲が25m以内にあるものを候補にしています。表示時間は坂道を考慮した道路上の地点までの目安です。入口への経路や、その間を横断・通行できるかは未確認です。</p>
      <p className="mt-2">参考施設は除いています。同じ施設の登録が重複している場合があります。施設名・営業状況・診療内容などは詳細からご確認ください。</p>
    </details>
  </section>;
}
