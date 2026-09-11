import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const [url, pattern] = process.argv.slice(2);
const html = fs.readFileSync(path.resolve('outputs/classification-followup-20260912/cache', crypto.createHash('sha256').update(url).digest('hex') + '.html'), 'utf8');
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
for (const m of text.matchAll(new RegExp('.{0,65}(?:' + pattern + ').{0,160}', 'g'))) console.log(m[0]);
