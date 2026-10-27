import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, 'VITE_');
  return {
    root: resolve(projectRoot, 'web'),
    envDir: projectRoot,
    plugins: [react()],
    base: env.VITE_BASE_PATH || '/Subtccstack/',
    build: {
      outDir: resolve(projectRoot, '.cache/build/web'),
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': 'http://127.0.0.1:3001' },
    },
    preview: { port: 4173, strictPort: true },
  };
});
