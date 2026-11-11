import { displayStudyMinutes, selectedEntranceRoute } from './entranceRouteStudy';
import type { EntranceOrigin, EntranceStudyMode } from './entranceRouteStudy';
import type { BakedFacilityCandidate } from './bakedWalking';
import EntranceRouteNotice from './EntranceRouteNotice';

export default function EntranceStudyPanel({ source, candidates, mode, onMode, minutes, mismatches, comparison = true }: {
  source: EntranceOrigin; candidates: BakedFacilityCandidate[]; mode: EntranceStudyMode;
  onMode: (mode: EntranceStudyMode) => void; minutes: number; mismatches: string[]; comparison?: boolean;
}) {
  const byId = new Map(candidates.map(candidate => [String(candidate.facility.id), candidate]));
  return <section className="entrance-study-panel rounded-xl border border-blue-200 bg-blue-50 p-3 mt-4" aria-label={comparison ? '入口経路の比較' : '施設までの経路'}>
    <h4 className="text-sm font-bold">{comparison ? '非公開の入口経路試算' : '施設までの経路'}</h4>
    {comparison && <label className="block mt-2 text-xs">施設経路の比較
      <select className="block w-full min-h-11 border rounded bg-white mt-1 px-2" value={mode} onChange={event => onMode(event.target.value as EntranceStudyMode)}>
        <option value="confirmed">確認経路を使用</option>
        <option value="current">現行計算と比較</option>
        {source.pairs.some(pair => pair.alternative) && <option value="alternative">別側からの参考経路</option>}
        {source.pairs.some(pair => pair.detour) && <option value="detour">ひかりヶ丘は外回り</option>}
      </select>
    </label>}
    {mismatches.length > 0 && <p role="alert" className="text-sm mt-2">{mismatches.length}組の元データが一致せず、試算を適用できません。</p>}
    <ul className="mt-3 space-y-3 text-xs">
      {source.pairs.map(pair => {
        const candidate = byId.get(pair.facilityId);
        const route = selectedEntranceRoute(pair, mode);
        const shown = mode === 'current' ? displayStudyMinutes(pair.currentMeters) : displayStudyMinutes(route.meters);
        if (mismatches.includes(pair.facilityId)) return <li key={pair.facilityId} data-study-facility={pair.facilityId}>
          <strong>{candidate?.facility.properties.name ?? pair.facilityId}</strong>
          <p>元データ不一致のため試算不適用。入口までの圏内外は判定保留。</p>
        </li>;
        return <li key={pair.facilityId} data-study-facility={pair.facilityId}>
          <strong>{candidate?.facility.properties.name ?? pair.facilityId}</strong>
          {comparison ? <p>現行 {displayStudyMinutes(pair.currentMeters)}分 → {route.label} {displayStudyMinutes(route.meters)}分</p> : <EntranceRouteNotice route={route} />}
          <p>{minutes}分圏{shown <= minutes ? '内' : '外'}{mode === 'current' ? ' · 近くの道路まで' : route.scope === 'outdoor' ? ' · 屋外通路まで・館内未計時' : ''}</p>
          {comparison && <p className="mt-1 text-stone-600">{mode === 'current' ? '現行の道路点までの計算。' : route.note}</p>}
        </li>;
      })}
    </ul>
    <p className="text-xs mt-3">青紫の線は入口側の経路のうち{minutes}分以内の区間です。施設のマークは登録された代表位置で、入口とは異なる場合があります。</p>
  </section>;
}
