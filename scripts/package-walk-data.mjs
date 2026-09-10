// work/walk/ を tar.gz にまとめ、Releaseマニフェストに必要な値を表示する。
// アップロードはしない（gh release create は別途手で叩く。docs/WALK-DATA-RELEASE.md 参照）。
//
//   npm run data:package
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const WORK_DIR = path.join(ROOT, 'work');
const SRC = path.join(WORK_DIR, 'walk');

if (!fs.existsSync(path.join(SRC, 'index.json'))) {
  console.error(`No baked data at ${SRC} (missing index.json). Run scripts/bake-walking.py first.`);
  process.exit(1);
}

const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
const asset = `walk-data-${date}.tar.gz`;
const outPath = path.join(WORK_DIR, asset);

execFileSync('tar', ['-czf', outPath, '-C', WORK_DIR, 'walk'], { stdio: 'inherit' });

const body = fs.readFileSync(outPath);
const sha256 = crypto.createHash('sha256').update(body).digest('hex');
const index = JSON.parse(fs.readFileSync(path.join(SRC, 'index.json'), 'utf8'));

console.log(`asset:  ${asset}`);
console.log(`path:   ${outPath}`);
console.log(`bytes:  ${body.length} (${(body.length / 1024 / 1024).toFixed(1)} MB)`);
console.log(`sha256: ${sha256}`);
console.log(`count:  ${index.length}`);
console.log('');
console.log('public/data/walk-release.json (tag = the tag you give `gh release create`):');
console.log(JSON.stringify({ version: 1, tag: `walk-data-${date}`, asset, sha256, count: index.length }, null, 2));
