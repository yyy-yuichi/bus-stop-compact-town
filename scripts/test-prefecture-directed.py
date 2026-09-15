"""Independent source and immutability checks for the prefecture expansion from accepted v17."""
from pathlib import Path
import collections,csv,hashlib,io,json,math,subprocess,zipfile
R=Path(__file__).resolve().parents[1];BASE='31fe20f6b13c161e3004ecd4f122746f042828b7'
def read(p):return json.loads((R/p).read_text())
def base(p):return subprocess.check_output(['git','show',BASE+':'+p],cwd=R)
old=json.loads(base('src/data/boarding-guide-study.json'));study=read('src/data/boarding-guide-study.json');index=read('src/data/boarding-walk-study/index.json')
changed=set();checked=0;new_confirmed=set()
for region,feed in [('iwakuni-batch02','iwakuni-directed-20260915/official-20260327.zip'),('iwakuni-remaining','iwakuni-directed-20260915/official-20260327.zip'),('hikari-remaining','hikari-pairs-20260915/originals/sources/hikari-gtfs.zip'),('jr-prefecture','jr-prefecture-20260915/official-current.zip')]:
 d=f'data-sources/{region}-20260915';ledger=read(d+'/ledger.json');points=[p for g in ledger['pairs'] for p in g['points']]
 assert ledger['summary']['confirmed_points']==sum(p['status']=='机上確認済み' for p in points)
 assert ledger['summary']['confirmed_pairs']+ledger['summary']['held_pairs']==len(ledger['pairs'])
 with zipfile.ZipFile(R/'data-sources'/feed) as z:
  rows=lambda n:list(csv.DictReader(io.StringIO(z.read(n+'.txt').decode('utf-8-sig'))))
  stops={r['stop_id']:r for r in rows('stops')};trips={r['trip_id']:r for r in rows('trips')};seqs=collections.defaultdict(list)
  for r in rows('stop_times'):seqs[r['trip_id']].append(r)
  for seq in seqs.values():seq.sort(key=lambda r:int(r['stop_sequence']))
 for p in points:
  changed.add(p['id']);source=stops[p['source_stop_id']]
  assert p['original_coordinates']==[float(source['stop_lon']),float(source['stop_lat'])]
  assert study['guides'][p['id']]['source_coordinates']==p['original_coordinates']
  assert (p['status']=='机上確認済み')==(bool(p['occurrences']) and all(e['status']=='整合' for e in p['occurrences']))
  if p['status']=='机上確認済み':new_confirmed.add(p['id'])
  for e in p['occurrences']:
   for tid in e['trip_ids']:
    seq=seqs[tid];matches=[i for i,r in enumerate(seq) if r['stop_id']==p['source_stop_id'] and int(r['stop_sequence'])==e['stop_sequence']];assert len(matches)==1
    i=matches[0];assert (seq[i-1]['stop_id'] if i else None)==e['previous_stop_id'];assert (seq[i+1]['stop_id'] if i+1<len(seq) else None)==e['next_stop_id']
    assert seq[i].get('pickup_type')!='1';assert trips[tid]['shape_id']==e['shape_id'];assert seq[i].get('stop_headsign')==e['stop_headsign']
   if e['status']=='整合':
    a,b=e['road_segment'];sx=111320*math.cos(math.radians(34));sy=111320
    dx,dy=(b[0]-a[0])*sx,(b[1]-a[1])*sy;tx,ty=(e['travel_to'][0]-e['travel_from'][0])*sx,(e['travel_to'][1]-e['travel_from'][1])*sy
    if dx*tx+dy*ty<0:dx,dy=-dx,-dy
    px,py=(p['original_coordinates'][0]-e['road_projection'][0])*sx,(p['original_coordinates'][1]-e['road_projection'][1])*sy
    assert abs((dx*py-dy*px)/math.hypot(dx,dy)-e['signed_left_m'])<.002
    assert e['signed_left_m']>=3 and e['point_road_distance_m']<=30
   checked+=1
for id,g in old['guides'].items():
 if id not in changed:assert study['guides'][id]==g,id
 else:
  assert study['guides'][id]['source_coordinates']==g['source_coordinates']
  assert study['guides'][id]['number']==g['number']
assert study['unlocated']==old['unlocated']
for p in old['hub_points']:assert p in study['hub_points']
oldindex=json.loads(base('src/data/boarding-walk-study/index.json'))
for id,e in oldindex['stops'].items():assert index['stops'][id]==e,id
preserved=0
tree=subprocess.check_output(['git','ls-tree','-r',BASE,'--','src/data/boarding-walk-study'],cwd=R,text=True)
for row in tree.splitlines():
 meta,path=row.split('\t');sha=meta.split()[2]
 if path.endswith('/index.json'):continue
 data=(R/path).read_bytes();assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==sha,path;preserved+=1
assert preserved==949
for p in read('data-sources/ube-official-maps-20260915/inventory.json')['points']:
 assert study['guides'][p['id']]['source_coordinates']==p['original_coordinates'];assert study['guides'][p['id']]['number'] is None;new_confirmed.add(p['id'])
osm={p['id']:p for p in read('public/data/bus_stop.geojson')['features']}
reference_ledgers={}
for p in read('data-sources/prefecture-directed-20260915/original-record-review.json')['points']:
 if p['status']=='机上確認済み':
  new_confirmed.add(p['id']);assert study['guides'][p['id']]['source_coordinates']==p['origin'];assert all(not e['reasons'] for e in p['geometry_checks'])
  assert osm[p['id']]['geometry']['coordinates']==p['origin']
  declared=osm[p['id']]['properties'].get('gtfs:stop_id','').split(';')
  if declared!=['']:assert p['reference_id'].split(':',1)[1] in declared
  path=p['reference_ledger']
  if path not in reference_ledgers:reference_ledgers[path]={q['id']:q for g in read(path)['pairs'] for q in g['points']}
  reference=reference_ledgers[path][p['reference_id']];assert reference['status']=='机上確認済み'
  for check in p['geometry_checks']:
   e=next(e for e in reference['occurrences'] if (e['route_id'],e['shape_id'],e['stop_sequence'])==(check['route_id'],check['shape_id'],check['stop_sequence']))
   sx=111320*math.cos(math.radians(34));sy=111320;a,b=e['road_segment'];dx,dy=(b[0]-a[0])*sx,(b[1]-a[1])*sy
   px,py=(p['origin'][0]-a[0])*sx,(p['origin'][1]-a[1])*sy
   tx,ty=(e['travel_to'][0]-e['travel_from'][0])*sx,(e['travel_to'][1]-e['travel_from'][1])*sy
   signed=(dx*py-dy*px)/math.hypot(dx,dy)*(1 if dx*tx+dy*ty>=0 else -1)
   assert signed>=3 and abs(signed-check['signed_left_m'])<.002
newfiles=[]
for id,e in index['stops'].items():
 if id in oldindex['stops']:continue
 assert id in new_confirmed,id
 if e.get('file'):
  c=read('src/data/boarding-walk-study/'+e['file']);assert c['id']==id and c['origin']==e['origin']==study['guides'][id]['source_coordinates'];assert c['gap']<=30;newfiles.append(e['file'])
result={'baseline':BASE,'official_occurrences_checked':checked,'old_walking_files_byte_identical':preserved,'old_index_entries_preserved':len(oldindex['stops']),'old_unrelated_guides_and_v15_corrections_preserved':True,'new_walks':len(newfiles),'browser_checked':False}
(R/'data-sources/prefecture-directed-20260915/source-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(result)
