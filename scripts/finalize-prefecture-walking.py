"""Attach actual own-origin results after baking; keep the explicit target receipt."""
from pathlib import Path
import collections,hashlib,json,math,shutil
R=Path(__file__).resolve().parents[1];D=R/'data-sources/prefecture-directed-20260915'
def read(p):return json.loads(p.read_text())
study=read(R/'src/data/boarding-guide-study.json');index=read(R/'src/data/boarding-walk-study/index.json')['stops']
review=read(D/'original-record-review.json');rows=[];references={}
for p in review['points']:
 if p['status']!='机上確認済み':continue
 id=p['id'];g=study['guides'][id];entry=index[id]
 assert entry['origin']==p['origin']==g['source_coordinates']
 g['location_description']=p['reason']+' 比較した公式原点：'+p['reference_id']+'。原座標はOSM原本を保持。'
 g['roadside_review']['reason']=p['reason']
 row={'id':id,'origin':p['origin'],'file':entry.get('file'),'field_checked':False}
 if entry.get('file'):
  file=R/'src/data/boarding-walk-study'/entry['file'];c=read(file)
  assert c['origin']==p['origin'] and c['id']==id and c['gap']<=30
  ds=[]
  for e in p['geometry_checks']:
   a,b=e['road_segment'];sx=111320*math.cos(math.radians(34));sy=111320
   dx,dy=(b[0]-a[0])*sx,(b[1]-a[1])*sy
   px,py=(p['origin'][0]-a[0])*sx,(p['origin'][1]-a[1])*sy
   t=max(0,min(1,(px*dx+py*dy)/(dx*dx+dy*dy)))
   q=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]
   ds.append(math.hypot((c['snap'][0]-q[0])*sx,(c['snap'][1]-q[1])*sy))
  row.update(gap_m=c['gap'],snap=c['snap'],max_snap_to_boarding_road_projection_m=max(ds),sha256=hashlib.sha256(file.read_bytes()).hexdigest())
  if max(ds)<=2:
   row['status']='原点・接続位置照合済み（既存徒歩手法）'
   notice='このOSM原点から徒歩5・10・15分と施設候補を計算しました。原点と乗車道路への接続位置を照合済みです。接続は30m以内。横断・通行状態・施設入口は現地未確認です。'
  else:
   row['status']='原点計算一致・徒歩接続の対応保留'
   notice='乗り場位置は机上照合済み。このOSM原点から計算していますが、徒歩道路の接続先が乗車道路の投影点と異なるため、徒歩接続の対応は保留です。徒歩圏・施設は計算参考として表示します。'
 else:
  row.update(status='乗り場机上整合・徒歩圏未計算',gap_m=entry.get('gap'))
  notice=('歩行用道路への距離'+str(entry['gap'])+'mが30mを超えるため、' if entry.get('gap') is not None else '歩行用道路との接続計算が成立しなかったため、')+'このOSM原点の徒歩圏・施設は未計算です。別の原点の計算は流用していません。'
 g['roadside_review']['walking_notice']=notice;rows.append(row)
for p in read(R/'data-sources/ube-official-maps-20260915/inventory.json')['points']:
 id=p['id'];g=study['guides'][id];entry=index[id];row={'id':id,'origin':p['original_coordinates'],'file':entry.get('file'),'field_checked':False}
 assert entry['origin']==p['original_coordinates']==g['source_coordinates']
 if entry.get('file'):
  file=R/'src/data/boarding-walk-study'/entry['file'];c=read(file)
  assert c['id']==id and c['origin']==p['original_coordinates'] and c['gap']<=30
  row.update(status='公式地図原点計算一致・徒歩接続は現地未確認',gap_m=c['gap'],snap=c['snap'],sha256=hashlib.sha256(file.read_bytes()).hexdigest())
  notice='公式地図の同じ原座標から徒歩5・10・15分と施設候補を計算しました。歩行用道路への接続は'+str(c['gap'])+'mで30m基準内。標柱・歩行接続・横断・施設入口は現地未確認です。'
 else:
  row.update(status='公式地図原点確認・徒歩圏未計算',gap_m=entry.get('gap'))
  notice=('歩行用道路への距離'+str(entry['gap'])+'mが30mを超えるため、' if entry.get('gap') is not None else '歩行用道路との接続計算が成立しなかったため、')+'この公式地図原点の徒歩圏・施設は未計算です。'
 g['data_notice']=notice;rows.append(row)
(R/'src/data/boarding-guide-study.json').write_text(json.dumps(study,ensure_ascii=False,indent=2)+'\n')
(D/'additional-walking-correspondence.json').write_text(json.dumps({'summary':dict(collections.Counter(p['status'] for p in rows)),'points':rows},ensure_ascii=False,indent=2)+'\n')
for name in ['bake-receipt.json','elevation-sources.json','baseline-nishigawara.json','graph-inputs.json']:
 source=R/'work/prefecture-walking-20260915'/name
 if source.exists():shutil.copy2(source,D/name)
print(collections.Counter(p['status'] for p in rows))
