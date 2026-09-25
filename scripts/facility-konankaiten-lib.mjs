import assert from 'node:assert/strict';
const norm=s=>s.normalize('NFKC').replace(/[\sー−‐－-]/g,'');
export function autobacsPoint(r) {
 const url='https://shop.autobacs.com/ja/retail/shops/380064', j=r.ld_identity;
 assert.equal(r.url,url); assert.equal(r.retail_id,'380064');
 assert.equal(r.brand,'オートバックス'); assert.equal(r.branch,'宇部厚南');
 assert.equal(j?.url,url); assert.equal(j?.name,r.branch);
 assert.equal(j.address.addressLocality,'宇部市');
 assert.equal(norm(j.address.streetAddress),norm('大字妻崎開作860-1'));
 assert(r.rows.some(s=>norm(s).includes(norm('山口県宇部市大字妻崎開作860-1'))));
 assert.equal(j.telephone,'+81-0836-44-3744');
 const map=new URL(r.map_src); assert.equal(map.protocol,'https:'); assert.equal(map.hostname,'maps.google.com'); assert.equal(map.pathname,'/maps');
 const q=map.searchParams.get('q')?.split(','); assert.equal(q?.length,3); assert.equal(q[0],r.brand+r.branch);
 const p=[Number(q[2]),Number(q[1])];
 assert(p.every(Number.isFinite)&&p[0]>130.7&&p[0]<132.5&&p[1]>33.6&&p[1]<34.9);
 assert.equal(map.searchParams.get('ll'),q[1]+','+q[2],'Named destination and displayed map disagree');
 return p; // The named q destination identifies the branch; ll alone never establishes a location.
}
