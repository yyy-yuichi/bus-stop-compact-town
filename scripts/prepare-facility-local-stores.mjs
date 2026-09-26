import fs from 'node:fs';
import assert from 'node:assert/strict';
import {hash} from './jev-batch.mjs';
import {httpLinks,htmlText} from './facility-bulk-lib.mjs';
const d='outputs/facility-local-stores-20260925';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const page=url=>read(d+'/pages/'+hash(new URL(url).href).slice(0,24)+'.json');
const save=(name,v)=>{const file=d+'/'+name;const text=JSON.stringify(v,null,2)+'\n';if(fs.existsSync(file))assert.equal(fs.readFileSync(file,'utf8'),text,'Immutable plan changed');else fs.writeFileSync(file,text);};
const home='https://www.karatoharete.com/',market='https://www.karatoichiba.com/stores/';
const mode=process.argv[2],plan=new Map();
if(mode==='directories'){
 for(const url of httpLinks(page(market).html,market).filter(u=>/^https:\/\/www\.karatoichiba\.com\/stores\/\?corner=\d+$/.test(u)))plan.set(url,{url,source:market});
 const html=page(home).html;
 for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  const text=htmlText(m[2]);if(!m[1].startsWith(home)||!text||/募集中|ホーム|お知らせ|店舗紹介|卒業生/.test(text))continue;
  plan.set(m[1],{url:m[1],source:home,directory_label:text});
 }
 plan.set('https://www.karatoichiba.com/access/',{url:'https://www.karatoichiba.com/access/',purpose:'Official shared complex address and representative location'});
 save('directories-plan.json',[...plan.values()]);
}else if(mode==='stores'){
 const rows=new Map();
 for(const source of read(d+'/directories-plan.json').filter(x=>x.url.includes('corner='))){
  const r=page(source.url);assert(!r.error);
  for(const m of r.html.matchAll(/<li>\s*<a href="(https:\/\/www\.karatoichiba\.com\/stores\/\d+\/)"[\s\S]*?<div class="company-name">([\s\S]*?)<\/div>[\s\S]*?<div class="company-item">([\s\S]*?)<\/div>[\s\S]*?<\/li>/g)){
   const url=m[1],name=htmlText(m[2]);const prior=rows.get(url);if(prior){assert.equal(prior.name,name);prior.directory_sources.push(source.url);}else rows.set(url,{id:'karato-market-'+url.split('/').at(-2),url,name,directory_summary:htmlText(m[3]),directory_sources:[source.url]});
  }
 }
 save('market-directory.json',[...rows.values()]);
 for(const s of rows.values())plan.set(s.url,{url:s.url,source:s.directory_sources[0]});
 save('stores-plan.json',[...plan.values()]);
}else if(mode==='followups'){
 for(const p of read(d+'/directories-plan.json').filter(x=>x.url.startsWith(home))){
  const r=page(p.url);
  for(const m of r.html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
   if(m[1].startsWith(home)&&/イヤシロチ|ごろう/.test(htmlText(m[2])))plan.set(m[1],{url:m[1],source:p.url,directory_label:htmlText(m[2]),purpose:'Navigation-only lead; current detail must be verified'});
  }
 }
 for(const source of [home,'https://www.karatoichiba.com/access/'])for(const url of httpLinks(page(source).html,source).filter(u=>/^https:\/\/www\.google\.com\/maps(?:\/embed\?|\/place\/|\?)/.test(u)))plan.set(url,{url,source,purpose:'Official-linked complex representative point, not individual unit coordinates'});
 save('followups-plan.json',[...plan.values()]);
}else throw Error('Use directories, stores, or followups');
console.log(JSON.stringify({mode,urls:plan.size}));
