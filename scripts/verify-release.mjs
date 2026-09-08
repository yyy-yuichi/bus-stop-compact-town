import fs from 'node:fs';
import path from 'node:path';
const root='dist';
const files=fs.readdirSync(root,{recursive:true}).filter(f=>fs.statSync(path.join(root,f)).isFile());
for(const f of files){
 if(!/^(index\.html|about\.html|third-party-notices\.txt|data\/(bus_stop|shopping)\.geojson|assets\/[\w.-]+\.(js|css|png))$/.test(f.replaceAll('\\','/'))) throw Error(`Unexpected release file: ${f}`);
}
for(const file of ['index.html','about.html','third-party-notices.txt','data/bus_stop.geojson','data/shopping.geojson']) if(!files.includes(file)&&!files.includes(file.replaceAll('/','\\')))throw Error(`Missing release file ${file}`);
const html=fs.readFileSync('dist/index.html','utf8');
for(const m of html.matchAll(/(?:src|href)="(\.\/assets\/[^"#]+)"/g)) if(!fs.existsSync(path.join(root,m[1])))throw Error(`Missing asset ${m[1]}`);
if(/(?:src|href)="\/assets\//.test(html))throw Error('Absolute asset path prevents subdirectory deployment');
for(const file of ['bus_stop.geojson','shopping.geojson']) if(!fs.readFileSync(`public/data/${file}`).equals(fs.readFileSync(`dist/data/${file}`)))throw Error(`Stale data: ${file}`);
const bus=JSON.parse(fs.readFileSync('dist/data/bus_stop.geojson','utf8'));
if(bus.features.length!==1085)throw Error('Unexpected bus stop count');
console.log(`Release verified: ${files.length} files; 1085 bus stops; source data matches dist.`);
