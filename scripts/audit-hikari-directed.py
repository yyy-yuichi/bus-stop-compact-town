"""Ordered stop/shape matching and directed road-side audit, without moving source points.
Run first with --pilot, inspect evidence, then without --pilot. No app writes.
"""
import argparse, collections, csv, io, json, math, sys, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'data-sources/hikari-pairs-20260915/originals'
OUT=ROOT/'data-sources/hikari-directed-20260915'
parser=argparse.ArgumentParser()
parser.add_argument('--pilot',action='store_true')
parser.add_argument('--namespace',default='hikari')
parser.add_argument('--gtfs',type=Path,default=SRC/'sources/hikari-gtfs.zip')
parser.add_argument('--pairs',type=Path,default=SRC/'hikari-pairs.json')
parser.add_argument('--out',type=Path,default=OUT)
args=parser.parse_args();OUT=args.out
OUT.mkdir(parents=True,exist_ok=True)
SX=111320*math.cos(math.radians(34));SY=111320
def xy(p):return ((p[0]-132)*SX,(p[1]-34)*SY)
def ll(p):return [p[0]/SX+132,p[1]/SY+34]
def norm(p):return math.hypot(*p)
def sub(a,b):return (a[0]-b[0],a[1]-b[1])
def dot(a,b):return a[0]*b[0]+a[1]*b[1]
def project(p,a,b):
    v=sub(b,a);den=dot(v,v);t=max(0,min(1,dot(sub(p,a),v)/den)) if den else 0
    q=(a[0]+t*v[0],a[1]+t*v[1]);return norm(sub(p,q)),q,t
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def save(n,v):(OUT/n).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
with zipfile.ZipFile(args.gtfs) as z:
    def table(n):return list(csv.DictReader(io.StringIO(z.read(n+'.txt').decode('utf-8-sig'))))
    stops={r['stop_id']:r for r in table('stops')};routes={r['route_id']:r for r in table('routes')}
    trips={r['trip_id']:r for r in table('trips')};seqs=collections.defaultdict(list);shapes=collections.defaultdict(list)
    for r in table('stop_times'):seqs[r['trip_id']].append(r)
    for r in table('shapes'):shapes[r['shape_id']].append(r)
for seq in seqs.values():seq.sort(key=lambda r:int(r['stop_sequence']))
pos={sid:xy([float(s['stop_lon']),float(s['stop_lat'])]) for sid,s in stops.items()}
for sh,rows in shapes.items():
    rows.sort(key=lambda r:int(r['shape_pt_sequence']))
    points=[xy([float(r['shape_pt_lon']),float(r['shape_pt_lat'])]) for r in rows]
    cumulative=[0.0]
    for a,b in zip(points,points[1:]):cumulative.append(cumulative[-1]+norm(sub(b,a)))
    shapes[sh]={'points':points,'cum':cumulative,'source_sequences':[int(r['shape_pt_sequence']) for r in rows]}

def at(shape,s):
    cs=shape['cum'];ps=shape['points']
    for j in range(len(cs)-1):
        if cs[j+1]>=s:
            t=max(0,min(1,(s-cs[j])/(cs[j+1]-cs[j] or 1)))
            return (ps[j][0]+t*(ps[j+1][0]-ps[j][0]),ps[j][1]+t*(ps[j+1][1]-ps[j][1]))
    return ps[-1]

def candidates(shape,p):
    out=[]
    for j,(a,b) in enumerate(zip(shape['points'],shape['points'][1:])):
        d,q,t=project(p,a,b)
        if d<=100:out.append({'s':shape['cum'][j]+t*(shape['cum'][j+1]-shape['cum'][j]),'d':d,'j':j,'q':q})
    # Collapse projections at the SAME along-shape location, never across a return visit.
    keep=[]
    for c in sorted(out,key=lambda x:x['d']):
        if all(abs(c['s']-k['s'])>8 for k in keep):keep.append(c)
    return sorted(keep,key=lambda x:x['s'])

