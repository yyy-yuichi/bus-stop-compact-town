"""Prepare every remaining adopted GTFS original, reusing source roads and prior audits."""
from pathlib import Path
import collections,json,hashlib,math
R=Path(__file__).resolve().parents[1]
read=lambda p:json.loads(p.read_text())
study=read(R/'src/data/boarding-guide-study.json');features=read(R/'public/data/review-stops.geojson')['features']
roads=read(R/'raw_data/yamaguchi-roads.json')
for region in ['iwakuni','hikari']:
 D=R/f'data-sources/{region}-remaining-20260915';D.mkdir(exist_ok=True)
 targets=[f for f in features if f['properties']['source_namespace']==region and not study['guides'][f['id']].get('roadside_review')]
 groups=collections.defaultdict(list)
 for f in targets:groups[f['properties']['name']].append(f)
 pairs=[{'stop_name':name,'stop_ids':[f['properties']['source_stop_id'] for f in fs],'distance_m':max([math.hypot((a['geometry']['coordinates'][0]-b['geometry']['coordinates'][0])*92300,(a['geometry']['coordinates'][1]-b['geometry']['coordinates'][1])*111320) for a in fs for b in fs] or [0])} for name,fs in groups.items()]
 (D/'selected-pairs.json').write_text(json.dumps(pairs,ensure_ascii=False,indent=2)+'\n')
 # Source-road geometry is usable evidence, but its WALK extraction omits trunk and vehicle restrictions.
 # Preserve that limitation per source; full-road supplements replace matching IDs where already available.
 grid=collections.defaultdict(list)
 for f in targets:
  x,y=f['geometry']['coordinates'];grid[int(x*500),int(y*500)].append((x,y))
 def wanted(p):
  x,y=p[:2];gx,gy=int(x*500),int(y*500)
  return any(abs(x-a)<=.0015 and abs(y-b)<=.0012 for xx in range(gx-1,gx+2) for yy in range(gy-1,gy+2) for a,b in grid[xx,yy])
 ways={};nodes={}
 for w in roads['ways']:
  if not any(n in roads['nodes'] and wanted(roads['nodes'][n]) for n in w['refs']):continue
  ways[str(w['id'])]={'type':'way','id':int(w['id']),'nodes':[int(n) for n in w['refs']],'tags':w['tags']}
  for n in w['refs']:
   if n in roads['nodes']:p=roads['nodes'][n];nodes[str(n)]={'type':'node','id':int(n),'lon':p[0],'lat':p[1]}
 reused=[]
 for parent in ['hikari-directed-20260915','iwakuni-directed-20260915','iwakuni-batch02-20260915']:
  for f in (R/'data-sources'/parent).glob('carriageways-*.json'):
   if f.name.endswith('-receipt.json'):continue
   payload=read(f);reused.append(str(f.relative_to(R)))
   for e in payload['elements']:
    if e['type']=='node':nodes[str(e['id'])]=e
    elif e['type']=='way':ways[str(e['id'])]=e
 payload={'elements':list(nodes.values())+list(ways.values())}
 (D/'carriageways-reused.json').write_text(json.dumps(payload,ensure_ascii=False)+'\n')
 (D/'source-receipt.json').write_text(json.dumps({'target_points':len(targets),'source_path':'raw_data/yamaguchi-roads.json','sha256':hashlib.sha256((R/'raw_data/yamaguchi-roads.json').read_bytes()).hexdigest(),'reused_full_road_supplements':reused,'limitations':'Original road extraction excludes some trunk roads and vehicle one-way tags. A missing candidate is not proof of absent road; no restriction is inferred from absent tags. New candidates require targeted full-road follow-up.','excluded_previously_reviewed':True},ensure_ascii=False,indent=2)+'\n')
 print(region,len(targets),len(groups),len(ways),flush=True)
