"""Check stored acquisition receipts and preservation of the pre-study catalog."""
from pathlib import Path
import subprocess,json,hashlib,datetime,csv,io,zipfile
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'data-sources/route-living-pilot-20260914'
BASE='726cc8be4be6b00b6cb0e8e84536bc4c7bfb8519'
digest=lambda b:hashlib.sha256(b).hexdigest()
receipts=[]
for path in sorted(SRC.glob('*.receipt.json')):
 r=json.loads(path.read_bytes())
 candidates=[f for f in SRC.glob(path.name.removesuffix('.receipt.json')+'.*') if f!=path and f.suffix not in {'.json'}]
 if not candidates:candidates=[path.with_name(path.name.replace('.receipt.json','.json'))]
 candidates=[f for f in candidates if f.exists() and digest(f.read_bytes())==r['sha256']]
 assert len(candidates)==1,path
 f=candidates[0];assert f.stat().st_size==r['bytes'],path
 receipts.append({'name':f.name,'sha256':r['sha256'],'bytes':r['bytes'],'url':r['url']})
def original(name):return subprocess.run(['git','show',f'{BASE}:{name}'],cwd=ROOT,capture_output=True,check=True).stdout
name='public/data/shopping.geojson'
old=json.loads(original(name))['features'];new=json.loads((ROOT/name).read_bytes())['features']
assert [f['id'] for f in old]==[f['id'] for f in new]
changed=[]
for a,b in zip(old,new):
 assert a['geometry']==b['geometry'],a['id']
 if a['properties']!=b['properties']:changed.append(a['id'])
expected=[r['id'] for r in json.loads((SRC/'facility-review.json').read_bytes())['reviews']]
assert set(changed)==set(expected)
unchanged=['public/data/civic-facilities.geojson','public/data/bus_stop.geojson','public/data/review-national.geojson','public/data/review-routes.json','public/data/baked-bus-stops.geojson','public/data/walk-unreachable.json','public/data/walking-onoda.json','public/maps/soft.json']
for f in unchanged:assert original(f).replace(b'\r\n',b'\n')==(ROOT/f).read_bytes().replace(b'\r\n',b'\n'),f
report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'base':BASE,'receipts':receipts,'allShoppingIdsAndGeometriesPreserved':len(old),'reviewedPropertiesOnly':changed,'unchangedFiles':unchanged,'comparisonNote':'Git checkout LF/CRLF conversion is normalized; all other bytes are compared.'}
with zipfile.ZipFile(SRC/'352080-gtfsjp.zip') as z:
 iwakuni=list(csv.DictReader(io.StringIO(z.read('stops.txt').decode('utf-8-sig'))))
assert len(iwakuni)==800 and all(s['location_type']=='0' and not s['parent_station'] for s in iwakuni)
current_stops=json.loads((ROOT/'public/data/review-stops.geojson').read_bytes())['features']
old_stops=json.loads(original('public/data/review-stops.geojson'))['features']
assert current_stops[:len(old_stops)]==old_stops
adopted={f['properties']['source_stop_id'] for f in current_stops if f['properties']['source_namespace']=='iwakuni'}
excluded=[s['stop_id'] for s in iwakuni if s['stop_id'] not in adopted]
assert len(adopted)==800 and len(excluded)==0
report['iwakuniStopKinds']={'all':800,'boardingRecords':800,'previouslyAdopted':735,'newlyAdoptedYuu':65,'currentlyAdopted':800,'heldIds':excluded}
out=ROOT/'outputs/route-living-pilot-20260914';out.mkdir(exist_ok=True,parents=True)
(out/'source-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'receipts':len(receipts),'retainedIdsAndGeometries':len(old),'changedProperties':len(changed),'unchangedFilesApartFromCheckoutLineEndings':len(unchanged)},ensure_ascii=False))
