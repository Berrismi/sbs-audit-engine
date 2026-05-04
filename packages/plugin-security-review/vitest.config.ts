// SPDX-License-Identifier: MIT
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // scan-core's published entry is dist/index.js; alias straight to src in
  // tests so the plugin's vitest run doesn't require scan-core to be built
  // first. The run command is the only consumer of scan-core here.
  resolve: {
    alias: {
      '@hellomavens/security-review-for-salesforce-scan-core': fileURLToPath(
        new URL('../scan-core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts', 'src/commands/**'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
