import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateWalk, reachableLines, reachFacility, validateGraph, distance } from '../src/walking.ts';
const x = 180 / (Math.PI * 6371000);
const graph = (nodes, edges) => ({ version: 1, nodes: nodes.map(([x, y], i) => [x, y, String(i)]), edges, pilot_stops: [], facility_ids: [], core: [-1,-1,1,1], bbox: [-1,-1,1,1] });
// A point inside a long edge must produce a clipped road, even if neither end is reachable.
const long = graph([[0,0],[1000*x,0]], [[0,1,1000,1,1,'1']]);
let r = calculateWalk(long, [500*x,0], 100);
assert(r); assert.equal(reachableLines(r, 100).length, 1);
let line = reachableLines(r, 100)[0];
assert(Math.abs(distance(...line)-200)<0.01);
assert(Math.abs(line[0][0]/x-400)<0.01 && Math.abs(line[1][0]/x-600)<0.01);
// Disconnected crossing ways must never be joined by proximity.
const cross = graph([[-100*x,0],[100*x,0],[0,-100*x],[0,100*x]], [[0,1,200,1,1,'1'],[2,3,200,1,1,'2']]);
r=calculateWalk(cross,[-90*x,0],300);
assert(!Number.isFinite(r.distances[2])); assert(!Number.isFinite(r.distances[3]));
// Pedestrian one-way respected in the middle, but starting on a junction can enter other roads.
const directed=graph([[0,0],[100*x,0],[0,100*x]],[[0,1,100,1,0,'1'],[0,2,100,1,1,'2']]);
r=calculateWalk(directed,[50*x,0],100); assert(!Number.isFinite(r.distances[0]));
r=calculateWalk(directed,[0,0],110); assert.equal(r.distances[2],100);
// A remote stop is not connected by a made-up long straight line.
assert.equal(calculateWalk(long,[0,100*x],300),null);
// Origin-to-road offset consumes the time budget.
r=calculateWalk(long,[500*x,20*x],100);line=reachableLines(r,100)[0];assert(Math.abs(distance(...line)-160)<0.01);
// Shortest route can be discovered after a more expensive path.
const loop=graph([[0,0],[100*x,0],[50*x,50*x],[200*x,0]],[[0,1,100,1,1,'1'],[0,2,60,1,1,'2'],[2,1,20,1,1,'3'],[1,3,100,1,1,'4']]);
r=calculateWalk(loop,[0,0],200);assert.equal(r.distances[1],80);assert.equal(r.distances[3],180);
assert.throws(()=>validateGraph({...long,edges:[[0,900,100,1,1,'x']]}));
// Facility inside the reachable road interval, not reachable across a disconnected component.
r=calculateWalk(long,[0,0],200);
assert(reachFacility(r,[[[150*x,5*x]]])?.meters<=151);
assert.equal(reachFacility(r,[[[500*x,5*x]]]),null);
const pilot=JSON.parse(fs.readFileSync('public/data/walking-onoda.json','utf8'));validateGraph(pilot);
const mall=JSON.parse(fs.readFileSync('public/data/shopping.geojson','utf8')).features.find(f=>f.id==='sunpark');
const rings=mall.geometry.coordinates.map(p=>p[0]);
const results=[];
for(const stop of pilot.pilot_stops){
  const walk=calculateWalk(pilot,stop.coordinate,4*1000/6);assert(walk,stop.name);
  const five=reachableLines(walk,4*1000/12),ten=reachableLines(walk,4*1000/6);
  const sum=lines=>lines.reduce((s,l)=>s+distance(...l),0);
  assert(sum(five)<=sum(ten)+0.01);
  const hit=reachFacility(walk,rings);
  results.push({id:stop.id,name:stop.name,road_connection_m:Math.round(walk.snap.gap),reachable_road_m_5:Math.round(sum(five)),reachable_road_m_10:Math.round(sum(ten)),facility_road_distance_m:hit?Math.round(hit.meters):null});
}
assert(results[0].facility_road_distance_m!==null);

// 焼いた結果が満たすべき不変条件を確かめ、あわせて現行実装と桁が合うかだけ見る。
// 事前に `python3 scripts/bake-walking.py --pilot` を実行しておく。
// calculateWalk との突き合わせは、Task 11 でそれが消えるまでの暫定。
const bakeDir = 'work/pilot-bake';
if (fs.existsSync(bakeDir)) {
  const total = lines => lines.reduce((s, l) => s + distance(...l), 0);
  for (const stop of pilot.pilot_stops) {
    const file = `${bakeDir}/${stop.id.replaceAll('/', '-')}.geojson`;
    const fc = JSON.parse(fs.readFileSync(file, 'utf8'));
    const segments = fc.features.filter(f => f.properties.role === 'segment');
    const banded = budget => segments.reduce((sum, f) => {
      const { d1, d2 } = f.properties;
      const [p, q] = f.geometry.coordinates;
      if (d1 > budget && d2 > budget) return sum;
      const len = distance(p, q);
      if (d1 <= budget && d2 <= budget) return sum + len;
      return sum + len * Math.min(1, (budget - Math.min(d1, d2)) / Math.abs(d2 - d1));
    }, 0);

    // 帯は広げるほど伸びる。焼いたデータだけで閉じた検査で、現行実装に依存しない。
    const bands = [250, 500, 750, 1000].map(banded);
    for (let i = 1; i < bands.length; i++) {
      assert(bands[i] >= bands[i - 1] - 1e-6, `${stop.name}: 帯が縮んだ ${bands}`);
    }
    assert(bands[0] > 0 && bands[3] > bands[0], `${stop.name}: 帯が広がらない ${bands}`);
    assert(segments.every(f => f.properties.d1 <= fc.budget && f.properties.d2 <= fc.budget),
      `${stop.name}: バジェットを超える距離が残っている`);

    // 現行の calculateWalk は試作なので、桁違いのずれだけを見る参考比較にとどめる。
    const live = total(reachableLines(calculateWalk(pilot, stop.coordinate, 1000), 1000));
    assert(Math.abs(bands[3] - live) < live * 0.10,
      `${stop.name}: baked ${bands[3].toFixed(0)}m vs provisional ${live.toFixed(0)}m`);
  }
  console.log(`Baked catchment invariants held for ${pilot.pilot_stops.length} stops.`);
} else {
  throw Error('Run `python3 scripts/bake-walking.py --pilot` before the walking tests');
}

console.log(JSON.stringify({checks:'clipping, topology, direction, snap, shortest paths, facility, real pilot',pilot:results},null,2));
