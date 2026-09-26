import fs from 'node:fs';
import { runBatch,validateManifest,hash,summarize } from './jev-batch.mjs';
import { loadCredential } from './jev-credential.mjs';
const dir='outputs/facility-bulk-triage-20260925',read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const manifest=read(`${dir}/jev-manifest.json`),args=process.argv.slice(2);
try {
  if(args.length!==1 || !['--dry-run','--run','--summary'].includes(args[0]))throw Error('Use exactly --dry-run, --run or --summary');
  if(args[0]==='--dry-run')console.log(JSON.stringify({...validateManifest(manifest,{recordLimit:3000,budgetLimit:1}),manifest_hash:hash(manifest),...manifest.preflight,authorization:'proposal only; dry-run sends nothing'},null,2));
  else if(args[0]==='--summary')console.log(JSON.stringify(summarize(manifest,`${dir}/jev`),null,2));
  else {
    const approval=read('data-sources/facility-bulk-triage-20260925/authorization.json');
    if(approval.status!=='approved'||approval.manifest_hash!==hash(manifest)||!approval.user_instruction||approval.max_records>3000||approval.budget_usd>1)throw Error('Explicit scoped approval required');
    const preflight=read(`${dir}/preflight-summary.json`);
    for(const [file,expected] of Object.entries(preflight.input_hashes))if(hash(fs.readFileSync(file,'utf8'))!==expected)throw Error('Input changed after preparation');
    validateManifest(manifest,{recordLimit:approval.max_records,budgetLimit:approval.budget_usd});
    console.log(JSON.stringify(await runBatch(manifest,`${dir}/jev`,{authorization:approval,apiKey:loadCredential(),onProgress:p=>console.log(JSON.stringify(p))}),null,2));
  }
}catch(e){console.error(e.message);process.exitCode=1;}
