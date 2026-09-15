"""Display observed official originals separately; calculate only confirmed roadside origins."""
from pathlib import Path
import json,collections,math
R=Path(__file__).resolve().parents[1];D=R/'data-sources/sentetsu-v19-20260915'
def read(p):return json.loads(p.read_text())
# Read the retained boundary only; do not rerun v18 inventory.
polygons=read(R/'data-sources/prefecture-directed-20260915/municipal-boundaries.geojson')
def inring(x,y,ring):
 inside=False
 for a,b in zip(ring,ring[1:]+ring[:1]):
  if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:inside=not inside
 return inside
def city(p):
 names=set();x,y=p
 for f in polygons['features']:
  for rings in ([f['geometry']['coordinates']] if f['geometry']['type']=='Polygon' else f['geometry']['coordinates']):
   if inring(x,y,rings[0]) and not any(inring(x,y,r) for r in rings[1:]):names.add(f['properties']['N03_004'])
 return next(iter(names)) if len(names)==1 else '市町境界対応保留'
study=read(R/'src/data/boarding-guide-study.json');ledger=read(D/'ledger.json');index=read(R/'src/data/boarding-walk-study/index.json')['stops'];ids=[]
for pair in ledger['pairs']:
 for p in pair['points']:
  confirmed=p['status']=='机上確認済み'
  id=p['id']
  if confirmed:ids.append(id)
  es=p['occurrences'];directions=collections.defaultdict(set);nexts=collections.defaultdict(set);details=[]
  for e in es:
   directions[e['route_name']].add(e['headsign']+'（次は'+(e['next_stop_name'] or '終点')+'）')
   if e['next_stop_name']:nexts[e['route_name']].add(e['next_stop_name'])
   if not confirmed:
    details.append(f"{e['previous_stop_name'] or '始発'}→当点→{e['next_stop_name'] or '終点'}、{e['headsign']}。保留理由：{' / '.join(e['reasons'])}");continue
   q=e['road_projection'];dx=(p['original_coordinates'][0]-q[0])*92300;dy=(p['original_coordinates'][1]-q[1])*111320
   side=['北','北東','東','南東','南','南西','西','北西'][int(((math.degrees(math.atan2(dx,dy))%360)+22.5)//45)%8]
   details.append(f"{e['previous_stop_name']}→当点→{e['next_stop_name']}、{e['headsign']}。公式経路図の分岐のない区間{e['official_map_section']}と停車順を照合。{e['road_tags'].get('name') or 'OSM道路'+e['way_id']}の{side}側、進行方位{e['heading_deg']}°に対する左側余裕{e['signed_left_m']}m。")
  heads=sorted({e['headsign'] for e in es});g={'stop_name':p['name'],'group_id':'sentetsu:'+p['name'],'number':None,'role':'boarding','summary':'／'.join(heads),'directions':[{'route':r,'text':' / '.join(sorted(v)),'next_stops':sorted(nexts[r])} for r,v in directions.items()],'source_url':'https://sentetsu.busplus.jp/','guide_url':'https://www.sentetsu.jp/scheduled-bus/sennavi-guidance/','evidence':'stop-sequence','source_coordinates':p['original_coordinates'],'source_origin_label':'船木鉄道公式せんナビ','location_description':' / '.join(details),'roadside_review':{'status':'confirmed','direction_status':'source-sequence-checked','reason':'公式せんナビの原乗り場ID・座標・乗車する便の方面と前後停車順を、公式経路図の一意な分岐のない区間および道路側に照合。2026-09-15の取得対象小野田線での机上整合です。別路線・全曜日の網羅、現地標柱確認ではありません。','walking_notice':'この原点の徒歩圏・周辺施設は未計算です。'}}
  if not confirmed:
   g['roadside_review'].update(status='hold',reason='公式の原座標と乗車する便の方面・停車順は取得。道路側との対応は保留：'+' / '.join(sorted({r for e in es if e['status']!='整合' for r in e['reasons']})),walking_notice='乗る方面と原位置の道路側の対応に保留があります。この原点の徒歩圏・施設は未計算です。')
  if id in study['guides']:assert study['guides'][id]['source_coordinates']==p['original_coordinates']
  study['guides'][id]=g
  if not any(f['id']==id for f in study['hub_points']):study['hub_points'].append({'type':'Feature','id':id,'geometry':{'type':'Point','coordinates':p['original_coordinates']},'properties':{'name':p['name'],'operator':'船木鉄道','source_kind':'boarding-study','source_namespace':'sentetsu','source_stop_id':p['source_stop_id'],'source_date':'2026-09-15','city':city(p['original_coordinates']),'source_url':g['source_url'],'location_kind':'unverified'}})
(D/'confirmed-walking-targets.json').write_text(json.dumps(ids,ensure_ascii=False,indent=2)+'\n')
(R/'src/data/boarding-guide-study.json').write_text(json.dumps(study,ensure_ascii=False,indent=2)+'\n')
print('Added confirmed originals',len(ids))
