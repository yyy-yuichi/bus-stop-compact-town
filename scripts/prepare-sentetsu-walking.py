"""Reuse v18 roads/DEM and add only sourced full road records around new points."""
from pathlib import Path
import json,urllib.parse,shutil
R=Path(__file__).resolve().parents[1];D=R/'data-sources/sentetsu-v19-20260915';W=R/'work/sentetsu-v19-20260915'
p=json.loads((R/'data-sources/residuals-v19-20260915/walking-road-overlay.json').read_text());ways={w['id']:w for w in p['ways']}
for e in json.loads((D/'carriageways-verified.json').read_text())['elements']:
 if e['type']=='node':p['nodes'][str(e['id'])]=[e['lon'],e['lat']]
 if e['type']=='way':ways[str(e['id'])]={'id':str(e['id']),'refs':[str(n) for n in e['nodes']],'tags':e['tags']}
for r in json.loads((D/'full-road-receipts.json').read_text()):
 if not r.get('error'):p['bboxes'].append([float(v) for v in urllib.parse.parse_qs(urllib.parse.urlparse(r['url']).query)['bbox'][0].split(',')])
p['ways']=list(ways.values());p['sources'].append(str((D/'carriageways-verified.json').relative_to(R)))
(D/'walking-road-overlay.json').write_text(json.dumps(p,ensure_ascii=False)+'\n');(W/'dem').mkdir(parents=True,exist_ok=True)
for file in (R/'work/prefecture-walking-20260915/dem').glob('*.gz'):
 if not (W/'dem'/file.name).exists():shutil.copy2(file,W/'dem'/file.name)
print('retained DEM',len(list((W/'dem').glob('*.gz'))))
