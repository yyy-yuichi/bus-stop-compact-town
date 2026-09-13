import type { ShoppingProperties } from './types';
import { detailText, openingHours, phoneHref } from './facilityDetails';

const FIELDS = [
  ['cuisine', '料理・飲食'], ['service', 'サービス'], ['specialty', '診療分野（原表記）'],
  ['wheelchair', '車いす'], ['access', '利用対象'], ['brand', 'ブランド'], ['branch', '支店'], ['operator', '運営'],
] as const;

export default function RegisteredDetails({ details, civicSources, civicDetails }: { details: ShoppingProperties['registered_details']; civicSources?: ShoppingProperties['civic_sources']; civicDetails?: ShoppingProperties['civic_details'] }) {
  if (!details) return null;
  const dates = [...new Set(details.sources.map(s => s.source_timestamp.slice(0, 10)))].sort();
  return <section className="registered-details" aria-label="施設の登録情報">
    <h3>施設の登録情報</h3>
    <p className="helper-text">{civicSources ? [...new Set(civicSources.map(s => `${s.publisher} · ${s.date}`))].join(' / ') : `OpenStreetMap · ${dates.join(' / ')}`}時点のデータ<br />営業状況・受付時間は施設へご確認ください。</p>
    <dl>
      {details.opening_hours && <><dt>営業時間・利用時間</dt><dd>{details.opening_hours.map(value => {
        const formatted = openingHours(value);
        return <p key={value}>{formatted.raw && <small>原表記：</small>}{formatted.text}</p>;
      })}</dd></>}
      {details.phone && <><dt>電話</dt><dd>{details.phone.map(value => {
        const href = phoneHref(value);
        return <p key={value}>{href ? <a className="phone-link" href={href}>{value}</a> : value}</p>;
      })}</dd></>}
      {FIELDS.map(([key, label]) => details[key]?.length ? <div className="registered-field" key={key}><dt>{label}</dt><dd>{details[key]!.map(value => <p key={value}>{detailText(key, value)}</p>)}</dd></div> : null)}
      {civicDetails?.map(({ label, value, source_id }) => <div className="registered-field" key={`${label}:${value}:${source_id}`}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  </section>;
}
