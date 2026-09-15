"""Apply independently inspectable directed ledger; never recalculate or move origins."""
from pathlib import Path
import argparse,collections,json,math,hashlib
R=Path(__file__).resolve().parents[1];D=R/'data-sources/hikari-directed-20260915'
p=argparse.ArgumentParser();p.add_argument('--directory',type=Path,default=D);p.add_argument('--title',default='光市同名66組')
args=p.parse_args();D=args.directory
def read(p):return json.loads(p.read_text())
data=read(D/'ledger.json');study=read(R/'src/data/boarding-guide-study.json');index=read(R/'src/data/boarding-walk-study/index.json')
walking=[];lines=['# '+args.title+'：乗る方面と原位置の机上照合','',
 f"確認済み{data['summary']['confirmed_pairs']}組、保留{data['summary']['held_pairs']}組。個別の原点では{data['summary']['confirmed_points']}点が机上整合。現地での標柱確認とは異なる。",'',
 '|組名・組判定|原ID・原座標|原点判定|乗るバスの方面|道路側・使用経路区間・根拠|徒歩圏|','|---|---|---|---|---|---|']
for pair in data['pairs']:
    for p in pair['points']:
        id=p['id'];guide=study['guides'][id];es=p['occurrences'];confirmed=p['status']=='机上確認済み'
        assert guide['source_coordinates']==p['original_coordinates']
        entry=index['stops'].get(id, {'origin':p['original_coordinates']});assert entry['origin']==p['original_coordinates']
        route_text=collections.defaultdict(set);route_next=collections.defaultdict(set)
        for e in es:
            heads=[e['stop_headsign']] if e['stop_headsign'] else e['trip_headsigns']
            next=e['next_stop_name'] or '終点'
            route_text[e['route_name']].add('・'.join(heads)+'（次は'+next+'）')
            if e['next_stop_name']:route_next[e['route_name']].add(e['next_stop_name'])
        guide['directions']=[{'route':r,'text':' / '.join(sorted(texts)),'next_stops':sorted(route_next[r])} for r,texts in route_text.items()]
        # Preserve familiar next-stop summary; add the source's actual stop-specific headsign.
        nexts=sorted({n for ns in route_next.values() for n in ns})
        heads=sorted({e['stop_headsign'] for e in es if e['stop_headsign']})
        if nexts or heads:guide['summary']='・'.join(nexts)+'方面'+('（'+'／'.join(heads)+'）' if heads else '')
        reasons=sorted({reason for e in es if e['status']!='整合' for reason in e['reasons']})
        if not es:reasons=['収録GTFSに乗車可能な停車記録がなく、乗る方面を確認できない']
        details=[]
        for e in es:
            interval=e.get('interval',{})
            if e.get('road_segment'):
                a,b=e['road_segment'];q=e['road_projection'];origin=p['original_coordinates']
                dx,dy=(origin[0]-q[0])*92300,(origin[1]-q[1])*111320
                bearing=math.degrees(math.atan2(dx,dy))%360
                side=['北','北東','東','南東','南','南西','西','北西'][int((bearing+22.5)//45)%8]
                road=e['road_tags'].get('name') or 'OSM道路'+e['way_id']
                detail=f"{road}の{side}側。{e['previous_stop_name']}→当点→{e['next_stop_name']}、shape {e['shape_id']} の {interval['previous_s_m']:.1f}〜{interval['next_s_m']:.1f}m区間、進行方位{e['heading_deg']}°、左側余裕{e['signed_left_m']:.1f}m：{e['status']}"
            else:detail=f"shape {e['shape_id']}、{e['previous_stop_name']}→当点→{e['next_stop_name']}：{e['status']}（{'・'.join(e['reasons'])}）"
            if detail not in details:details.append(detail)
        # Only confirmed origins are newly checked/qualified for walking integration.
        w={'id':id,'boarding_position_status':p['status'],'origin':p['original_coordinates'],'file':entry.get('file')}
        if not confirmed:
            if entry.get('file'):
                w['status']='乗り場保留・既存計算を参考保持'
                notice='乗り場の方面と道路側の照合に保留があります。徒歩圏・施設は原座標からの計算参考です。'
            else:
                w['status']='乗り場保留・徒歩圏未計算'
                notice='乗り場の方面と道路側の照合に保留があります。この原点の徒歩圏・施設は未計算です。'
        elif not entry.get('file'):
            w.update(status='乗り場机上整合・道路未接続',gap_m=entry.get('gap'))
            if entry.get('gap') is None:
                w['status']='乗り場机上整合・徒歩圏未計算'
                notice='乗り場位置は机上照合済み。徒歩圏は未計算です。道路未接続と判定した状態ではありません。'
            else:notice=f"乗り場位置は机上照合済み。歩行用道路への距離{entry.get('gap')}mが30mを超えるため、徒歩圏は未計算です。"
        else:
            f=R/'src/data/boarding-walk-study'/entry['file'];c=read(f)
            assert c['id']==id and c['origin']==p['original_coordinates'] and c['gap']<=30
            snap=c['snap'];distances=[math.hypot((snap[0]-e['road_projection'][0])*92300,(snap[1]-e['road_projection'][1])*111320) for e in es]
            w.update(origin_matches=True,sha256=hashlib.sha256(f.read_bytes()).hexdigest(),gap_m=c['gap'],snap=snap,
              max_snap_to_boarding_road_projection_m=round(max(distances),3))
            if max(distances)>2:
                w['status']='原点計算一致・徒歩接続の対応保留'
                notice='乗り場位置は机上照合済み。既存徒歩圏の原点は一致しますが、接続先が乗車道路の投影点と異なるため、徒歩接続の対応は保留です。施設は計算参考として表示します。'
            else:
                w['status']='原点・接続位置照合済み（既存徒歩手法）'
                notice='この原点の徒歩5・10・15分と施設候補を照合済みです。接続は既存の30m基準内。横断・通行状態・施設入口は現地未確認です。'
        walking.append(w)
        guide['roadside_review']={'status':'confirmed' if confirmed else 'hold','direction_status':'source-sequence-checked',
          'reason':'前後停留所に対応する経路区間と、進行方向に対する原点の道路側を照合。'+('全ての乗車経路で机上整合。標柱は現地未確認です。' if confirmed else '保留理由：'+' / '.join(reasons)),
          'walking_notice':notice}
        guide['location_description']=' / '.join(details)
        lines.append('|'+ '|'.join([pair['name']+'：'+pair['status'],id+' '+str(p['original_coordinates']),p['status'],
            ' / '.join(r+'：'+' / '.join(sorted(t)) for r,t in route_text.items()),' / '.join(details),w['status']])+'|')
(R/'src/data/boarding-guide-study.json').write_text(json.dumps(study,ensure_ascii=False,indent=2)+'\n')
(D/'ledger.md').write_text('\n'.join(lines)+'\n')
(D/'walking-correspondence.json').write_text(json.dumps({'summary':dict(collections.Counter(w['status'] for w in walking)),'points':walking},ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(collections.Counter(w['status'] for w in walking)),ensure_ascii=False))
