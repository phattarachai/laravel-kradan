/*
 * The workbench bundle's stamp (dist/workbench.json): the package version, the git short sha, and src_hash, a
 * sha256 over resources/board/src/** sorted by path. harness.sh hashes the package's source the same way to tell
 * when the skill's vendored copy is behind: for each file, its path relative to resources/board/src, a NUL, its
 * bytes, a NUL; all of it through one sha256.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const SKILL_DIR = path.join(os.homedir(), '.claude/skills/design/workbench');

function files(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

export function srcHash(root) {
  const dir = path.join(root, 'resources/board/src');
  const h = crypto.createHash('sha256');
  files(dir).sort().forEach(rel => { h.update(rel); h.update('\0'); h.update(fs.readFileSync(path.join(dir, rel))); h.update('\0'); });
  return h.digest('hex');
}

export function stamp(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  let sha = '';
  try { sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
  return { version: pkg.version || '0.0.0', sha, src_hash: srcHash(root) };
}

/* the line both sides print when the vendored copy is older than the package's source; '' when in step */
export function behindLine(root, dir) {
  let vendored;
  try { vendored = JSON.parse(fs.readFileSync(path.join(dir, 'workbench.json'), 'utf8')); } catch { return ''; }
  const now = stamp(root);
  return vendored.src_hash === now.src_hash ? '' : `workbench core เก่ากว่า kradan (${vendored.sha || '?'} → ${now.sha}): npm run sync:workbench`;
}
