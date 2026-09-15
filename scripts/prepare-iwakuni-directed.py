"""Small first regional batch; do not treat all 735 originals as confirmed."""
from pathlib import Path
import json,urllib.request,urllib.parse,hashlib,datetime,sys,xml.etree.ElementTree as ET
R=Path(__file__).resolve().parents[1];D=R/'data-sources/iwakuni-directed-20260915'
data=json.loads((D/'inventory.json').read_text())
names={'南岩国駅','尾津','東洋紡','愛宕供用会館','寿橋'}
pairs=[p for p in data['pairs'] if p['stop_name'] in names]
if '--next-batch' in sys.argv:
 prior={p['name'] for p in json.loads((D/'ledger.json').read_text())['pairs']}
 pairs=[p for p in data['pairs'] if p['stop_name'] not in prior and p['pattern_count']>=2][:30]
 D=R/'data-sources/iwakuni-batch02-20260915';D.mkdir(exist_ok=True)
 names={p['stop_name'] for p in pairs}
 clock=D/'timing.json'
 if not clock.exists():clock.write_text(json.dumps({'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope_points':60,'note':'対象選定から保存までの経過時間。冒頭の環境確認は含まない。'},ensure_ascii=False,indent=2)+'\n')
 assert len(pairs)==30
else:assert len(pairs)==5
points={p['id'].split(':',1)[1]:p for p in data['points']}
assert all(points[s]['official_id_coordinate_match'] for p in pairs for s in p['stop_ids'])
(D/'selected-pairs.json').write_text(json.dumps(pairs,ensure_ascii=False,indent=2)+'\n')
file=D/'carriageways-first.json'
if file.exists():print('reuse roads');raise SystemExit
boxes=[]
for p in pairs:
 cs=[points[s]['original_coordinates'] for s in p['stop_ids']]
 boxes.append([min(c[1] for c in cs)-.0012,min(c[0] for c in cs)-.0015,max(c[1] for c in cs)+.0012,max(c[0] for c in cs)+.0015])
query='[out:json][timeout:45];('+''.join('way["highway"]('+','.join(map(str,b))+');' for b in boxes)+');(._;>;);out body;'
(D/'carriageways-first.overpass').write_text(query)
url='https://overpass-api.de/api/interpreter'
if '--map-api' in sys.argv:
 elements={};receipts=[]
 for p,b in zip(pairs,boxes):
  source=D/('map-'+p['stop_ids'][0]+'.osm')
  mapurl='https://api.openstreetmap.org/api/0.6/map?bbox='+','.join(map(str,[b[1],b[0],b[3],b[2]]))
  if not source.exists():
   with urllib.request.urlopen(mapurl,timeout=45) as response:source.write_bytes(response.read())
  payload=source.read_bytes()
  for e in ET.fromstring(payload):
   if e.tag not in ['node','way']:continue
   tags={t.get('k'):t.get('v') for t in e.findall('tag')}
   if e.tag=='way' and 'highway' not in tags:continue
   x={'type':e.tag,'id':int(e.get('id')),'tags':tags}
   if e.tag=='node':x.update(lon=float(e.get('lon')),lat=float(e.get('lat')))
   else:x['nodes']=[int(n.get('ref')) for n in e.findall('nd')]
   elements[e.tag,e.get('id')]=x
  receipts.append({'file':source.name,'url':mapurl,'sha256':hashlib.sha256(payload).hexdigest(),'bytes':len(payload)})
  print('map fetched',p['stop_name'],len(payload),flush=True)
 (D/'map-receipts.json').write_text(json.dumps(receipts,ensure_ascii=False,indent=2)+'\n')
 raw=json.dumps({'elements':list(elements.values())},ensure_ascii=False).encode()
 url='OpenStreetMap public map API; URLs in map-receipts.json'
else:
 with urllib.request.urlopen(url+'?'+urllib.parse.urlencode({'data':query}),timeout=55) as response:raw=response.read()
payload=json.loads(raw)
if payload.get('remark'):raise RuntimeError(payload['remark'])
file.write_bytes(raw)
(D/'carriageways-first-receipt.json').write_text(json.dumps({'url':url,'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'query_file':'carriageways-first.overpass','pair_names':sorted(names),'bboxes':boxes},ensure_ascii=False,indent=2)+'\n')
print(len(raw),len(payload['elements']))
