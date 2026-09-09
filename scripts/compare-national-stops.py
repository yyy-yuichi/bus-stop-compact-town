from pathlib import Path
from collections import defaultdict,Counter
import csv,hashlib,json,math,unicodedata,zipfile
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'outputs/national-comparison-20260909';OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'work/transport-inventory-20260908/P11-22_35_SHP.zip'
URL='https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P11-2022.html'
def js(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def norm(s):return ''.join(unicodedata.normalize('NFKC',s or '').split()).replace('ヶ','ケ')
def distance(a,b):
    x,y,u,v=map(math.radians,[*a,*b]);h=math.sin((v-y)/2)**2+math.cos(y)*math.cos(v)*math.sin((u-x)/2)**2
    return 6371000*2*math.asin(min(1,math.sqrt(h)))
with zipfile.ZipFile(SOURCE) as z:
    assert z.testzip() is None
    raw=json.loads(z.read('P11-22_35_SHP/P11-22_35.geojson'))
assert raw['crs']['properties']['name']=='urn:ogc:def:crs:EPSG::6668'
national=[]
for i,f in enumerate(raw['features'],1):
    p=f['properties'];coord=f['geometry']['coordinates']
    assert f['geometry']['type']=='Point' and len(coord)==2 and all(math.isfinite(v) for v in coord) and 130<coord[0]<133 and 33<coord[1]<36
    national.append(dict(type='Feature',id=f'mlit-p11-22-35:{i}',geometry=f['geometry'],properties=dict(name=p['P11_001'],operator=p['P11_002'],routes=[p[f'P11_003_{j:02}'] for j in range(1,36) if p[f'P11_003_{j:02}']],source_row=i,source_year=2022,source_url=URL,license='CC-BY-4.0',source_crs='EPSG:6668',note=p['P11_005'])))
assert len(national)==4418
js(ROOT/'public/data/review-national.geojson',dict(type='FeatureCollection',crs=raw['crs'],features=national))
osm=json.loads((ROOT/'public/data/bus_stop.geojson').read_text(encoding='utf-8'))['features']
city=json.loads((ROOT/'public/data/review-stops.geojson').read_text(encoding='utf-8'))['features']
def index(fs):
    grid=defaultdict(list)
    for f in fs:
        x,y=f['geometry']['coordinates'];grid[(math.floor(x*100),math.floor(y*100))].append(f)
    return grid
def candidates(f,grid):
    x,y=f['geometry']['coordinates'];gx,gy=math.floor(x*100),math.floor(y*100);found=[]
    for dx in [-1,0,1]:
        for dy in [-1,0,1]:
            for other in grid[(gx+dx,gy+dy)]:
                d=distance([x,y],other['geometry']['coordinates'])
                if d<=300:found.append((d,other))
    return sorted(found,key=lambda x:x[0])
summary={}
for label,left,right in [('national-to-osm',national,osm),('osm-to-national',osm,national),('city-to-national',city,national)]:
    grid=index(right);rows=[]
    for f in left:
        nearby=candidates(f,grid);name=f['properties'].get('name','');same=[(d,o) for d,o in nearby if name and norm(name)==norm(o['properties'].get('name',''))]
        rows.append(dict(source_id=f['id'],name=name,nearest_id_within_300m=nearby[0][1]['id'] if nearby else '',nearest_name=nearby[0][1]['properties'].get('name','') if nearby else '',nearest_distance_m=round(nearby[0][0],2) if nearby else '',same_name_id_within_300m=same[0][1]['id'] if same else '',same_name_distance_m=round(same[0][0],2) if same else '',has_point_25m=any(d<=25 for d,o in nearby),has_point_100m=any(d<=100 for d,o in nearby),has_point_300m=bool(nearby),same_name_100m=any(d<=100 for d,o in same)))
    with (OUT/(label+'.csv')).open('w',encoding='utf-8-sig',newline='') as stream:
        w=csv.DictWriter(stream,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    summary[label]=dict(records=len(rows),**{key:sum(r[key] for r in rows) for key in ['has_point_25m','has_point_100m','has_point_300m','same_name_100m']})
# Check the spatial candidate lookup against exhaustive search for a deterministic sample.
grid=index(national)
for f in city[::45]:
    actual={o['id'] for d,o in candidates(f,grid)}
    expected={o['id'] for o in national if distance(f['geometry']['coordinates'],o['geometry']['coordinates'])<=300}
    assert actual==expected
summary['national_records']=4418;summary['national_unique_coordinate_pairs']=len({tuple(f['geometry']['coordinates']) for f in national})
summary['source_sha256']=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
summary['method']='300m neighborhood, spherical distance, NFKC/space/kana-small-ke normalization only. No identity, currentness or accuracy verdict. EPSG:6668 coordinates retained; no epoch/datum correction.'
js(OUT/'summary.json',summary);print(json.dumps(summary,ensure_ascii=False))
