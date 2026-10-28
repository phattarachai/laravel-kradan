/*
 * The workbench bundle's stamp (dist/workbench.json): the package version, the git short sha, and src_hash.
 * harness.sh hashes the package's source the same way to tell when the skill's vendored copy is behind:
 *   every regular file under resources/board/src (names starting with "." skipped, no symlinks followed),
 *   paths relative to it with "/" separators, sorted by byte order; a manifest of one
 *   "<sha256 hex of the file>  <path>\n" line per file (sha256sum style); src_hash = sha256 hex of the manifest.
 * Shell: find . -name '.*' -prune -o -type f -print | sed 's|^\./||' | LC_ALL=C sort | while IFS= read -r f; do
 *   printf '%s  %s\n' "$(shasum -a 256 "$f" | cut -d' ' -f1)" "$f"; done | shasum -a 256 | cut -d' ' -f1
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const SKILL_DIR = path.join(os.homedir(), '.claude/skills/design/workbench');

function files(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).filter(e => !e.name.startsWith('.')).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { return files(p, base); }
    return e.isFile() ? [path.relative(base, p).split(path.sep).join('/')] : [];
  });
}
/* byte order, as LC_ALL=C sort */
const byBytes = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));

export function srcHash(root) {
  const dir = path.join(root, 'resources/board/src');
  const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
  const manifest = files(dir).sort(byBytes).map(rel => `${sha(fs.readFileSync(path.join(dir, rel)))}  ${rel}\n`).join('');
  return sha(manifest);
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
