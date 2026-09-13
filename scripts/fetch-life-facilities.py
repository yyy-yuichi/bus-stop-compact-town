"""Acquire one bounded, named public-service extract; never replace a saved source."""
from pathlib import Path
import datetime, hashlib, json, urllib.parse, urllib.request

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'data-sources/life-facilities-20260913'
QUERY = '''[out:json][timeout:90];
area["ISO3166-2"="JP-35"]["boundary"="administrative"]->.pref;
nwr(area.pref)["amenity"~"^(post_office|bank|library|townhall|community_centre)$"];
out body center;'''
ENDPOINT = 'https://overpass.private.coffee/api/interpreter'

if __name__ == '__main__':
    WORK.mkdir(parents=True, exist_ok=True)
    target = WORK / 'osm-life-facilities.json'
    if target.exists():
        raise SystemExit('Saved extract exists; reuse it without overwriting.')
    request = urllib.request.Request(ENDPOINT, data=urllib.parse.urlencode({'data':QUERY}).encode(),
        headers={'User-Agent':'bus-stop-compact-town/0.1 (+https://github.com/yyy-yuichi/bus-stop-compact-town)'})
    with urllib.request.urlopen(request, timeout=120) as response:
        content = response.read()
    raw = json.loads(content)
    if raw.get('remark') or not raw.get('elements'):
        raise ValueError('Empty or incomplete extract')
    target.write_bytes(content)
    (WORK/'query.overpassql').write_text(QUERY, encoding='utf-8')
    (WORK/'retrieval.json').write_text(json.dumps({'endpoint':ENDPOINT,
        'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'sha256':hashlib.sha256(content).hexdigest(), 'bytes':len(content)}, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'elements':len(raw['elements']), 'snapshot':raw['osm3s']['timestamp_osm_base'], 'bytes':len(content)}))
