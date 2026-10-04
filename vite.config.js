import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
export default defineConfig({
  base: './',
  // the square lantern is not in the public repository (see CREDITS.md); a build without it never asks for it
  define: { __KAKU__: JSON.stringify(existsSync('public/assets/glb/kaku.glb')) },
  server: { host: '127.0.0.1', port: 5195 },
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
});
