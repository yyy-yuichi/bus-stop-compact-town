import assert from 'node:assert/strict';
import {htmlText} from './facility-bulk-lib.mjs';
const norm=s=>s.normalize('NFKC').replace(/[\sー−‐－-]/g,'');
export const metres=(a,b)=>Math.hypot((a[0]-b[0])*92000,(a[1]-b[1])*111000);
function ld(receipt,url,type){
 assert.equal(receipt.status,200);assert.equal(receipt.url,url);assert.equal(receipt.final_url,url);
 const rows=[...receipt.html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(m=>{const j=JSON.parse(m[1]);return Array.isArray(j)?j:j['@graph']??[j];}).filter(j=>j['@type']===type);
 assert.equal(rows.length,1,'Expected one branch-specific JSON-LD record');return rows[0];
}
function point(g){const p=[Number(g?.longitude),Number(g?.latitude)];assert(p.every(Number.isFinite)&&p[0]>130.7&&p[0]<132.5&&p[1]>33.6&&p[1]<34.9,'Invalid Yamaguchi point');return p;}
export function mcdPoint(job,current,spec){
 const j=ld(job,spec.jobUrl,'JobPosting');
 assert.equal(j.url,spec.jobUrl);assert.equal(j.identifier?.value,spec.code);
 assert.equal(j.hiringOrganization?.name,spec.name);
 assert.equal(j.jobLocation?.address?.addressLocality,'宇部市');
 assert.equal(norm(j.jobLocation.address.streetAddress),norm(spec.address));
 assert.equal(current.status,200);assert.equal(current.url,spec.currentUrl);assert.equal(current.final_url,spec.currentUrl);
 const text=norm(htmlText(current.html));
 for(const value of [spec.name.replace('マクドナルド ',''),spec.currentAddress,spec.phone])assert(text.includes(norm(value)),'Current branch identity does not agree');
 const p=point(j.jobLocation.geo);
 const center=[Number(current.html.match(/var center_lng\s*=\s*([\d.]+)/)?.[1]),Number(current.html.match(/var center_lat\s*=\s*([\d.]+)/)?.[1])];
 assert(metres(p,center)<20,'Job location and store map disagree');
 return p; // Adopt the named jobLocation, never a bare map viewport.
}
export function kfcPoint(receipt){
 const url='https://search.kfc.co.jp/points/5063',j=ld(receipt,url,'Restaurant');
 assert.equal(j.url,url);assert.equal(j['@id'],url);assert.equal(j.name,'ゆめタウン宇部店');
 assert.equal(j.address?.addressLocality,'宇部市');assert.equal(j.address?.streetAddress,'黒石北3-4-1');assert.equal(j.telephone.trim(),'0836-39-0205');
 return point(j.geo);
}
export function geometryDistance(p,geometry){
 if(geometry.type==='Point')return {distance_m:Math.round(metres(p,geometry.coordinates)),method:'point_distance'};
 assert(['Polygon','MultiPolygon'].includes(geometry.type),'Unsupported geometry must be reviewed');
 const pts=geometry.coordinates.flat(geometry.type==='Polygon'?1:2);
 assert(pts.length&&pts.every(p=>p.length===2&&p.every(Number.isFinite)));
 const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),bounds=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
 const nearest=[Math.max(bounds[0],Math.min(p[0],bounds[2])),Math.max(bounds[1],Math.min(p[1],bounds[3]))];
 return {distance_m:Math.round(metres(p,nearest)),method:'bounding_box_screen_only',bounds};
}
