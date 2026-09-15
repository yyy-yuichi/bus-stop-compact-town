"""Keep official JR originals independent; select municipalities by official polygons."""
from pathlib import Path
import collections,csv,datetime,hashlib,io,json,runpy,zipfile
R=Path(__file__).resolve().parents[1];D=R/'data-sources/jr-prefecture-20260915';D.mkdir(exist_ok=True)
ctx=runpy.run_path(str(R/'scripts/inventory-prefecture.py'));city=ctx['city']
raw=(Path('/tmp/jr-chugoku-current.zip') if Path('/tmp/jr-chugoku-current.zip').exists() else D/'official-current.zip').read_bytes();(D/'official-current.zip').write_bytes(raw)
z=zipfile.ZipFile(io.BytesIO(raw))
def rows(n):return list(csv.DictReader(io.StringIO(z.read(n+'.txt').decode('utf-8-sig'))))
directions={r['stop_id']:r['direction'] for r in rows('stops_direction')}
groups=collections.defaultdict(list);points=[]
for s in rows('stops'):
 p=[float(s['stop_lon']),float(s['stop_lat'])];municipality=city(p)
 if municipality=='市町境界対応保留':continue
 points.append({'id':'jr-chugoku:'+s['stop_id'],'source_stop_id':s['stop_id'],'name':s['stop_name'],'original_coordinates':p,'city':municipality,'official_direction':directions.get(s['stop_id']),'original':s})
 groups[s['stop_name']].append(s['stop_id'])
(D/'inventory.json').write_text(json.dumps({'source_url':'https://ajt-mobusta-gtfs.mcapps.jp/static/15/current_data.zip','distribution_page':'https://www.bus-kyo.or.jp/gtfs-open-data/gtfs-jp-ダウンロード','retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sha256':hashlib.sha256(raw).hexdigest(),'feed_info':rows('feed_info'),'cities':dict(collections.Counter(p['city'] for p in points)),'points':points},ensure_ascii=False,indent=2)+'\n')
(D/'selected-pairs.json').write_text(json.dumps([{'stop_name':n,'stop_ids':ids,'distance_m':None} for n,ids in groups.items()],ensure_ascii=False,indent=2)+'\n')
road=json.loads((R/'raw_data/yamaguchi-roads.json').read_text());grid=collections.defaultdict(list)
for p in points:
 x,y=p['original_coordinates'];grid[int(x*500),int(y*500)].append((x,y))
def wanted(p):
 x,y=p[:2];gx,gy=int(x*500),int(y*500)
 return any(abs(x-a)<.0015 and abs(y-b)<.0012 for xx in range(gx-1,gx+2) for yy in range(gy-1,gy+2) for a,b in grid[xx,yy])
es=[];ns=set()
for w in road['ways']:
 if any(n in road['nodes'] and wanted(road['nodes'][n]) for n in w['refs']):
  ns.update(w['refs']);es.append({'type':'way','id':int(w['id']),'nodes':[int(n) for n in w['refs']],'tags':w['tags']})
es.extend({'type':'node','id':int(n),'lon':road['nodes'][n][0],'lat':road['nodes'][n][1]} for n in ns if n in road['nodes'])
(D/'carriageways-reused.json').write_text(json.dumps({'elements':es})+'\n')
print('JR',len(points),dict(collections.Counter(p['city'] for p in points)))
