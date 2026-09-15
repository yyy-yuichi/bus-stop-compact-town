"""Render retained official map geometry, roads and unchanged original stops for individual review."""
from pathlib import Path
import json
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
R=Path(__file__).resolve().parents[1];D=R/'data-sources/sentetsu-v19-20260915'
j=json.loads((D/'ledger.json').read_text());sh=json.loads((D/'official-map-sections.json').read_text());rd=json.loads((D/'carriageways-verified.json').read_text())['elements'];ns={e['id']:[e['lon'],e['lat']] for e in rd if e['type']=='node'}
fig,axs=plt.subplots(1,3,figsize=(15,5))
for ax,name in zip(axs,['竜王町','公園通','西の浜']):
 group=next(g for g in j['pairs'] if g['name']==name);x,y=group['points'][0]['original_coordinates']
 for w in rd:
  if w['type']=='way':
   ps=[ns[n] for n in w['nodes'] if n in ns]
   if any(abs(p[0]-x)<.002 and abs(p[1]-y)<.002 for p in ps):ax.plot([p[0] for p in ps],[p[1] for p in ps],color='gray',lw=1)
 for sid in {e['official_map_section'] for p in group['points'] for e in p['occurrences'] if 'official_map_section' in e}:
  ps=next(s['coordinates'] for s in sh if s['id']==sid);ax.plot([p[0] for p in ps],[p[1] for p in ps],color='green',lw=1)
 for p in group['points']:
  a,b=p['original_coordinates'];ax.scatter([a],[b],color='red');ax.annotate(p['source_stop_id'],(a,b))
 ax.set_xlim(x-.00065,x+.00065);ax.set_ylim(y-.00065,y+.00065);ax.set_aspect(1.2);ax.set_title(group['points'][0]['source_stop_id'].split('_')[0]);ax.ticklabel_format(useOffset=False)
fig.tight_layout();fig.savefig(D/'local-route-originals-review.png',dpi=150)
