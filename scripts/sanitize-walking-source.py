"""Retain only the road data needed to reproduce the graph, without editor metadata."""
from pathlib import Path
import xml.etree.ElementTree as ET
import json,hashlib
root=Path(__file__).resolve().parents[1]
work=root/'work/walking-pilot-20260908'
raw=work/'onoda.osm'
tree=ET.parse(raw).getroot()
fields={'highway','area','foot','access','foot:conditional','access:conditional','oneway:foot:conditional','barrier','oneway:foot','foot:forward','foot:backward','bridge','tunnel','layer'}
ways=[w for w in tree.findall('way') if any(t.get('k')=='highway' for t in w.findall('tag'))]
refs={n.get('ref') for w in ways for n in w.findall('nd')}
out=ET.Element('osm',version='0.6',generator='bus-stop-compact-town walking data filter')
for item in list(tree.findall('node'))+ways:
    if item.tag=='node' and item.get('id') not in refs:continue
    attrs={k:item.get(k) for k in (['id','lat','lon'] if item.tag=='node' else ['id'])}
    copied=ET.SubElement(out,item.tag,attrs)
    for child in item:
        if child.tag=='nd' or child.tag=='tag' and child.get('k') in fields:ET.SubElement(copied,child.tag,child.attrib)
dest=work/'onoda-walking-source.osm';ET.ElementTree(out).write(dest,encoding='utf-8',xml_declaration=True)
(work/'source-manifest.json').write_text(json.dumps(dict(source_url='https://www.openstreetmap.org/api/0.6/map?bbox=131.158,33.974,131.187,33.999',retrieved_at='2026-09-08',raw_sha256=hashlib.sha256(raw.read_bytes()).hexdigest(),filtered_sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),license='ODbL-1.0',attribution='© OpenStreetMap contributors',filter='Road ways, referenced nodes, access and geometry tags only. Editor metadata omitted.'),ensure_ascii=False,indent=2),encoding='utf-8')
print('Saved reproducible road source:',dest.stat().st_size,'bytes')