def ordered_match(shape,seq):
    cs=[candidates(shape,pos[r['stop_id']]) for r in seq]
    if any(not c for c in cs):return None,{'error':'100m以内のshape候補がない停留所','empty_indices':[i for i,c in enumerate(cs) if not c]}
    # DP over all stop occurrences, strictly monotonic along this shape.
    fw=[[float('inf')]*len(c) for c in cs];prev=[[None]*len(c) for c in cs]
    fw[0]=[c['d']**2 for c in cs[0]]
    for i in range(1,len(cs)):
        for k,c in enumerate(cs[i]):
            ok=[(fw[i-1][j],j) for j,p in enumerate(cs[i-1]) if c['s']>p['s']+0.1]
            if ok:
                v,j=min(ok);fw[i][k]=v+c['d']**2;prev[i][k]=j
    cost,k=min((v,k) for k,v in enumerate(fw[-1]))
    if not math.isfinite(cost):return None,{'error':'停車順を満たす単調対応なし'}
    chosen=[]
    for i in range(len(cs)-1,-1,-1):chosen.append(cs[i][k]);k=prev[i][k]
    chosen.reverse()
    bw=[[float('inf')]*len(c) for c in cs];bw[-1]=[0]*len(cs[-1])
    for i in range(len(cs)-2,-1,-1):
        for j,c in enumerate(cs[i]):
            vals=[n['d']**2+bw[i+1][k] for k,n in enumerate(cs[i+1]) if n['s']>c['s']+0.1]
            if vals:bw[i][j]=min(vals)
    # A second traversal position >40m away whose complete matching RMS differs <=1m is ambiguous.
    for i,c in enumerate(chosen):
        alternatives=[{'s':round(x['s'],2),'distance_m':round(x['d'],2)} for k,x in enumerate(cs[i])
          if abs(x['s']-c['s'])>40 and math.sqrt((fw[i][k]+bw[i][k])/len(cs))<=math.sqrt(cost/len(cs))+1]
        c['alternatives']=alternatives
    return chosen,{'rms_m':round(math.sqrt(cost/len(cs)),3),'max_stop_distance_m':round(max(c['d'] for c in chosen),3),
                  'stop_count':len(seq),'method':'monotonic-DP-all-stop-occurrences','shape_distance_field_present':False}

road={'nodes':{},'ways':[]};road_sources=[];waymap={}
for source in sorted(OUT.glob('carriageways-*.json')):
    if source.name.endswith('-receipt.json'):continue
    payload=read(source)
    if 'elements' not in payload:continue
    road_sources.append(source.name)
    for e in payload['elements']:
        if e['type']=='node':road['nodes'][str(e['id'])]=[e['lon'],e['lat']]
        elif e['type']=='way' and 'highway' in e.get('tags',{}):
            waymap[str(e['id'])]={'id':str(e['id']),'refs':[str(n) for n in e['nodes']],'tags':e['tags']}
if not road_sources:raise RuntimeError('Need full carriageway metadata; walk-filtered original is insufficient')
road['ways']=list(waymap.values())
segments=[];incident=collections.defaultdict(set);grid=collections.defaultdict(list)
vehicle={'trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','unclassified','residential','service','living_street'}
for w in road['ways']:
    if w['tags'].get('highway') not in vehicle:continue
    for na,nb in zip(w['refs'],w['refs'][1:]):
        if na not in road['nodes'] or nb not in road['nodes']:continue
        la,lb=road['nodes'][na][:2],road['nodes'][nb][:2]
        a,b=xy(la),xy(lb)
        if norm(sub(b,a))<0.01:continue
        idx=len(segments);segments.append({'a':a,'b':b,'way_id':w['id'],'node_ids':[na,nb],'tags':w['tags']})
        incident[na].add(nb);incident[nb].add(na)
        for gx in range(math.floor(min(a[0],b[0])/100),math.floor(max(a[0],b[0])/100)+1):
            for gy in range(math.floor(min(a[1],b[1])/100),math.floor(max(a[1],b[1])/100)+1):grid[gx,gy].append(idx)
def nearby(p):
    gx,gy=math.floor(p[0]/100),math.floor(p[1]/100)
    return [segments[j] for j in {i for x in range(gx-1,gx+2) for y in range(gy-1,gy+2) for i in grid[x,y]}]
