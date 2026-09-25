import fs from 'node:fs';
import net from 'node:net';
import {hash} from './jev-batch.mjs';
const planFile=process.argv[2];
if(!planFile)throw Error('Pass an explicit reviewed URL plan');
const plan=JSON.parse(fs.readFileSync(planFile,'utf8'));
const dir='outputs/facility-evidence-20260925/followups';fs.mkdirSync(dir,{recursive:true});
function safe(url){const u=new URL(url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port||net.isIP(u.hostname)||!u.hostname.includes('.')||/localhost|\.local$|\.internal$/.test(u.hostname))throw Error('Not a public page URL');return u.href;}
for(const item of plan){const url=safe(item.url),file=`${dir}/${hash(url).slice(0,24)}.json`;if(fs.existsSync(file))continue;
  const r={...item,retrieved_at:new Date().toISOString()};
  try{let current=url,response;for(let n=0;n<5;n++){response=await fetch(current,{redirect:'manual',signal:AbortSignal.timeout(15000)});if(![301,302,303,307,308].includes(response.status))break;await response.body?.cancel();current=safe(new URL(response.headers.get('location'),current).href);if(n===4)throw Error('Redirect limit');}
    r.status=response.status;r.final_url=current;r.content_type=response.headers.get('content-type');
    if(!response.ok){await response.body?.cancel();throw Error(`HTTP ${response.status}`);}
    const chunks=[];let size=0;for await(const c of response.body){size+=c.length;if(size>3_000_000)throw Error('Response exceeds bound');chunks.push(Buffer.from(c));}
    const b=Buffer.concat(chunks),head=b.subarray(0,1000).toString('utf8');
    if(!/text|json|javascript/.test(r.content_type??'')&&!/<!doctype|<html/i.test(head))throw Error('Non-text format requires specific reader');
    const enc=(r.content_type?.match(/charset=([^;\s]+)/i)?.[1]??head.match(/charset=["']?([^"'\s/>]+)/i)?.[1]??'utf-8').replace(/["']/g,'');
    r.html=new TextDecoder(enc).decode(b);r.encoding=enc;r.decoded_hash=hash(r.html);
  }catch(e){r.error=e.message;}
  fs.writeFileSync(file,JSON.stringify(r)+'\n',{flag:'wx'});console.log(JSON.stringify({url:item.url,status:r.status,error:r.error,receipt:file}));
}
