import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';

mkdirSync('.cache/qa', { recursive: true });
const env = {
  ...process.env,
  NODE_ENV: 'test',
  M5_LOCAL_ONLY: '1',
  SUBTCCSTACK_BUILD_TARGET: 'integration-test',
  SUBTCCSTACK_TEST_DIRECTORY: mkdtempSync(resolve('.cache/qa/integration-')),
  VITE_API_URL: 'http://127.0.0.1:3002/api',
  VITE_BASE_PATH: '/Substcck/',
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
    'config/playwright.integration.config.ts',
  ],
]) {
  const result = spawnSync(process.execPath, args, {
    env: {
      ...env,
      NODE_ENV: args[0].endsWith('vite.js') ? 'production' : 'test',
    },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
