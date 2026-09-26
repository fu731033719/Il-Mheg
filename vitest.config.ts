import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'apps/renderer/src'),
      '@ilmheg/contracts': path.resolve(import.meta.dirname, 'packages/contracts/src/index.ts'),
      '@ilmheg/domain': path.resolve(import.meta.dirname, 'packages/domain/src/index.ts'),
      '@ilmheg/model-catalog': path.resolve(import.meta.dirname, 'packages/model-catalog/src/index.ts'),
      '@ilmheg/graph-compiler': path.resolve(import.meta.dirname, 'packages/graph-compiler/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
  },
});
