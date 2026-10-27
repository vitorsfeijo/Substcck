import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, '..'),
  test: {
    include: ['server/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    coverage: { reportsDirectory: '.cache/coverage' },
  },
});
