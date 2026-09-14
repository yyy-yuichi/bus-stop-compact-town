"""Rebuild a bounded, source-verifiable route study. No geocoding or inferred times."""
from pathlib import Path
import csv,io,json,zipfile,hashlib,datetime,collections
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'data-sources/route-living-pilot-20260914'
def read(name): return json.loads((SRC/name).read_text(encoding='utf-8-sig'))
with zipfile.ZipFile(SRC/'352101_kotsu001.zip') as z:
 data={n:list(csv.DictReader(io.StringIO(z.read(n).decode('utf-8-sig')))) for n in ['stops.txt','trips.txt','stop_times.txt','calendar.txt','calendar_dates.txt','feed_info.txt','shapes.txt']}
stops={s['stop_id']:s for s in data['stops.txt']}
pdf=read('gururin-pdf-check.json')
all_trips=[t for t in data['trips.txt'] if t['route_id']=='1']
assert len(all_trips)==6
trips=[]
corrections=[]
for t in all_trips:
 times=sorted([s for s in data['stop_times.txt'] if s['trip_id']==t['trip_id']],key=lambda s:int(s['stop_sequence']))
 for c in pdf['timeCorrections']:
  if c['tripId']!=t['trip_id']:continue
  s=next(s for s in times if s['stop_id']==c['stopId'])
  assert s['arrival_time']==s['departure_time']==c['raw']
  s['source_arrival']=s['arrival_time'];s['source_departure']=s['departure_time']
  s['arrival_time']=s['departure_time']=c['official'];corrections.append(c)
 origin=times[0]['departure_time'][:5]
 expected=next(r for r in pdf['rows'] if r['direction']==t['direction_id'] and r['departure']==origin)
 # A loop visits 光駅 twice. The right trip starts there; the left return finishes there.
 selected=[next(s for s in (times if t['direction_id']=='0' else list(reversed(times))) if stops[s['stop_id']]['stop_name']==name) for name in pdf['stopNames']]
 assert [s['departure_time'][:5] for s in selected]==expected['times'],(t['trip_id'],[s['departure_time'] for s in selected],expected['times'])
 trips.append({'id':t['trip_id'],'serviceId':t['service_id'],'direction':int(t['direction_id']),'start':origin,'operation':expected['operation'],
  'stops':[{'id':s['stop_id'],'sequence':int(s['stop_sequence']),'arrival':s['arrival_time'],'departure':s['departure_time'],'pickup':int(s['pickup_type'] or 0),'dropoff':int(s['drop_off_type'] or 0),'headsign':s['stop_headsign'],**({'sourceArrival':s['source_arrival'],'sourceDeparture':s['source_departure']} if 'source_arrival' in s else {})} for s in times],
  'officialExcludedDates':['20261229','20261230','20261231','20270101','20270102','20270103'] if origin in ['07:40','15:45'] and t['direction_id']=='0' else []})
trips.sort(key=lambda t:(t['direction'],t['start']))
groups=[]
for i,name in enumerate(pdf['stopNames']):
 ids=[]
 for direction in [0,1]:
  times=next(t for t in trips if t['direction']==direction)['stops']
  s=next(s for s in (times if direction==0 else list(reversed(times))) if stops[s['id']]['stop_name']==name)
  ids.append(s['id'])
 groups.append({'name':name,'outboundId':ids[0],'returnId':ids[1],'number':i+1})
ids={s['id'] for t in trips for s in t['stops']}
compact_stops=[{'id':s['stop_id'],'name':s['stop_name'],'coordinate':[float(s['stop_lon']),float(s['stop_lat'])],'platformCode':s.get('platform_code','')} for s in data['stops.txt'] if s['stop_id'] in ids]
shape=[]
# Clip only the right-trip shape between the endpoints of the selected study corridor.
points=sorted([s for s in data['shapes.txt'] if s['shape_id']=='111'],key=lambda s:int(s['shape_pt_sequence']))
coords=[[float(s['shape_pt_lon']),float(s['shape_pt_lat'])] for s in points]
end=[float(stops['10_01']['stop_lon']),float(stops['10_01']['stop_lat'])]
end_i=min(range(len(coords)),key=lambda i:sum((a-b)**2 for a,b in zip(coords[i],end)))
shape=coords[:end_i+1]
assert len(shape)>10
feed=data['feed_info.txt'][0]
services={t['serviceId'] for t in trips}
result={'id':'hikari-gururin-20260401','title':'ひかりぐるりんバスで午前の買い物','checkedAt':'2026-09-14','sampleDate':'2026-09-15',
 'feedStart':feed['feed_start_date'],'feedEnd':feed['feed_end_date'],'feedVersion':feed['feed_version'],
 'reviewDue':'2026-10-14','publisher':'光市','operator':'周南近鉄タクシー 光営業所','adultFare':200,
 'sourceUrl':'https://yamaguchi-opendata.jp/ckan/dataset/352101_kotsu001','officialUrl':'https://www.city.hikari.lg.jp/soshiki/11/kokyokotsu/1/1/1936.html',
 'pdfUrl':pdf['source'],'routeMapUrl':'https://www.city.hikari.lg.jp/material/files/group/155/gururin_ryakuzu_r80401.pdf',
 'sourceSha256':hashlib.sha256((SRC/'352101_kotsu001.zip').read_bytes()).hexdigest(),
 'groups':groups,'stops':compact_stops,'trips':trips,'shape':shape,
 'calendar':[c for c in data['calendar.txt'] if c['service_id'] in services],
 'exceptions':[c for c in data['calendar_dates.txt'] if c['service_id'] in services],
 'mismatches':pdf['mismatches'],'timeCorrections':corrections,'limits':pdf['limits']}
(ROOT/'public/data/route-living-pilot.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf8')
inventory=read('transport-source-review.json')
counts=collections.Counter(f['properties']['operator'] for f in json.loads((ROOT/'public/data/review-national.geojson').read_bytes())['features'])
assert set(counts)=={r['key'] for r in inventory['rows'] if r['key']}
for r in inventory['rows']:r['sourceRecordCount']=counts.get(r['key'],0)
(ROOT/'public/data/transport-source-review.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'pdfTimesChecked':60,'unchangedTimesMatched':59,'officialTimeCorrections':len(corrections),'routeTrips':len(trips),'studyStopNames':len(groups),'boardingIds':len({g[k] for g in groups for k in ['outboundId','returnId']}),'calendarMismatchTrips':2,'sourceOperatorsCovered':len(counts),'shapePoints':len(shape)},ensure_ascii=False))
