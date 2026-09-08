import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// This app has no client-side routes. Relative assets also support a subdirectory.
export default defineConfig({ base: './', plugins: [tailwindcss()], build: { rollupOptions: { input: ['index.html', 'review.html'] } } });
