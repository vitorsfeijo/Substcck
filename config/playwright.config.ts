import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: '../tests/e2e',
  outputDir: resolve(import.meta.dirname, '../.cache/test-results'),
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:4173/Substcck/',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    cwd: resolve(import.meta.dirname, '..'),
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173/Substcck/',
    reuseExistingServer: !process.env.CI,
  },
});
