// Releaseアセットから徒歩圏データを取得して public/data/walk/ へ展開する。
// 取得先はGitHub自身であり、国土地理院やGeofabrikを叩くものではない。
//
//   npm run data:fetch
//
// 完了の判定は data/walk/index.json の件数がマニフェストの count と一致するかどうか。
// チェックサム不一致・展開失敗は public/data/walk/ に触れる前に止まるので、
// 中途半端なデータが残ることはない。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const REPO = process.env.WALK_DATA_REPO ?? 'yyy-yuichi/bus-stop-compact-town';
const MANIFEST_PATH = path.join(ROOT, 'public/data/walk-release.json');
const DATA_DIR = path.join(ROOT, 'public/data');
const DEST = path.join(DATA_DIR, 'walk');

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

// sha256はシェイプで判定する。「PENDING_RELEASE」のような目印文字列に加え、
// 打ち間違いも自動的に弾ける。
if (!/^[0-9a-f]{64}$/i.test(manifest.sha256)) {
  console.error(
    `public/data/walk-release.json is still a placeholder (sha256: "${manifest.sha256}").\n` +
    'No walk-data Release has been published yet, so there is nothing to fetch.\n' +
    'To publish one: bake the data, run `npm run data:package` to get the tarball\n' +
    `and its checksum, \`gh release create\` it on ${REPO}, then replace tag/asset/sha256\n` +
    'in walk-release.json with the real values (count must match the tarball you upload).'
  );
  process.exit(1);
}

function readCount(dir) {
  const indexPath = path.join(dir, 'index.json');
  if (!fs.existsSync(indexPath)) return null;
  try {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    return Array.isArray(index) ? index.length : null;
  } catch {
    return null;
  }
}

const existingCount = readCount(DEST);
if (existingCount === manifest.count) {
  console.log(`Walk data already present: ${existingCount} catchments.`);
  process.exit(0);
}

if (fs.existsSync(DEST) && fs.lstatSync(DEST).isSymbolicLink()) {
  // public/data/walk is normally wired to work/walk for local development (bake-walking.py
  // writes there directly). If it's a symlink but doesn't match the manifest, that's a local
  // bake in progress or out of sync with the published Release -- don't clobber it.
  const target = fs.readlinkSync(DEST);
  console.error(
    `public/data/walk is a symlink to ${target} with ${existingCount ?? 'no'} catchments, ` +
    `but the manifest expects ${manifest.count}.\n` +
    'Refusing to overwrite what looks like a local bake with a downloaded Release asset.\n' +
    'Remove or repoint the symlink first if you want the published dataset instead.'
  );
  process.exit(1);
}

const url = `https://github.com/${REPO}/releases/download/${manifest.tag}/${manifest.asset}`;
console.log(`Fetching ${url}`);
const response = await fetch(url, { redirect: 'follow' });
if (!response.ok) {
  console.error(`Download failed: ${response.status} ${response.statusText} (${url})`);
  process.exit(1);
}
const body = Buffer.from(await response.arrayBuffer());

const digest = crypto.createHash('sha256').update(body).digest('hex');
if (digest !== manifest.sha256) {
  console.error(`Checksum mismatch for ${manifest.asset}: got ${digest}, expected ${manifest.sha256}.`);
  console.error('Refusing to extract a corrupt or tampered download. public/data/walk/ is untouched.');
  process.exit(1);
}

// Extract into a scratch dir next to the destination (same filesystem, so the final move is a
// single rename) rather than straight into public/data/walk/. A run killed mid-extraction then
// leaves only the scratch dir behind, never a half-populated public/data/walk/ that the count
// check above would mistake for complete.
fs.mkdirSync(DATA_DIR, { recursive: true });
const tmpDir = fs.mkdtempSync(path.join(DATA_DIR, '.walk-fetch-'));
try {
  execFileSync('tar', ['-xzf', '-', '-C', tmpDir], { input: body, stdio: ['pipe', 'inherit', 'inherit'] });

  const extracted = path.join(tmpDir, 'walk');
  const extractedCount = readCount(extracted);
  if (extractedCount !== manifest.count) {
    throw new Error(`Extracted ${extractedCount ?? 0} catchments, expected ${manifest.count} (truncated archive?).`);
  }

  if (fs.existsSync(DEST)) fs.rmSync(DEST, { recursive: true, force: true });
  fs.renameSync(extracted, DEST);
  console.log(`Walk data ready: ${extractedCount} catchments.`);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
