"""Export current application IDs without inventing cross-source associations."""
from pathlib import Path
import csv, hashlib, json
from urllib.parse import urlencode

root = Path(__file__).resolve().parents[1]
out = root / 'outputs/integration-ready-20260911/id-index'
out.mkdir(parents=True, exist_ok=True)
public_url = 'https://yyy-yuichi.github.io/bus-stop-compact-town/'
read = lambda name: json.loads((root / 'public/data' / name).read_text(encoding='utf-8'))
link = lambda kind, identifier: public_url + '#' + urlencode({'kind': kind, 'id': identifier})
national, facilities, osm, graph = [read(name) for name in ('review-national.geojson', 'shopping.geojson', 'bus_stop.geojson', 'walking-onoda.json')]
source_stops = {str(f.get('id') or f['properties'].get('@id')): f for f in osm['features']}
tables = {}
tables['national-stops.csv'] = [dict(id=f['id'], name=f['properties']['name'], source='mlit-p11-22-35', source_year=2022,
    longitude=f['geometry']['coordinates'][0], latitude=f['geometry']['coordinates'][1],
    operator=f['properties'].get('operator', ''), routes=' / '.join(f['properties'].get('routes', [])),
    location_kind='representative', license='CC-BY-4.0', map_url=link('national', f['id'])) for f in national['features']]
tables['pilot-stops.csv'] = [dict(id=s['id'], name=s['name'], source='osm-pilot',
    longitude=source_stops[s['id']]['geometry']['coordinates'][0], latitude=source_stops[s['id']]['geometry']['coordinates'][1],
    national_stop_id='', national_association='unverified', license='ODbL-1.0', map_url=link('pilot', s['id'])) for s in graph['pilot_stops']]
tables['facilities.csv'] = [dict(id=f['id'], name=f['properties']['name'], city=f['properties']['city'], category=f['properties']['category'],
    geometry_kind=f['properties']['geometry_kind'], source_ids=' / '.join(f['properties']['source_ids']),
    geometry_timestamp=f['properties']['source_timestamp'], name_address_checked_at=f['properties']['verified_at'],
    license=f['properties']['license'], official_url=f['properties']['official_url'],
    current_walking_pilot='included' if f['id'] in graph['facility_ids'] else 'not_calculated', map_url=link('facility', f['id'])) for f in facilities['features']]
for name, rows in tables.items():
    with (out / name).open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader(); writer.writerows(rows)
    with (out / name).open(encoding='utf-8-sig', newline='') as stream:
        restored = list(csv.DictReader(stream))
    assert len(restored) == len(rows) == len({row['id'] for row in restored})
    for a, b in zip(rows, restored):
        assert all(str(value) == b[key] for key, value in a.items())
manifest = dict(created_at='2026-09-11', rows={name:len(rows) for name,rows in tables.items()},
    sha256={name:hashlib.sha256((out/name).read_bytes()).hexdigest() for name in tables},
    sources={name:hashlib.sha256((root/'public/data'/name).read_bytes()).hexdigest() for name in ('review-national.geojson', 'shopping.geojson', 'bus_stop.geojson', 'walking-onoda.json')},
    source_urls={name:public_url+'data/'+name for name in ('review-national.geojson', 'shopping.geojson', 'bus_stop.geojson', 'walking-onoda.json')},
    note='Current app IDs only. National representatives and OSM pilot origins have no confirmed association. No new walking data is included.')
(out/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps(manifest['rows']))
