import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync('public/data/shopping.geojson','utf8'));
const ids=new Set(), sources=new Set();
const counts={building:0,facility_area:0,representative_point:0};
const categories={mall:0,supermarket:0,drugstore:0,convenience:0,hospital:0,clinic:0,pharmacy:0};
for(const f of data.features) {
 const p=f.properties;
 if(!f.id||ids.has(f.id)) throw Error(`Duplicate/missing ID: ${f.id}`);
 ids.add(f.id);
 if(!(p.category in categories)) throw Error(`Unknown shopping category: ${f.id}`);
 categories[p.category]++;
 if(!p.name||!p.source_timestamp||!p.source_ids?.length||p.license!=='ODbL-1.0') throw Error(`Missing provenance: ${f.id}`);
 if(p.verification_status==='osm_unverified') {
  if(p.verified_at||p.official_address||p.official_url||!p.retrieved_at) throw Error(`Unverified record presented as official: ${f.id}`);
  if(!/^osm-(node|way|relation)-\d+$/.test(f.id)||p.geometry_kind!=='representative_point') throw Error(`Invalid imported record: ${f.id}`);
  if(p.website) { const url=new URL(p.website); if(!['http:','https:'].includes(url.protocol)||url.username||url.password) throw Error(`Unsafe registered URL: ${f.id}`); }
 } else {
  if(!p.official_address||!p.city||!p.verified_at) throw Error(`Missing curated provenance: ${f.id}`);
  if(new URL(p.official_url).protocol!=='https:') throw Error(`Unsafe official URL: ${f.id}`);
 }
 for(const id of p.source_ids) {if(sources.has(id)) throw Error(`Repeated source: ${id}`);sources.add(id);}
 if(!(p.geometry_kind in counts)) throw Error(`Unknown geometry kind: ${f.id}`);
 counts[p.geometry_kind]++;
 if(!['Point','MultiPolygon'].includes(f.geometry.type)) throw Error(`Invalid type: ${f.id}`);
 if((f.geometry.type==='Point')!==(p.geometry_kind==='representative_point')) throw Error(`Kind mismatch: ${f.id}`);
 const rings=f.geometry.type==='Point'?[[f.geometry.coordinates]]:f.geometry.coordinates.flat();
 for(const ring of rings) {
  if(ring.some(c=>c.length!==2||!c.every(Number.isFinite)||c[0]<130||c[0]>133||c[1]<33||c[1]>35)) throw Error(`Invalid coordinates: ${f.id}`);
  if(f.geometry.type!=='Point'&&(ring.length<4||JSON.stringify(ring[0])!==JSON.stringify(ring.at(-1)))) throw Error(`Unclosed ring: ${f.id}`);
 }
}
console.log(JSON.stringify({facilities:ids.size,source_elements:sources.size,geometry:counts,categories},null,2));
