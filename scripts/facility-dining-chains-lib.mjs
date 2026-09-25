import assert from 'node:assert/strict';
import {normalize} from './facility-bulk-lib.mjs';

export function namedShopPoint(receipt, spec) {
  assert.equal(receipt.status,200); assert(!receipt.error);
  assert.equal(receipt.final_url??receipt.url,spec.url);
  const parsed=[...receipt.html.matchAll(/(?:var|const|let)\s+(\w+)\s*=\s*(\{[^\n]+\});/g)]
    .filter(m=>m[1]===spec.variable).map(m=>JSON.parse(m[2]));
  assert(parsed.length>0,'Missing named shop data');
  const points=parsed.map(j=>{
    assert.equal(String(j[spec.idKey]),spec.code,'Wrong branch ID');
    assert.equal(normalize(j.name),normalize(spec.name),'Wrong branch name');
    assert.equal(normalize(j[spec.addressKey]),normalize(spec.address),'Wrong official address');
    const point=[Number(j[spec.lonKey]),Number(j.lat)];
    assert(point.every(Number.isFinite)&&point[0]>=130&&point[0]<=133&&point[1]>=33&&point[1]<=35,'Invalid branch coordinates');
    return point;
  });
  for(const p of points)assert.deepEqual(p,points[0],'Inconsistent duplicated branch data');
  return points[0];
}
export function addDiningBatch(current, batch) {
  const overlay=structuredClone(current);let added=0,updated=0;
  for(const [field,rows] of [['additions',batch.additions],['updates',batch.updates]]) {
    assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
    for(const r of rows){const existing=overlay[field].find(f=>f.id===r.id);
      if(existing)assert.deepEqual(existing,r,'Existing adopted record differs');
      else{overlay[field].push(r);if(field==='additions')added++;else updated++;}
    }
  }
  return {overlay,added,updated};
}
