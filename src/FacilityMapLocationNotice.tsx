import { mapLocationLabel } from './facilityMapLocation';
import type { FacilityMapLocation } from './facilityMapLocation';

/** Position evidence stays visible and separate from the facility identity review. */
export default function FacilityMapLocationNotice({ location }: { location?: FacilityMapLocation }) {
  if (!location) return null;
  const current = location.current_location;
  return <section className="soft-note facility-map-location-notice" aria-label="地図の位置確認">
    <strong>{mapLocationLabel(location)}</strong>
    <p>{location.note}</p>
    <p>地図には元データの登録位置を表示しています。この登録位置は徒歩圏の集計・到達性判定の対象外です。</p>
    {current && <>
      <p>照合した現施設点（元の地図位置とは別の情報）：緯度 {current.coordinates[1]}、経度 {current.coordinates[0]}</p>
      {current.distance_from_original_m !== undefined && <p>記録された元の地図位置との差：{current.distance_from_original_m} m</p>}
      <a href={current.source.url} target="_blank" rel="noreferrer">{current.source.title} ↗</a>
      {current.source.as_of && <p className="helper-text">資料の基準日：{current.source.as_of}</p>}
      {current.source.published_at && <p className="helper-text">資料の公開・出力日：{current.source.published_at}</p>}
      {current.source.retrieved_at && <p className="helper-text">取得日：{current.source.retrieved_at}</p>}
      <p className="helper-text">この点の記録だけで、移転・現在営業・入口や徒歩での到達性を確認したものではありません。</p>
    </>}
  </section>;
}
