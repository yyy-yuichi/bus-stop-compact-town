import { displayStudyMinutes } from './entranceRouteStudy';
import type { EntranceRoute } from './entranceRouteStudy';

export default function EntranceRouteNotice({ route, stopName }: { route: EntranceRoute; stopName?: string }) {
  return <div className="entrance-route-notice text-xs leading-relaxed">
    <p>{stopName ? `${stopName}から ` : ''}{route.endLabel ? `${route.endLabel}までの目安` : route.scope === 'outdoor' ? '屋外通路まで（館内未計時）' : route.provisional ? '入口経路（暫定）' : '入口までの目安'} 約{displayStudyMinutes(route.meters)}分</p>
    {route.endLabel && <p>{route.note}</p>}
    {route.startLabel && <p>一の宮県住前の東側標柱からの経路です。反対側の乗り場からは確認していません。</p>}
    {route.scope === 'outdoor' && <p>1階の屋外通路までです。館内の上下移動や、目的の場所までの移動時間は含みません。</p>}
    {route.provisional && <p>階段を通る暫定経路です。階段上端の接続、門扉・掲示・現在の通行規制は未確認です。</p>}
    <p>入口側の区間は時速4kmで換算しています。この区間の坂・階段・信号待ちの時間は含みません。</p>
  </div>;
}
