"""Derive the app's Japanese, muted palette from the saved OpenFreeMap style."""
from pathlib import Path
import json, hashlib
ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT/'data-sources/basemap-20260913'

def build(original):
    style = json.loads(json.dumps(original))
    style['name'] = 'バス停と暮らし · Soft'
    style['metadata'] = {'source':'https://tiles.openfreemap.org/styles/positron',
        'changes':'Japanese-first single-line labels, warm land, teal water, clearer local streets and railway, station names.'}
    palette = {'background':('background-color','#f5f4ee'), 'park':('fill-color','#dfe8d9'),
        'water':('fill-color','#b6d7d6'), 'waterway':('line-color','#94c3c5'),
        'landuse_residential':('fill-color','#eaece4'), 'landcover_wood':('fill-color','#dce7d6'),
        'building':('fill-color','#e4e4d9'), 'highway_path':('line-color','#c8cbbf'),
        'highway_minor':('line-color','#fffefa'), 'highway_major_casing':('line-color','#d0cfbf'),
        'highway_major_subtle':('line-color','#d9d3bd')}
    name = ['coalesce',['get','name:ja'],['get','name:nonlatin'],['get','name'],['get','name:latin']]
    for layer in style['layers']:
        identifier = layer['id']
        if identifier in palette:
            key, value = palette[identifier]
            layer.setdefault('paint',{})[key] = value
        if identifier == 'building': layer['paint']['fill-outline-color'] = '#d3d6c9'
        if identifier.startswith('railway') and 'dashline' not in identifier:
            layer['paint']['line-color'] = '#9ca9a2'
        layout = layer.get('layout',{})
        if 'shield' in identifier:
            # The upstream comparison warns on roads without a ref_length.
            length = ['to-number',['get','ref_length'],0]
            layer['filter'][1] = ['all',['>=',length,1],['<=',length,6]]
        if identifier == 'highway-shield-non-us':
            layout['icon-image'] = ['match',['to-string',['get','ref_length']],
                '1','road_1','2','road_2','3','road_3','4','road_4','5','road_5','6','road_6','road_1']
        if 'text-field' in layout and 'shield' not in identifier:
            layout['text-field'] = name
            layout['text-font'] = ['Noto Sans Bold' if identifier in ('label_city','label_city_capital') else 'Noto Sans Regular']
            layout['text-letter-spacing'] = 0.03
            layer.setdefault('paint',{})['text-color'] = '#516d73' if 'water' in identifier else '#3f554e'
        if identifier == 'label_other': layout['text-size'] = ['interpolate',['linear'],['zoom'],8,10,12,12]
    style['layers'].append({'id':'railway-station-label','type':'symbol','source':'openmaptiles','source-layer':'poi',
        'minzoom':13,'filter':['==',['get','class'],'railway'],
        'layout':{'text-field':name,'text-font':['Noto Sans Bold'],'text-size':13,'text-padding':5},
        'paint':{'text-color':'#496773','text-halo-color':'#fffefa','text-halo-width':1.5}})
    return style

if __name__ == '__main__':
    original = WORK/'positron.json'
    record = json.loads((WORK/'retrieval.json').read_text(encoding='utf-8'))
    if hashlib.sha256(original.read_bytes()).hexdigest() != record['sha256']: raise ValueError('Style source hash mismatch')
    target = ROOT/'public/maps/soft.json'
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(build(json.loads(original.read_text(encoding='utf-8'))),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(target)
