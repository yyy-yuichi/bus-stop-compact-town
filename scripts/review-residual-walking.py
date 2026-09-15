"""Inspect every v18 missing origin against retained and newly sourced roads."""
from pathlib import Path
import importlib.util,json,collections,datetime
R=Path(__file__).resolve().parents[1];D=R/'data-sources/residuals-v19-20260915'
spec=importlib.util.spec_from_file_location('boarding',R/'scripts/bake-boarding-walking.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);bake=mod.bake
def read(p):return json.loads(p.read_text())
study=read(R/'src/data/boarding-guide-study.json');index=read(R/'src/data/boarding-walk-study/index.json')['stops']
overlay=read(R/'data-sources/prefecture-directed-20260915/walking-road-overlay.json');ways={w['id']:w for w in overlay['ways']}
full=read(D/'carriageways-verified.json')
for e in full['elements']:
 if e['type']=='node':overlay['nodes'][str(e['id'])]=[e['lon'],e['lat'],e.get('tags',{})]
 if e['type']=='way':ways[str(e['id'])]={'id':str(e['id']),'refs':[str(n) for n in e['nodes']],'tags':e['tags']}
import urllib.parse
for p in read(D/'full-road-receipts.json'):
 if p.get('error'):continue
 box=urllib.parse.parse_qs(urllib.parse.urlparse(p['url']).query)['bbox'][0];overlay['bboxes'].append(list(map(float,box.split(','))))
overlay['ways']=list(ways.values());overlay['sources'].append('data-sources/residuals-v19-20260915/carriageways-verified.json')
(D/'walking-road-overlay.json').write_text(json.dumps(overlay,ensure_ascii=False)+'\n')
roads=read(R/'raw_data/yamaguchi-roads.json');mod.apply_road_overlay(roads,overlay)
n,e=bake.build_road_graph(roads);graph={'nodes':n,'edges':e};grid=bake.GridIndex(graph,cell_lon=.06,cell_lat=.06);tags={w['id']:w['tags'] for w in roads['ways']}
alln,alle=bake.build_road_graph({'nodes':overlay['nodes'],'ways':overlay['ways']});allg={'nodes':alln,'edges':alle};allgrid=bake.GridIndex(allg,cell_lon=.06,cell_lat=.06)
baseline_targets={p['id']:p['origin'] for p in read(D/'missing-128-targets.json')}
rows=[];retry=[]
for id,entry in index.items():
 if id not in baseline_targets:continue
 assert entry['origin']==baseline_targets[id]
 if entry.get('file'):continue
 g=study['guides'][id];p=entry['origin'];eligible=g.get('roadside_review',{}).get('status')=='confirmed' or g.get('evidence')=='official-platform-coordinate'
 near=bake.nearest_edge(graph,*p,5000,grid);rawnear=bake.nearest_edge(allg,*p,5000,allgrid)
 row={'id':id,'name':g.get('stop_name') or g['group_id'],'origin':p,'direction':g['summary'],'boarding_confirmed':eligible,'v18_gap_m':entry.get('gap'),'walkable_gap_m':round(near[3],3) if near else None,'walking_way':graph['edges'][near[0]][5] if near else None,'status':'保留'}
 if rawnear:
  wid=allg['edges'][rawnear[0]][5];t=ways[wid]['tags'];row.update(nearest_recorded_road=wid,nearest_recorded_road_gap_m=round(rawnear[3],3),nearest_recorded_road_tags=t,nearest_recorded_road_walkable=bake._builder.can_walk(t))
 if not eligible:row['reason']='場所・方面の既存判定が保留。徒歩接続の近さで解除しない。'+g.get('roadside_review',{}).get('reason','')
 elif near and near[3]<=30:row.update(status='再計算対象',reason='取得した道路原本に30m以内の歩行用道路がある。原座標を保持してこの点だけ再計算する。');retry.append(id)
 elif rawnear and rawnear[3]<=30 and not row['nearest_recorded_road_walkable']:row['reason']='30m内に道路は収録済みだが歩行対象の条件を満たさない。道路タグを根拠なく書き換えず、別の歩行路または歩行可否の追加根拠が必要。'
 else:row['reason']='取得済み道路原本の歩行用道路は30m外。原座標から接続できる歩道・通路の追加位置資料が不足。'
 rows.append(row)
(D/'missing-128-review.json').write_text(json.dumps({'recorded_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'points':rows,'summary':dict(collections.Counter(p['status'] for p in rows))},ensure_ascii=False,indent=2)+'\n')
(D/'retry-targets.json').write_text(json.dumps(retry,ensure_ascii=False,indent=2)+'\n')
print('Results',collections.Counter(p['status'] for p in rows));print('Retry',retry)
