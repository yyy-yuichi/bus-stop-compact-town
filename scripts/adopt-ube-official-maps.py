"""Keep the operator's map coordinates and directions, without transferring labels to OSM."""
from pathlib import Path
import collections,html,json,re
R=Path(__file__).resolve().parents[1];D=R/'data-sources/ube-official-maps-20260915'
data=json.loads((D/'inventory.json').read_text());study=json.loads((R/'src/data/boarding-guide-study.json').read_text());hubids={p['id'] for p in study['hub_points']}
groups=collections.defaultdict(list)
for p in data['points']:
 direction=html.unescape(re.sub('<[^>]+>',' / ',p['direction'])).strip('・ ')
 if not direction:raise ValueError('Missing official direction')
 id=p['id'];coord=p['original_coordinates'];name=p['name']
 if id not in hubids:study['hub_points'].append({'type':'Feature','id':id,'geometry':{'type':'Point','coordinates':coord},'properties':{'name':name,'operator':'宇部市交通局','source_kind':'boarding-study','source_date':'2026-09-15','city':'宇部市','source_url':p['page_url'],'location_kind':'unverified'}})
 study['guides'][id]={'stop_name':name,'group_id':'ube-official-map:'+name,'number':None,'role':'boarding','summary':direction,'directions':[{'route':'交通局公式の乗り場地図','text':direction,'next_stops':[]}],'source_url':p['page_url'],'guide_url':p['map_url'],'evidence':'official-platform-coordinate','source_coordinates':coord,'location_description':'交通局の公式ページに埋め込まれた地図のPoint原座標と、その同一Placemarkに記載された方面。OSM点への近接割当はしていません。資料の行IDは公式番号ではありません。標柱・徒歩接続は現地未確認。'}
 study['guides'][id]['source_origin_label']='宇部市交通局の公式ページに掲載された地図'
 groups[name].append({**p,'source_stop_id':id.split(':',1)[1],'status':'机上確認済み','field_checked':False,'verification_method':'official-published-coordinate-and-direction','road_side_status':'公式地図の点位置を採用。道路の左右を別の原点へ転記しない。'})
 # This ledger uses direct official coordinate+direction evidence, not the GTFS shape algorithm.
ledger={'verification_method':'official-published-coordinate-and-direction','pairs':[{'name':name,'points':points} for name,points in groups.items()]}
(D/'ledger.json').write_text(json.dumps(ledger,ensure_ascii=False,indent=2)+'\n')
(D/'confirmed-walking-targets.json').write_text(json.dumps([p['id'] for p in data['points']],ensure_ascii=False,indent=2)+'\n')
(R/'src/data/boarding-guide-study.json').write_text(json.dumps(study,ensure_ascii=False,indent=2)+'\n')
print('Official map originals',len(data['points']))
