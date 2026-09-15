import { useEffect } from 'react';
import L from 'leaflet';
import type { BusFeature } from './types';

export default function LocationReviewPanel({ stop, map, scope, onMapFacilities }: {
  stop: BusFeature; map: L.Map | null; scope: string; onMapFacilities: (scope: string, ids: string[]) => void;
}) {
  const review = stop.properties.boarding_guide?.review;
  const hold = stop.properties.boarding_guide?.assignment_hold;
  useEffect(() => {
    onMapFacilities(scope, []);
    if (!map || !review) return;
    const ring = L.circle([stop.geometry.coordinates[1], stop.geometry.coordinates[0]], {
      radius: review.search_radius_m, color: '#b45309', fillOpacity: 0.07, dashArray: '5 5', interactive: false,
    }).addTo(map);
    return () => { ring.remove(); };
  }, [map, stop, scope, onMapFacilities, review]);
  if (hold) return <section className="location-review" aria-label="乗り場の番号対応確認">
    <strong>公式{hold.number}のりばと原位置の対応を確認中です</strong>
    <p>{hold.reason}</p>
    <p>原ID・原座標を保持しています。番号対応の根拠が得られるまで、この点を公式のりばとした徒歩5・10・15分と周辺施設は表示しません。</p>
  </section>;
  if (!review) return null;
  return <section className="location-review" aria-label="乗り場の位置確認">
    <strong>このピンの位置を確認中です</strong>
    <p>{stop.properties.boarding_guide?.location_description}</p>
    <p>位置と道路側の確認後、この地点の徒歩5・10・15分と周辺施設を追加します。</p>
    {import.meta.env.VITE_CONFIRMATION_DOCUMENT === '1' && <a href={`${import.meta.env.BASE_URL}boarding-location-confirmation.pdf`} target="_blank" rel="noreferrer">地図付きの位置確認票を開く ↗</a>}
    <details><summary>確認してほしいこと</summary><ol>{review.questions.map(q => <li key={q}>{q}</li>)}</ol>
      <p>{review.precision_notice}</p><p>{review.method}</p>
    </details>
  </section>;
}
