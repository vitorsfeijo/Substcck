import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const env = {
  ...process.env,
  SUBTCCSTACK_BUILD_TARGET: 'auth-test',
  VITE_API_URL: 'https://identity.subtccstack.test/api',
};
for (const args of [
  [
    resolve('node_modules/vite/bin/vite.js'),
    'build',
    '--config',
    'config/vite.config.ts',
  ],
  [
    resolve('node_modules/@playwright/test/cli.js'),
    'test',
    '--config',
    'config/playwright.config.ts',
    'auth.spec.ts',
    'editor.spec.ts',
  ],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
