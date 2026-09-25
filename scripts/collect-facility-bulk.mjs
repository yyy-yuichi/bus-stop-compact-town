import fs from 'node:fs';
import path from 'node:path';
import { hash } from './jev-batch.mjs';

// Public read-only WordPress collections discovered from article link relations.
// A fixed date interval and immutable page receipts make interruption/replay safe.
const configFile='data-sources/facility-bulk-triage-20260925/sources.json';
const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
const dir='outputs/facility-bulk-triage-20260925';
fs.mkdirSync(path.join(dir,'pages'),{recursive:true});
const statuses=[], articles=new Map();
for(const source of config.sources) {
  let total=null, pages=null, count=0, error=null;
  try {
    for(let page=1;pages===null || page<=pages;page++) {
      if(page>100) throw Error('Unexpected page count; collection stopped');
      const url=new URL(source.collection);
      for(const [k,v] of Object.entries({categories:source.category,after:config.after,before:config.before,per_page:100,page,orderby:'id',order:'asc',_fields:'id,date,modified,link,title,content,excerpt,categories'})) url.searchParams.set(k,v);
      const file=path.join(dir,'pages',`${source.id}-${String(page).padStart(3,'0')}.json`);
      let receipt;
      if(fs.existsSync(file)) {
        receipt=JSON.parse(fs.readFileSync(file,'utf8'));
        if(receipt.url!==url.href || receipt.config_hash!==hash(config) || receipt.data_hash!==hash(receipt.data)) throw Error('Cached page identity/hash mismatch');
      } else {
        const r=await fetch(url,{signal:AbortSignal.timeout(25000),headers:{'User-Agent':'Busmap-facility-research/1.0 (public metadata collection)'},redirect:'error'});
        if(!r.ok) throw Error(`HTTP ${r.status}`);
        const data=await r.json();
        if(!Array.isArray(data)) throw Error('Expected post array');
        const advertisedTotal=Number(r.headers.get('x-wp-total')), advertisedPages=Number(r.headers.get('x-wp-totalpages'));
        if(!r.headers.has('x-wp-total') || !r.headers.has('x-wp-totalpages') || !Number.isInteger(advertisedTotal) || !Number.isInteger(advertisedPages)) throw Error('Missing pagination headers');
        receipt={url:url.href,config_hash:hash(config),retrieved_at:new Date().toISOString(),total:advertisedTotal,pages:advertisedPages,data_hash:hash(data),data};
        fs.writeFileSync(file,JSON.stringify(receipt)+'\n',{flag:'wx'});
      }
      if(total!==null && (total!==receipt.total || pages!==receipt.pages)) throw Error('Collection changed during pagination; do not silently skip records');
      total=receipt.total;pages=receipt.pages;
      for(const post of receipt.data) {
        const key=`${source.id}-${post.id}`;
        if(articles.has(key)) throw Error('Duplicate article across pages');
        articles.set(key,{key,source:source.id,source_scope:source.scope,source_class:'secondary_news',receipt_file:file,receipt_hash:hash(receipt),retrieved_at:receipt.retrieved_at,...post});
        count++;
      }
      console.log(JSON.stringify({source:source.id,page,pages,collected:count,total}));
    }
    if(count!==total) throw Error('Collected count does not match provider total');
  } catch(e) {error=e.message;}
  statuses.push({source:source.id,scope:source.scope,total,collected:count,pages,complete:!error,error});
}
const result={schema:1,config_hash:hash(config),after:config.after,before:config.before,statuses,article_count:articles.size,articles:[...articles.values()].sort((a,b)=>a.key.localeCompare(b.key,'en'))};
fs.writeFileSync(path.join(dir,'articles.json'),JSON.stringify(result)+'\n');
console.log(JSON.stringify({article_count:articles.size,statuses}));
if(statuses.some(s=>!s.complete)) process.exitCode=1;
