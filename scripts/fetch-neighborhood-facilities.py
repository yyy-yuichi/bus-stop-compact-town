"""Save a bounded prefecture extract for everyday places; never overwrite sources."""
from pathlib import Path
import datetime, hashlib, json, urllib.parse, urllib.request

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'data-sources/neighborhood-facilities-20260914'
ENDPOINT='https://overpass.private.coffee/api/interpreter'
QUERY='''[out:json][timeout:90];
area["ISO3166-2"="JP-35"]["boundary"="administrative"]->.pref;
(
  nwr(area.pref)["amenity"~"^(restaurant|cafe|fast_food|food_court|bar|pub|dentist|kindergarten|childcare|school|college|university|social_facility)$"];
  nwr(area.pref)["healthcare"="dentist"];
  nwr(area.pref)["leisure"~"^(park|playground|sports_centre|fitness_centre)$"];
  nwr(area.pref)["shop"~"^(bakery|laundry|dry_cleaning|hairdresser|beauty)$"];
);
out body center geom;'''
if __name__=='__main__':
    WORK.mkdir(parents=True,exist_ok=True)
    target=WORK/'osm-neighborhood-facilities.json'
    if target.exists(): raise SystemExit('Saved source exists; reuse without overwriting.')
    request=urllib.request.Request(ENDPOINT,data=urllib.parse.urlencode({'data':QUERY}).encode(),headers={'User-Agent':'bus-stop-compact-town/0.1 (+https://github.com/yyy-yuichi/bus-stop-compact-town)'})
    with urllib.request.urlopen(request,timeout=120) as response: content=response.read(25_000_001)
    if len(content)>25_000_000: raise ValueError('Extract exceeded the bounded response size')
    raw=json.loads(content)
    if raw.get('remark') or not raw.get('elements'): raise ValueError('Incomplete or empty source')
    target.write_bytes(content)
    (WORK/'query.overpassql').write_text(QUERY,encoding='utf-8')
    record={'endpoint':ENDPOINT,'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sha256':hashlib.sha256(content).hexdigest(),'bytes':len(content),'snapshot':raw['osm3s']['timestamp_osm_base']}
    (WORK/'retrieval.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({**record,'elements':len(raw['elements'])}))
