import assert from 'node:assert/strict';
import {normalize} from './facility-bulk-lib.mjs';
export function namedEmbed(receipt, cid, name, addressTerm) {
  assert.equal(receipt.status,200);
  const u=new URL(receipt.final_url??receipt.url);
  assert.equal(u.origin,'https://www.google.com');
  assert.equal(u.pathname,'/maps/embed');
  const matches=[...receipt.html.matchAll(/\["(0x[a-f\d]+:0x[a-f\d]+)","([^"]+)",\[([\d.]+),([\d.]+)\],"\d+"\]/g)]
    .filter(m=>m[1]===cid&&normalize(m[2]).includes(normalize(name))&&normalize(m[2]).includes(normalize(addressTerm)));
  assert.equal(matches.length,1,'Require one facility-name/address/CID marker, never a viewport or another branch');
  const point=[Number(matches[0][4]),Number(matches[0][3])];
  assert(point[0]>=130&&point[0]<=133&&point[1]>=33&&point[1]<=35);
  return point;
}
export function addHagiBatch(current, additions) {
  const overlay=structuredClone(current); let added=0;
  assert.equal(new Set(additions.map(f=>f.id)).size,additions.length);
  for(const row of additions) {
    const present=overlay.additions.find(f=>f.id===row.id);
    if(present)assert.deepEqual(present,row,'Previously applied facility changed');
    else{overlay.additions.push(row);added++;}
  }
  return {overlay,added};
}
