"""Read-only nearest eligible edges for already-confirmed, uncomputed origins."""
import argparse,importlib.util,json,math
from pathlib import Path
R=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('directory',type=Path);a=p.parse_args();D=a.directory
spec=importlib.util.spec_from_file_location('walking',R/'scripts/build-walking-pilot.py');w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
nodes={};ways={}
for f in D.glob('carriageways-*.json'):
 if f.name.endswith('-receipt.json'):continue
 for e in json.loads(f.read_text())['elements']:
  (nodes if e['type']=='node' else ways)[e['id']]=e
results=[];sx=111320*math.cos(math.radians(34));sy=111320
for point in json.loads((D/'walking-correspondence.json').read_text())['points']:
 if point['boarding_position_status']!='机上確認済み' or point.get('file'):continue
 origin=point['origin'];candidates=[]
 for way in ways.values():
  t=way.get('tags',{})
  if not w.can_walk(t):continue
  forward=t.get('oneway:foot')!='-1' and t.get('foot:forward','yes') in w.ALLOW
  backward=t.get('oneway:foot') not in {'yes','1','true'} and t.get('foot:backward','yes') in w.ALLOW
  if not (forward or backward):continue
  for ia,ib in zip(way['nodes'],way['nodes'][1:]):
   if ia not in nodes or ib not in nodes:continue
   na,nb=nodes[ia],nodes[ib]
   if not w.node_open(na.get('tags',{})) or not w.node_open(nb.get('tags',{})):continue
   ax,ay=(na['lon']-origin[0])*sx,(na['lat']-origin[1])*sy
   bx,by=(nb['lon']-origin[0])*sx,(nb['lat']-origin[1])*sy
   dx,dy=bx-ax,by-ay;u=max(0,min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy or 1)))
   candidates.append({'way_id':way['id'],'node_ids':[ia,ib],'gap_m':math.hypot(ax+u*dx,ay+u*dy),'tags':t})
 nearest=min(candidates,key=lambda c:c['gap_m']) if candidates else None
 results.append({'id':point['id'],'origin':origin,'existing_gap_m':point['gap_m'],'nearest_current_eligible_edge':nearest,'within_30m':bool(nearest and nearest['gap_m']<=30),'note':'候補辺までの距離確認のみ。徒歩接続・全域グラフの再計算ではない。'})
(D/'walking-gap-review.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(results,ensure_ascii=False))
