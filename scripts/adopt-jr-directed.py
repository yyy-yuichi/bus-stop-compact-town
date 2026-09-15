"""Add official JR source points as independent map records; never attach by proximity."""
from pathlib import Path
import csv,io,json,zipfile,collections
R=Path(__file__).resolve().parents[1];D=R/'data-sources/jr-prefecture-20260915'
inventory=json.loads((D/'inventory.json').read_text());ledger=json.loads((D/'ledger.json').read_text())
study=json.loads((R/'src/data/boarding-guide-study.json').read_text())
hubids={f['id'] for f in study['hub_points']};source=inventory['source_url']
stop_times=collections.defaultdict(list)
with zipfile.ZipFile(D/'official-current.zip') as z:
 for row in csv.DictReader(io.StringIO(z.read('stop_times.txt').decode('utf-8-sig'))):stop_times[row['stop_id']].append(row)
for p in inventory['points']:
 id=p['id'];coord=p['original_coordinates']
 if id not in hubids:
  study['hub_points'].append({'type':'Feature','id':id,'geometry':{'type':'Point','coordinates':coord},'properties':{'name':p['name'],'operator':'ＪＲバス中国','source_kind':'boarding-study','source_date':'2026-09-15','source_namespace':'jr-chugoku','source_stop_id':p['source_stop_id'],'city':p['city'],'source_url':source,'location_kind':'unverified'}})
 if id not in study['guides']:
  rows=stop_times[p['source_stop_id']];alighting=bool(rows) and all(r.get('pickup_type')=='1' for r in rows)
  study['guides'][id]={'stop_name':p['name'],'group_id':'jr-chugoku:'+p['name'],'number':p['original'].get('platform_code') or None,'role':'alighting' if alighting else 'boarding','summary':p['official_direction'] or ('公式GTFSでは降車専用' if alighting else '乗る方面の対応を確認中'),'directions':[],'source_url':source,'guide_url':inventory['distribution_page'],'evidence':'stop-sequence','source_coordinates':coord,'official_direction':p['official_direction'],'location_description':'公式GTFSの原座標。stops_direction.txtの原IDに対応する方面と停車順・経路・道路を照合する。'}
for p in inventory['points']:study['guides'][p['id']]['source_origin_label']='JRバス中国の公式GTFS'
(R/'src/data/boarding-guide-study.json').write_text(json.dumps(study,ensure_ascii=False,indent=2)+'\n')
(D/'confirmed-walking-targets.json').write_text(json.dumps([p['id'] for g in ledger['pairs'] for p in g['points'] if p['status']=='机上確認済み'],ensure_ascii=False,indent=2)+'\n')
print('Independent JR originals',len(inventory['points']))
