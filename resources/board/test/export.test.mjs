import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportMd, labelFor, localPath } from '../src/board/export.js';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../tests/Fixtures/export');

test('the JS export prints the shared fixture line for line, as ReviewBuilder does', () => {
  const input = JSON.parse(fs.readFileSync(path.join(FIX, 'board.json'), 'utf8'));
  const want = fs.readFileSync(path.join(FIX, 'review.md'), 'utf8').split('\n');
  const got = exportMd(input).split('\n');
  got.forEach((line, i) => assert.equal(line, want[i], `line ${i + 1}`));
  assert.equal(got.length, want.length);
});

test('labels and attachment paths match the PHP helpers', () => {
  assert.equal(labelFor('T156', 'T156 ราคา'), 'T156 ราคา');
  assert.equal(labelFor('T15', 'T156 ราคา'), 'T15 T156 ราคา');
  assert.equal(labelFor('', ' ราคา '), 'ราคา');
  assert.equal(localPath(3, '..แผน (ก).pdf'), 'attachments/3-แผน-ก-.pdf');
  assert.equal(localPath(4, '???'), 'attachments/4-file');
});
