import { build } from 'esbuild';
import path from 'node:path';

await build({
  entryPoints: [path.resolve('scripts/runtime-smoke.ts')],
  outfile: path.resolve('.tmp/runtime-smoke.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  external: ['node:sqlite'],
  logLevel: 'silent',
});