def road_audit(p,shape,c,lo,hi):
    # Only samples in the selected previous->current->next occurrence interval.
    before=at(shape,max(lo,c['s']-20));after=at(shape,min(hi,c['s']+20));v=sub(after,before);length=norm(v)
    if length<5:return {'status':'判定不能','reasons':['前後区間内で進行方向を安定して読めない']}
    u=(v[0]/length,v[1]/length);samples=[at(shape,max(lo,min(hi,c['s']+d))) for d in [-15,0,15]]
    cand=[]
    for seg in nearby(p):
        a,b=seg['a'],seg['b'];rv=sub(b,a);rl=norm(rv);ru=(rv[0]/rl,rv[1]/rl)
        alignment=abs(dot(u,ru));distance,q,t=project(p,a,b)
        if distance>50 or alignment<0.85:continue
        # score against the LOCAL traversal, not only the original point
        residuals=[project(x,a,b)[0] for x in samples]
        fit=sum(residuals)/len(residuals)
        cand.append((fit,distance,seg,q,ru,t,alignment))
    if not cand:return {'status':'判定不能','reasons':['指定した進行区間に整合する車道線候補なし'],'travel_vector':u}
    cand.sort(key=lambda z:z[0]);fit,d,seg,q,ru,t,align=cand[0]
    if dot(ru,u)<0:ru=(-ru[0],-ru[1])
    offset=sub(p,q);left=ru[0]*offset[1]-ru[1]*offset[0]
    competing=[]
    for f2,d2,s2,q2,r2,t2,a2 in cand[1:]:
        if f2<=fit+3 and norm(sub(q,q2))>4:competing.append({'way_id':s2['way_id'],'fit_m':round(f2,2),'projection':ll(q2)})
    junctions=[]
    for n,ns in incident.items():
        if len(ns)>=3:
            jp=xy(road['nodes'][n][:2]);jd=norm(sub(jp,q))
            if jd<20:junctions.append({'node_id':n,'distance_m':round(jd,2),'degree':len(ns)})
    reasons=[]
    if c['alternatives']:reasons.append('停車順を守っても別の通過区間候補が残る')
    if c['d']>30:reasons.append('原点と対応shapeの距離が30m超')
    if fit>12:reasons.append('局所shapeと道路線の適合残差が12m超')
    if d>30:reasons.append('原点と車道線が30m超')
    if competing:reasons.append('局所shapeに同程度で適合する別車道線候補あり')
    # A nearby junction alone is not ambiguity. The ordered local shape can resolve a through movement.
    mid=at(shape,c['s']);vin=sub(mid,before);vout=sub(after,mid)
    turn=math.degrees(math.acos(max(-1,min(1,dot(vin,vout)/(norm(vin)*norm(vout) or 1)))))
    if turn>20:reasons.append('原点前後20mの進行方向変化が20度超で単一直線の道路側判定が不安定')
    if junctions and (min(j['distance_m'] for j in junctions)<8 or turn>20):
        reasons.append('分岐8m以内または分岐付近の20度超の曲折で乗降する枝の局所方向が不安定')
    if abs(left)<3:reasons.append('道路線の左右余裕が判定用の3m未満。座標精度不明のため保留（3mは公式の精度保証ではない）')
    one=seg['tags'].get('oneway');roadv=sub(seg['b'],seg['a']);forward=dot(roadv,u)>0
    if (one in ['yes','1','true'] and not forward) or (one=='-1' and forward):reasons.append('収録された一方通行方向と進行区間が不整合')
    status='判定不能' if reasons else ('整合' if left>=3 else '不整合')
    if status=='不整合':reasons.append('進行方向に対し原点が車道線の右側。対向乗降側の整合を確認できない（原点誤りの断定ではない）')
    if status=='整合':reasons.append('前後停車順で選定した局所進行方向と道路線が一致し、原点はその左側。机上整合であり標柱実見ではない')
    return {'status':status,'reasons':reasons,'way_id':seg['way_id'],'node_ids':seg['node_ids'],'road_tags':seg['tags'],
      'road_segment':[ll(seg['a']),ll(seg['b'])],'road_projection':ll(q),'travel_from':ll(before),'travel_to':ll(after),
      'heading_deg':round(math.degrees(math.atan2(u[0],u[1]))%360,1),'signed_left_m':round(left,3),
      'point_road_distance_m':round(d,3),'local_shape_road_fit_m':round(fit,3),'alignment':round(align,3),
      'local_turn_deg':round(turn,3),'oneway_evidence':one or 'tag absent; restriction not inferred',
      'side_margin_sensitivity_m':{str(m):left>=m for m in [1,2,3,5]},'competing_roads':competing,'nearby_junctions':junctions}

pairs=read(args.pairs);pilot_names=['土井','金山','木園','西河原','小周防Ｂ']
if '--pilot' in sys.argv:pairs=[p for p in pairs if p['stop_name'] in pilot_names]
target={s for p in pairs for s in p['stop_ids']}
patterns=collections.defaultdict(list)
for tid,seq in seqs.items():
    tr=trips[tid]
    key=(tr['route_id'],tr['shape_id'],tuple((r['stop_id'],r.get('stop_headsign',''),r.get('pickup_type',''),r.get('drop_off_type','')) for r in seq))
    patterns[key].append(tid)
