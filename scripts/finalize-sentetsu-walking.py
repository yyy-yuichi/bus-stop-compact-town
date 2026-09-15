"""Record own-origin calculations, keeping any unresolved sidewalk correspondence explicit."""
from pathlib import Path
import json,math,collections,hashlib,shutil
R=Path(__file__).resolve().parents[1];D=R/'data-sources/sentetsu-v19-20260915'
def read(p):return json.loads(p.read_text())
study=read(R/'src/data/boarding-guide-study.json');index=read(R/'src/data/boarding-walk-study/index.json')['stops'];rows=[]
for group in read(D/'ledger.json')['pairs']:
 for p in group['points']:
  if p['status']!='机上確認済み':continue
  id=p['id'];e=index[id];g=study['guides'][id];assert e['origin']==g['source_coordinates']==p['original_coordinates']
  row={'id':id,'origin':e['origin'],'file':e.get('file'),'field_checked':False}
  if e.get('file'):
   f=R/'src/data/boarding-walk-study'/e['file'];c=read(f);assert c['id']==id and c['origin']==e['origin'] and c['gap']<=30
   ds=[math.hypot((c['snap'][0]-a['road_projection'][0])*92300,(c['snap'][1]-a['road_projection'][1])*111320) for a in p['occurrences']]
   row.update(gap_m=c['gap'],snap=c['snap'],max_snap_to_boarding_road_projection_m=max(ds),sha256=hashlib.sha256(f.read_bytes()).hexdigest())
   if max(ds)<=2:
    row['status']='原点・接続位置照合済み（既存徒歩手法）';notice='この公式原点から徒歩5・10・15分と施設候補を計算しました。原点と乗車道路への接続位置を照合済みです。接続は30m以内。現地通行状態・横断・施設入口は未確認です。'
   else:
    row['status']='原点計算一致・徒歩接続の対応保留';notice='乗り場位置は机上照合済み。この公式原点から計算していますが、歩行用道路の接続先と乗車道路の対応は保留です。徒歩圏・施設は計算参考として表示します。'
  else:
   row.update(status='乗り場机上整合・徒歩圏未計算',gap_m=e.get('gap'));notice='この原点の徒歩圏・施設は未計算です。'+('歩行用道路への距離'+str(e['gap'])+'mが30mを超えています。' if e.get('gap') is not None else '歩行用道路への接続計算が成立していません。')
  g['roadside_review']['walking_notice']=notice;rows.append(row)
(R/'src/data/boarding-guide-study.json').write_text(json.dumps(study,ensure_ascii=False,indent=2)+'\n')
(D/'walking-correspondence.json').write_text(json.dumps({'summary':dict(collections.Counter(p['status'] for p in rows)),'points':rows},ensure_ascii=False,indent=2)+'\n')
for name in ['bake-receipt.json','elevation-sources.json','baseline-nishigawara.json','graph-inputs.json']:
 f=R/'work/sentetsu-v19-20260915'/name
 if f.exists():shutil.copy2(f,D/name)
print(collections.Counter(p['status'] for p in rows))
