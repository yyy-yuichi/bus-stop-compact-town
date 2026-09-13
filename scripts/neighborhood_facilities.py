"""Extend the preserved facility layer and attach source-labelled registered details."""
from pathlib import Path
from collections import Counter
import copy, hashlib, json, math, re, unicodedata

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'data-sources/neighborhood-facilities-20260914'
AREA_CATEGORIES={'school','college','childcare','park','playground','sports_centre'}
CATEGORIES=('restaurant','cafe','fast_food','bar','bakery','dentist','childcare','school','college','park','playground','sports_centre','social_facility','laundry','hairdresser')

def category(tags):
    amenity=tags.get('amenity')
    values={'restaurant':'restaurant','food_court':'restaurant','cafe':'cafe','fast_food':'fast_food','bar':'bar','pub':'bar','dentist':'dentist',
            'kindergarten':'childcare','childcare':'childcare','school':'school','college':'college','university':'college','social_facility':'social_facility'}
    if amenity in values: return values[amenity]
    if tags.get('healthcare')=='dentist': return 'dentist'
    leisure=tags.get('leisure')
    if leisure in ('park','playground','sports_centre'): return leisure
    if leisure=='fitness_centre': return 'sports_centre'
    return {'bakery':'bakery','laundry':'laundry','dry_cleaning':'laundry','hairdresser':'hairdresser','beauty':'hairdresser'}.get(tags.get('shop'))

def load_source(directory, filename):
    path=directory/filename
    receipt=json.loads((directory/'retrieval.json').read_text(encoding='utf-8'))
    content=path.read_bytes()
    if hashlib.sha256(content).hexdigest()!=receipt['sha256']: raise ValueError(f'Source hash mismatch: {filename}')
    return json.loads(content),receipt

def closed_area(element):
    if element.get('type')!='way': return None
    points=element.get('geometry',[])
    if any(not isinstance(p,dict) or 'lat' not in p or 'lon' not in p for p in points): return None
    ring=[[p['lon'],p['lat']] for p in points]
    if len(ring)<4 or ring[0]!=ring[-1] or len({tuple(p) for p in ring})<3: return None
    if any(not all(isinstance(v,(int,float)) and math.isfinite(v) for v in p) or not (130<=p[0]<=133 and 33<=p[1]<=35) for p in ring): return None
    return {'type':'MultiPolygon','coordinates':[[ring]]}

def normalized_name(value): return ''.join(unicodedata.normalize('NFKC',value).split()).lower()

def in_ring(point,ring):
    x,y=point; inside=False
    for a,b in zip(ring,ring[1:]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]: inside=not inside
    return inside

