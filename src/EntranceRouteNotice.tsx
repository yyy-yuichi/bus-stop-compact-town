import { displayStudyMinutes } from './entranceRouteStudy';
import type { EntranceRoute } from './entranceRouteStudy';

export function walkingEndpoint(route?: EntranceRoute) {
  if (!route) return '近くの道路';
  return route.endLabel || (route.scope === 'outdoor' ? '屋外通路' : '入口');
}

export function walkingTimeSummary(meters: number, route?: EntranceRoute) {
  const time = `約${displayStudyMinutes(meters)}分`;
  const endpoint = walkingEndpoint(route);
  if (!route) return `${endpoint}まで ${time}`;
  if (route.scope === 'outdoor') return `${endpoint}まで（館内未計時） ${time}`;
  if (route.provisional) return route.endLabel ? `${endpoint}まで（暫定） ${time}` : `入口経路（暫定） ${time}`;
  return `${endpoint}までの目安 ${time}`;
}

export default function EntranceRouteNotice({ route, stopName }: { route: EntranceRoute; stopName?: string }) {
  return <div className="entrance-route-notice text-xs leading-relaxed">
    <p>{stopName ? `${stopName}から ` : ''}{walkingTimeSummary(route.meters, route)}</p>
    {route.endLabel && <p>{route.note}</p>}
    {route.startLabel && <p>一の宮県住前の東側標柱からの経路です。反対側の乗り場からは確認していません。</p>}
    {route.scope === 'outdoor' && <p>1階の屋外通路までです。館内の上下移動や、目的の場所までの移動時間は含みません。</p>}
    {route.provisional && <p>階段を通る暫定経路です。階段上端の接続、門扉・掲示・現在の通行規制は未確認です。</p>}
    {route.segmentCosts
      ? <p>時速4kmを基準に勾配を反映した目安です。横断の待ち時間と館内の移動時間は含みません。</p>
      : <p>入口側の区間は時速4kmで換算しています。この区間の坂・階段・信号待ちの時間は含みません。</p>}
  </div>;
}
