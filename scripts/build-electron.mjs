import { build } from 'esbuild';
import path from 'node:path';

const root = process.cwd();
const shared = {
  bundle: true,
  platform: 'node',
  target: 'node24',
  sourcemap: true,
  external: ['electron', 'node:sqlite'],
  logLevel: 'info',
};

await Promise.all([
  build({
    ...shared,
    entryPoints: [path.join(root, 'apps/desktop/src/main.ts')],
    outfile: path.join(root, 'apps/desktop/dist/main.cjs'),
    format: 'cjs',
  }),
  build({
    ...shared,
    entryPoints: [path.join(root, 'apps/desktop/src/preload.ts')],
    outfile: path.join(root, 'apps/desktop/dist/preload.cjs'),
    format: 'cjs',
  }),
]);
