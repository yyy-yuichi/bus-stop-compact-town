import { useEffect } from 'react';
import L from 'leaflet';
import type { BusFeature } from './types';
import { boardingChoices } from './boardingGuide';
import { focusContent } from './mapLayout';
import { distance } from './bakedWalking';

export default function BoardingGuidePanel({ stop, stops, map, active, onStop }: {
  stop: BusFeature; stops: BusFeature[]; map: L.Map | null; active: boolean; onStop: (id: string) => void;
}) {
  const guide = stop.properties.boarding_guide;
  // The walking panel owns framing when a boarding catchment exists. This
  // focus is used only for hub points without a walking source.
  useEffect(() => {
    if (!map || !active || stop.properties.source_kind !== 'boarding-study') return;
    const focus = () => focusContent(map, L.latLngBounds([[stop.geometry.coordinates[1], stop.geometry.coordinates[0]]]), 18);
    focus(); map.on('resize', focus);
    return () => { map.off('resize', focus); };
  }, [map, active, stop]);
  if (!guide) return null;
  const choices = boardingChoices(stop, stops);
  const sourceVariants = choices.some(choice => choice.properties.boarding_guide?.cross_source_reference);
  return <section className="boarding-guide" aria-label="乗り場の方面">
    <p className="boarding-direction">{guide.summary}</p>
    {guide.roadside_review && <div className="helper-text" aria-label="道路側の確認状況">
      <p>{guide.roadside_review.status === 'hold' ? 'この方面の乗り場位置は一部保留' : 'この方面の乗り場位置は机上照合済み'}</p>
      <p>{guide.roadside_review.walking_notice}</p>
    </div>}
    {guide.data_notice && <p className="helper-text">{guide.data_notice}</p>}
    {guide.role === 'alighting' && <p className="helper-text">{guide.location_description}</p>}
    {choices.length > 1 && <details key={String(stop.id)} className="boarding-choices">
      <summary>{guide.roadside_review ? '同じ名前の登録地点' : stop.properties.source_kind === 'municipal' ? '同じ名前の乗り場' : 'この停留所の乗り場'}（{choices.length}地点）</summary>
      {choices.map(choice => {
        const from = stop.geometry.coordinates, to = choice.geometry.coordinates;
        const separation = distance([from[0], from[1]], [to[0], to[1]]);
        return <button type="button" key={String(choice.id)} className="boarding-choice" aria-pressed={choice.id === stop.id} onClick={() => onStop(String(choice.id))}>
        <span><strong>{choice.properties.boarding_guide?.number ? `${choice.properties.boarding_guide.number}のりば` : choice.properties.boarding_guide?.role === 'alighting' ? '降車専用' : choice.properties.boarding_guide?.summary}{choice.properties.boarding_guide?.review ? '（位置候補）' : ''}</strong>
          {choice.properties.boarding_guide?.number && <small>{choice.properties.boarding_guide.summary}</small>}
          {sourceVariants && <small>{choice.properties.boarding_guide?.cross_source_reference ? 'OSMの原点' : '公式データの原点'}</small>}
          {choice.properties.boarding_guide?.roadside_review && <small>{choice.properties.boarding_guide.roadside_review.status === 'confirmed' ? '乗り場位置：机上照合済み' : '乗り場位置：一部保留'}</small>}
          {choice.properties.boarding_guide?.role === 'alighting' && <small>{choice.properties.boarding_guide.location_description}</small>}
          {separation > 500 && <small>約{(separation/1000).toFixed(1)}km離れた同名地点</small>}
        </span><span className="boarding-choice-status">{choice.id === stop.id ? '選択中' : '地図で見る'}</span>
      </button>; })}
    </details>}
    <details className="boarding-evidence"><summary>方面・位置の根拠</summary>
      {guide.evidence === 'stop-sequence' && <p>次の停留所を目印にした方面です。</p>}
      {(guide.directions.length > 1 || guide.roadside_review) && <dl className="boarding-routes">{guide.directions.map(row => <div key={row.route}><dt>{row.route}</dt><dd>{row.text}</dd></div>)}</dl>}
      {guide.roadside_review && <p>{guide.roadside_review.reason}</p>}
      <a className="boarding-official" href={guide.guide_url} target="_blank" rel="noopener noreferrer">{guide.guide_label || (guide.evidence === 'stop-sequence' ? '公式の路線案内' : '公式のりば案内')} ↗</a>
      <p>{guide.assignment_hold ? '公式案内の番号と、この原位置の対応は未確認です。' : guide.evidence === 'stop-sequence' ? `位置は${guide.source_origin_label || `${stop.properties.city}提供データ`}の原座標、方面は路線と停車順から整理しています。のりば番号は資料に記載がありません。` : guide.evidence === 'official-platform-coordinate' ? guide.source_origin_label ? `位置と方面は${guide.source_origin_label}の同じ記録に基づきます。資料にない番号は付けていません。` : '番号・方面は公式案内、位置は防長交通の公式検索が提供する乗り場の原座標です。原IDを保持しています。' : guide.review ? '番号・方面は公式案内、位置は図と道路形状から整理した確認用の候補です。既存の位置データを書き換えたものではありません。' : '番号・方面は公式案内、位置は公式図の配置と照合したOpenStreetMapの候補点です。'}</p>
      {guide.location_description && <p>{guide.location_description}</p>}
      <p>標柱の位置は現地未確認です。</p>
      <a href={guide.source_url} target="_blank" rel="noopener noreferrer">出典を開く ↗</a>
    </details>
  </section>;
}
