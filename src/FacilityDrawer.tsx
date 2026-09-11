import { useEffect, useRef } from 'react';
import type { ShoppingFeature } from './types';
import { categoryOf } from './shoppingData';
import MapIcon from './MapIcon';
import SharePlace from './SharePlace';
import FacilityIcon from './FacilityIcon';

export default function FacilityDrawer({ facility, onClose, returnStop }: { facility: ShoppingFeature; onClose: () => void; returnStop?: { name: string; pilot: boolean } }) {
  const close = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const p = facility.properties;
  const category = categoryOf(facility);
  const imported = p.verification_status === 'osm_unverified';
  const medical = category.id === 'hospital' || category.id === 'clinic' || category.id === 'pharmacy';
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
    {returnStop && <button className="drawer-return" onClick={onClose}>← {returnStop.name}の{returnStop.pilot ? '徒歩圏' : 'バス停詳細'}に戻る</button>}
    <div className="detail-body">
      {imported && <p className="facility-status">{p.classification_review ? '公開資料を基にOpenStreetMapの登録情報を点検した記録です。確認した範囲は下記をご覧ください。現地での位置・入口・営業状況の確認はしていません。' : 'OpenStreetMapの登録情報です。名称・所在地・営業状況は個別に確認していません。'}</p>}
      {p.classification_review && <section className="soft-note"><strong>分類の点検{p.classification_review.status === 'pending' ? '・保留' : ''}</strong><p>{p.classification_review.note}</p>{p.classification_review.evidence_url && <a href={p.classification_review.evidence_url} target="_blank" rel="noreferrer">点検に用いた資料 ↗</a>}<p className="helper-text">点検日：{p.classification_review.checked_at}</p></section>}
      <section className="facility-address"><h3>{imported ? '登録されている所在地' : '所在地'}</h3><p>{p.official_address || p.address || '住所の登録がありません。位置は地図で確認できます。'}</p></section>
      {(p.official_url || p.website) && <a className="primary-link" href={p.official_url || p.website} target="_blank" rel="noreferrer">{imported ? '登録されているウェブサイト' : '施設の公式サイト'} <span aria-hidden="true">↗</span></a>}
      <p className="helper-text">{category.id === 'reference' ? '買い物・通院先の7分類には含めていない参考記録です。' : medical ? '診療内容・受付時間・処方箋の扱いは、施設へご確認ください。' : '営業時間や取扱商品は、施設へご確認ください。'}</p>
      <SharePlace place={{ kind: 'facility', id: String(facility.id) }} />
      <div className="soft-note"><strong>地図上の位置について</strong><p>{p.geometry_kind === 'representative_point' ? '施設の代表位置を表示しています。' : p.geometry_kind === 'facility_area' ? '施設の範囲を表示しています。' : '建物の形を表示しています。'}入口や、バス停から歩いて到達できることを確認した表示ではありません。</p></div>
      <details className="source-details"><summary>データの出典・確認日</summary>
        <dl><dt>名称・所在地の確認</dt><dd>{imported ? '未確認（OSM登録情報を取り込み）' : p.verified_at}</dd><dt>{imported ? '取得元データの基準日時' : '位置データの更新日時'}</dt><dd>OpenStreetMap（{p.source_timestamp}）</dd>{imported && <><dt>取り込み日</dt><dd>{p.retrieved_at?.slice(0, 10)}</dd></>}</dl>
        {p.source_ids.map(id => /^(node|way|relation)\/\d+$/.test(id) && <a key={id} href={`https://www.openstreetmap.org/${id}`} target="_blank" rel="noreferrer">OSMの原情報 ↗</a>)}
        <p className="helper-text">© OpenStreetMap contributors / ODbL 1.0</p>
      </details>
    </div>
  </aside>;
}
