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

test('one person\'s review prints the workbench shape: no names, A + B, ↳ notes, numbered pins, the compact line', async () => {
  const { reviewLocal } = await import('../src/board/export.js');
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
  const input = JSON.parse(fs.readFileSync(path.join(dir, 'local-review.json'), 'utf8'));
  const want = fs.readFileSync(path.join(dir, 'local-review.md'), 'utf8').split('\n');
  const got = reviewLocal(input).split('\n');
  got.forEach((line, i) => assert.equal(line, want[i], `line ${i + 1}`));
  assert.equal(got.length, want.length);
});

test('a bare drawing stays out of the review; a box with the texts it covers stays in', async () => {
  const { bare, reviewLocal } = await import('../src/board/export.js');
  assert.equal(bare({ kind: 'stroke' }), true);
  assert.equal(bare({ kind: 'arrow', texts: ['ยืนยัน'] }), true);
  assert.equal(bare({ kind: 'arrow', texts: ['ยืนยัน'], text: 'ตรงนี้' }), false);
  assert.equal(bare({ kind: 'stroke' }, true), false, 'someone replied to it');
  assert.equal(bare({ kind: 'rect', texts: ['1', '2', '3'] }), false);
  assert.equal(bare({ kind: 'ellipse', texts: [] }), true, 'a ring over no text');
  assert.equal(bare({ kind: 'rect' }), true, 'a box beside the screens');
  assert.equal(bare({ kind: 'rect', text: 'ทำไม' }), false);
  assert.equal(bare({ kind: 'rect' }, true), false);
  assert.equal(bare({ kind: 'note', text: '' }), false, 'only drawings are ever bare');
  const md = reviewLocal({ title: 'x', steps: [{ key: 's', title: 'หน้า', kind: 'screen', options: [] }],
    items: [{ id: 1, step: 's', kind: 'rect', anchor: { device: 'phone', src: 'a.html' }, texts: ['1', '2', '3'] }, { id: 2, step: 's', kind: 'stroke', anchor: {} }] });
  assert.match(md, /▭ มือถือ ตีกรอบ “1”, “2”, “3”/);
  assert.doesNotMatch(md, /〰/);
});
