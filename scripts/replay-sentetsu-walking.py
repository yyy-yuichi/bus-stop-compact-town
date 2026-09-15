"""Reproduce only the seven new catchments from their saved graphs; never overwrite app originals."""
from pathlib import Path
import json,importlib.util,hashlib
R=Path(__file__).resolve().parents[1];D=R/'data-sources/sentetsu-v19-20260915';W=R/'work/sentetsu-v19-20260915'
def read(p):return json.loads(p.read_text())
spec=importlib.util.spec_from_file_location('bake',R/'scripts/bake-walking.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
first=set(read(D/'first-walking-targets.json'));all_ids=set(read(D/'confirmed-walking-targets.json'));index=read(R/'src/data/boarding-walk-study/index.json')['stops'];results=[]
for graph_file,ids in [('graph-first.json',first),('graph.json',all_ids-first)]:
 graph=read(W/graph_file);grid=b.GridIndex(graph);adjacency=b.build_adjacency(graph);incidence=b.build_incidence(graph)
 for id in sorted(ids):
  origin=index[id]['origin'];c=b.bake_stop(graph,id,id,origin,1000.0,grid,adjacency=adjacency,incidence=incidence);assert c and c['seg'];c['origin']=origin
  raw=json.dumps(c,ensure_ascii=False,separators=(',',':')).encode();expected=(R/'src/data/boarding-walk-study'/index[id]['file']).read_bytes();assert raw==expected,id
  results.append({'id':id,'graph':graph_file,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'exact_match':True})
(D/'graph-reproduction-verification.json').write_text(json.dumps({'new_results_reproduced':len(results),'originals_overwritten':False,'points':results},ensure_ascii=False,indent=2)+'\n');print('Saved graph reproduction exact matches',len(results))
