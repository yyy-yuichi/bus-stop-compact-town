"""Inventory independent source records by official 2026 municipal polygons; no origin edits."""
from pathlib import Path
import json,zipfile,hashlib,collections,datetime
R=Path(__file__).resolve().parents[1];D=R/'data-sources/prefecture-directed-20260915';D.mkdir(exist_ok=True)
zpath=Path('/tmp/yamaguchi-boundary-2026.zip')
if zpath.exists():
 with zipfile.ZipFile(zpath) as z:raw=z.read('N03-20260101_35.geojson')
else:raw=(D/'municipal-boundaries.geojson').read_bytes()
(D/'municipal-boundaries.geojson').write_bytes(raw)
bound=json.loads(raw);polys=[]
for f in bound['features']:
 for rings in ([f['geometry']['coordinates']] if f['geometry']['type']=='Polygon' else f['geometry']['coordinates']):
  outer=rings[0];box=[min(p[0] for p in outer),min(p[1] for p in outer),max(p[0] for p in outer),max(p[1] for p in outer)]
  polys.append((f['properties']['N03_004'],box,rings))
def inring(x,y,ring):
 inside=False
 for a,b in zip(ring,ring[1:]+ring[:1]):
  if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:inside=not inside
 return inside
def city(p):
 x,y=p;names=set()
 for name,b,rings in polys:
  if b[0]<=x<=b[2] and b[1]<=y<=b[3] and inring(x,y,rings[0]) and not any(inring(x,y,h) for h in rings[1:]):names.add(name)
 return next(iter(names)) if len(names)==1 else '市町境界対応保留'
study=json.loads((R/'src/data/boarding-guide-study.json').read_text());sources={}
for file,kind in [('review-national.geojson','national-representative'),('review-stops.geojson','official-gtfs'),('bus_stop.geojson','osm-original')]:
 for f in json.loads((R/'public/data'/file).read_text())['features']:
  id=str(f['id']);p=f['properties'];coord=f['geometry']['coordinates']
  sources[id]={'id':id,'name':p.get('name'),'origin':coord,'city':city(coord),'source_kind':kind,'source_file':'public/data/'+file,'operator':p.get('operator'),'routes':p.get('routes') or p.get('route_ids',[])}
for p in study['hub_points']:
 id=p['id']
 if id not in sources:
  coord=p.get('coordinates') or p.get('geometry',{}).get('coordinates')
  sources[id]={'id':id,'name':p.get('name') or p.get('properties',{}).get('name'),'origin':coord,'city':city(coord),'source_kind':'independent-hub','source_file':'src/data/boarding-guide-study.json'}
review_file=D/'original-record-review.json'
record_reviews={p['id']:p for p in json.loads(review_file.read_text())['points']} if review_file.exists() else {}
for id,p in sources.items():
 g=study['guides'].get(id)
 p['status']='未処理';p['guide_present']=g is not None
 if g and g.get('roadside_review'):p['status']='机上確認済み' if g['roadside_review']['status']=='confirmed' else '保留';p['reason']=g['roadside_review']['reason']
 elif g and (g.get('assignment_hold') or g.get('review')):p['status']='保留';p['reason']=g.get('location_description')
 elif g and g.get('evidence') in ['official-platform-coordinate','official-diagram-and-osm']:p['status']='既存公式案内確認';p['reason']=g.get('location_description')
 elif id in record_reviews:
  review=record_reviews[id]
  assert review['origin']==p['origin'],id
  p['status']=review['status'];p['reason']=review['reason'];p['review_file']='data-sources/prefecture-directed-20260915/original-record-review.json'
 summary=None
cities=sorted({p[0] for p in polys});rows=[]
for name in cities+['市町境界対応保留']:
 ps=[p for p in sources.values() if p['city']==name]
 rows.append({'city':name,'source_records':len(ps),'sources':dict(collections.Counter(p['source_kind'] for p in ps)),'states':dict(collections.Counter(p['status'] for p in ps))})
out={'generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'boundary_source':'https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2026/N03-20260101_35_GML.zip','boundary_sha256':hashlib.sha256(raw).hexdigest(),'boundary_zip_sha256':hashlib.sha256(zpath.read_bytes()).hexdigest() if zpath.exists() else None,'municipalities':len(cities),'unique_source_ids':len(sources),'note':'出典をまたぐ近接・同名統合なし。現存乗り場数ではなく保有原ID数。境界外は最近傍市町へ割当しない。','cities':rows,'points':list(sources.values())}
(D/'inventory.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(rows,ensure_ascii=False,indent=2));print('TOTAL',len(sources))
