/* Builds dist/board.js, dist/board.css and dist/agent.js. `--watch` rebuilds on change. */
import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = p => path.join(root, 'resources/board/src', p);
const out = p => path.join(root, 'dist', p);
const common = { bundle: true, minify: true, target: ['es2020', 'chrome100', 'safari15', 'firefox100'], legalComments: 'none', logLevel: 'info' };

const builds = [
  { ...common, entryPoints: [src('agent-entry.js')], outfile: out('agent.js'), format: 'iife' },
  { ...common, entryPoints: [src('board/main.js')], outfile: out('board.js'), format: 'iife' },
  { ...common, entryPoints: [src('board.css')], outfile: out('board.css') },
];

if (process.argv.includes('--watch')) {
  for (const b of builds) { await (await esbuild.context(b)).watch(); }
} else {
  await Promise.all(builds.map(b => esbuild.build(b)));
}
