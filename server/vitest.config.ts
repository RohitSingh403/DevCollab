import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-value-please-change',
      CLIENT_ORIGIN: 'http://localhost:5173',
    },
    fileParallelism: false,
    hookTimeout: 180000,
    testTimeout: 30000,
    setupFiles: ['./tests/setup.ts'],
  },
});
