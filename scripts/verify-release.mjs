import fs from 'node:fs';
import path from 'node:path';
const root=process.argv[2] || 'dist';
const walkDataUrl=process.env.VITE_WALK_DATA_URL;
const files=fs.readdirSync(root,{recursive:true}).filter(f=>fs.statSync(path.join(root,f)).isFile());
for(const f of files){
 if(!/^(index\.html|review\.html|about\.html|third-party-notices\.txt|data\/(bus_stop|baked-bus-stops|shopping|review-stops|review-national)\.geojson|data\/(walking-onoda|review-routes|walk-unreachable)\.json|data\/walk\/[\w.-]+\.json|assets\/[\w.-]+\.(js|css|png))$/.test(f.replaceAll('\\','/'))) throw Error(`Unexpected release file: ${f}`);
}
for(const file of ['index.html','about.html','third-party-notices.txt','data/bus_stop.geojson','data/shopping.geojson','data/walking-onoda.json','data/baked-bus-stops.geojson','data/walk-unreachable.json',...(walkDataUrl?[]:['data/walk/index.json'])]) if(!files.includes(file)&&!files.includes(file.replaceAll('/','\\')))throw Error(`Missing release file ${file}`);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const m of html.matchAll(/(?:src|href)="(\.\/assets\/[^"#]+)"/g)) if(!fs.existsSync(path.join(root,m[1])))throw Error(`Missing asset ${m[1]}`);
if(/(?:src|href)="\/assets\//.test(html))throw Error('Absolute asset path prevents subdirectory deployment');
for(const file of ['bus_stop.geojson','shopping.geojson','baked-bus-stops.geojson','walk-unreachable.json']) if(!fs.readFileSync(`public/data/${file}`).equals(fs.readFileSync(path.join(root,'data',file))))throw Error(`Stale data: ${file}`);
if(!fs.readFileSync('public/data/walking-onoda.json').equals(fs.readFileSync(path.join(root,'data/walking-onoda.json'))))throw Error('Stale walking graph');
const bus=JSON.parse(fs.readFileSync(path.join(root,'data/bus_stop.geojson'),'utf8'));
if(bus.features.length!==1085)throw Error('Unexpected bus stop count');
console.log(`Release verified: ${files.length} files; 1085 original OSM records for comparison/pilot; source data matches dist.`);
const official=JSON.parse(fs.readFileSync(path.join(root,'data/review-stops.geojson'),'utf8'));
const routes=JSON.parse(fs.readFileSync(path.join(root,'data/review-routes.json'),'utf8'));
if(official.features.length!==907||new Set(official.features.map(f=>f.id)).size!==907)throw Error('Review stop count/IDs');
for(const [city,count] of [['hikari',172],['iwakuni',735]])if(official.features.filter(f=>f.properties.source_namespace===city).length!==count)throw Error(`Review count: ${city}`);
const routeIds=new Set(routes.map(r=>r.id));
if(official.features.some(f=>f.properties.stale_route_warning||f.properties.publication_status!=='ready-as-separate-source-layer'||f.properties.license!=='CC-BY-4.0'||f.properties.route_ids.some(id=>!routeIds.has(id))))throw Error('Invalid review candidate');
for(const file of ['review-stops.geojson','review-routes.json'])if(!fs.readFileSync(`public/data/${file}`).equals(fs.readFileSync(path.join(root,'data',file))))throw Error(`Stale review data ${file}`);
const review=fs.readFileSync(path.join(root,'review.html'),'utf8');
for(const m of review.matchAll(/(?:src|href)="(\.\/assets\/[^"#]+)"/g))if(!fs.existsSync(path.join(root,m[1])))throw Error(`Missing review asset ${m[1]}`);
console.log('Review verified: Hikari 172 + Iwakuni 735; excluded known stale routes; route references valid.');
const national=JSON.parse(fs.readFileSync(path.join(root,'data/review-national.geojson'),'utf8'));
if(national.features.length!==4418||new Set(national.features.map(f=>f.id)).size!==4418||national.features.some(f=>f.properties.source_year!==2022||f.properties.license!=='CC-BY-4.0'||f.geometry.type!=='Point'))throw Error('National data integrity');
if(!fs.readFileSync('public/data/review-national.geojson').equals(fs.readFileSync(path.join(root,'data/review-national.geojson'))))throw Error('Stale national data');
console.log('National layer verified: 4418 original-row IDs, 2022 edition.');

const baked=JSON.parse(fs.readFileSync(path.join(root,'data/baked-bus-stops.geojson'),'utf8'));
const bakedIds=new Set(baked.features.map(f=>f.id));
if(bakedIds.size!==3946||baked.features.length!==3946||baked.license!=='CC-BY-4.0')throw Error('Baked origin integrity');
const unreachable=JSON.parse(fs.readFileSync(path.join(root,'data/walk-unreachable.json'),'utf8')).stops;
if(Object.keys(unreachable).length!==289||Object.keys(unreachable).some(id=>!bakedIds.has(id)))throw Error('Unreachable origin integrity');
if(walkDataUrl){
  if(fs.existsSync(path.join(root,'data/walk')))throw Error('External walking data must not be bundled');
  const scripts=files.filter(f=>/^assets\/[\w.-]+\.js$/.test(f.replaceAll('\\','/')));
  if(!scripts.some(f=>fs.readFileSync(path.join(root,f),'utf8').includes(walkDataUrl)))throw Error('Missing external walking data URL');
  console.log('External walking data: 3946 origins; 289 unconnected; URL included, catchments kept out of site.');
}else{
  const ids=JSON.parse(fs.readFileSync(path.join(root,'data/walk/index.json'),'utf8'));
  if(ids.length!==3657||new Set(ids).size!==3657||ids.some(id=>!bakedIds.has(id)||Object.hasOwn(unreachable,id)))throw Error('Local walking index integrity');
  for(const id of ids)if(!fs.existsSync(path.join(root,`data/walk/${id}.json`)))throw Error(`Missing catchment ${id}`);
  console.log('Local walking data: all 3657 catchments present.');
}
