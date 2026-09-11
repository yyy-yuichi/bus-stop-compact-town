import { useEffect, useRef } from 'react';
import type { ShoppingFeature } from './types';
import { categoryOf } from './shoppingData';
import MapIcon from './MapIcon';
import SharePlace from './SharePlace';

export default function FacilityDrawer({ facility, onClose }: { facility: ShoppingFeature; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const p = facility.properties;
  const category = categoryOf(facility);
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
  return <aside className="detail-drawer facility-drawer" ref={panel} role="dialog" aria-labelledby="facility-title">
    <header className="detail-header">
      <div><p className="detail-eyebrow"><span className="category-symbol" style={{ background: category.color }}>{category.short}</span>{category.name}</p><h2 id="facility-title">{p.name}</h2><p className="detail-subtitle">{p.city}</p></div>
      <button ref={close} className="icon-button" onClick={onClose} aria-label="施設の詳細を閉じる"><MapIcon name="close" /></button>
    </header>
    <div className="detail-body">
      <section className="facility-address"><h3>所在地</h3><p>{p.official_address}</p></section>
      <a className="primary-link" href={p.official_url} target="_blank" rel="noreferrer">お店の公式サイト <span aria-hidden="true">↗</span></a>
      <p className="helper-text">営業時間や取扱商品は、公式サイトをご確認ください。</p>
      <SharePlace place={{ kind: 'facility', id: String(facility.id) }} />
      <div className="soft-note"><strong>地図上の位置について</strong><p>{p.geometry_kind === 'representative_point' ? '店舗の代表位置を表示しています。' : p.geometry_kind === 'facility_area' ? '施設の範囲を表示しています。' : '建物の形を表示しています。'}入口や、バス停から歩いて到達できることを確認した表示ではありません。</p></div>
      <details className="source-details"><summary>データの出典・確認日</summary>
        <dl><dt>名称・所在地の確認日</dt><dd>{p.verified_at}</dd><dt>位置データ</dt><dd>OpenStreetMap（{p.source_timestamp}）</dd></dl>
        {p.source_ids.map(id => /^(node|way|relation)\/\d+$/.test(id) && <a key={id} href={`https://www.openstreetmap.org/${id}`} target="_blank" rel="noreferrer">OSMの原情報 ↗</a>)}
        <p className="helper-text">© OpenStreetMap contributors / ODbL 1.0</p>
      </details>
    </div>
  </aside>;
}
