import type { ShoppingFeature } from './types';
import { freshnessLabel, freshnessDateText } from './facilityFreshness';

export default function FacilityFreshnessDetails({ facility }: { facility: ShoppingFeature }) {
  const r = facility.properties.freshness_review;
  if (!r) return null;
  const school = ['school', 'college'].includes(facility.properties.category ?? '');
  const childcare = facility.properties.category === 'childcare';
  const careServices = r.scope === 'registered_care_services';
  const dateLabel = { closed: careServices ? '指定廃止日' : childcare ? '閉園日' : school ? '閉校日' : facility.properties.category === 'library' ? '閉館日' : '閉店日', temporary_closure: careServices ? '掲載介護サービスの休止開始日' : childcare ? '休園開始日' : school ? '休校開始日' : '一時休止開始日', opened: '開店日', listed: '開店日', renamed: '名称変更日', service_change: '変更日', scheduled_closure: '営業終了予定日' }[r.event];
  return <section className="mb-5 rounded-xl border border-stone-300 bg-stone-50 p-4 text-sm leading-relaxed text-stone-800" aria-label="施設の変更確認">
    <h3 className="text-base font-bold">{freshnessLabel(facility)}</h3>
    <p className="my-2 font-semibold">{dateLabel}：{freshnessDateText(r, facility.properties.category)}</p>
    <p>{r.summary}</p>
    {careServices && <p>対象サービス：{r.affected_services?.join('、')}。元の記録に掲載された介護サービスについての確認です。建物全体や併設する別事業の閉鎖を意味しません。</p>}
    {facility.properties.duplicate_of && <p className="font-semibold">同じ店舗の登録をまとめています。この記録は通常の候補から除外し、<a className="underline" href={'#kind=facility&id=' + encodeURIComponent(facility.properties.duplicate_of)}>通常表示の店舗</a>からご覧いただけます。</p>}
    {['closed', 'temporarily_closed'].includes(r.status) && <p className="font-semibold">{careServices ? 'この記録は掲載介護サービスが指定廃止・休止のため、通常の検索・周辺施設・徒歩圏の候補には表示しません。' : 'この施設は通常の検索・周辺施設・徒歩圏の候補には表示しません。'}</p>}
    <details className="mt-3"><summary className="flex min-h-11 cursor-pointer items-center underline underline-offset-2">確認した資料・注意点</summary>
      {r.sources.map(s => <p key={s.url}><a className="inline-flex min-h-11 items-center underline underline-offset-2" href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a></p>)}
      {r.limits.map(text => <p className="my-2" key={text}>{text}</p>)}
      <p>資料確認日：{r.checked_at}（リアルタイム情報ではありません）</p>
    </details>
  </section>;
}
