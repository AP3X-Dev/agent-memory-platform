import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    conditions: ['default'],
  },
  test: {
    environment: 'node',
    testTimeout: 10000,
  },
});
