import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, 'VITE_');
  return {
    root: resolve(projectRoot, 'web'),
    envDir: projectRoot,
    plugins: [
      react(),
      {
        name: 'substcck-public-api',
        transformIndexHtml() {
          return [
            {
              tag: 'meta',
              attrs: {
                name: 'substcck-api-url',
                content: (env.VITE_API_URL || '').replace(/\/+$/, ''),
              },
              injectTo: 'head',
            },
          ];
        },
      },
    ],
    base: env.VITE_BASE_PATH || '/Substcck/',
    build: {
      outDir: resolve(
        projectRoot,
        process.env.SUBTCCSTACK_BUILD_TARGET === 'auth-test'
          ? '.cache/build/auth-web'
          : process.env.SUBTCCSTACK_BUILD_TARGET === 'integration-test'
            ? '.cache/build/integration-web'
            : '.cache/build/web',
      ),
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
