"""Bake the reviewed boarding points with the existing walking method and original origins."""
import gc
import hashlib
import importlib.util
import json
from pathlib import Path
import time
import sys
import shutil

ROOT = Path(__file__).resolve().parents[1]
EXTEND = '--extend' in sys.argv
WORK = ROOT / ('work/regional-boarding-20260914' if EXTEND else 'work/boarding-walking-20260914')
if '--work-dir' in sys.argv:
    WORK = (ROOT / sys.argv[sys.argv.index('--work-dir') + 1]).resolve()
    if not WORK.is_relative_to(ROOT / 'work'):
        raise ValueError('Walking work directory must stay inside project work')
OUT = ROOT / 'src/data/boarding-walk-study'
spec = importlib.util.spec_from_file_location('bake', ROOT / 'scripts/bake-walking.py')
bake = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bake)

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

def key(p):
    return (round(p[0], 10), round(p[1], 10))

def apply_road_overlay(roads, overlay):
    """Replace fetched OSM IDs with their current source records, keeping provenance."""
    # Include restricted ways in the overlay so a new access restriction cannot
    # leave an older walkable copy behind. Apply the existing walking policy.
    replaced = {w['id'] for w in overlay['ways']}
    covered_nodes = {key for key,p in roads['nodes'].items()
                     if any(a <= p[0] <= c and b <= p[1] <= d for a,b,c,d in overlay['bboxes'])}
    # The query fetched every highway way in these boxes, including restricted
    # ways. An old way now absent in a covered box must not remain as a stale
    # shortcut after deletion, movement or loss of its highway tag.
    roads['ways'] = [w for w in roads['ways'] if w['id'] not in replaced
                    and not any(ref in covered_nodes for ref in w['refs'])]
    roads['ways'].extend(w for w in overlay['ways'] if bake._builder.can_walk(w['tags']))
    roads['nodes'].update(overlay['nodes'])

def require_road_coverage(targets, bounds):
    """Fail before baking if a source's walking area lies outside extracted roads."""
    missing = []
    for target in targets:
        lon, lat = target['geometry']['coordinates']
        # 1.6 km study radius; conservative conversion at Yamaguchi latitudes.
        dx, dy = 1600 / 90000, 1600 / 110000
        if not any(a <= lon-dx and b <= lat-dy and c >= lon+dx and d >= lat+dy
                   for a,b,c,d in bounds):
            missing.append(target.get('id', 'baseline'))
    if missing:
        raise ValueError('Road extraction coverage missing (not an absent road): ' + ', '.join(missing))

