import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

import type { ShoppingCollection, ShoppingFeature, ShoppingProperties, LoadState } from './types';

export default function ShoppingLayer({ map }: { map: L.Map | null }) {
  const layerRef = useRef<L.GeoJSON | null>(null);
  const panelRef = useRef<HTMLDetailsElement | null>(null);
  const itemsRef = useRef(new Map<string, L.Layer>());
  const [features, setFeatures] = useState<ShoppingFeature[]>([]);
  const [status, setStatus] = useState<LoadState>('loading');
  const [visible, setVisible] = useState(true);
  const [selected, setSelected] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!map) return;
    const abort = new AbortController();
    setStatus('loading');
    setSelected('');
    setFeatures([]);
    fetch(`${import.meta.env.BASE_URL}data/shopping.geojson`, { signal: abort.signal })
      .then(r => { if (!r.ok) throw new Error('Shopping data unavailable'); return r.json() as Promise<ShoppingCollection>; })
      .then(data => {
        if (abort.signal.aborted) return;
        if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length) throw new Error('Invalid shopping data');
        const layer = L.geoJSON<ShoppingProperties>(data, {
          style: feature => ({ color: '#9c4600', weight: 3, fillColor: '#f3a13b', fillOpacity: feature?.properties.geometry_kind === 'facility_area' ? 0.2 : 0.45, dashArray: feature?.properties.geometry_kind === 'facility_area' ? '6 4' : undefined }),
          pointToLayer: (_f, latlng) => L.circleMarker(latlng, { radius: 10, color: '#9c4600', weight: 3, fillColor: '#f3a13b', fillOpacity: 0.9 }),
          onEachFeature: (feature, item) => {
            const p = feature.properties;
            const isPoint = feature.geometry.type === 'Point';
            const isArea = p.geometry_kind === 'facility_area';
            const box = document.createElement('div');
            const title = document.createElement('strong'); title.textContent = p.name; box.append(title);
            for (const text of [p.official_address, '名称・住所：公式サイト照合済み', isPoint ? 'OSM由来の施設代表点（建物形状・入口ではありません）' : isArea ? 'OSMの施設範囲（建物境界とは限りません）' : 'OSMの建物形状', p.location_verification, p.location_verification ? p.geometry_note : '', '入口位置・現地精度は未確認', `OSM要素更新日：${p.source_timestamp}`, `照合日：${p.verified_at}`, `OSM ID：${p.source_ids.join(', ')}`, p.osm_name && p.osm_name !== p.name ? `OSM登録名：${p.osm_name}` : ''].filter(Boolean)) {
              const line = document.createElement('p'); line.textContent = text || ''; box.append(line);
            }
            const url = new URL(p.official_url);
            if (url.protocol === 'https:') {
              const link = document.createElement('a'); link.href = url.href; link.textContent = '施設公式サイト'; link.target = '_blank'; link.rel = 'noopener noreferrer'; box.append(link);
            }
            item.bindPopup(box, { maxWidth: 280, maxHeight: 220, autoPanPaddingTopLeft: [14, window.innerWidth <= 600 ? 370 : 90], autoPanPaddingBottomRight: [14, 80] });
            item.on('click', () => {
              setSelected(String(feature.id));
              if (window.innerWidth <= 600 && panelRef.current) panelRef.current.open = false;
            });
            itemsRef.current.set(String(feature.id), item);
          },
        });
        layerRef.current = layer;
        setFeatures([...data.features].sort((a, b) => `${a.properties.city}${a.properties.name}`.localeCompare(`${b.properties.city}${b.properties.name}`, 'ja')));
        setStatus('ready');
      }).catch(error => { if (error.name !== 'AbortError' && !abort.signal.aborted) setStatus('error'); });
    return () => {
      abort.abort();
      layerRef.current?.remove();
      layerRef.current = null;
      itemsRef.current.clear();
    };
  }, [map, attempt]);

  useEffect(() => {
    if (!map || !layerRef.current) return;
    if (visible) layerRef.current.addTo(map);
    else { layerRef.current.remove(); setSelected(''); }
  }, [map, visible, status]);

  const select = (event: React.ChangeEvent<HTMLSelectElement>) => {
    if (!map || !layerRef.current) return;
    const id = event.target.value;
    setSelected(id);
    const item = itemsRef.current.get(id);
    if (!item) { map.closePopup(); return; }
    if (!map.hasLayer(layerRef.current)) layerRef.current.addTo(map);
    setVisible(true);
    const popup = item.getPopup();
    if (popup) popup.options.autoPanPaddingTopLeft = [14, window.innerWidth <= 600 ? 370 : 90];
    if (window.innerWidth <= 600 && panelRef.current) panelRef.current.open = false;
    const bounds = (item instanceof L.FeatureGroup || item instanceof L.Polygon) ? item.getBounds() : undefined;
    if (bounds) map.fitBounds(bounds, { padding: [30, 50], maxZoom: 16 });
    else if (item instanceof L.CircleMarker) map.setView(item.getLatLng(), 16);
    item.openPopup();
  };

  return <details className="shopping-panel absolute right-6 top-[90px] w-[300px] max-w-[calc(100%-28px)] rounded-2xl border border-amber-200 bg-amber-50/95 p-3 text-sm text-amber-950 shadow-lg shadow-amber-950/10 backdrop-blur-sm max-[600px]:left-3.5 max-[600px]:right-auto max-[600px]:top-[326px] max-[600px]:w-[290px] max-[600px]:open:max-h-[calc(100dvh-420px)] max-[600px]:open:overflow-y-auto [@media(max-height:600px)]:top-auto [@media(max-height:600px)]:bottom-[22px] [@media(max-height:600px)]:left-3.5 [@media(max-height:600px)]:max-h-[calc(100dvh-110px)] [@media(max-height:600px)]:overflow-y-auto [@media(max-height:600px)_and_(min-width:601px)]:left-auto [@media(max-height:600px)_and_(min-width:601px)]:right-3.5 [@media(max-height:600px)_and_(min-width:601px)]:top-[90px] [@media(max-height:600px)_and_(min-width:601px)]:bottom-auto" ref={panelRef}>
    <summary className="min-h-8 cursor-pointer content-center text-xs font-bold marker:text-amber-700">橙：商業施設 {status === 'ready' ? `${features.length}施設（試作）` : status === 'error' ? '読込エラー' : '読込中…'}</summary>
    {status === 'error' && <button className="mt-2 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-xs font-semibold hover:bg-stone-100" onClick={() => setAttempt(n => n + 1)}>商業施設を再読み込み</button>}
    {status === 'ready' && <>
      <label className="layer-switch flex min-h-10 cursor-pointer items-center gap-2 text-xs font-semibold"><input className="size-5 shrink-0 accent-amber-700 disabled:cursor-wait disabled:opacity-50" type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} /> 商業施設を表示</label>
      <label className="mt-2 block text-xs font-medium" htmlFor="shopping-choice">商業施設を選択</label>
      <select className="mt-1 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-2 text-xs text-stone-800 shadow-sm transition-colors hover:border-emerald-600" id="shopping-choice" value={selected} onChange={select}>
        <option value="">施設を選ぶと拡大します</option>
        {features.map(f => <option key={f.id} value={f.id}>{f.properties.city} · {f.properties.name}</option>)}
      </select>
      <p className="mt-2 text-[11px] leading-relaxed text-stone-600">県内全件ではありません。<br />実線の面：建物 ／ 破線の面：施設範囲<br />丸：施設代表点。入口位置・現地精度は未確認。<br />名称・住所を公式サイトと照合。</p>
      <a className="text-[11px] text-sky-800 underline decoration-sky-300 underline-offset-2 hover:text-sky-950" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors / ODbL</a>
      <p className="mt-2 text-[11px] leading-relaxed text-stone-600"><a className="text-[11px] text-sky-800 underline decoration-sky-300 underline-offset-2 hover:text-sky-950" href={`${import.meta.env.BASE_URL}about.html`}>この地図について・データ出典</a></p>
    </>}
  </details>;
}


