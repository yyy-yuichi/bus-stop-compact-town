import type { ShoppingFeature } from './types';
import { freshnessLabel, freshnessDateText } from './facilityFreshness';

export default function FacilityFreshnessDetails({ facility }: { facility: ShoppingFeature }) {
  const r = facility.properties.freshness_review;
  if (!r) return null;
  const dateLabel = { closed: '閉店日', opened: '開店日', listed: '開店日', renamed: '名称変更日', service_change: '変更日', scheduled_closure: '営業終了予定日' }[r.event];
  return <section className="mb-5 rounded-xl border border-stone-300 bg-stone-50 p-4 text-sm leading-relaxed text-stone-800" aria-label="施設の変更確認">
    <h3 className="text-base font-bold">{freshnessLabel(facility)}</h3>
    <p className="my-2 font-semibold">{dateLabel}：{freshnessDateText(r)}</p>
    <p>{r.summary}</p>
    {facility.properties.duplicate_of && <p className="font-semibold">同じ店舗の登録をまとめています。この記録は通常の候補から除外し、<a className="underline" href={'#kind=facility&id=' + encodeURIComponent(facility.properties.duplicate_of)}>通常表示の店舗</a>からご覧いただけます。</p>}
    {r.status === 'closed' && <p className="font-semibold">この店舗は通常の検索・周辺施設・徒歩圏の候補には表示しません。</p>}
    <details className="mt-3"><summary className="flex min-h-11 cursor-pointer items-center underline underline-offset-2">確認した資料・注意点</summary>
      {r.sources.map(s => <p key={s.url}><a className="inline-flex min-h-11 items-center underline underline-offset-2" href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a></p>)}
      {r.limits.map(text => <p className="my-2" key={text}>{text}</p>)}
      <p>資料確認日：{r.checked_at}（リアルタイム情報ではありません）</p>
    </details>
  </section>;
}
