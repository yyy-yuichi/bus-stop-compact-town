import assert from 'node:assert/strict';
import { htmlText, normalize } from './facility-bulk-lib.mjs';

export function gorpRestaurant(receipt, expectedName) {
  assert.equal(receipt.status, 200);
  const data = JSON.parse(receipt.html);
  const rows = JSON.parse(data.data_attribute.json_ld)['@graph'].filter(r => r['@type'] === 'Restaurant');
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(normalize(r.name), normalize(expectedName));
  assert.equal(r.url, receipt.url);
  assert.equal(r.address.addressRegion, '山口県');
  assert.equal(r.address.addressLocality, '周南市');
  const coordinates = [r.geo.longitude, r.geo.latitude];
  assert(coordinates.every(Number.isFinite));
  return { name: r.name, address: `${r.address.addressRegion}${r.address.addressLocality}${r.address.streetAddress}`, coordinates };
}

export function embeddedNamedPoint(receipt, expectedCid, expectedName) {
  assert.equal(receipt.status, 200);
  assert.equal(new URL(receipt.url).origin, 'https://www.google.com');
  const rows = [...receipt.html.matchAll(/\["(0x[a-f\d]+:0x[a-f\d]+)","([^"]+)",\[([\d.]+),([\d.]+)\],"\d+"\]/g)]
    .filter(m => m[1] === expectedCid && normalize(m[2]).includes(normalize(expectedName)));
  assert.equal(rows.length, 1, 'Need one name-and-CID-bound marker; viewport is not a marker');
  return [Number(rows[0][4]), Number(rows[0][3])];
}

export function placeNamedPoint(receipt, expectedName, expectedCid) {
  assert.equal(receipt.status, 200);
  const url = new URL(receipt.final_url ?? receipt.url);
  assert.equal(url.origin, 'https://www.google.com');
  assert(normalize(decodeURIComponent(url.pathname.split('/@')[0])).includes(normalize(expectedName)));
  const point = url.href.match(/!3d([\d.]+)!4d([\d.]+)/);
  assert(point, 'Place coordinates required, never @ viewport');
  const markers = [...receipt.html.matchAll(/\["(0x[a-f\d]+:0x[a-f\d]+)","([^"]+)",null,null,null,null,null,\[null,null,([\d.]+),([\d.]+)\]/g)]
    .filter(m => m[1] === expectedCid && normalize(m[2]) === normalize(expectedName));
  assert.equal(markers.length, 1, 'Need a unique CID-and-name-bound place marker');
  assert.equal(Number(markers[0][3]), Number(point[1]));
  assert.equal(Number(markers[0][4]), Number(point[2]));
  return [Number(point[2]), Number(point[1])];
}

export function caption(receipt) {
  assert.equal(receipt.status, 200);
  const tags = [...receipt.html.matchAll(/<meta[^>]*>/g)].filter(m => /name="description"/.test(m[0]));
  assert.equal(tags.length, 1, 'Need an actual public post caption');
  const text = tags[0][0].match(/content="([^"]*)"/)?.[1];
  assert(text);
  return htmlText(text);
}

export function adoptShunanBatch(before, additions, update) {
  const overlay = structuredClone(before);
  let newAdditions = 0, newUpdates = 0;
  for (const f of additions) {
    const existing = overlay.additions.find(r => r.id === f.id);
    if (existing) assert.deepEqual(existing, f, `Previously applied addition drift: ${f.id}`);
    else { overlay.additions.push(f); newAdditions++; }
  }
  const existing = overlay.updates.find(r => r.id === update.id);
  if (existing) assert.deepEqual(existing, update, 'Previously applied closure drift');
  else { overlay.updates.push(update); newUpdates++; }
  return { overlay, newAdditions, newUpdates };
}