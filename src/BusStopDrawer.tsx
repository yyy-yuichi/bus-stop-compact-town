import Drawer from './Drawer';
import type { BusFeature } from './types';

interface BusStopDrawerProps {
  stop: BusFeature;
  timestamp: string;
  onClose: () => void;
}

export default function BusStopDrawer({ stop, timestamp, onClose }: BusStopDrawerProps) {
  const name = stop.properties?.['name:ja'] || stop.properties?.name || '名称未登録';
  const id = String(stop.id || stop.properties?.['@id']);
  const [longitude, latitude] = stop.geometry.coordinates;

  return <Drawer title={name} eyebrow="BUS STOP" description="バス停の詳細" closeLabel="バス停の詳細を閉じる" onClose={onClose}>
      <dl className="space-y-6 text-sm">
        <div><dt className="text-xs font-semibold text-stone-500">運行事業者（OSM登録情報）</dt>
          <dd className="mt-2 break-words font-medium text-stone-900">{stop.properties?.operator || '登録情報なし'}</dd></div>
        <div><dt className="text-xs font-semibold text-stone-500">OSM ID</dt>
          <dd className="mt-2 font-mono text-stone-800">{id}</dd></div>
        <div><dt className="text-xs font-semibold text-stone-500">位置（緯度・経度）</dt>
          <dd className="mt-2 font-mono text-stone-800">{latitude.toFixed(6)}, {longitude.toFixed(6)}</dd></div>
      </dl>
      {/^(node|way|relation)\/\d+$/.test(id) && <a href={`https://www.openstreetmap.org/${id}`} target="_blank" rel="noopener noreferrer"
        className="mt-7 flex min-h-11 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-3 text-sm font-semibold text-sky-900 hover:bg-sky-100">OpenStreetMapで確認 ↗</a>}
      <div className="mt-7 rounded-xl bg-stone-50 p-4 text-xs leading-relaxed text-stone-600">
        <p>OSM由来の試用データです。位置・運行情報の正確性、最新性は未確認です。</p>
        <p className="mt-2 break-all">データ時点：{timestamp || '不明'}</p>
        <a className="mt-3 inline-block text-sky-800 underline underline-offset-2" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors / ODbL</a>
      </div>
  </Drawer>;
}
