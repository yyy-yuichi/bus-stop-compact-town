import fs from 'node:fs';
import {httpLinks}from'./facility-bulk-lib.mjs';
const d='outputs/facility-evidence-20260925',read=f=>JSON.parse(fs.readFileSync(f,'utf8')),urls=new Map();
const pages=read(d+'/triage.json').filter(r=>['target_change_notice','target_current_listing'].includes(r.choice)).map(r=>read(r.receipt));
pages.push(...fs.readdirSync(d+'/followups').map(f=>read(d+'/followups/'+f)).filter(r=>!/google|goo.gl/.test(r.url)));
for(const r of pages)for(const url of httpLinks(r.html??'',r.url).filter(u=>/https:\/\/(?:www\.)?google\.[^/]+\/maps\/embed\?|https:\/\/maps.app.goo.gl\//.test(u))){if(!urls.has(url))urls.set(url,{url,source:r.url,purpose:'Official-link candidate position only; source and place identity require review.'});}
for(const url of ['https://ufuya.jp/news/page/3/','https://www.emile-group.jp/content/news.php'])urls.set(url,{url,purpose:'Previously observed official announcement follow-up'});
fs.writeFileSync(d+'/map-followup-plan.json',JSON.stringify([...urls.values()],null,2)+'\n');console.log(JSON.stringify({unique_urls:urls.size}));
