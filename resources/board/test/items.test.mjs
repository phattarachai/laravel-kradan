import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxOf, onFrame, besideGroup, summary } from '../src/board/items.js';

test('boxOf: the bounding box, with points made relative to it', () => {
  assert.deepEqual(boxOf([[120, 80], [100, 140], [160, 90]]), { x: 100, y: 80, w: 60, h: 60, points: [[20, 0], [0, 60], [60, 10]] });
});

test('an item on a frame shows only on that option, device and screen', () => {
  const it = { anchor: { option: 'A', device: 'desktop', src: 'crop', on: true } };
  assert.equal(onFrame(it, { option: 'A', device: 'desktop', src: 'crop' }), true);
  assert.equal(onFrame(it, { option: 'B', device: 'desktop', src: 'crop' }), false);
  assert.equal(onFrame(it, { option: 'A', device: 'phone', src: 'crop' }), false);
  assert.equal(onFrame(it, { option: 'A', device: 'desktop', src: 'screen.html?v=A#s=list' }), false);
  assert.equal(besideGroup(it, 'A'), false, 'on a frame, not beside the group');
});

test('an item beside a group follows the option, whatever the device', () => {
  const it = { anchor: { option: 'B', device: 'desktop', src: 'crop', on: false } };
  assert.equal(besideGroup(it, 'B'), true);
  assert.equal(besideGroup(it, 'A'), false);
  assert.equal(besideGroup({ anchor: { option: null, on: false } }, ''), true, 'a step without options');
});

test('summary: what the panel and the tip say about an item', () => {
  assert.equal(summary({ kind: 'note', text: 'ยอดรวมควรตัวใหญ่กว่านี้' }), 'ยอดรวมควรตัวใหญ่กว่านี้');
  assert.equal(summary({ kind: 'file', file: { name: 'ราคา Q4.xlsx' } }), 'ราคา Q4.xlsx');
  assert.equal(summary({ kind: 'arrow', texts: ['ยืนยันตะกร้า'] }), 'ชี้ที่ “ยืนยันตะกร้า”');
  assert.equal(summary({ kind: 'rect', texts: ['ยอดรวม', '12,450.00'] }), 'ตีกรอบ “ยอดรวม”, “12,450.00”');
  assert.equal(summary({ kind: 'stroke' }), 'วาดเส้น');
});

test('uploads: the package lists extensions, a MIME list works too; svg is a file, not an image', async () => {
  const { typeAllowed, kindOf } = await import('../src/board/items.js');
  const f = (name, type) => ({ name, type });
  assert.equal(typeAllowed(f('ราคา Q4.xlsx', 'application/vnd.ms-excel'), ['xlsx', 'pdf']), true);
  assert.equal(typeAllowed(f('run.exe', 'application/x-msdownload'), ['xlsx', 'pdf']), false);
  assert.equal(typeAllowed(f('a.png', 'image/png'), ['image/png']), true);
  assert.equal(typeAllowed(f('a.png', 'image/png'), []), true);
  assert.equal(kindOf(f('shot.png', 'image/png')), 'image');
  assert.equal(kindOf(f('logo.svg', 'image/svg+xml')), 'file');
  assert.equal(kindOf(f('q4.pdf', 'application/pdf')), 'file');
});

test('anchor.on sent as a form field ("0"/"1") reads the same as JSON', () => {
  assert.equal(besideGroup({ anchor: { option: null, on: '0' } }, ''), true);
  assert.equal(onFrame({ anchor: { option: null, device: 'desktop', src: 'crop', on: '1' } }, { option: null, device: 'desktop', src: 'crop' }), true);
});

test('a move keeps the anchor when the item stays in the same place', async () => {
  const { movePatch } = await import('../src/board/items.js');
  const it = { x: 40, y: 60, anchor: { option: 'A', device: 'desktop', src: 'crop', on: false } };
  /* beside the same group: the device of its first frame doesn't matter */
  assert.deepEqual(movePatch(it, { anchor: { option: 'A', device: 'phone', src: 'crop', on: false }, x: 40.4, y: 59.6 }), { x: 40, y: 60 });
  const onA = { x: 10, y: 20, anchor: { option: 'A', device: 'desktop', src: 'crop', on: '1' } };
  assert.deepEqual(movePatch(onA, { anchor: { option: 'A', device: 'desktop', src: 'crop', on: true }, x: 11, y: 21 }), { x: 10, y: 20 });
});

test('dropping onto a frame, off it, or onto another option re-anchors with x/y in the new space', async () => {
  const { movePatch } = await import('../src/board/items.js');
  const beside = { x: 900, y: 40, anchor: { option: 'A', device: 'desktop', src: 'crop', on: false } };
  const frameA = { option: 'A', device: 'desktop', src: 'crop', on: true };
  assert.deepEqual(movePatch(beside, { anchor: frameA, x: 120.6, y: 88.2 }), { anchor: frameA, x: 121, y: 88 }, 'onto the frame');
  const onFrame = { x: 120, y: 88, anchor: { ...frameA, on: '1' } };
  const besideB = { option: 'B', device: 'desktop', src: 'crop', on: false };
  assert.deepEqual(movePatch(onFrame, { anchor: besideB, x: -30, y: 400 }), { anchor: besideB, x: -30, y: 400 }, 'off the frame, beside B');
  const phone = { option: 'A', device: 'phone', src: 'crop', on: true };
  assert.deepEqual(movePatch(onFrame, { anchor: phone, x: 5, y: 6 }).anchor, phone, 'onto the same option at another device');
  assert.deepEqual(movePatch(beside, null), { x: 900, y: 40 }, 'nowhere to land: plain move');
});

test('ความเห็น holds real notes; plain drawings go under ภาพวาด', async () => {
  const { isNoted } = await import('../src/board/items.js');
  assert.equal(isNoted({ kind: 'note', text: 'เพิ่มกราฟ' }), true);
  assert.equal(isNoted({ kind: 'text', text: 'ยอด' }), true);
  assert.equal(isNoted({ kind: 'image', file: { name: 'จอ.png' } }), true, 'an upload is something someone meant to say');
  assert.equal(isNoted({ kind: 'file', file: { name: 'ราคา.xlsx' } }), true);
  assert.equal(isNoted({ kind: 'stroke', points: [[0, 0], [4, 4]] }), false);
  assert.equal(isNoted({ kind: 'arrow', texts: ['ยืนยัน'] }), false, 'the text it points at is not a note');
  assert.equal(isNoted({ kind: 'rect', texts: ['1', '2', '3'] }), false, 'nor the texts a box covers');
  assert.equal(isNoted({ kind: 'ellipse', texts: [], text: '  ' }), false);
  assert.equal(isNoted({ kind: 'rect', texts: ['1'], text: 'ตัวเลขซ้อนกัน' }), true, 'a note typed on it');
  assert.equal(isNoted({ kind: 'arrow' }, true), true, 'a drawing someone replied to');
});
