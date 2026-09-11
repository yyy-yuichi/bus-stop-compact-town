// Fetch only explicitly supplied public evidence pages, sequentially.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const out = path.resolve('outputs/classification-followup-20260912/cache');
fs.mkdirSync(out, { recursive: true });
for (const url of process.argv.slice(2)) {
  const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
  const html = await response.text();
  fs.writeFileSync(path.join(out, crypto.createHash('sha256').update(url).digest('hex') + '.html'), html);
  const schemas = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m => { try { return JSON.parse(m[1]); } catch { return null; } });
  const links = [...html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map(m => m[1].replaceAll('&amp;', '&')).filter(v => /maps\.app|google\.com\/maps|shop-detail/.test(v) && !/key=/.test(v));
  const compact = schemas.flatMap(s => s?.['@graph'] ?? [s]).filter(s => s?.address || s?.geo).map(s => ({ name: s.name, type: s['@type'], address: s.address, geo: s.geo, offers: s.makesOffer?.itemOffered?.map(o => o.name) }));
  console.log(JSON.stringify({ url, status: response.status, title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], schemas: compact, links: [...new Set(links)] }));
}
