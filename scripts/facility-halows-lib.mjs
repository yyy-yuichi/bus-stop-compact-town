import assert from 'node:assert/strict';
export const norm=s=>s.normalize('NFKC').replace(/[\s\u200b]/g,'').toLowerCase();
export function halowsBatchPoint(input,spec){
 assert.equal(input.url,spec.url);assert.equal(input.status,200);
 assert.equal(norm(input.heading),norm(spec.heading));assert.equal(norm(input.address),norm(spec.address));
 const u=new URL(input.map_url);assert.equal(u.protocol,'https:');assert(['www.google.com','maps.google.com'].includes(u.hostname));assert(['/maps','/maps/embed'].includes(u.pathname));
 let point;
 if(spec.cid){
  const m=input.marker;assert(m&&m.cid===spec.cid);assert(norm(m.label).includes(norm(spec.marker_name)));assert(norm(m.label).includes(norm(spec.address_term)));
  // The marker is extracted from the embed linked by this branch, not a display centre.
  const pb=u.searchParams.get('pb'),q=u.searchParams.get('q');
  assert(pb?.includes(spec.cid)||q&&norm(q).includes(norm(spec.marker_name)));
  point=m.point;
 }else{
  assert.equal(spec.id,'official-daiso-005565');
  const q=u.searchParams.get('q');assert(q&&/^[\d.]+,[\d.]+$/.test(q),'Require the store page map destination, not ll');
  const [lat,lon]=q.split(',').map(Number);point=[lon,lat];
 }
 assert(point?.length===2&&point.every(Number.isFinite));assert(point[0]>=130&&point[0]<=133&&point[1]>=33&&point[1]<=35);
 assert.deepEqual(point,spec.point,'Reviewed branch point changed');
 return point;
}
