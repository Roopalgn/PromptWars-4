import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/rules/**/*.ts', 'src/simulation/**/*.ts'],
      exclude: ['src/data/**/*.ts'],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 90,
        statements: 95,
      },
      reporter: ['text', 'lcov', 'json-summary'],
    },
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
});
