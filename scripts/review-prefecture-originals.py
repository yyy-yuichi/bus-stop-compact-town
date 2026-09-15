"""Evaluate unassigned source records against ordered, directed evidence without ID merging.

National P11 aggregates opposing stops by design. OSM originals require a unique
official stop occurrence and independently consistent local directed geometry.
The 5m along-road window restricts this comparison to the already audited cross-section.
"""
from pathlib import Path
import collections,json,math,unicodedata
R=Path(__file__).resolve().parents[1];D=R/'data-sources/prefecture-directed-20260915'
inventory=json.loads((D/'inventory.json').read_text());study=json.loads((R/'src/data/boarding-guide-study.json').read_text())
original_osm={p['id']:p['properties'] for p in json.loads((R/'public/data/bus_stop.geojson').read_text())['features']}
def name(s):return ''.join(unicodedata.normalize('NFKC',s or '').split()).removesuffix('バス停')
def xy(p):return [p[0]*111320*math.cos(math.radians(34)),p[1]*111320]
def distance(a,b):return math.dist(xy(a),xy(b))
def project(p,a,b):
 p,a,b=xy(p),xy(a),xy(b);v=[b[0]-a[0],b[1]-a[1]];length=math.hypot(*v)
 t=max(0,min(1,((p[0]-a[0])*v[0]+(p[1]-a[1])*v[1])/(length*length)))
 return [a[0]+t*v[0],a[1]+t*v[1]],v,length,p
sources=collections.defaultdict(list)
by_source_id=collections.defaultdict(list)
for region in ['hikari-directed','iwakuni-directed','iwakuni-batch02','hikari-remaining','iwakuni-remaining','jr-prefecture']:
 file=R/f'data-sources/{region}-20260915/ledger.json'
 if not file.exists():continue
 for group in json.loads(file.read_text())['pairs']:
  for p in group['points']:
   record={**p,'official_stop_name':group['name'],'ledger':str(file.relative_to(R))};sources[name(group['name'])].append(record);by_source_id[p['source_stop_id']].append(record)
results=[]
for original in inventory['points']:
 existing_guide=study['guides'].get(original['id'])
 if existing_guide and not existing_guide.get('cross_source_reference'):continue
 row={**original,'field_checked':False}
 if original['source_kind']=='national-representative':
  row.update(status='保留',reason='P11-2022は同一道路・同一事業者・同名の停留所を原則統合した資料。収録系統は'+str(original.get('routes'))+'だが、この原点をどちら方面の乗車場所とするかは収録されていない。方向別の公式原点は別IDとして保持し、代表点を移動・置換しない。',source_url='https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P11-2022.html',method='published-source-schema')
 elif original['source_kind']=='osm-original':
  props=original_osm[original['id']];declared=[s.strip() for s in props.get('gtfs:stop_id','').split(';') if s.strip()]
  pool={p['id']:p for p in sources[name(original['name'])]}
  linked=[p for sid in declared for p in by_source_id[sid]]
  if 'ジェイアール' in props.get('operator','') or 'JR Bus' in props.get('operator:en',''):linked=[p for p in linked if p['id'].startswith('jr-chugoku:')]
  if linked:pool={p['id']:p for p in linked}
  candidates=[{**p,'distance_m':distance(original['origin'],p['original_coordinates'])} for p in pool.values()]
  near=[p for p in candidates if p['distance_m']<=15]
  row.update(status='保留',method='unique-official-occurrence-and-directed-cross-section',osm_gtfs_stop_ids=declared,osm_operator=props.get('operator'),original_local_ref=props.get('local_ref') or props.get('ref'),candidates=[{'id':p['id'],'distance_m':round(p['distance_m'],3),'status':p['status'],'ledger':p['ledger']} for p in candidates],geometry_checks=[])
  if len(near)!=1:
   row['reason']=('原本のgtfs:stop_idに対応する' if linked else '同名の')+'公式GTFS原点との15m内の候補が'+str(len(near))+'件。近接だけでは方面対応を採用せず、原点に対応する公式地図または運行経路の追加照合が必要。'
  elif declared and near[0]['source_stop_id'] not in declared:row['reason']='OSM原本のgtfs:stop_id '+','.join(declared)+' と近接する現行資料の '+near[0]['id']+' が異なる。運行主体・原点の引継ぎ対応を確認できないため、近さと形状だけで方面を転記しない。'
  elif near[0]['status']!='机上確認済み':row['reason']='唯一の対応公式原点 '+near[0]['id']+' 自体の前後経路・道路側が保留。保留理由は参照台帳の各乗車区間に保存。'
  else:
   candidate=near[0];problems=[]
   for e in candidate['occurrences']:
    q,v,length,p=project(original['origin'],*e['road_segment']);travel=[b-a for a,b in zip(xy(e['travel_from']),xy(e['travel_to']))]
    if sum(a*b for a,b in zip(v,travel))<0:v=[-a for a in v]
    left=(v[0]*(p[1]-q[1])-v[1]*(p[0]-q[0]))/length;delta=math.dist(q,xy(e['road_projection']));gap=math.dist(q,p)
    reasons=[]
    if left<3:reasons.append('進行方向の左側余裕3m未満または右側')
    if delta>5:reasons.append('確認済み道路断面から沿道方向5m超')
    if gap>30:reasons.append('道路線から30m超')
    if any(j['distance_m']-delta<8 for j in e['nearby_junctions']):reasons.append('確認済み断面とのずれを含めると分岐8m内の可能性')
    row['geometry_checks'].append({'source_stop_id':candidate['id'],'route_id':e['route_id'],'shape_id':e['shape_id'],'stop_sequence':e['stop_sequence'],'previous_stop_id':e['previous_stop_id'],'next_stop_id':e['next_stop_id'],'signed_left_m':left,'along_cross_section_delta_m':delta,'road_distance_m':gap,'way_id':e['way_id'],'road_segment':e['road_segment'],'reasons':reasons})
    problems.extend(reasons)
   row['reference_id']=candidate['id'];row['reference_ledger']=candidate['ledger'];row['official_stop_name']=candidate['official_stop_name']
   row['status']='保留' if problems else '机上確認済み'
   linkage=('OSM原本のgtfs:stop_id '+','.join(declared)+' が公式原点と一致。' if declared else '同名・距離は候補抽出にのみ使用。')
   row['reason']=' / '.join(sorted(set(problems))) if problems else linkage+'唯一の公式停車原点の前後区間・進行方向に対し、OSM原座標も同一道路の左側3m以上で、監査済み断面から沿道方向5m以内。全乗車区間が整合。原IDは統合せず標柱は現地未確認。'
 else:
  row.update(status='未処理',reason='この資料種別の個別照合はまだ実施していない。')
 results.append(row)
out={'criteria':{'candidate_radius_m':15,'max_along_cross_section_delta_m':5,'minimum_left_margin_m':3,'field_checked':False,'note':'判定用余裕は公式の精度保証ではない。候補不足は資料不存在の証明ではない。'},'summary':dict(collections.Counter(p['status'] for p in results)),'points':results}
(D/'original-record-review.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(out['summary'])
