import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: '../tests/integration',
  testMatch: '**/*.spec.ts',
  outputDir: resolve(import.meta.dirname, '../.cache/integration-results'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: resolve(
          import.meta.dirname,
          '../.cache/integration-results/results.json',
        ),
      },
    ],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4174/Substcck/',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      cwd: resolve(import.meta.dirname, '..'),
      command: 'node --import tsx tests/integration/server.ts',
      url: 'http://127.0.0.1:3002/api/health',
      timeout: 60000,
      reuseExistingServer: false,
    },
    {
      cwd: resolve(import.meta.dirname, '..'),
      command:
        'node node_modules/vite/bin/vite.js preview --config config/vite.config.ts --port 4174 --host 127.0.0.1',
      url: 'http://127.0.0.1:4174/Substcck/',
      reuseExistingServer: false,
    },
  ],
});
