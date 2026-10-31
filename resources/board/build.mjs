/*
 * Builds dist/: board.js + board.css (Kradan), agent.js (both), deck.js + deck.css (the deck runtime, injected into
 * deck pages), present.js + present.css (a deck's public share page), and workbench.js + workbench.css + workbench.json
 * (the design workbench, 3-shared-core.md). `--watch` rebuilds on change. Every build also says when the design
 * skill's vendored copy of the workbench is older than this source.
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stamp, behindLine, SKILL_DIR } from './stamp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = p => path.join(root, 'resources/board/src', p);
const out = p => path.join(root, 'dist', p);
const common = { bundle: true, minify: true, target: ['es2020', 'chrome100', 'safari15', 'firefox100'], legalComments: 'none', logLevel: 'info' };
const STAMP = stamp(root);

const builds = [
  { ...common, entryPoints: [src('agent-entry.js')], outfile: out('agent.js'), format: 'iife' },
  { ...common, entryPoints: [src('deck-entry.js')], outfile: out('deck.js'), format: 'iife' },
  { ...common, entryPoints: [src('deck.css')], outfile: out('deck.css') },
  { ...common, entryPoints: [src('present-entry.js')], outfile: out('present.js'), format: 'iife' },
  { ...common, entryPoints: [src('present.css')], outfile: out('present.css') },
  { ...common, entryPoints: [src('board/main.js')], outfile: out('board.js'), format: 'iife' },
  { ...common, entryPoints: [src('board.css')], outfile: out('board.css') },
  { ...common, entryPoints: [src('workbench/main.js')], outfile: out('workbench.js'), format: 'iife', define: { __WB_STAMP__: JSON.stringify(STAMP) },
    banner: { js: `/* kradan workbench ${STAMP.version} ${STAMP.sha} ${STAMP.src_hash} */` } },
  { ...common, entryPoints: [src('workbench.css')], outfile: out('workbench.css'), banner: { css: `/* kradan workbench ${STAMP.version} ${STAMP.sha} */` } },
];
const writeStamp = () => fs.writeFileSync(out('workbench.json'), JSON.stringify(STAMP, null, 2) + '\n');

if (process.argv.includes('--watch')) {
  for (const b of builds) { await (await esbuild.context(b)).watch(); }
  writeStamp();
} else {
  await Promise.all(builds.map(b => esbuild.build(b)));
  writeStamp();
  const line = behindLine(root, SKILL_DIR);
  if (line) { console.log(`\n${line}`); }
}