def append_neighborhood(base,builder):
    raw,receipt=load_source(WORK,'osm-neighborhood-facilities.json')
    # `out geom` supplies bounds rather than the separate `center` property.
    # Derive that representative point from the response bounds for the shared importer.
    prepared=copy.deepcopy(raw)
    for element in prepared['elements']:
        bounds=element.get('bounds',{})
        if element['type']!='node' and not element.get('center') and all(k in bounds for k in ('minlat','maxlat','minlon','maxlon')):
            element['center']={'lat':(bounds['minlat']+bounds['maxlat'])/2,'lon':(bounds['minlon']+bounds['maxlon'])/2}
    extra,skipped=builder(prepared,{'features':[]},receipt['retrieved_at'],category_fn=category)
    elements={f"{e['type']}/{e['id']}":e for e in raw['elements']}
    for feature in extra['features']:
        p=feature['properties']; element=elements[p['source_ids'][0]]
        origin=[element.get('tags',{}).get(k) for k in ('source','note:ja','note')]
        origin=list(dict.fromkeys(v for v in origin if isinstance(v,str) and v.strip() and len(v)<=1000))
        if origin: p['registration_origin']=origin
        geometry=closed_area(element) if p['category'] in AREA_CATEGORIES else None
        if geometry:
            feature['geometry']=geometry
            p['geometry_kind']='facility_area'
            p['geometry_note']='Closed OSM way boundary; not a verified entrance'
        if p['category'] in ('school','college','childcare') and re.search(r'閉校|閉園|廃校|休校|休園|^旧',p['name']):
            original=p['category']; p['category']='reference'
            p['classification_review']={'checked_at':'2026-09-14','status':'pending','original_category':original,
                'note':'元の名称に旧校・休校等の記載があるため通常候補から除外。現在の使用状況は未確認。',
                'evidence_url':'https://www.openstreetmap.org/'+p['source_ids'][0]}
        if p['category']=='social_facility' and re.search(r'(病院|クリニック|歯科)$',p['name']):
            p['category']='reference'
            p['classification_review']={'checked_at':'2026-09-14','status':'pending','original_category':'social_facility',
                'note':'医療機関名で福祉施設として登録されているため分類保留。独立した福祉サービスの名称・現況と既存病院記録との関係が未確認。',
                'evidence_url':'https://www.openstreetmap.org/'+p['source_ids'][0]}
            if feature['id']=='osm-node-1631268797':
                p['classification_review']['note']+=' 梅田病院の公式案内は産婦人科・小児科であり、登録の生活支援付き住居としては採用していない。'
                p['classification_review']['evidence_url']='https://umeda-hospital.or.jp/'
    # An identically named node inside a same-category area represents one place.
    # Keep both source references so details on the node remain available.
    areas=[f for f in extra['features'] if f['geometry']['type']=='MultiPolygon']
    candidates=[]
    for feature in extra['features']:
        p=feature['properties']; g=feature['geometry']
        same=next((area for area in areas if p['source_ids'][0].startswith('node/') and g['type']=='Point'
                   and area['properties']['category']==p['category']
                   and normalized_name(area['properties']['name'])==normalized_name(p['name'])
                   and in_ring(g['coordinates'],area['geometry']['coordinates'][0][0])),None)
        if same:
            same['properties']['source_ids'].extend(p['source_ids'])
            skipped.append({'source_id':p['source_ids'][0],'reason':'same_name_node_inside_area','kept_id':same['id']})
        else: candidates.append(feature)
    used={sid for f in base['features'] for sid in f['properties']['source_ids']}
    additions=[]
    for feature in candidates:
        if any(sid in used for sid in feature['properties']['source_ids']):
            skipped.append({'source_id':feature['properties']['source_ids'][0],'reason':'existing_source_id'})
            continue
        additions.append(feature); used.update(feature['properties']['source_ids'])
    result={**base,'features':base['features']+additions}
    return result,{'raw_elements':len(raw['elements']),'added':len(additions),'categories':dict(Counter(f['properties']['category'] for f in additions)),
                   'areas':sum(f['geometry']['type']=='MultiPolygon' for f in additions),'skipped':skipped,'snapshot':raw['osm3s']['timestamp_osm_base'],'source_sha256':receipt['sha256']}

DETAIL_KEYS={'phone':('phone','contact:phone'),'opening_hours':('opening_hours',),'operator':('operator',),'brand':('brand',),'branch':('branch',),
             'cuisine':('cuisine',),'wheelchair':('wheelchair',),'specialty':('healthcare:speciality',),'service':('social_facility',),'access':('access',)}

def enrich_registered_details(base):
    sources={}
    for directory,name in [(ROOT/'data-sources/osm-facilities-20260911','osm-facilities.json'),(ROOT/'data-sources/life-facilities-20260913','osm-life-facilities.json'),(WORK,'osm-neighborhood-facilities.json')]:
        raw,receipt=load_source(directory,name)
        for element in raw['elements']:
            sid=f"{element['type']}/{element['id']}"
            value={'tags':element.get('tags',{}),'source_id':sid,'source_timestamp':raw['osm3s']['timestamp_osm_base'],'retrieved_at':receipt['retrieved_at']}
            # Overlapping extracts can have different snapshot dates.
            if sid not in sources or sources[sid]['source_timestamp']<value['source_timestamp']: sources[sid]=value
    result=copy.deepcopy(base); counts=Counter()
    for feature in result['features']:
        p=feature['properties']
        if p.get('category')=='reference': continue
        details={}; provenance=[]
        for sid in p['source_ids']:
            source=sources.get(sid)
            if not source: continue
            contributed=False
            for field,keys in DETAIL_KEYS.items():
                for key in keys:
                    value=source['tags'].get(key)
                    if isinstance(value,str) and value.strip() and len(value)<=1000:
                        values=details.setdefault(field,[])
                        if value.strip() not in values: values.append(value.strip())
                        contributed=True
            if contributed: provenance.append({k:source[k] for k in ('source_id','source_timestamp','retrieved_at')})
        if details:
            p['registered_details']={**details,'sources':provenance}
            counts.update(details.keys()); counts['facilities']+=1
    return result,dict(counts)
