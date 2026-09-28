import type { RegistryReview } from './facilityRegistry';

const registryLabels: Record<RegistryReview['scope'], string> = {
  care_service_registry: '介護サービス事業者台帳',
  care_publication_list: '介護サービス情報の公表対象一覧',
  school_register: '学校名簿',
  childcare_register: '保育・幼稚園等の施設名簿',
  medical_register: '保険医療機関名簿',
  pharmacy_register: '薬局名簿',
  welfare_register: '社会福祉施設名簿',
  food_business_register: '食品営業許可施設一覧',
  post_office_directory: '日本郵便の郵便局一覧',
  public_facility_directory: '自治体・観光団体の施設案内',
  operator_directory: '運営者の公式施設一覧',
  trade_association_directory: '業界団体の公式施設一覧',
  regional_business_directory: '公的事業と連携する地域店舗案内',
};

export default function FacilityRegistryDetails({ review, duplicateOf }: { review?: RegistryReview; duplicateOf?: string }) {
  if (!review) return null;
  const heading = review.scope === 'regional_business_directory' ? '地域店舗案内の掲載確認' : review.scope === 'care_publication_list' ? '介護情報公表資料の掲載確認' : review.scope.endsWith('_directory') ? '公式施設一覧の掲載確認' : '行政台帳の掲載確認';
  return <section className="registered-details verified-facility" aria-label={heading}>
    <h3>{heading}</h3>
    {duplicateOf && <p className="font-semibold">同じ施設の重複した登録をまとめています。この記録は保持し、<a className="underline" href={'#kind=facility&id=' + encodeURIComponent(duplicateOf)}>通常表示の施設</a>へ案内します。</p>}
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
