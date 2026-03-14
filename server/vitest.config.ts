import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Allow time for sql.js WASM init + server startup in integration tests
    hookTimeout: 30_000,
    testTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
    },
  },
});
