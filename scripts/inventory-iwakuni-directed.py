"""Compare separately fetched official GTFS to adopted IDs before any route audit."""
from pathlib import Path
import csv,io,json,zipfile,collections,hashlib,datetime,math
R=Path(__file__).resolve().parents[1];D=R/'data-sources/iwakuni-directed-20260915'
file=D/'official-20260327.zip'
with zipfile.ZipFile(file) as z:
 def table(n):return list(csv.DictReader(io.StringIO(z.read(n+'.txt').decode('utf-8-sig'))))
 stops={r['stop_id']:r for r in table('stops')};trips={r['trip_id']:r for r in table('trips')}
 times=table('stop_times');shapes=table('shapes')
features=json.loads((R/'public/data/review-stops.geojson').read_text())['features']
adopted=[f for f in features if f['properties']['source_namespace']=='iwakuni']
results=[];groups=collections.defaultdict(list)
for f in adopted:
 sid=f['properties']['source_stop_id'];s=stops.get(sid);coord=f['geometry']['coordinates']
 same=s is not None and coord==[float(s['stop_lon']),float(s['stop_lat'])]
 results.append({'id':'iwakuni:'+sid,'name':f['properties']['name'],'original_coordinates':coord,'official_id_coordinate_match':same})
 if same:groups[s['stop_name']].append(sid)
pairs=[]
for name,ids in groups.items():
 if len(ids)!=2:continue
 a,b=[stops[sid] for sid in ids]
 d=math.hypot((float(a['stop_lon'])-float(b['stop_lon']))*92300,(float(a['stop_lat'])-float(b['stop_lat']))*111320)
 pairs.append({'stop_name':name,'stop_ids':ids,'distance_m':round(d,1)})
seqs=collections.defaultdict(list)
for row in times:seqs[row['trip_id']].append(row)
for seq in seqs.values():seq.sort(key=lambda r:int(r['stop_sequence']))
patterns=collections.defaultdict(set)
for tid,seq in seqs.items():
 for i,r in enumerate(seq):
  if r.get('pickup_type')=='1':continue
  patterns[r['stop_id']].add((trips[tid].get('shape_id'),seq[i-1]['stop_id'] if i else None,seq[i+1]['stop_id'] if i+1<len(seq) else None))
for p in pairs:p['pattern_count']=sum(len(patterns[s]) for s in p['stop_ids'])
out={'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_url':'https://yamaguchi-opendata.jp/ckan/dataset/2dbaeb43-5134-4880-90a3-62870504f1d3/resource/bac76226-a946-466f-a94c-d61dcb6ab0dc/download/gtfs-jp2026-03-27_1458_.zip','sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'bytes':file.stat().st_size,
 'adopted_points':len(adopted),'official_points':len(stops),'id_coordinate_matches':sum(p['official_id_coordinate_match'] for p in results),'shape_count':len({r['shape_id'] for r in shapes}),'same_name_two_point_groups':len(pairs),'points':results,'pairs':sorted(pairs,key=lambda p:(p['pattern_count'],p['stop_name'])),'note':'ID・座標一致は乗り場の方向・道路側の確認ではない。由宇の未採用点は対象外。旧GTFSと同一ファイルとは主張しない。'}
(D/'inventory.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in out.items() if k not in ['points','pairs']},ensure_ascii=False))
print(json.dumps(out['pairs'][:25],ensure_ascii=False))
