import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

import type { ShoppingCollection, ShoppingProperties } from './types';

export default function ShoppingLayer({ map }: { map: L.Map | null }) {
  const layerRef = useRef<L.GeoJSON | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!map) return;
    const abort = new AbortController();
    setFailed(false);
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
            item.bindPopup(box, { maxWidth: 280, maxHeight: 220, autoPanPaddingTopLeft: [14, 90], autoPanPaddingBottomRight: [14, 80] });
          },
        }).addTo(map);
        layerRef.current = layer;
      }).catch(error => { if (error.name !== 'AbortError' && !abort.signal.aborted) setFailed(true); });
    return () => {
      abort.abort();
      layerRef.current?.remove();
      layerRef.current = null;
    };
  }, [map, attempt]);

  return failed ? <button className="absolute right-4 top-28 rounded-xl bg-white p-3 text-sm text-red-800 shadow" onClick={() => setAttempt(n => n + 1)}>商業施設を読み込めませんでした。再読み込み</button> : null;
}
