"""Apply only successful cross-section reviews, preserving each OSM origin and ID."""
from pathlib import Path
import copy,json
R=Path(__file__).resolve().parents[1];D=R/'data-sources/prefecture-directed-20260915'
review=json.loads((D/'original-record-review.json').read_text());study=json.loads((R/'src/data/boarding-guide-study.json').read_text());osm={p['id']:p for p in json.loads((R/'public/data/bus_stop.geojson').read_text())['features']}
targets=[];existing={p['id'] for p in study['hub_points']}
approved={p['id'] for p in review['points'] if p['status']=='机上確認済み'}
withdrawn={id for id,g in study['guides'].items() if g.get('cross_source_reference') and id not in approved}
for id in withdrawn:del study['guides'][id]
study['hub_points']=[p for p in study['hub_points'] if p['id'] not in withdrawn]
for p in review['points']:
 if p['status']!='机上確認済み':continue
 id=p['id'];reference=study['guides'][p['reference_id']]
 if id in study['guides'] and not study['guides'][id].get('cross_source_reference'):continue
 feature=copy.deepcopy(osm[id]);assert feature['geometry']['coordinates']==p['origin']
 feature['properties'].update(source_kind='boarding-study',city=p['city'],source_url='https://www.openstreetmap.org/'+id)
 if id not in existing:study['hub_points'].append(feature)
 study['guides'][id]={'group_id':'osm-directed:'+p['name'],'stop_name':p['name'],'number':None,'role':'boarding','summary':reference['summary'],'directions':copy.deepcopy(reference['directions']),'source_url':reference['source_url'],'guide_url':reference['guide_url'],'evidence':'stop-sequence','source_coordinates':p['origin'],'location_description':p['reason']+' 比較した公式原点：'+p['reference_id']+'。原座標はOSM原本を保持。','roadside_review':{'status':'confirmed','direction_status':'source-sequence-checked','reason':p['reason'],'walking_notice':'このOSM原点の徒歩圏は未計算です。比較した公式原点の徒歩圏は流用しません。'}}
 targets.append(id)
 study['guides'][id].update(group_id=reference['group_id'],source_origin_label='OpenStreetMap原本（公式GTFSの経路と照合）',cross_source_reference=p['reference_id'])
(R/'src/data/boarding-guide-study.json').write_text(json.dumps(study,ensure_ascii=False,indent=2)+'\n')
(D/'confirmed-osm-walking-targets.json').write_text(json.dumps(targets,ensure_ascii=False,indent=2)+'\n')
print('New OSM original guides',len(targets))
