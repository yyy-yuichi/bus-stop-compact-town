"""Fetch complete highway tags for provisionally consistent originals, with receipts."""
from pathlib import Path
import argparse,datetime,hashlib,json,urllib.request,urllib.parse,xml.etree.ElementTree as ET
p=argparse.ArgumentParser();p.add_argument('directory',type=Path);p.add_argument('--input-ledger',default='ledger.json');p.add_argument('--candidate-status',default='机上確認済み');args=p.parse_args();D=args.directory
data=json.loads((D/args.input_ledger).read_text());elements={};receipts=[]
verified=D/'carriageways-verified.json'
if verified.exists():
 for e in json.loads(verified.read_text())['elements']:elements[e['type'],str(e['id'])]=e
prior_receipts=D/'full-road-receipts.json'
if prior_receipts.exists():receipts=json.loads(prior_receipts.read_text())
for group in data['pairs']:
 points=[p for p in group['points'] if p['status']==args.candidate_status]
 if not points:continue
 coords=[p['original_coordinates'] for p in points]
 # Small individual boxes avoid requesting long stretches between same-name distant stops.
 for point in points:
  sid=point['source_stop_id'];x,y=point['original_coordinates'];source=D/('full-road-'+hashlib.sha256(sid.encode()).hexdigest()[:16]+'.osm')
  url='https://api.openstreetmap.org/api/0.6/map?bbox='+','.join(map(str,[x-.0015,y-.0012,x+.0015,y+.0012]))
  reused_from=None
  if not source.exists():
   for receipt in receipts:
    box=urllib.parse.parse_qs(urllib.parse.urlparse(receipt.get('url','')).query).get('bbox')
    if not box or not receipt.get('file') or receipt.get('error'):continue
    a,b,c,d=map(float,box[0].split(','))
    if a<=x-60/92300 and b<=y-60/111320 and c>=x+60/92300 and d>=y+60/111320:
     source=D/receipt['file'];url=receipt['url'];reused_from=receipt['id'];break
  try:
   if not source.exists():
    with urllib.request.urlopen(url,timeout=45) as response:source.write_bytes(response.read())
   raw=source.read_bytes();tree=ET.fromstring(raw)
  except Exception as e:
   receipts.append({'id':point['id'],'url':url,'error':str(e)});continue
  for e in tree:
   if e.tag not in ['node','way']:continue
   tags={t.get('k'):t.get('v') for t in e.findall('tag')}
   if e.tag=='way' and 'highway' not in tags:continue
   out={'type':e.tag,'id':int(e.get('id')),'tags':tags}
   if e.tag=='node':out.update(lon=float(e.get('lon')),lat=float(e.get('lat')))
   else:out['nodes']=[int(n.get('ref')) for n in e.findall('nd')]
   elements[e.tag,e.get('id')]=out
  receipts=[r for r in receipts if r['id']!=point['id']]
  receipts.append({'id':point['id'],'url':url,'file':source.name,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'recorded_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reused_from':reused_from,'reuse_required_source_margin_m':60 if reused_from else None})
  print(point['id'],len(raw),flush=True)
  (D/'full-road-receipts.json').write_text(json.dumps(receipts,ensure_ascii=False,indent=2)+'\n')
(D/'carriageways-verified.json').write_text(json.dumps({'elements':list(elements.values())},ensure_ascii=False)+'\n')
