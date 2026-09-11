"""Reproduce three local shopping samples from the saved OSM extract."""
from pathlib import Path
import copy, hashlib, json, xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
source = root / 'work/walking-pilot-20260908/onoda.osm'
if not source.exists():
    source = root / 'work/daily-shopping-20260911/shopping-source.osm'
tree = ET.parse(source).getroot()
elements = {(e.tag, e.get('id')): e for e in tree if e.tag in ('node', 'way')}
shops = [
    ('maruki-nakagawa', 'way', '740120977', 'ウェスタまるき中川店', 'supermarket', '山口県山陽小野田市中川町2丁目6633-1', 'https://marukijapan.co.jp/shop/'),
    ('cosmos-onoda', 'way', '332618148', 'コスモス小野田店', 'drugstore', '山口県山陽小野田市高栄1丁目8-5', 'https://www.cosmospc.co.jp/shop/chugoku/yamaguchi/93347.html'),
    ('cosmos-marugouchi', 'node', '9472329358', 'コスモス丸河内店', 'drugstore', '山口県山陽小野田市丸河内1032-5', 'https://www.cosmospc.co.jp/shop/chugoku/yamaguchi/97154.html'),
]
path = root / 'public/data/shopping.geojson'
data = json.loads(path.read_text(encoding='utf-8'))
new_ids = {s[0] for s in shops}
data['features'] = [f for f in data['features'] if f['id'] not in new_ids]
for f in data['features']:
    f['properties'].setdefault('category', 'mall')
kept = set()
observations = []
for identifier, kind, osm_id, name, category, address, url in shops:
    element = elements[(kind, osm_id)]
    tags = {t.get('k'): t.get('v') for t in element.findall('tag')}
    kept.add((kind, osm_id))
    if kind == 'way':
        assert tags.get('building')
        refs = [nd.get('ref') for nd in element.findall('nd')]
        assert refs[0] == refs[-1]
        kept.update(('node', ref) for ref in refs)
        ring = [[float(elements[('node', ref)].get('lon')), float(elements[('node', ref)].get('lat'))] for ref in refs]
        geometry = {'type': 'MultiPolygon', 'coordinates': [[ring]]}
    else:
        geometry = {'type': 'Point', 'coordinates': [float(element.get('lon')), float(element.get('lat'))]}
    properties = dict(name=name, category=category, city='山陽小野田市', official_address=address,
        official_url=url, source='OpenStreetMap', source_ids=[f'{kind}/{osm_id}'],
        source_timestamp=element.get('timestamp'), retrieved_at='2026-09-08', verified_at='2026-09-11',
        verification_status='official_name_and_address_checked; geometry_and_entrance_unverified',
        license='ODbL-1.0', license_url='https://opendatacommons.org/licenses/odbl/1-0/',
        osm_name=tags.get('name'), geometry_kind='building' if kind == 'way' else 'representative_point',
        geometry_note='Original OSM geometry; no entrance or walking connection verified')
    data['features'].append(dict(type='Feature', id=identifier, properties=properties, geometry=geometry))
    observations.append(dict(id=identifier, name=name, address=address, official_url=url,
        checked_at='2026-09-11', method='Official shop page in browser' if identifier.startswith('cosmos') else 'Search-index text of official shop list; direct connection unavailable',
        source_id=f'{kind}/{osm_id}', geometry_timestamp=element.get('timestamp'), geometry_verified=False,
        notes='Branch association uses OSM name and locality. No independent survey or entrance verification.'))
path.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
out = root / 'work/daily-shopping-20260911'
out.mkdir(exist_ok=True)
filtered = ET.Element('osm', version='0.6', generator='daily-shopping-source-filter')
for key in sorted(kept):
    element = copy.deepcopy(elements[key])
    for attr in ('user', 'uid', 'changeset'):
        element.attrib.pop(attr, None)
    filtered.append(element)
ET.indent(filtered)
ET.ElementTree(filtered).write(out/'shopping-source.osm', encoding='utf-8', xml_declaration=True)
(out/'source-manifest.json').write_text(json.dumps(dict(input_extract_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
    source='OpenStreetMap / ODbL-1.0', original_retrieved_at='2026-09-08', stores=observations), ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f'{len(shops)} additions; {len(data["features"])} total; {len(kept)} source elements retained')
