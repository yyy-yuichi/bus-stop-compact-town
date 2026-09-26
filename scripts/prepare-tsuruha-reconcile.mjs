import fs from 'node:fs';
import {hash} from './jev-batch.mjs';
import {httpLinks, htmlText, anchor, municipalityIndex} from './facility-bulk-lib.mjs';
const d='outputs/facility-reconcile-20260925', read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const stage=process.argv[2],urls=new Map();
const receipt=u=>d+'/pages/'+hash(u).slice(0,24)+'.json';
if(stage==='cities') {
  const url='https://shop.tsuruha-g.com/yamaguchi',r=read(receipt(url));
  for(const u of httpLinks(r.html,url).filter(u=>/^https:\/\/shop.tsuruha-g.com\/yamaguchi\/\w+$/.test(u)))urls.set(u,{url:u,source:url});
} else if(stage==='stores') {
  for(const item of read(d+'/cities-plan.json')){const r=read(receipt(item.url));if(r.error)throw Error('Incomplete city directory');for(const u of httpLinks(r.html,item.url).filter(u=>/^https:\/\/shop.tsuruha-g.com\/\d+$/.test(u)))urls.set(u,{url:u,source:item.url});}
} else if(stage==='index') {
  const base=['shopping.geojson','civic-facilities.geojson'].flatMap(n=>read('public/data/'+n).features).concat(read('public/data/facility-current.json').additions);
  const bounds=municipalityIndex(read('data-sources/prefecture-directed-20260915/municipal-boundaries.geojson').features);
  const rows=[];
  for(const item of read(d+'/stores-plan.json')) {
    const file=receipt(item.url),r=read(file);if(r.error)throw Error('Missing store: '+item.url);
    const ld=[...r.html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g)].flatMap(m=>{const j=JSON.parse(m[1]);return j['@graph']??[j];}).filter(x=>x?.geo&&x?.address&&x?.name);
    if(ld.length!==1)throw Error('Ambiguous business structured data: '+item.url);
    const s=ld[0],coordinates=[Number(s.geo.longitude),Number(s.geo.latitude)],cities=bounds.locate(coordinates);
    const addressMatches=cities.length===1&&(s.address.addressLocality.endsWith(cities[0])||s.address.addressLocality.endsWith('郡')&&s.address.streetAddress.startsWith(cities[0]));
    if(s.address.addressRegion!=='山口県'||!addressMatches)throw Error('Address / municipality disagreement: '+item.url);
    const distance=f=>{const a=anchor(f.geometry);return a?Math.round(Math.hypot((a[0]-coordinates[0])*Math.cos(coordinates[1]*Math.PI/180)*111320,(a[1]-coordinates[1])*111320)):Infinity;};
    const nearby=base.filter(f=>['drugstore','pharmacy','reference'].includes(f.properties.category)).map(f=>({id:f.id,name:f.properties.name,category:f.properties.category,distance_m:distance(f),address:f.properties.address,search_names:f.properties.search_names,already_excluded:f.properties.category==='reference'})).filter(f=>f.distance_m<800).sort((a,b)=>a.distance_m-b.distance_m).slice(0,8);
    rows.push({id:'tsuruha-'+item.url.split('/').pop(),url:item.url,name:s.name,address:s.address.addressRegion+s.address.addressLocality+s.address.streetAddress,city:cities[0],coordinates,description:s.description,phone:s.telephone,nearby,receipt:file,receipt_hash:hash(r),text:htmlText(r.html)});
  }
  const expected=Number(htmlText(read(receipt('https://shop.tsuruha-g.com/yamaguchi')).html).match(/山口県（(\d+)件）/)[1]);
  if(rows.length!==expected)throw Error('Directory count mismatch: '+rows.length+'/'+expected);
  fs.writeFileSync(d+'/tsuruha-stores.json',JSON.stringify(rows,null,2)+'\n');
  console.log(JSON.stringify({official_rows:rows.length,with_nearby:rows.filter(r=>r.nearby.length).length,no_nearby:rows.filter(r=>!r.nearby.length).length}));
  process.exit(0);
} else throw Error('Use cities, stores, or index');
fs.writeFileSync(d+'/'+stage+'-plan.json',JSON.stringify([...urls.values()],null,2)+'\n');console.log(JSON.stringify({stage,count:urls.size}));
