import type { RegistryReview } from './facilityRegistry';

const registryLabels: Record<RegistryReview['scope'], string> = {
  care_service_registry: '介護サービス事業者台帳',
  school_register: '学校名簿',
  childcare_register: '保育・幼稚園等の施設名簿',
  medical_register: '保険医療機関名簿',
  pharmacy_register: '保険薬局名簿',
  welfare_register: '社会福祉施設名簿',
  food_business_register: '食品営業許可施設一覧',
  post_office_directory: '日本郵便の郵便局一覧',
  public_facility_directory: '自治体等の公共施設一覧',
  operator_directory: '運営者の公式施設一覧',
};

export default function FacilityRegistryDetails({ review }: { review?: RegistryReview }) {
  if (!review) return null;
  const heading = review.scope.endsWith('_directory') ? '公式施設一覧の掲載確認' : '行政台帳の掲載確認';
  return <section className="registered-details verified-facility" aria-label={heading}>
    <h3>{heading}</h3>
    <p className="helper-text">{registryLabels[review.scope]}の掲載内容を照合しました。建物全体の営業・開業、現地での稼働、入口や現在の利用可否を確認したものではありません。</p>
    <dl>
      <div className="registered-field"><dt>{review.source_date_kind === 'retrieved' ? '資料閲覧日' : '資料基準日'}</dt><dd>{review.source_as_of}</dd></div>
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
