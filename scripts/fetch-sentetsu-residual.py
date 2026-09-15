"""Read the operator-linked public passenger API, retaining every request and original ID."""
from pathlib import Path
import json,subprocess,hashlib,datetime,time,urllib.parse,shutil
R=Path(__file__).resolve().parents[1];D=R/'data-sources/sentetsu-v19-20260915';D.mkdir(exist_ok=True)
receipts=[]
def get(endpoint,params):
 key=endpoint+'?'+urllib.parse.urlencode(params);name=hashlib.sha256(key.encode()).hexdigest()[:20]+'.json';p=D/name;url='https://sentetsu.busplus.jp/api/'+endpoint+'.cgi'
 cached=p.exists()
 if not p.exists():
  subprocess.run(['curl','--fail','--silent','--show-error','--max-time','60','--data',urllib.parse.urlencode(params),url,'--output',str(p)],check=True);time.sleep(.3)
 data=json.loads(p.read_text());receipts.append({'endpoint':url,'method':'POST','purpose':'read-only public passenger information','parameters':params,'file':name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'recorded_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reused_cache':cached})
 (D/'receipts.json').write_text(json.dumps(receipts,ensure_ascii=False,indent=2)+'\n');return data
for src,name in [('/tmp/sennavi-guidance.html','official-link-page.html'),('/tmp/sentetsu-buslocation.html','official-route-map.html'),('/tmp/sentetsu-ichigo-stops.csv','official-map-stops.csv'),('/tmp/sentetsu-app.js','public-passenger-app.js'),('/tmp/sentetsu-allstops.json','all-stop-index.json')]:
 if not (D/name).exists():shutil.copy2(src,D/name)
trips={};details={};groups={}
for target in ['U1','S27']:
 for t in get('gettrips',{'pickup':'S17','dropoff':target,'date':'2026-09-15'})['trips']:trips[t['trip_id']]=t
# One date is a source observation for position/direction, not a claim about all operating days.
for tid,t in trips.items():
 d=get('tripdetail',{'trip_id':tid,'target_date':'2026-09-15'});assert d.get('ok');details[tid]=d['data']
 for p in d['data']:groups[p['busstop_id']]=p['stop_name']
 print('trip sections',len(details),flush=True)
stops={};boarding={}
for gid,name in groups.items():
 d=get('busstop',{'id':gid});assert d.get('ok');stops.update(d['stops'])
 for target in ['U1','S27']:
  if gid==target:continue
  data=get('gettrips',{'pickup':gid,'dropoff':target,'date':'2026-09-15'})
  for t in data.get('trips',[]):
   if t['trip_id'] not in details:continue
   id=t['pickup']['stop_id'];boarding.setdefault(id,[]).append(t)
 print('boarding group',gid,name,flush=True)
out={'scope':'公式せんナビで2026-09-15に公開された小野田線の原点・乗車可能な方面。全曜日・全路線網羅とはしない。','source_link':'https://www.sentetsu.jp/scheduled-bus/sennavi-guidance/','passenger_url':'https://sentetsu.busplus.jp/','stops':stops,'boarding':boarding,'trip_sections':details,'trip_headers':trips}
(D/'source-observation.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print('Originals',len(stops),'boarding observed',len(boarding),flush=True)
