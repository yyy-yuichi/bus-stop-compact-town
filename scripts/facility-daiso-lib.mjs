import assert from 'node:assert/strict';
import {htmlText,normalize} from './facility-bulk-lib.mjs';
export function daisoStore(r){
 assert.equal(r.status,200);assert.equal(r.final_url??r.url,r.url);
 const u=new URL(r.url);assert.equal(u.origin,'https://www.daiso-sangyo.co.jp');const id=u.pathname.match(/^\/shop\/detail\/(\d{6})$/)?.[1];assert(id);
 const name=htmlText(r.html.match(/<h2 class="shopSingle-name">([\s\S]*?)<\/h2>/)?.[1]??'');assert(name.startsWith('DAISO '));assert.equal(normalize(htmlText(r.html.match(/<title>([^|]+)/)?.[1]??'')),normalize(name));
 const field=r.html.match(/<dt>\s*住所\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/)?.[1];assert(field);const address=htmlText(field);
 const city=address.match(/^山口県([^市]+市)/)?.[1]??address.match(/^山口県([^郡]+郡[^町]+町)/)?.[1];assert(city);
 const link=field.match(/href="([^"]+)"/)?.[1];assert(link);const pin=new URL(link.replaceAll('&amp;','&'),u);assert.equal(pin.origin,u.origin);assert.equal(pin.pathname,'/shop/map');assert.equal(pin.searchParams.get('initid'),id);
 const point=[Number(pin.searchParams.get('lon')),Number(pin.searchParams.get('lat'))];assert(point.every(Number.isFinite)&&point[0]>130&&point[0]<133&&point[1]>33&&point[1]<35);
 const maps=[...r.html.matchAll(/<iframe[^>]*src="([^"]+)"/g)].map(m=>new URL(m[1].replaceAll('&amp;','&'))).filter(u=>u.origin==='https://www.google.com'&&u.pathname==='/maps');
 assert.equal(maps.length,1);const dest=maps[0].searchParams.get('q');assert(dest&&/^[\d.-]+,[\d.-]+$/.test(dest));const [lat,lon]=dest.split(',').map(Number);assert.deepEqual(point,[lon,lat]);
 const dirs=[...r.html.matchAll(/href="(https:\/\/www\.google\.com\/maps\/dir\/\/([\d.-]+),([\d.-]+))"/g)];assert.equal(dirs.length,1);assert.deepEqual(point,[+dirs[0][3],+dirs[0][2]]);
 return {id:'official-daiso-'+id,name,address,city,category:'variety_store',url:r.url,point,map_url:maps[0].href,directions_url:dirs[0][1],marker_url:pin.href,location_method:'official_address_marker_shop_id_plus_embed_q_and_directions_agree'};
}