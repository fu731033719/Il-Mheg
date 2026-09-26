import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@ilmheg/contracts': path.resolve(import.meta.dirname, '../../packages/contracts/src/index.ts'),
      '@ilmheg/domain': path.resolve(import.meta.dirname, '../../packages/domain/src/index.ts'),
      '@ilmheg/model-catalog': path.resolve(import.meta.dirname, '../../packages/model-catalog/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 760,
  },
});