def main():
    started = time.time()
    WORK.mkdir(parents=True, exist_ok=True)
    study = read(ROOT / 'src/data/boarding-guide-study.json')
    index = read(OUT / 'index.json')['stops'] if EXTEND and (OUT / 'index.json').exists() else {}
    retry = set(read(ROOT / sys.argv[sys.argv.index('--retry-ids') + 1])) if '--retry-ids' in sys.argv else set()
    if retry and not EXTEND:
        raise ValueError('Retry requires --extend to preserve calculated origins')
    for sid in retry:
        if sid not in index or index[sid].get('file'):
            raise ValueError('Retry may only name previously uncalculated origins: ' + sid)
    for sid, entry in index.items():
        assert not study['guides'][sid].get('assignment_hold'), 'Held assignment cannot have a walking entry: ' + sid
        assert study['guides'][sid]['source_coordinates'] == entry['origin'], sid
        assert not entry.get('file') or (OUT / entry['file']).is_file(), sid
    targets = [{'id': sid, 'geometry': {'coordinates': row['source_coordinates']}}
               for sid, row in study['guides'].items()
               if not row.get('assignment_hold') and (sid not in index or sid in retry)]
    if '--target-ids' in sys.argv:
        allowed = set(read(ROOT / sys.argv[sys.argv.index('--target-ids') + 1]))
        if any(study['guides'][sid].get('roadside_review', {}).get('status') != 'confirmed'
               and study['guides'][sid].get('evidence') != 'official-platform-coordinate' for sid in allowed):
            raise ValueError('Directed target list includes a boarding position that is not confirmed')
        targets = [target for target in targets if target['id'] in allowed]
    if not targets:
        print('All source origins already have a recorded walking result', flush=True)
        return
    baseline_origin = [131.92142, 33.97257]
    road_targets = targets + [{'geometry': {'coordinates': baseline_origin}}]
    # A 1.6 km source margin retains the entire 1 km distance budget and the
    # 30 m grade-smoothing window. Retain whole crossing edges before splitting.
    graph_cache = WORK / 'graph.json'
    inputs = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in
              ['raw_data/yamaguchi-roads.json', 'raw_data/elevations.json',
               'src/data/boarding-guide-study.json', 'scripts/bake-walking.py']}
    inputs['target_ids'] = hashlib.sha256(json.dumps(targets, sort_keys=True).encode()).hexdigest()
    inputs['generator'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    overlay_path = ROOT / sys.argv[sys.argv.index('--road-overlay') + 1] if '--road-overlay' in sys.argv else None
    if overlay_path:
        inputs['road_overlay'] = hashlib.sha256(overlay_path.read_bytes()).hexdigest()
    signature = WORK / 'graph-inputs.json'
    if graph_cache.exists() and signature.exists() and read(signature) == inputs:
        graph = read(graph_cache)
        print('Using verified local graph cache', flush=True)
    else:
        print('Preparing existing graph and verifying elevation-table fingerprint', flush=True)
        original, _, _, _ = bake.prepare_graph(ROOT)
        elevation = bake.ElevationTable(ROOT / 'raw_data/elevations.json', original)
        # Restore coordinate-keyed samples in precisely the original lookup order.
        # Derive the source bounds from the target points, so a new region never
        # accidentally reuses the old Hikari/Shimonoseki-only bounds.
        samples, seen = {}, set()
        coords = [t['geometry']['coordinates'] for t in road_targets]
        xmin, xmax = min(p[0] for p in coords)-0.03, max(p[0] for p in coords)+0.03
        ymin, ymax = min(p[1] for p in coords)-0.025, max(p[1] for p in coords)+0.025
        def wanted(p):
            return xmin <= p[0] <= xmax and ymin <= p[1] <= ymax
        for edge in original['edges']:
            if edge[bake.FLAT] or edge[bake.STEPS] or edge[bake.LEN] <= 0:
                continue
            for node_index in edge[:2]:
                if node_index in seen:
                    continue
                seen.add(node_index)
                p = original['nodes'][node_index]
                value = elevation.at(*p)
                if wanted(p):
                    samples[key(p)] = value
        assert elevation.i == len(elevation.values)
        del original, elevation, seen
        gc.collect()
        print(f'Restored {len(samples)} existing elevation samples; preparing study roads', flush=True)
        roads = read(ROOT / 'raw_data/yamaguchi-roads.json')
        bounds = [roads['bbox']]
        if overlay_path:
            overlay = read(overlay_path)
            apply_road_overlay(roads, overlay)
            bounds.extend(overlay['bboxes'])
            del overlay
        require_road_coverage(road_targets, bounds)
        nodes, edges = bake.build_road_graph(roads)
        del roads
        edges = bake.prune_edges_near_stops(nodes, edges, {'features': road_targets},
                  prune_lon=0.025, prune_lat=0.02, prune_radius=1600.0)
        used = sorted({i for edge in edges for i in edge[:2]})
        remap = {old: new for new, old in enumerate(used)}
        local_nodes = [nodes[i] for i in used]
        for edge in edges:
            edge[0], edge[1] = remap[edge[0]], remap[edge[1]]
        del nodes, used, remap
        graph = bake.subdivide({'nodes': local_nodes, 'edges': edges}, 50.0)
        del local_nodes, edges
        gc.collect()
        if EXTEND:
            (WORK / 'dem').mkdir(exist_ok=True)
            for cache in ['boarding-walking-20260914', 'regional-boarding-20260914',
                          'western-hubs-20260914', 'bocho-regions-20260915', 'bocho-districts-20260915',
                          'boarding-connections-20260915', 'sanden-hubs-20260915']:
                for tile in (ROOT / 'work' / cache / 'dem').glob('*.gz'):
                    if not (WORK / 'dem' / tile.name).exists():
                        shutil.copy2(tile, WORK / 'dem' / tile.name)
        remote = bake.Elevation(WORK / 'dem', pause=0.25, max_requests=500)
        class StudyElevation:
            def at(self, lon, lat):
                k = key([lon, lat])
                if k not in samples:
                    samples[k] = remote.at(lon, lat)
                return samples[k]
        print(f"Applying same grade method to {len(graph['edges'])} study edges", flush=True)
        bake.apply_grades(graph, StudyElevation())
        write(WORK / 'elevation-sources.json', {'existing_samples_and_gsi_fallback': True, 'gsi': remote.stats()})
        write(graph_cache, graph)
        write(signature, inputs)
        del samples, remote
        gc.collect()
    grid = bake.GridIndex(graph)
    adjacency = bake.build_adjacency(graph)
    incidence = bake.build_incidence(graph)
    missing = []
    for target in targets:
        sid, origin = target['id'], target['geometry']['coordinates']
        # Original source ID is the catchment ID; different boarding points never
        # borrow a representative's file or collide at rounded coordinates.
        result = bake.bake_stop(graph, sid, sid, origin, 1000.0, grid,
                               adjacency=adjacency, incidence=incidence)
        filename = sid.replace(':', '-').replace('/', '-') + '.json'
        if result and result['seg']:
            result['origin'] = origin  # Preserve source precision, not rounded UI coordinates.
            write(OUT / filename, result)
            index[sid] = {'origin': origin, 'file': filename}
        else:
            missing.append(target)
            index[sid] = {'origin': origin, 'gap': None}
    distances = bake.unreachable_distances(graph, missing)
    for sid, gap in distances.items():
        index[sid]['gap'] = gap
    write(OUT / 'index.json', {'version': 1, 'budget': 1000, 'snap_limit': 30, 'stops': index})
    # Recompute the original Nishigawara too, for a direct method-parity check.
    baseline = bake.bake_stop(graph, '131.92142_33.97257', '西河原', baseline_origin,
                            1000.0, grid, adjacency=adjacency, incidence=incidence)
    write(WORK / 'baseline-nishigawara.json', baseline)
    receipt = {'targets': len(index), 'added_targets': len(targets)-len(retry),
               'retried_targets': len(retry), 'new_baked': len(targets)-len(missing),
               'baked': sum(bool(e.get('file')) for e in index.values()),
               'unreachable': {sid:e.get('gap') for sid,e in index.items() if not e.get('file')}, 'seconds': round(time.time()-started, 1),
               'nodes': len(graph['nodes']), 'edges': len(graph['edges']),
               'original_ids_and_coordinates_preserved': True, 'inputs': inputs}
    write(WORK / 'bake-receipt.json', receipt)
    print(json.dumps(receipt, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    main()
