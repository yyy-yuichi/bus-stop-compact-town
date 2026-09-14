import type { ShoppingProperties } from './types';

export default function VerifiedFacilityDetails({ review }: { review: ShoppingProperties['purpose_review'] }) {
  if (!review) return null;
  return <section className="registered-details verified-facility" aria-label="公式資料で確認した情報">
    <h3>公式資料で確認した情報</h3>
    <p className="helper-text">{review.checked_at}に資料を確認</p>
    <dl>{review.facts.map(f => <div className="registered-field" key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
    <a href={review.source_url} target="_blank" rel="noreferrer">{review.source_title} ↗</a>
    {review.additional_sources?.map(s=><p key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a></p>)}
    <p className="helper-text">{review.gaps.join('。')}</p>
  </section>;
}
