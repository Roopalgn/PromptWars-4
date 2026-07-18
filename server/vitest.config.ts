import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/rules/**/*.ts',
        'src/simulation/**/*.ts',
        'src/agent/offline.ts',
        'src/agent/gemini.ts',
        'src/cache/ttl.ts',
        'src/firestore/client.ts',
        'src/app.ts',
      ],
      exclude: ['src/data/**/*.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        // Branch coverage is 83% — the uncovered branches in app.ts (65%)
        // and offline.ts (64%) require live Cloud TTS / Firestore / Gemini
        // credentials that are intentionally absent from CI (ADR-8).
        // Rules engine branches remain at 91%+ (all tested).
        branches: 80,
        statements: 90,
      },
      reporter: ['text', 'lcov', 'json-summary'],
    },
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
});

