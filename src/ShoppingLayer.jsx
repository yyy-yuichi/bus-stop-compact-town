import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

export default function ShoppingLayer({ map }) {
  const layerRef = useRef(null);
  const panelRef = useRef(null);
  const itemsRef = useRef(new Map());
  const [features, setFeatures] = useState([]);
  const [status, setStatus] = useState('loading');
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
      .then(r => { if (!r.ok) throw new Error('Shopping data unavailable'); return r.json(); })
      .then(data => {
        if (abort.signal.aborted) return;
        if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length) throw new Error('Invalid shopping data');
        const layer = L.geoJSON(data, {
          style: feature => ({ color: '#9c4600', weight: 3, fillColor: '#f3a13b', fillOpacity: feature.properties.geometry_kind === 'facility_area' ? 0.2 : 0.45, dashArray: feature.properties.geometry_kind === 'facility_area' ? '6 4' : undefined }),
          pointToLayer: (_f, latlng) => L.circleMarker(latlng, { radius: 10, color: '#9c4600', weight: 3, fillColor: '#f3a13b', fillOpacity: 0.9 }),
          onEachFeature: (feature, item) => {
            const p = feature.properties;
            const isPoint = feature.geometry.type === 'Point';
            const isArea = p.geometry_kind === 'facility_area';
            const box = document.createElement('div');
            const title = document.createElement('strong'); title.textContent = p.name; box.append(title);
            for (const text of [p.official_address, '名称・住所：公式サイト照合済み', isPoint ? 'OSM由来の施設代表点（建物形状・入口ではありません）' : isArea ? 'OSMの施設範囲（建物境界とは限りません）' : 'OSMの建物形状', p.location_verification, p.location_verification ? p.geometry_note : '', '入口位置・現地精度は未確認', `OSM要素更新日：${p.source_timestamp}`, `照合日：${p.verified_at}`, `OSM ID：${p.source_ids.join(', ')}`, p.osm_name && p.osm_name !== p.name ? `OSM登録名：${p.osm_name}` : ''].filter(Boolean)) {
              const line = document.createElement('p'); line.textContent = text; box.append(line);
            }
            const url = new URL(p.official_url);
            if (url.protocol === 'https:') {
              const link = document.createElement('a'); link.href = url.href; link.textContent = '施設公式サイト'; link.target = '_blank'; link.rel = 'noopener noreferrer'; box.append(link);
            }
            item.bindPopup(box, { maxWidth: 280, maxHeight: 220, autoPanPaddingTopLeft: [14, window.innerWidth <= 600 ? 370 : 90], autoPanPaddingBottomRight: [14, 80] });
            item.on('click', () => {
              setSelected(feature.id);
              if (window.innerWidth <= 600 && panelRef.current) panelRef.current.open = false;
            });
            itemsRef.current.set(feature.id, item);
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

  const select = event => {
    const id = event.target.value;
    setSelected(id);
    const item = itemsRef.current.get(id);
    if (!item) { map.closePopup(); return; }
    if (!map.hasLayer(layerRef.current)) layerRef.current.addTo(map);
    setVisible(true);
    item.getPopup().options.autoPanPaddingTopLeft = [14, window.innerWidth <= 600 ? 370 : 90];
    if (window.innerWidth <= 600 && panelRef.current) panelRef.current.open = false;
    const bounds = item.getBounds?.();
    if (bounds) map.fitBounds(bounds, { padding: [30, 50], maxZoom: 16 });
    else map.setView(item.getLatLng(), 16);
    item.openPopup();
  };

  return <details className="shopping-panel" ref={panelRef}>
    <summary>橙：商業施設 {status === 'ready' ? `${features.length}施設（試作）` : status === 'error' ? '読込エラー' : '読込中…'}</summary>
    {status === 'error' && <button onClick={() => setAttempt(n => n + 1)}>商業施設を再読み込み</button>}
    {status === 'ready' && <>
      <label className="layer-switch"><input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} /> 商業施設を表示</label>
      <label htmlFor="shopping-choice">商業施設を選択</label>
      <select id="shopping-choice" value={selected} onChange={select}>
        <option value="">施設を選ぶと拡大します</option>
        {features.map(f => <option key={f.id} value={f.id}>{f.properties.city} · {f.properties.name}</option>)}
      </select>
      <p>県内全件ではありません。<br />実線の面：建物 ／ 破線の面：施設範囲<br />丸：施設代表点。入口位置・現地精度は未確認。<br />名称・住所を公式サイトと照合。</p>
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors / ODbL</a>
      <p><a href={`${import.meta.env.BASE_URL}about.html`}>この地図について・データ出典</a></p>
    </>}
  </details>;
}
