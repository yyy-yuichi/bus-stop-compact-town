"""Bounded OSM carriageway metadata for directed review only. Never modifies walking originals."""
from pathlib import Path
import datetime, hashlib, json, sys, urllib.request, urllib.parse, xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1];D=ROOT/'data-sources/hikari-directed-20260915'
original=ROOT/'data-sources/hikari-pairs-20260915/originals'
pairs=json.loads((original/'hikari-pairs.json').read_text());old=json.loads((ROOT/'data-sources/hikari-pairs-20260915/ledger.json').read_text())
points={p['source_stop_id']:p['original_coordinates'] for x in old['pairs'] for p in x['points']}
pilot={'土井','金山','木園','西河原','小周防Ｂ'};phase='remaining' if '--remaining' in sys.argv else 'pilot'
selected=[p for p in pairs if (p['stop_name'] not in pilot if phase=='remaining' else p['stop_name'] in pilot)]
path=D/f'carriageways-{phase}.json'
if path.exists():print('reuse',path);sys.exit(0)
boxes=[]
for pair in selected:
    coords=[points[s] for s in pair['stop_ids']]
    boxes.append([min(p[1] for p in coords)-.0012,min(p[0] for p in coords)-.0015,max(p[1] for p in coords)+.0012,max(p[0] for p in coords)+.0015])
query='[out:json][timeout:90];('+''.join('way["highway"]('+','.join(map(str,b))+');' for b in boxes)+');(._;>;);out body;'
(D/f'carriageways-{phase}.overpass').write_text(query)
if '--map-api' in sys.argv:
    elements={};receipts=[]
    for pair,b in zip(selected,boxes):
        name=pair['stop_ids'][0];file=D/f'map-{name}.osm'
        url='https://api.openstreetmap.org/api/0.6/map?bbox='+','.join(map(str,[b[1],b[0],b[3],b[2]]))
        if pair['stop_name']=='西河原' and (D/'nishigawara-full-roads.osm').exists():
            file=D/'nishigawara-full-roads.osm';url='https://api.openstreetmap.org/api/0.6/map?bbox=131.9185,33.9710,131.9240,33.9742'
        if not file.exists():
            with urllib.request.urlopen(url,timeout=45) as response:payload=response.read()
            file.write_bytes(payload)
        payload=file.read_bytes()
        for e in ET.fromstring(payload):
            if e.tag not in ['node','way']:continue
            tags={t.get('k'):t.get('v') for t in e.findall('tag')}
            if e.tag=='way' and 'highway' not in tags:continue
            x={'type':e.tag,'id':int(e.get('id')),'tags':tags}
            if e.tag=='node':x.update(lon=float(e.get('lon')),lat=float(e.get('lat')))
            else:x['nodes']=[int(n.get('ref')) for n in e.findall('nd')]
            elements[e.tag,e.get('id')]=x
        receipts.append({'file':file.name,'url':url,'sha256':hashlib.sha256(payload).hexdigest(),'bytes':len(payload)})
        print('map fetched',pair['stop_name'],len(payload),flush=True)
    (D/f'map-{phase}-receipts.json').write_text(json.dumps(receipts,ensure_ascii=False,indent=2))
    raw=json.dumps({'elements':list(elements.values())},ensure_ascii=False).encode();url='OpenStreetMap map API; per-file URLs in map-'+phase+'-receipts.json'
else:
    url='https://overpass-api.de/api/interpreter'
    request=urllib.request.Request(url+'?'+urllib.parse.urlencode({'data':query}),headers={'User-Agent':'BusStopLivingMap/0.1 bounded-review'})
    with urllib.request.urlopen(request,timeout=110) as response:raw=response.read()
data=json.loads(raw)
if data.get('remark'):raise RuntimeError(data['remark'])
path.write_bytes(raw)
(D/f'carriageways-{phase}-receipt.json').write_text(json.dumps({'url':url,'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'query_file':f'carriageways-{phase}.overpass','pair_names':[p['stop_name'] for p in selected],
 'bboxes_south_west_north_east':boxes,'purpose':'乗降方向と車道形状の確認のみ。徒歩グラフに未投入。'},ensure_ascii=False,indent=2)+'\n')
print(phase,len(raw),len(data['elements']))
