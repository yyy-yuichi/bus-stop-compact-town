import { auditLabel, type FacilityAuditReview } from './facilityAudit';

export default function FacilityAuditDetails({ review }: { review?: FacilityAuditReview }) {
  if (!review) return null;
  return <section className="registered-details verified-facility facility-audit-details" aria-label="施設監査の確認結果">
    <h3>{auditLabel(review)}</h3>
    <p className="helper-text">監査記録日：{review.checked_at}。確認範囲を限定した監査結果です。当日の営業や施設全体の状態を一括して保証するものではありません。</p>
    <p>{review.summary}</p>
    <dl><div className="registered-field"><dt>確認範囲</dt><dd>{review.scope}</dd></div></dl>
    {review.status === 'unresolved' && <p>必要な根拠が揃っていないため、営業中・閉鎖・移転とは判定していません。</p>}
    <details className="source-details"><summary>出典・確認できていないこと</summary>
      {!review.sources.length && <p className="helper-text">公開リンク未収録。保存済み監査の判定範囲を表示していますが、この画面から個別の原資料を開くことはできません。</p>}
      {review.sources.map(s => <p key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a></p>)}
      {review.limits.map((limit, i) => <p className="helper-text" key={i}>{limit}</p>)}
      <p className="helper-text">元の施設ID・名称・分類・位置・形状は保持しています。過去の移転や一部サービスの終了は、現在の建物全体の閉鎖に読み替えていません。</p>
    </details>
  </section>;
}
