import fs from 'node:fs';
import { build } from 'vite';

// The private Sites preview serves the public R2 walk files through its own
// origin, so the browser does not need a second CORS allow-list entry.
process.env.VITE_BOARDING_STUDY = '1';
process.env.VITE_WALK_DATA_URL = '/data/walk';

await build({ build: { outDir: 'dist/client' } });
fs.mkdirSync('dist/server', { recursive: true });
fs.mkdirSync('dist/.openai', { recursive: true });
fs.copyFileSync('preview-worker.js', 'dist/server/index.js');
fs.copyFileSync('.openai/hosting.json', 'dist/.openai/hosting.json');
