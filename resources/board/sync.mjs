/*
 * npm run sync:workbench [-- <dir>]: build, then copy the workbench bundle into the design skill
 * (~/.claude/skills/design/workbench/), or into <dir>.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKILL_DIR } from './stamp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.resolve(process.argv[2] || SKILL_DIR);
execFileSync(process.execPath, [path.join(root, 'resources/board/build.mjs')], { cwd: root, stdio: 'inherit' });
fs.mkdirSync(dir, { recursive: true });
for (const f of ['workbench.js', 'workbench.css', 'agent.js', 'workbench.json']) { fs.copyFileSync(path.join(root, 'dist', f), path.join(dir, f)); }
const s = JSON.parse(fs.readFileSync(path.join(dir, 'workbench.json'), 'utf8'));
console.log(`workbench ${s.version} · ${s.sha} → ${dir}`);
