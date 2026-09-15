import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

function keepConfirmationInStudy() {
  let output: string;
  return {
    name: 'keep-confirmation-in-study',
    apply: 'build' as const,
    configResolved(config: { root: string; build: { outDir: string } }) {
      output = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (process.env.VITE_CONFIRMATION_DOCUMENT !== '1') {
        fs.rmSync(path.join(output, 'boarding-location-confirmation.pdf'), { force: true });
      }
    },
  };
}

// This app has no client-side routes. Relative assets also support a subdirectory.
export default defineConfig({ base: './', plugins: [tailwindcss(), keepConfirmationInStudy()], build: { rollupOptions: { input: ['index.html', 'review.html', 'route-living.html'] } } });
