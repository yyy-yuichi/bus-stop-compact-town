import fs from 'node:fs';
import {hash}from'./jev-batch.mjs';
import {anchor,municipalityIndex}from'./facility-bulk-lib.mjs';
import {placePosition}from'./facility-evidence-lib.mjs';
const d='outputs/facility-evidence-20260925',read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const base=['shopping.geojson','civic-facilities.geojson'].flatMap(n=>read('public/data/'+n).features).concat(read('public/data/facility-current.json').additions);
const boundaries=municipalityIndex(read('data-sources/prefecture-directed-20260915/municipal-boundaries.geojson').features);
const dist=(a,b)=>Math.hypot((a[0]-b[0])*Math.cos(a[1]*Math.PI/180)*111320,(a[1]-b[1])*111320);
const plans=[...read(d+'/followup-plan.json'),...read(d+'/map-followup-plan.json')],seen=new Set(),rows=[];
for(const item of plans){if(!item.source||seen.has(item.source+'|'+item.url))continue;seen.add(item.source+'|'+item.url);
 const file=d+'/followups/'+hash(item.url).slice(0,24)+'.json';if(!fs.existsSync(file))continue;const r=read(file);if(r.error)continue;
 const position=placePosition(item.url,r);if(!position)continue;
 const {name,coordinates:coords,method}=position;
 const nearest=base.map(f=>({id:f.id,name:f.properties.name,category:f.properties.category,distance_m:anchor(f.geometry)?Math.round(dist(coords,anchor(f.geometry))):Infinity})).sort((a,b)=>a.distance_m-b.distance_m).slice(0,5);
 rows.push({source:item.source,map_url:item.url,map_name:name,coordinates:coords,method,city:boundaries.locate(coords),receipt:file,receipt_hash:hash(r),nearest,identity_confirmed:false});
}
fs.writeFileSync(d+'/positions.json',JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify({positions:rows.length,within_yamaguchi:rows.filter(r=>r.city.length).length}));
