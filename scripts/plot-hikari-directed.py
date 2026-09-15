"""Data-only diagnostic overlay, not a new basemap or invented boarding plan."""
import argparse,json,math,sys
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parents[1];D=ROOT/'data-sources/hikari-directed-20260915'
p=argparse.ArgumentParser();p.add_argument('--all',action='store_true');p.add_argument('--directory',type=Path,default=D)
p.add_argument('--names',nargs='+')
args=p.parse_args();D=args.directory
data=json.loads((D/('ledger.json' if '--all' in sys.argv else 'pilot.json')).read_text())
roads={'nodes':{},'ways':[]};ways={}
for source in D.glob('carriageways-*.json'):
    if source.name.endswith('-receipt.json'):continue
    for e in json.loads(source.read_text())['elements']:
        if e['type']=='node':roads['nodes'][str(e['id'])]=[e['lon'],e['lat']]
        elif e['type']=='way':ways[str(e['id'])]={'refs':[str(n) for n in e['nodes']]}
roads['ways']=list(ways.values())
out=ROOT/'work'/D.name;out.mkdir(parents=True,exist_ok=True)
sx=111320*math.cos(math.radians(34));sy=111320
for pair in data['pairs']:
    if args.names and pair['name'] not in args.names:continue
    originals=[p['original_coordinates'] for p in pair['points']]
    cx=sum(p[0] for p in originals)/len(originals);cy=sum(p[1] for p in originals)/len(originals)
    def xy(p):return [(p[0]-cx)*sx,(p[1]-cy)*sy]
    span=max(80,(pair['pair_distance_m'] or 0)/2+60,max(math.hypot(*xy(z)) for z in originals)+60)
    fig,ax=plt.subplots(figsize=(8,7));allids=[]
    for w in roads['ways']:
        refs=w['refs']; coords=[roads['nodes'].get(n) for n in refs]
        for a,b in zip(coords,coords[1:]):
            if a is None or b is None:continue
            pa,pb=xy(a),xy(b)
            if min(pa[0],pb[0])>span or max(pa[0],pb[0])<-span or min(pa[1],pb[1])>span or max(pa[1],pb[1])<-span:continue
            ax.plot([pa[0],pb[0]],[pa[1],pb[1]],color='#999999',lw=1)
    for k,p in enumerate(pair['points']):
        color=['#0072b2','#d55e00','#009e73','#cc79a7'][k%4];a=xy(p['original_coordinates']);allids.append(p['id'])
        ax.scatter(*a,c=color,s=75,zorder=5);ax.annotate(p['id'],a,xytext=(5,8),textcoords='offset points',fontsize=9,color=color)
        used=set()
        for e in p['occurrences']:
            if e['shape_id'] in used:continue
            used.add(e['shape_id'])
            if 'interval' not in e:continue
            coords=[xy(z) for z in e['interval']['shape_coordinates']]
            ax.plot([z[0] for z in coords],[z[1] for z in coords],c=color,lw=1.5,alpha=.6)
            if 'travel_from' in e:
                x,y=xy(e['travel_from']),xy(e['travel_to'])
                ax.annotate('',xy=y,xytext=x,arrowprops={'arrowstyle':'->','color':color,'lw':2})
                road=[xy(z) for z in e['road_segment']];ax.plot([z[0] for z in road],[z[1] for z in road],c='black',lw=2)
                q=xy(e['road_projection']);ax.plot([a[0],q[0]],[a[1],q[1]],c=color,ls=':')
                for j in e['nearby_junctions']:
                    qj=xy(roads['nodes'][j['node_id']]);ax.scatter(*qj,c='purple',marker='x',s=60)
    ax.set(xlim=(-span,span),ylim=(-span,span),xlabel='East (m)',ylabel='North (m)',title=' / '.join(allids)+'\nGray: OSM | colored: selected stop interval | black: tested road')
    ax.set_aspect('equal');ax.grid(alpha=.2);fig.tight_layout();fig.savefig(out/(pair['points'][0]['source_stop_id']+'.png'),dpi=140);plt.close(fig)
print(out)