per_stop=collections.defaultdict(list);pattern_report=[]
for key,tids in patterns.items():
    rid,sh,_=key;seq=seqs[tids[0]]
    if not any(r['stop_id'] in target for r in seq):continue
    shape=shapes[sh];matched,info=ordered_match(shape,seq)
    pattern_report.append({'route_id':rid,'shape_id':sh,'trips':tids,**info})
    for i,r in enumerate(seq):
        sid=r['stop_id']
        if sid not in target or r.get('pickup_type')=='1':continue
        prev=seq[i-1]['stop_id'] if i else None;next=seq[i+1]['stop_id'] if i+1<len(seq) else None
        item={'route_id':rid,'route_name':routes[rid]['route_long_name'],'shape_id':sh,'trip_ids':tids,
              'stop_sequence':int(r['stop_sequence']),'previous_stop_id':prev,'next_stop_id':next,
              'previous_stop_name':stops[prev]['stop_name'] if prev else None,'next_stop_name':stops[next]['stop_name'] if next else None,
              'stop_headsign':r.get('stop_headsign'),'trip_headsigns':sorted({trips[t]['trip_headsign'] for t in tids}),
              'whole_sequence_stop_ids':[x['stop_id'] for x in seq], 'matching':info}
        if not matched:item.update(status='判定不能',reasons=[info['error']])
        elif not prev or not next:item.update(status='判定不能',reasons=['起終点のため前後両側で区間を限定できない'])
        else:
            c=matched[i];lo=matched[i-1]['s'];hi=matched[i+1]['s']
            item['interval']={'previous_s_m':round(lo,3),'current_s_m':round(c['s'],3),'next_s_m':round(hi,3),
                 'shape_segment_index':c['j'],'shape_pt_sequence_start':shape['source_sequences'][c['j']],
                 'shape_pt_sequence_end':shape['source_sequences'][c['j']+1],
                 'stop_shape_distance_m':round(c['d'],3),'alternative_traversals':c['alternatives'],
                 'shape_coordinates':[ll(at(shape,lo))]+[ll(p) for j,p in enumerate(shape['points']) if lo<shape['cum'][j]<hi]+[ll(at(shape,hi))]}
            item.update(road_audit(pos[sid],shape,c,lo,hi))
        per_stop[sid].append(item)
ledger=[]
for pair in pairs:
    ps=[]
    for sid in pair['stop_ids']:
        es=per_stop[sid];confirmed=bool(es) and all(e['status']=='整合' for e in es)
        ps.append({'id':args.namespace+':'+sid,'source_stop_id':sid,'original_coordinates':[float(stops[sid]['stop_lon']),float(stops[sid]['stop_lat'])],
          'status':'机上確認済み' if confirmed else '保留','field_checked':False,'occurrences':es})
    ledger.append({'name':pair['stop_name'],'status':'確認済み' if all(p['status']=='机上確認済み' for p in ps) else '保留',
       'pair_distance_m':pair['distance_m'],'points':ps,'pairing_claim':'同名原2点の個別対応を確認する単位。単純な上下の対とは限らない。'})
summary={'pairs':len(ledger),'confirmed_pairs':sum(p['status']=='確認済み' for p in ledger),'held_pairs':sum(p['status']=='保留' for p in ledger),
 'confirmed_points':sum(p['status']=='机上確認済み' for pair in ledger for p in pair['points']),
 'occurrence_states':dict(collections.Counter(e['status'] for pair in ledger for p in pair['points'] for e in p['occurrences']))}
save('pilot.json' if '--pilot' in sys.argv else 'ledger.json',{'summary':summary,'pairs':ledger,'patterns':pattern_report,'road_sources':road_sources,
 'criteria':{'interpretation':'原ID別の方面と道路側の机上整合。現地標柱・歩行接続の確認ではない。',
 'direction_window_m':20,'max_turn_deg':20,'min_left_margin_m':3,'margin_is_official_accuracy':False,
 'max_stop_shape_distance_m':30,'max_point_road_distance_m':30,'max_local_shape_road_fit_m':12,
 'min_alignment_cosine':.85,'junction_uncertainty_radius_m':8,'competing_road_fit_delta_m':3,
 'alternative_traversal_separation_m':40,'alternative_total_match_rms_delta_m':1,
 'stop_sequence_matching':'全停車順の単調DP。前停留所と次停留所の区間内のみ。',
 'oneway':'収録タグのみ。欠落は規制なしと断定しない。'}})
print(json.dumps(summary,ensure_ascii=False))
for pair in ledger:
    print(pair['name'],pair['status'])
    for p in pair['points']:
        print(p['id'],p['status'],[(e['shape_id'],e['previous_stop_name'],e['next_stop_name'],e['status'],e.get('signed_left_m'),e['reasons']) for e in p['occurrences']])
