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
