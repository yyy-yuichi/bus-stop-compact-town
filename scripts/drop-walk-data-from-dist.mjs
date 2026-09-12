// vite buildはpublic/data/walk（symlink先はwork/walk、143MB強）をdist/data/walkへ
// そのままコピーする。VITE_WALK_DATA_URLを設定したビルドはR2から直接fetchするので
// (docs/WALK-DATA-R2.md参照)、distにその143MBは要らない。publicDirの除外設定を
// 作るより、ビルド後にディレクトリを消す方が読みやすく検証もしやすい。
//
//   VITE_WALK_DATA_URL=... npm run build
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

if (!process.env.VITE_WALK_DATA_URL) process.exit(0);

const dir = path.join(ROOT, 'dist/data/walk');
if (fs.existsSync(dir)) {
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('VITE_WALK_DATA_URL set: removed dist/data/walk (served from R2 instead).');
}
