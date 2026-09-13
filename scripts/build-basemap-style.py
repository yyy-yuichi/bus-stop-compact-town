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
    style['name'] = 'バス停と暮らし · 案内図'
    style['metadata']['changes'] = 'Japanese-first guide map: parchment land, teal sea, quieter streets and labels; original geography retained.'
    palette={
     'background':('background-color','#f7f0df'),
     'park':('fill-color','#c5d6ae'),
     'water':('fill-color','#94bec0'),
     'landuse_residential':('fill-color','#ece4d1'),
     'landcover_wood':('fill-color','#cbd9ba'),
     'building':('fill-color','#ddd3bb'),
     'waterway':('line-color','#8bb7ba'),
     'highway_minor':('line-color','#fffaf0'),
     'highway_major_casing':('line-color','#d6cbb4'),
     'highway_major_inner':('line-color','#fffdf5'),
     'highway_major_subtle':('line-color','#d3c8ae'),
     'highway_motorway_inner':('line-color','#e5dac0'),
     'highway_motorway_subtle':('line-color','#c6b99b'),
    }
    for layer in style['layers']:
     identifier=layer['id']
     if identifier in palette:
      prop,color=palette[identifier];layer.setdefault('paint',{})[prop]=color
     if identifier=='building':
      layer['minzoom']=16
      layer['paint']['fill-opacity']=0.55
      layer['paint']['fill-outline-color']='#c9c1aa'
     if identifier=='highway_minor':
      layer['paint']['line-width']=['interpolate',['linear'],['zoom'],12,0.7,15,2.1,18,6]
     if identifier=='highway_path':layer['minzoom']=16
     if 'shield' in identifier:layer['minzoom']=16
     if identifier in ('highway-name-minor','highway-name-path'):layer['minzoom']=18
     if identifier=='label_other':
      layer['minzoom']=15.5
      layer['layout']['text-size']=12
      layer['paint']['text-color']='#7d816a'
     if identifier.startswith('railway') and layer['type']=='line':
      layer['paint']['line-color']='#708178' if 'dashline' not in identifier else '#faf5e7'
     if identifier in ('label_city','label_city_capital','label_town'):
      layer['layout']['text-font']=['Noto Sans Bold']
      layer['paint']['text-color']='#395640'
      layer['paint']['text-halo-color']='#faf5e7'
     if identifier=='railway-station-label':
      layer['minzoom']=16
      layer['paint']['text-color']='#325d59'
    return style

if __name__ == '__main__':
    original = WORK/'positron.json'
    record = json.loads((WORK/'retrieval.json').read_text(encoding='utf-8'))
    if hashlib.sha256(original.read_bytes()).hexdigest() != record['sha256']: raise ValueError('Style source hash mismatch')
    target = ROOT/'public/maps/soft.json'
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(build(json.loads(original.read_text(encoding='utf-8'))),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(target)
