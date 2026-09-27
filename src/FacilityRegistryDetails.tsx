import type { RegistryReview } from './facilityRegistry';

export default function FacilityRegistryDetails({ review }: { review?: RegistryReview }) {
  if (!review) return null;
  return <section className="registered-details verified-facility" aria-label="行政台帳の掲載確認">
    <h3>行政台帳の掲載確認</h3>
    <p className="helper-text">{review.scope === 'care_service_registry' ? '介護サービス事業者台帳' : '学校名簿'}の掲載内容を照合しました。建物全体の営業・開業、現地での稼働、入口や現在の利用可否を確認したものではありません。</p>
    <dl>
      <div className="registered-field"><dt>資料基準日</dt><dd>{review.source_as_of}</dd></div>
      <div className="registered-field"><dt>照合日</dt><dd>{review.checked_at}</dd></div>
      <div className="registered-field"><dt>台帳ID</dt><dd>{review.registry_id}</dd></div>
      <div className="registered-field"><dt>公式名称</dt><dd>{review.official_name}</dd></div>
      <div className="registered-field"><dt>公式住所</dt><dd>{review.official_address}</dd></div>
      {review.services.length > 0 && <div className="registered-field"><dt>掲載サービス</dt><dd>{review.services.join('、')}</dd></div>}
    </dl>
    <p>{review.summary}</p>
    <details className="source-details"><summary>出典・確認の限界</summary>
      {review.sources.map(source => <p key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></p>)}
      {review.limits.map((limit, index) => <p className="helper-text" key={`${index}-${limit}`}>{limit}</p>)}
    </details>
  </section>;
}
