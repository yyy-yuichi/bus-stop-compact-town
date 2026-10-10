import type { FacilityGuidanceReview } from './facilityGuidance';
import { referenceFacilityGroups } from './facilityGuidance';

export default function FacilityGuidanceDetails({ review: r }: { review?: FacilityGuidanceReview }) {
  if (!r) return null;
  const exclusionTitle = r.exclusion_scope === 'original_location' ? '元の地図位置は現在の目的地に使えません' :
    r.exclusion_scope === 'original_service' || r.exclusion_scope === 'registered_services' ? '記載したサービス・用途は案内対象外' :
    r.exclusion_scope === 'named_facility_unit' ? '記載した施設・店舗の利用は案内対象外' :
    r.exclusion_scope === 'unsupported_current_use' ? '記載した現役利用は案内対象外' : '元の記録は案内対象外';
  return <section className="verified-facility facility-guidance" aria-label="施設の案内確認">
    <h3>{r.decision === 'ready' ? '施設の案内' : r.decision === 'exclude' ? exclusionTitle : r.saved_count_group ? '同じ施設の案内（代表記録に集約）' : r.decision === 'reference' ? '資料の範囲で参考表示' : '案内に必要な確認が残っています'}</h3>
    {r.shared_destination && <p className="helper-text">{r.shared_destination.note}</p>}
    {r.saved_visit_group && <p className="helper-text">同じ店舗の施設付近案内1施設（元の登録記録{r.saved_visit_group.member_ids.length}件）。{r.saved_visit_group.note}</p>}
    {r.saved_count_group && <p className="helper-text">同じ施設の案内1施設（元の登録記録{r.saved_count_group.member_ids.length}件）。{r.saved_count_group.note}</p>}
    {referenceFacilityGroups([r]).map(g => <p className="helper-text" key={g.id}>
      {g.kind === 'original_registration' ? '登録由来の施設1・居宅相談サービス1' : '同じ店舗の参考情報1施設'}
      （元の登録記録{g.member_ids.length}件）。{g.note}
    </p>)}
    {r.excluded_unit && <p>案内対象外の範囲：{r.excluded_unit}</p>}
    <dl><dt>種類</dt><dd>{r.display.type}</dd><dt>場所</dt><dd>{r.display.place}</dd><dt>利用状況</dt><dd>{r.display.use}</dd></dl>
    <p>{r.summary}</p><p className="helper-text">{r.scope}</p>
    {r.remaining.map(v => <p key={v}>残る確認：{v}</p>)}
    {r.next_source && <p>次の資料：{r.next_source.url ? <a href={r.next_source.url} target="_blank" rel="noreferrer">{r.next_source.title} ↗</a> : r.next_source.title}</p>}
    {r.decision === 'exclude' && r.exclusion_scope === 'registered_services' ?
      <p className="helper-text">記載した対象サービスの現役登録案内から外しています。他の登録サービスの利用状態や案内は、この判断だけでは変更しません。</p> :
      r.decision !== 'ready' && <p className="helper-text">この記録は現役の徒歩候補・施設数・時間と距離の案内に含めません。</p>}
    {r.decision === 'reference' && <p className="helper-text">参考表示は施設全体の休止・閉鎖を認定するものではありません。</p>}
    {r.limits.map(v => <p className="helper-text" key={v}>{v}</p>)}
    <details className="source-details"><summary>案内の根拠と資料時点</summary>
      <p className="helper-text">資料照合日：{r.checked_at}</p>
      {r.record_basis && <div>
        <strong>保存された既存成果による限定判断</strong>
        <p>{r.record_basis.statement}</p>
        <p>保存済みの原記録・既存整理を引き継いだ制限です。外部一次本文の新しい読取りや、施設全体の現在利用・閉鎖を確認した根拠ではありません。</p>
      </div>}
      {r.saved_basis && <div aria-label="保存資料の出典">
        <strong>{r.saved_count_group && r.decision === 'reference' ? '保存された同じ施設の支持（候補は代表記録のみ）' : r.saved_basis.kind === 'saved_reference' ? '保存された判断の参考表示' : r.saved_basis.kind === 'saved_point_exclusion' ? '保存された確認による原点の限定除外' : '保存された支持範囲の限定案内'}</strong>
        <p>{r.saved_basis.statement}</p>
        {r.saved_basis.records.map(s => <div key={`${s.source_library_file_id}:${s.locator}`}>
          <strong>{s.title}</strong><p>保存資料の箇所：{s.locator}</p><p style={{ whiteSpace: 'pre-line' }}>{s.quote}</p><p>{s.scope}</p><p className="helper-text">{s.date_note}</p>
        </div>)}
      </div>}
      {r.sources.map(s => <div key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a><p>{s.scope}</p><p className="helper-text">{s.date_note}</p></div>)}
    </details>
  </section>;
}
