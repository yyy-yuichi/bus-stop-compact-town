"""Same directed geometry rules as the accepted v17 audit; reusable for additional official sources."""
import math,collections,json
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

def at(shape,s):
    cs=shape['cum'];ps=shape['points']
    for j in range(len(cs)-1):
        if cs[j+1]>=s:
            t=max(0,min(1,(s-cs[j])/(cs[j+1]-cs[j] or 1)))
            return (ps[j][0]+t*(ps[j+1][0]-ps[j][0]),ps[j][1]+t*(ps[j+1][1]-ps[j][1]))
    return ps[-1]

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

def load_roads(paths):
    global road,road_sources,waymap,segments,incident,grid
    road={'nodes':{},'ways':[]};road_sources=[];waymap={}
    for source in paths:
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
