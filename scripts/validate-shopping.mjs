import { SHOPPING_CATEGORIES } from '../src/facilityCatalog.ts';
import fs from 'node:fs';
const data={features: ['shopping','civic-facilities'].flatMap(name=>JSON.parse(fs.readFileSync(`public/data/${name}.geojson`,'utf8')).features)};
const ids=new Set(), sources=new Set();
const counts={building:0,facility_area:0,representative_point:0};
const categories=Object.fromEntries([...SHOPPING_CATEGORIES.map(c=>c.id),'reference'].map(id=>[id,0]));
for(const f of data.features) {
 const p=f.properties;
 if(!f.id||ids.has(f.id)) throw Error(`Duplicate/missing ID: ${f.id}`);
 ids.add(f.id);
 if(!(p.category in categories)) throw Error(`Unknown shopping category: ${f.id}`);
 categories[p.category]++;
 if(p.category==='reference'&&!['out_of_scope','pending'].includes(p.classification_review?.status)) throw Error(`Missing reference reason: ${f.id}`);
 if(p.classification_review) {
  const r=p.classification_review;
  if(!['corrected','out_of_scope','pending','retained'].includes(r.status)||!r.note||!r.checked_at||!r.original_category) throw Error(`Invalid classification review: ${f.id}`);
  if(r.status!=='pending'&&!r.evidence_url) throw Error(`Missing classification evidence: ${f.id}`);
  if(r.evidence_url) { const url=new URL(r.evidence_url); if(url.protocol!=='https:'||url.username||url.password) throw Error(`Unsafe evidence URL: ${f.id}`); }
 }
 const civic=p.verification_status==='civic_unverified';
 if(!p.name||!p.source_timestamp||!p.source_ids?.length||p.license!==(civic?'CC-BY-4.0':'ODbL-1.0')) throw Error(`Missing provenance: ${f.id}`);
 if(civic) {
  if(!/^civic-[\w-]+$/.test(f.id)||p.geometry_kind!=='representative_point'||p.verified_at||p.official_address||p.official_url||!p.retrieved_at||!p.civic_sources?.length||!p.address||!p.city) throw Error(`Invalid civic provenance: ${f.id}`);
  for(const source of p.civic_sources) {
   if(!source.title||!source.publisher||!/^\d{4}-\d{2}(?:-\d{2})?$/.test(source.date)||!source.url.startsWith('https://yamaguchi-opendata.jp/ckan/dataset/')) throw Error(`Invalid civic source: ${f.id}`);
  }
  if(p.source_ids.some(id=>!/^civic:[a-f\d-]+:row:\d+$/.test(id))) throw Error(`Invalid civic row: ${f.id}`);
  if(p.civic_details?.some(d=>!d.label||!d.value||!p.source_ids.includes(d.source_id))) throw Error(`Unattributed civic detail: ${f.id}`);
  if(p.website) { const url=new URL(p.website); if(!['http:','https:'].includes(url.protocol)||url.username||url.password) throw Error(`Unsafe civic URL: ${f.id}`); }
 } else if(p.verification_status==='osm_unverified') {
  if(p.verified_at||p.official_address||p.official_url||!p.retrieved_at) throw Error(`Unverified record presented as official: ${f.id}`);
  if(!/^osm-(node|way|relation)-\d+$/.test(f.id)||!['representative_point','facility_area'].includes(p.geometry_kind)) throw Error(`Invalid imported record: ${f.id}`);
  if(p.website) { const url=new URL(p.website); if(!['http:','https:'].includes(url.protocol)||url.username||url.password) throw Error(`Unsafe registered URL: ${f.id}`); }
 } else {
  if(!p.official_address||!p.city||!p.verified_at) throw Error(`Missing curated provenance: ${f.id}`);
  if(new URL(p.official_url).protocol!=='https:') throw Error(`Unsafe official URL: ${f.id}`);
 }
 if(p.registration_origin && (!Array.isArray(p.registration_origin)||p.registration_origin.some(v=>typeof v!=='string'||!v.trim()||v.length>1000))) throw Error(`Invalid source note: ${f.id}`);
 if(p.registered_details) {
  const details=p.registered_details;
  if(p.category==='reference'||!Array.isArray(details.sources)||!details.sources.length) throw Error(`Invalid detail provenance: ${f.id}`);
  for(const source of details.sources) {
   if(!p.source_ids.includes(source.source_id)||!Number.isFinite(Date.parse(source.source_timestamp))||!Number.isFinite(Date.parse(source.retrieved_at))) throw Error(`Unattributed details: ${f.id}`);
  }
  for(const [field,values] of Object.entries(details)) {
   if(field==='sources') continue;
   if(!['phone','opening_hours','operator','brand','branch','cuisine','wheelchair','specialty','service','access'].includes(field)||!Array.isArray(values)||!values.length||values.some(v=>typeof v!=='string'||!v.trim()||v.length>1000)||new Set(values).size!==values.length) throw Error(`Invalid registered detail: ${f.id}/${field}`);
  }
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
