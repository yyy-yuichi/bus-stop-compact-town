"""Build a small, offline walking graph. OSM node IDs preserve actual junctions."""
from pathlib import Path
import xml.etree.ElementTree as ET
import json,math,hashlib,collections
ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'work/walking-pilot-20260908/onoda-walking-source.osm'
BBOX=[131.158,33.974,131.187,33.999]
CORE=[131.169,33.9838,131.1785,33.9915]
def tags(e):return {t.get('k'):t.get('v') for t in e.findall('tag')}
def inside(p,b):return b[0]<=p[0]<=b[2] and b[1]<=p[1]<=b[3]
def meters(a,b):
    x=math.radians(b[0]-a[0])*math.cos(math.radians((a[1]+b[1])/2));y=math.radians(b[1]-a[1])
    return math.hypot(x,y)*6371000
ALLOW={'yes','designated','permissive','destination'}
ROADS={'residential','unclassified','service','tertiary','tertiary_link','secondary','secondary_link','primary','primary_link','footway','path','pedestrian','living_street','steps','track'}
def can_walk(t):
    if t.get('area')=='yes' or t.get('highway') in {'construction','proposed','motorway','motorway_link'}:return False
    if any(k in t for k in ['foot:conditional','access:conditional','oneway:foot:conditional']):return False
    permission=t.get('foot',t.get('access',''))
    if permission and permission not in ALLOW:return False
    return t.get('highway') in ROADS or t.get('highway') in {'trunk','trunk_link','cycleway','bridleway'} and t.get('foot') in ALLOW
def node_open(t):
    permission=t.get('foot',t.get('access',''))
    if permission and permission not in ALLOW:return False
    if 'foot:conditional' in t or 'access:conditional' in t:return False
    return not t.get('barrier') or t.get('barrier') in {'bollard','block','kerb','cycle_barrier'} or t.get('foot') in ALLOW
def build():
    root=ET.parse(RAW).getroot()
    nodes={n.get('id'):(float(n.get('lon')),float(n.get('lat'))) for n in root.findall('node')}
    nt={n.get('id'):tags(n) for n in root.findall('node')}
    edges=[];used={};skipped=collections.Counter()
    def index(i):
        if i not in used:used[i]=len(used)
        return used[i]
    for w in root.findall('way'):
        t=tags(w)
        if 'highway' not in t:continue
        if not can_walk(t):skipped[t['highway']]+=1;continue
        refs=[n.get('ref') for n in w.findall('nd')]
        forward=t.get('oneway:foot')!='-1' and t.get('foot:forward','yes') in ALLOW
        backward=t.get('oneway:foot') not in {'yes','1','true'} and t.get('foot:backward','yes') in ALLOW
        # Vehicle one-way restrictions do not automatically apply to walkers.
        for a,b in zip(refs,refs[1:]):
            if a not in nodes or b not in nodes or not inside(nodes[a],BBOX) or not inside(nodes[b],BBOX):continue
            if not node_open(nt[a]) or not node_open(nt[b]) or not (forward or backward):continue
            length=meters(nodes[a],nodes[b])
            if length<=0:continue
            edges.append([index(a),index(b),round(length,3),int(forward),int(backward),w.get('id')])
    packed_nodes=[[nodes[i][0],nodes[i][1],i] for i in used]
    buses=json.loads((ROOT/'public/data/bus_stop.geojson').read_text(encoding='utf-8'))
    pilot=[{'id':f['id'],'name':f['properties'].get('name','名称未登録'),'coordinate':f['geometry']['coordinates']} for f in buses['features'] if inside(f['geometry']['coordinates'],CORE)]
    # Keep a friendly, explicit first example without changing the source stop IDs.
    pilot.sort(key=lambda p:(p['id']!='node/5127585172',p['name'],p['id']))
    result=dict(version=1,name='おのだサンパーク周辺',source='https://www.openstreetmap.org/api/0.6/map?bbox=131.158,33.974,131.187,33.999',retrieved_at='2026-09-08',license='ODbL-1.0',attribution='© OpenStreetMap contributors',source_sha256=hashlib.sha256(RAW.read_bytes()).hexdigest(),bbox=BBOX,core=CORE,nodes=packed_nodes,edges=edges,pilot_stops=pilot,facility_ids=['sunpark'],excluded_highways=dict(skipped))
    out=ROOT/'public/data/walking-onoda.json';out.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print(json.dumps(dict(nodes=len(packed_nodes),edges=len(edges),stops=pilot,bytes=out.stat().st_size,excluded=dict(skipped)),ensure_ascii=False))
if __name__=='__main__':build()
