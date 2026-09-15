"""Resolve reference calculations only where the retained snap is an explicit same-side sidewalk."""
from pathlib import Path
import importlib.util,json,math,collections,xml.etree.ElementTree as ET
R=Path(__file__).resolve().parents[1];D=R/'data-sources/residuals-v19-20260915'
def module(name,file):
 s=importlib.util.spec_from_file_location(name,R/'scripts'/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
b=module('bake','bake-walking.py');g=module('geom','directed-geometry.py')
def read(p):return json.loads(p.read_text())
regions=['hikari-directed','iwakuni-directed','iwakuni-batch02','hikari-remaining','iwakuni-remaining','jr-prefecture'];points={};paths=[]
for name in regions:
 d=R/f'data-sources/{name}-20260915';f=d/'ledger.json'
 if f.exists():points.update({p['id']:p for group in read(f)['pairs'] for p in group['points']})
 paths.extend(sorted(d.glob('carriageways-*.json')))
g.load_roads(paths)
roads={'nodes':g.road['nodes'],'ways':[w for w in g.road['ways'] if b._builder.can_walk(w['tags'])]};n,e=b.build_road_graph(roads);graph={'nodes':n,'edges':e};grid=b.GridIndex(graph);tags={w['id']:w['tags'] for w in roads['ways']}
osm={p['id']:p for p in read(R/'data-sources/prefecture-directed-20260915/original-record-review.json')['points'] if p['status']=='机上確認済み'}
def intersects(a,b,c,d):
 def cross(p,q,r):return (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])
 return cross(a,b,c)*cross(a,b,d)<0 and cross(c,d,a)*cross(c,d,b)<0
rows=[]
for p in read(D/'reference-holds-input.json'):
 id=p['id'];origin=p['origin'];snap=p['snap'];reason=[];near=b.nearest_edge(graph,*snap,1.5,grid);item={**p,'previous_status':p['status'],'resolved':False,'field_checked':False}
 if not near:reason.append('既存接続点に一致する道路線を今回の完全属性資料で特定できない')
 else:
  edge=e[near[0]];t=tags[edge[5]];item.update(walking_way=edge[5],walking_way_tags=t,walking_segment=[n[edge[0]],n[edge[1]]])
  if t.get('highway')!='footway' or t.get('footway')!='sidewalk':reason.append('接続先が明示された歩道ではなく、別道路・通路との接続根拠が必要')
  source=points[osm[id]['reference_id']] if id in osm else points[id];checks=[]
  for q in source['occurrences']:
   a,z=map(g.xy,q['road_segment']);v=g.sub(z,a);travel=g.sub(g.xy(q['travel_to']),g.xy(q['travel_from']))
   if g.dot(v,travel)<0:v=(-v[0],-v[1])
   c=g.xy(origin);s=g.xy(snap);left_o=(v[0]*(c[1]-a[1])-v[1]*(c[0]-a[0]))/g.norm(v);left_s=(v[0]*(s[1]-a[1])-v[1]*(s[0]-a[0]))/g.norm(v)
   w=g.sub(g.xy(n[edge[1]]),g.xy(n[edge[0]]));angle=math.degrees(math.acos(min(1,abs(g.dot(w,v))/(g.norm(w)*g.norm(v)))))
   checks.append({'road_way':q['way_id'],'origin_left_m':left_o,'snap_left_m':left_s,'parallel_angle_deg':angle,'trip_ids':q['trip_ids']})
   if left_o<3 or left_s<3:reason.append('原点と接続点が同じ乗車道路側と確認できない')
   if angle>20:reason.append('歩道線と乗車道路が平行20度以内にならない')
   if any(intersects(c,s,k['a'],k['b']) for k in g.nearby(c)):reason.append('原点と接続点を結ぶ区間が車道線を横切る')
  item['checks']=checks
  if not reason:
   # Inspect barrier/building geometries from retained complete OSM map responses.
   for name in regions:
    for f in (R/f'data-sources/{name}-20260915').glob('*.osm'):
     root=ET.parse(f).getroot();nodes={x.get('id'):[float(x.get('lon')),float(x.get('lat'))] for x in root.findall('node')}
     for way in root.findall('way'):
      tt={x.get('k'):x.get('v') for x in way.findall('tag')}
      if not (tt.get('barrier') not in [None,'kerb','bollard','cycle_barrier'] or tt.get('building') not in [None,'no','roof']):continue
      refs=[x.get('ref') for x in way.findall('nd')]
      for x,y in zip(refs,refs[1:]):
       if x in nodes and y in nodes and intersects(g.xy(origin),g.xy(snap),g.xy(nodes[x]),g.xy(nodes[y])):reason.append('接続区間が収録された障壁または建物境界と交差する')
   if not reason:item['resolved']=True;item['status']='同じ道路側の明示歩道との接続を机上確認・既存計算再利用'
 item['reasons']=sorted(set(reason)) or ['接続点は明示された歩道。全観測乗車経路で原点と同じ道路側、歩道は平行、接続区間の車道・収録障壁横断なし。既存30m以内の原点計算をそのまま再利用。現地通行状態は未確認。'];rows.append(item)
(D/'reference-connections-review.json').write_text(json.dumps({'summary':dict(collections.Counter(p['resolved'] for p in rows)),'points':rows},ensure_ascii=False,indent=2)+'\n');print('Resolved',[p['id'] for p in rows if p['resolved']])
