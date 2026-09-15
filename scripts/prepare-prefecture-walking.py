"""Collect only confirmed NEW origins and full highway overlays; preserve existing results."""
from pathlib import Path
import json,urllib.parse
R=Path(__file__).resolve().parents[1];D=R/'data-sources/prefecture-directed-20260915';nodes={};ways={};boxes=[];sources=[]
for region in ['iwakuni-batch02','iwakuni-remaining','hikari-remaining','jr-prefecture','ube-official-maps']:
 directory=R/f'data-sources/{region}-20260915'
 receipts=directory/('map-receipts.json' if region=='iwakuni-batch02' else 'full-road-receipts.json')
 if receipts.exists():
  for r in json.loads(receipts.read_text()):
   if r.get('error'):continue
   b=urllib.parse.parse_qs(urllib.parse.urlparse(r['url']).query).get('bbox')
   if b:boxes.append([float(n) for n in b[0].split(',')])
 file=directory/('carriageways-first.json' if region=='iwakuni-batch02' else 'carriageways-verified.json')
 if not file.exists():raise FileNotFoundError(file)
 sources.append(str(file.relative_to(R)))
 for e in json.loads(file.read_text())['elements']:
  if e['type']=='node':nodes[str(e['id'])]=[e['lon'],e['lat']]
  elif e['type']=='way':ways[str(e['id'])]={'id':str(e['id']),'refs':[str(n) for n in e['nodes']],'tags':e['tags']}
index=json.loads((R/'src/data/boarding-walk-study/index.json').read_text())['stops'];targets=[]
for file in [R/'data-sources/jr-prefecture-20260915/confirmed-walking-targets.json',R/'data-sources/ube-official-maps-20260915/confirmed-walking-targets.json',D/'confirmed-osm-walking-targets.json']:
 targets.extend(p for p in json.loads(file.read_text()) if p not in index)
(D/'new-walking-targets.json').write_text(json.dumps(targets,ensure_ascii=False,indent=2)+'\n')
(D/'walking-road-overlay.json').write_text(json.dumps({'nodes':nodes,'ways':list(ways.values()),'bboxes':boxes,'sources':sources},ensure_ascii=False)+'\n')
print('New confirmed walking targets',len(targets),'overlay ways',len(ways))
