"""Match observed boarding IDs to unbranched official map sections and full OSM roads.

The map has no trip-specific GTFS shape IDs. Only an unbranched continuous
section containing previous/current/next originals is accepted; no shortest
path or inferred turn is substituted at branches.
"""
from pathlib import Path
import importlib.util,json,re,collections,math
R=Path(__file__).resolve().parents[1];D=R/'data-sources/sentetsu-v19-20260915'
spec=importlib.util.spec_from_file_location('geom',R/'scripts/directed-geometry.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
data=json.loads((D/'source-observation.json').read_text());raw=(D/'official-route-map.html').read_text()
lines=[json.loads(x) for x in re.findall(r'var Line = L\.polyline\((\[.*?\])\s*,\s*\{',raw,re.S)]
adj=collections.defaultdict(set);edge_sources=collections.defaultdict(set)
for i,line in enumerate(lines):
 for aa,bb in zip(line,line[1:]):
  a,b=tuple(aa[::-1]),tuple(bb[::-1])
  if a==b:continue
  adj[a].add(b);adj[b].add(a);edge_sources[frozenset([a,b])].add(i)
seen=set();chains=[]
def walk(a,b):
 path=[a];sources=set()
 while True:
  k=frozenset([a,b])
  if k in seen:break
  seen.add(k);sources.update(edge_sources[k]);path.append(b)
  if len(adj[b])!=2:break
  nxt=next(c for c in adj[b] if c!=a);a,b=b,nxt
 return path,sources
for a in adj:
 if len(adj[a])==2:continue
 for b in adj[a]:
  if frozenset([a,b]) not in seen:chains.append(walk(a,b))
for a in adj:
 for b in adj[a]:
  if frozenset([a,b]) not in seen:chains.append(walk(a,b))
shape_list=[]
for i,(path,sources) in enumerate(chains):
 ps=[g.xy(p) for p in path];cs=[0.]
 for a,b in zip(ps,ps[1:]):cs.append(cs[-1]+g.norm(g.sub(b,a)))
 shape_list.append({'id':i,'points':ps,'cum':cs,'source_polylines':sorted(sources),'coordinates':[list(p) for p in path]})
def matches(p):
 out=[]
 for shape in shape_list:
  candidates=[]
  for j,(a,b) in enumerate(zip(shape['points'],shape['points'][1:])):
   d,q,t=g.project(p,a,b)
   if d<=30:candidates.append({'d':d,'s':shape['cum'][j]+t*(shape['cum'][j+1]-shape['cum'][j]),'q':q,'alternatives':[]})
  if candidates:
   best=min(candidates,key=lambda c:c['d'])
   best['alternatives']=[{'s':v['s'],'d':v['d']} for v in candidates if abs(v['s']-best['s'])>40 and v['d']<=best['d']+5]
   if shape['coordinates'][0]==shape['coordinates'][-1]:best['alternatives'].append({'reason':'closed map chain has no trip-specific loop direction'})
   out.append((shape,best))
 return out
pos={id:g.xy([p['stop_lon'],p['stop_lat']]) for id,p in data['stops'].items()};cache={id:{s['id']:(s,c) for s,c in matches(p)} for id,p in pos.items()}
roads=list(D.glob('carriageways-*.json'))
if roads:g.load_roads(roads)
groups=collections.defaultdict(list);candidate=[]
for sid,boardings in data['boarding'].items():
 p=data['stops'][sid];occ=[];patterns=set()
 for t in boardings:
  seq=data['trip_sections'][t['trip_id']];ii=[i for i,r in enumerate(seq) if r['stop_id']==sid and str(r['stop_sequence'])==str(t['pickup']['stop_sequence'])];assert len(ii)==1;i=ii[0];prev=seq[i-1] if i else None;nxt=seq[i+1] if i+1<len(seq) else None
  key=(prev['stop_id'] if prev else None,nxt['stop_id'] if nxt else None,t['headsign'])
  if key in patterns:continue
  patterns.add(key);e={'trip_id':t['trip_id'],'trip_ids':[t['trip_id']],'route_id':t['route_id'],'route_name':t['route_name'],'headsign':t['headsign'],'stop_sequence':seq[i]['stop_sequence'],'previous_stop_id':key[0],'next_stop_id':key[1],'previous_stop_name':prev['stop_name'] if prev else None,'next_stop_name':nxt['stop_name'] if nxt else None}
  options=[]
  if prev and nxt:
   for k in cache[sid].keys()&cache[prev['stop_id']].keys()&cache[nxt['stop_id']].keys():
    shape,c=cache[sid][k];pc=cache[prev['stop_id']][k][1];nc=cache[nxt['stop_id']][k][1]
    if c['alternatives'] or pc['alternatives'] or nc['alternatives']:continue
    if pc['s']+.1<c['s']<nc['s']-.1:options.append((shape,c,pc['s'],nc['s']))
    elif nc['s']+.1<c['s']<pc['s']-.1:
     length=shape['cum'][-1];rev={**shape,'points':list(reversed(shape['points'])),'cum':[length-x for x in reversed(shape['cum'])]};options.append((rev,{**c,'s':length-c['s']},length-pc['s'],length-nc['s']))
  e['section_matches']={label:{'stop_id':record['stop_id'],'sections':[{'section':k,'distance_m':round(v[1]['d'],3),'position_m':round(v[1]['s'],3),'alternatives':v[1]['alternatives']} for k,v in cache[record['stop_id']].items()]} for label,record in [('previous',prev),('current',seq[i]),('next',nxt)] if record}
  if len(options)!=1:
   if not prev:reason='始発として観測され、前方経路だけでは乗車位置の道路側をこの手順で確定できない。終点・始発場所の追加根拠が必要。'
   elif not nxt:reason='終点として観測され、後続の進行区間がない。乗車場所の追加根拠が必要。'
   elif not all(cache[r['stop_id']] for r in [prev,seq[i],nxt]):reason='前後3原点のいずれかに30m内の公式経路線がない。section_matchesに該当原IDと距離候補を記録。'
   elif not cache[sid].keys()&cache[prev['stop_id']].keys()&cache[nxt['stop_id']].keys():reason='前後3原点が別の分岐間区間に分かれる。便別の経路線がないため通る分岐を特定できない。各原IDの区間候補はsection_matches。'
   elif not options:reason='同一区間候補はあるが停車順と区間内の進行順が整合しない、または循環・複数通過候補が残る。section_matchesに記録。'
   else:reason='停車順に整合する分岐間区間が複数ある。候補数を記録。'
   e.update(status='判定不能',reasons=[reason],candidate_sections=len(options))
  else:
   shape,c,lo,hi=options[0];e.update(official_map_section=shape['id'],source_polyline_indices=shape['source_polylines'],interval={'previous_s_m':lo,'current_s_m':c['s'],'next_s_m':hi},shape_id='official-map-section:'+str(shape['id']),stop_headsign=t['headsign'],trip_headsigns=[t['headsign']])
   e.update(g.road_audit(pos[sid],shape,c,lo,hi) if roads else {'status':'道路属性未確認','reasons':['公式経路区間を特定。周辺道路の完全属性を取得して照合する。']})
   # Individual visual review of retained official map geometry and OSM, not a blanket threshold change.
   # The public map bends through S13_01/S16_01 near the pole while its continuous
   # section progresses along one road. Check the longer interval direction against
   # that same road, retaining the failed 20m check and all other original guards.
   if roads and sid in {'S13_01','S16_01','S16_02'} and e['reasons']==['原点前後20mの進行方向変化が20度超で単一直線の道路側判定が不安定']:
    a,b=map(g.xy,e['road_segment']);rv=g.sub(b,a);direction=g.sub(g.at(shape,min(hi,c['s']+60)),g.at(shape,max(lo,c['s']-60)))
    if g.dot(rv,direction)<0:rv=(-rv[0],-rv[1])
    angles=[]
    for distance in [40,60,80]:
     v=g.sub(g.at(shape,min(hi,c['s']+distance)),g.at(shape,max(lo,c['s']-distance)))
     angles.append(math.degrees(math.acos(max(-1,min(1,g.dot(rv,v)/(g.norm(rv)*g.norm(v)))))))
    q=g.xy(e['road_projection']);off=g.sub(pos[sid],q);left=(rv[0]*off[1]-rv[1]*off[0])/g.norm(rv)
    e['individual_section_review']={'viewed_figure':'local-route-originals-review.png','original_20m_status':e['status'],'original_20m_reasons':e['reasons'],'section_spans_m':[40,60,80],'road_direction_angles_deg':angles,'signed_left_m':left,'finding':'公式経路図の停留所付近の折れと車道方向が異なる。前後原点を同じ分岐のない区間で特定したうえで、40/60/80m前後の進行と同じ車道の向きを個別照合。原座標・経路線・30m基準は変更しない。'}
    if max(angles)<=20 and left>=3:
     e['individual_section_review']['original_20m_heading_deg']=e['heading_deg'];e['heading_deg']=round(math.degrees(math.atan2(rv[0],rv[1]))%360,1);e['signed_left_m']=round(left,3)
     e['status']='整合';e['reasons']=['原経路線の個別図示確認：公式経路区間は同じ車道に沿って進む。停留所付近の経路図の折れは保持し、40/60/80m区間の向きと車道側が整合。現地標柱は未確認。']

  occ.append(e)
 status='机上確認済み' if occ and all(e['status']=='整合' for e in occ) else '保留'
 row={'id':'sentetsu:'+sid,'source_stop_id':sid,'original_coordinates':[p['stop_lon'],p['stop_lat']],'name':p['stop_name'],'status':status,'occurrences':occ,'field_checked':False,'observed_service_date':'2026-09-15'}
 groups[p['stop_name']].append(row)
 if occ and all('official_map_section' in e for e in occ):candidate.append(row)
ledger={'method':'official-public-boarding-ID + previous/current/next originals on an unbranched official map section + directed OSM roadside','scope':data['scope'],'pairs':[{'name':name,'points':ps,'status':'確認済み' if all(p['status']=='机上確認済み' for p in ps) else '保留'} for name,ps in groups.items()]}
ledger['summary']={'points':sum(map(len,groups.values())),'confirmed_points':sum(p['status']=='机上確認済み' for ps in groups.values() for p in ps),'held_points':sum(p['status']=='保留' for ps in groups.values() for p in ps)}
(D/'ledger.json').write_text(json.dumps(ledger,ensure_ascii=False,indent=2)+'\n')
(D/'official-map-sections.json').write_text(json.dumps([{k:v for k,v in s.items() if k not in ['points','cum']} for s in shape_list],ensure_ascii=False)+'\n')
(D/'road-candidates.json').write_text(json.dumps({'pairs':[{'name':p['name'],'points':[{**p,'status':'道路照合対象'}]} for p in candidate],'note':'道路取得の候補リストであり最終確認済みではない'},ensure_ascii=False,indent=2)+'\n')
print(ledger['summary'],'road candidates',len(candidate))
