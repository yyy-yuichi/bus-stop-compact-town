import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { hash } from './jev-batch.mjs';
import { htmlText } from './facility-bulk-lib.mjs';
const dir='outputs/facility-evidence-20260925',input='outputs/facility-bulk-triage-20260925/review-queue.json';
fs.mkdirSync(`${dir}/pages`,{recursive:true});
const articles=JSON.parse(fs.readFileSync(input,'utf8'));
const excluded=/(?:goguynet\.jp|kaiten-heiten|google|facebook|instagram|twitter|(?:^|\.)x\.com$|tiktok|youtube|youtu\.be|doubleclick|amazon|rakuten|townwork|indeed|tabelog|hotpepper|yahoo|navitime|job-gear|jobfind|recruit|baito|toranet|a8\.net|mtke-job)/i;
function eligible(url) {
  try {const u=new URL(url);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&!u.port&&u.hostname.includes('.')&&!net.isIP(u.hostname)&&!/localhost|\.local$|\.internal$/.test(u.hostname)&&!excluded.test(u.hostname)&&!/wp-content|\.(?:jpg|png|jpeg|gif|webp|svg|mp4|pdf|zip)(?:$|\?)/i.test(u.href)&&!/logout|checkout|unsubscribe|delete|purchase/i.test(u.pathname);}catch{return false;}
}
function canonical(url) {const u=new URL(url);u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^fbclid$|^gclid$/.test(k))u.searchParams.delete(k);return u.href;}
const urls=new Map();
for(const a of articles) for(const link of a.outbound_links) {
  if(!eligible(link))continue;
  const url=canonical(link);
  if(!urls.has(url))urls.set(url,{key:hash(url).slice(0,24),url,article_keys:[],first_queue_number:a.queue_number,source_status:'unverified_link_candidate'});
  urls.get(url).article_keys.push(a.key);
}
const plan={input,input_hash:hash(fs.readFileSync(input,'utf8')),urls:[...urls.values()].sort((a,b)=>a.first_queue_number-b.first_queue_number||a.url.localeCompare(b.url,'en')),note:'Links harvested from news, not automatically official. Social/map/job sites are retained in the original queue for appropriate manual or primary-source checking, not treated as unavailable.'};
const planPath=`${dir}/plan.json`;
if(fs.existsSync(planPath)&&hash(JSON.parse(fs.readFileSync(planPath,'utf8')))!==hash(plan))throw Error('Plan changed; use a new snapshot');
fs.writeFileSync(planPath,JSON.stringify(plan,null,2)+'\n');
if(process.argv.includes('--fetch')) {
  let next=0,done=0;
  async function worker() {
    for(;;) {
      const item=plan.urls[next++];if(!item)return;
      const file=`${dir}/pages/${item.key}.json`;
      if(fs.existsSync(file)){done++;continue;}
      let receipt={url:item.url,article_keys:item.article_keys,retrieved_at:new Date().toISOString(),status:null,error:null};
      try {
        let url=item.url,response;
        for(let redirects=0;redirects<=4;redirects++) {
          response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Busmap-facility-research/1.0 (public evidence readback)'}});
          if(![301,302,303,307,308].includes(response.status))break;
          const location=response.headers.get('location');await response.body?.cancel();
          url=new URL(location,url).href;if(!eligible(url))throw Error('Redirect requires separate review');
          if(redirects===4)throw Error('Redirect limit');
        }
        receipt.final_url=url;receipt.status=response.status;receipt.content_type=response.headers.get('content-type');
        if(!response.ok){await response.body?.cancel();throw Error(`HTTP ${response.status}`);}
        if(!/text\/|html|json/.test(receipt.content_type??'')){await response.body?.cancel();throw Error('Non-text document needs format-specific reader');}
        const chunks=[];let size=0;
        for await(const chunk of response.body){size+=chunk.length;if(size>2_000_000)throw Error('Body size exceeds text collection bound');chunks.push(Buffer.from(chunk));}
        const bytes=Buffer.concat(chunks),head=bytes.subarray(0,5000).toString('ascii');
        const encoding=(receipt.content_type?.match(/charset=([^;\s]+)/i)?.[1]??head.match(/charset=["']?([^"'\s/>]+)/i)?.[1]??'utf-8').replace(/["']/g,'');
        receipt.encoding=encoding;receipt.html=new TextDecoder(encoding).decode(bytes);receipt.decoded_hash=hash(receipt.html);receipt.bytes=bytes.length;
      }catch(e){receipt.error=e.message;}
      fs.writeFileSync(file,JSON.stringify(receipt)+'\n',{flag:'wx'});
      done++;if(done%25===0)console.log(JSON.stringify({completed:done,total:plan.urls.length}));
    }
  }
  await Promise.all([worker(),worker()]);
}
const results=plan.urls.map(item=>{const file=`${dir}/pages/${item.key}.json`;if(!fs.existsSync(file))return{...item,state:'pending'};const r=JSON.parse(fs.readFileSync(file,'utf8'));return{...item,state:r.error?'fetch_failed':'fetched',http_status:r.status,error:r.error,final_url:r.final_url,receipt:file,receipt_hash:hash(r),text_length:r.html?htmlText(r.html).length:0};});
fs.writeFileSync(`${dir}/index.json`,JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({total:results.length,states:results.reduce((o,r)=>(o[r.state]=(o[r.state]??0)+1,o),{})}));
