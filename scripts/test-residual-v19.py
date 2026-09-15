"""Targeted v19 integrity checks against retained v18 archive and raw evidence."""
from pathlib import Path
import zipfile,json,hashlib,collections,argparse
R=Path(__file__).resolve().parents[1];D=R/'data-sources/residuals-v19-20260915';S=R/'data-sources/sentetsu-v19-20260915'
def read(p):return json.loads(p.read_text())
parser=argparse.ArgumentParser();parser.add_argument('--baseline-zip',type=Path,default=Path('/tmp/yamaguchi-prefecture-source-e61eca41.zip'));args=parser.parse_args()
z=zipfile.ZipFile(args.baseline_zip)
def old(p):return json.loads(z.read('site-source/'+p))
index=read(R/'src/data/boarding-walk-study/index.json');oi=old('src/data/boarding-walk-study/index.json');study=read(R/'src/data/boarding-guide-study.json');og=old('src/data/boarding-guide-study.json')
assert index['snap_limit']==30
for id,e in oi['stops'].items():assert index['stops'][id]==e,id
walks=[n for n in z.namelist() if n.startswith('site-source/src/data/boarding-walk-study/') and n.endswith('.json') and not n.endswith('/index.json')]
for n in walks:assert z.read(n)==(R/n.removeprefix('site-source/')).read_bytes(),n
assert len(walks)==1143
resolved={p['id'] for p in read(D/'reference-connections-review.json')['points'] if p['resolved']};assert len(resolved)==5
for id,g in og['guides'].items():
 updated=study['guides'][id]
 if id in resolved:
  updated=json.loads(json.dumps(updated));updated['roadside_review']['walking_notice']=g['roadside_review']['walking_notice']
 assert updated==g,id
assert study['hub_points'][:len(og['hub_points'])]==og['hub_points']
missing=[id for id,e in oi['stops'].items() if not e.get('file')];assert len(missing)==128
review=read(D/'missing-128-review.json');ps=review['points'];assert {p['id'] for p in ps}==set(missing)
ledger=read(S/'ledger.json');data=read(S/'source-observation.json');confirmed={p['id']:p for g in ledger['pairs'] for p in g['points'] if p['status']=='机上確認済み'}
all_new={p['id']:p for g in ledger['pairs'] for p in g['points']}
assert set(study['guides'])-set(og['guides'])==set(all_new)
for id,p in all_new.items():
 assert study['guides'][id]['source_coordinates']==p['original_coordinates'] and study['guides'][id]['number'] is None
 if id not in confirmed:assert study['guides'][id]['roadside_review']['status']=='hold' and id not in index['stops']
for id,p in confirmed.items():
 g=study['guides'][id];s=data['stops'][p['source_stop_id']]
 assert g['number'] is None and g['source_coordinates']==[s['stop_lon'],s['stop_lat']]==p['original_coordinates']
 assert g['roadside_review']['status']=='confirmed'
 for e in p['occurrences']:
  assert e['status']=='整合' and e['signed_left_m']>=3 and e['point_road_distance_m']<=30
  assert e['interval']['previous_s_m']<e['interval']['current_s_m']<e['interval']['next_s_m']
  t=next(t for t in data['boarding'][p['source_stop_id']] if t['trip_id']==e['trip_id'])
  assert t['pickup']['stop_id']==p['source_stop_id'] and t['headsign']==e['headsign']
  seq=data['trip_sections'][e['trip_id']];i=next(i for i,x in enumerate(seq) if x['stop_id']==p['source_stop_id'] and str(x['stop_sequence'])==str(e['stop_sequence']))
  assert seq[i-1]['stop_id']==e['previous_stop_id'] and seq[i+1]['stop_id']==e['next_stop_id']
 e=index['stops'][id];assert e['origin']==g['source_coordinates']
 if e.get('file'):
  c=read(R/'src/data/boarding-walk-study'/e['file']);assert c['id']==id and c['origin']==g['source_coordinates'] and c['gap']<=30
for r in read(S/'receipts.json'):
 raw=(S/r['file']).read_bytes();assert len(raw)==r['bytes'] and hashlib.sha256(raw).hexdigest()==r['sha256']
result={'baseline_original_walk_files_unchanged':len(walks),'baseline_index_entries_unchanged':len(oi['stops']),'baseline_missing_remaining':len(missing),'reference_connections_resolved_reused':len(resolved),'confirmed_new_originals':len(confirmed),'new_walk_files':sum(bool(index['stops'][id].get('file')) for id in confirmed),'old_guides_changed_only_walking_notice':sorted(resolved),'browser_checked':False}
(D/'source-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(result)
