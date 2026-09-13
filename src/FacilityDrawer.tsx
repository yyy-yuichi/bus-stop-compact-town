import { useEffect, useRef } from 'react';
import type { ShoppingFeature } from './types';
import { categoryOf } from './shoppingData';
import MapIcon from './MapIcon';
import SharePlace from './SharePlace';
import FacilityIcon from './FacilityIcon';
import RegisteredDetails from './RegisteredDetails';

export default function FacilityDrawer({ facility, onClose, returnStop }: { facility: ShoppingFeature; onClose: () => void; returnStop?: { name: string } }) {
  const close = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const p = facility.properties;
  const category = categoryOf(facility);
  const imported = p.verification_status === 'osm_unverified';
  const civic = p.verification_status === 'civic_unverified';
  const medical = category.group === 'medical';
  useEffect(() => {
    const previous = document.activeElement;
    const element = panel.current;
    close.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (element?.contains(document.activeElement) || document.activeElement === document.body) {
        const target = previous instanceof HTMLElement && previous.isConnected ? previous : document.getElementById('place-search');
        target?.focus({ preventScroll: true });
      }
    };
  }, [onClose]);
  useEffect(() => {
    panel.current?.querySelector('.detail-body')?.scrollTo(0, 0);
    close.current?.focus({ preventScroll: true });
  }, [facility.id]);
  return <aside className="detail-drawer facility-drawer" ref={panel} role="dialog" aria-labelledby="facility-title">
    <header className="detail-header">
      <div><p className="detail-eyebrow"><span className="category-symbol" style={{ background: category.color }}><FacilityIcon category={category.id} /></span>{category.name}</p><h2 id="facility-title">{p.name}</h2><p className="detail-subtitle">{p.city}</p></div>
      <button ref={close} className="icon-button" onClick={onClose} aria-label="施設の詳細を閉じる"><MapIcon name="close" /></button>
    </header>
    {returnStop && <button className="drawer-return" onClick={onClose}>← {returnStop.name}の徒歩圏に戻る</button>}
    <div className="detail-body">
      {p.classification_review?.status === 'pending' && <p className="mb-3 text-xs text-amber-800">情報確認中</p>}
      <section className="facility-address"><h3>所在地</h3><p>{p.official_address || p.address || '住所の登録なし'}</p></section>
      <RegisteredDetails details={p.registered_details} civicSources={p.civic_sources} civicDetails={p.civic_details} />
      {(p.official_url || p.website) && <a className="primary-link" href={p.official_url || p.website} target="_blank" rel="noreferrer">{imported || civic ? 'ウェブサイト' : '公式サイト'} <span aria-hidden="true">↗</span></a>}
      <SharePlace place={{ kind: 'facility', id: String(facility.id) }} />
      <details className="source-details"><summary>登録情報・確認状況</summary>
      {imported && <p className="facility-status">{p.classification_review ? '出典を基にOpenStreetMapの登録情報を点検した記録です。確認した範囲は下記をご覧ください。現地での位置・入口・営業状況の確認はしていません。' : 'OpenStreetMapの登録情報です。名称・所在地・営業状況は個別に確認していません。'}</p>}
      {civic && <p className="facility-status">自治体が公開した施設一覧を加工しています。公開元の時点の情報で、現在の開設状況・サービス・入口は個別に確認していません。</p>}
      {p.classification_review && <section className="soft-note"><strong>登録情報の点検{p.classification_review.status === 'pending' ? '・保留' : ''}</strong><p>{p.classification_review.note}</p>{p.classification_review.evidence_url && <a href={p.classification_review.evidence_url} target="_blank" rel="noreferrer">点検に用いた資料 ↗</a>}<p className="helper-text">点検日：{p.classification_review.checked_at}</p></section>}
      <p className="helper-text">{category.id === 'reference' ? '通常の施設分類には含めていない参考記録です。' : medical ? '診療内容・受付時間・処方箋の扱いは、施設へご確認ください。' : '営業時間・窓口やサービスの内容は、施設へご確認ください。'}</p>
      <div className="soft-note"><strong>地図上の位置について</strong><p>{p.geometry_kind === 'representative_point' ? '施設の代表位置を表示しています。' : p.geometry_kind === 'facility_area' ? '施設の範囲を表示しています。' : '建物の形を表示しています。'}入口や、バス停から歩いて到達できることを確認した表示ではありません。</p></div>
        <dl><dt>名称・所在地の確認</dt><dd>{civic ? '自治体の公開一覧から取り込み・現況未確認' : imported ? '未確認（OSM登録情報を取り込み）' : p.verified_at}</dd><dt>{imported || civic ? '取得元データの基準日時' : '位置データの更新日時'}</dt><dd>{civic ? '自治体オープンデータ' : 'OpenStreetMap'}（{p.source_timestamp}）</dd>{(imported || civic) && <><dt>取り込み日</dt><dd>{p.retrieved_at?.slice(0, 10)}</dd></>}</dl>
        {p.source_ids.map(id => /^(node|way|relation)\/\d+$/.test(id) && <a key={id} href={`https://www.openstreetmap.org/${id}`} target="_blank" rel="noreferrer">OSMの原情報 ↗</a>)}
        {p.registration_origin?.length && <div className="soft-note"><strong>元の登録に記載された出典・注記</strong>{p.registration_origin.map(note => <p key={note}>{note}</p>)}<p className="helper-text">OSMの取得元日時より古い資料が含まれます。</p></div>}
        {p.civic_sources?.map(s => <p key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a><br />{s.date}時点・{s.publisher}のデータを加工</p>)}
        {civic ? <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> : <p className="helper-text">© OpenStreetMap contributors / ODbL 1.0</p>}
      </details>
    </div>
  </aside>;
}
