"""Explicit official-diagram correspondences; preserve the supplied OSM points.

No spatial joining, renumbering, inferred coordinates, or source overwrites.
Run once against the recorded v13 baseline, or rerun to verify identical entries.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'src/data/boarding-guide-study.json'
SOURCE = ROOT / 'public/data/bus_stop.geojson'
LEDGER = ROOT / 'data-sources/sanden-hubs-20260915/locations.json'

def read(p):
    return json.loads(p.read_text(encoding='utf-8'))

def main():
    study = read(APP)
    original = {f['id']: f for f in read(SOURCE)['features']}
    rows = read(LEDGER)
    for row in rows:
        sid = row['id']
        point = original[sid]
        assert point['properties']['name'] == row['stop_name']
        assert point['geometry']['coordinates'] == row['source_coordinates']
        assert point['properties']['public_transport'] == 'platform'
        number = point['properties'].get('local_ref')
        assert number is None or number == row['number']
        guide = {k: row[k] for k in ['stop_name', 'group_id', 'number', 'summary',
                                      'source_coordinates', 'guide_url', 'location_description']}
        guide.update(role='boarding', directions=[],
                     source_url='https://www.openstreetmap.org/' + sid,
                     evidence='official-diagram-and-osm')
        if row.get('assignment_hold'):
            guide['assignment_hold'] = row['assignment_hold']
        # Existing map sources contain these points, but only reviewed hub points
        # enter the boarding study. Keep the original properties as source_tags.
        hub = {'type': 'Feature', 'id': sid, 'geometry': point['geometry'],
               'properties': {'name': row['stop_name'], 'operator': 'サンデン交通',
                 'source_kind': 'boarding-study', 'city': '下関市',
                 'source_url': guide['source_url'], 'location_kind': 'unverified',
                 'source_tags': point['properties']}}
        if sid in study['guides']:
            assert study['guides'][sid] == guide
            assert next(p for p in study['hub_points'] if p['id'] == sid) == hub
        else:
            assert not any(p['id'] == sid for p in study['hub_points'])
            study['guides'][sid] = guide
            study['hub_points'].append(hub)
    APP.write_text(json.dumps(study, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'added_or_verified': len(rows), 'total_guides': len(study['guides'])}))

if __name__ == '__main__':
    main()
