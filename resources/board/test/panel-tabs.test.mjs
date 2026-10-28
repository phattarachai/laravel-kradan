import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitItems } from '../src/board/items.js';
import { PANEL_TABS, tabOf, tabKey, panelCounts } from '../src/board/panel-tabs.js';

const step = [
  { id: 1, kind: 'note', text: 'เพิ่มกราฟ' },
  { id: 2, kind: 'image', file: { name: 'จอ.png' } },
  { id: 3, kind: 'rect', texts: ['ยอดวันนี้'] },
  { id: 4, kind: 'stroke', points: [[0, 0], [4, 4]] },
  { id: 5, kind: 'arrow', texts: ['ยืนยัน'] },
  { id: 6, kind: 'ellipse', texts: [], text: 'ตรงนี้' },
  { id: 7, kind: 'note', text: '', draft: true },
];
const ids = list => list.map(it => it.id);

test('the tabs split: ความเห็น gets notes, uploads and noted drawings; ภาพวาด the plain drawings; a draft in neither', () => {
  const { notes, drawings } = splitItems(step);
  assert.deepEqual(ids(notes), [1, 2, 6]);
  assert.deepEqual(ids(drawings), [3, 4, 5]);
});

test('each tab counts its own: ความเห็น is the threads plus the notes, ภาพวาด the drawings', () => {
  const threads = [{ id: 10 }, { id: 11 }];
  assert.deepEqual(panelCounts({ threads, ...splitItems(step) }), { comments: 5, drawings: 3 });
  assert.deepEqual(panelCounts({}), { comments: 0, drawings: 0 });
});

test('ใส่โน้ต moves a drawing from ภาพวาด to ความเห็น, and a reply does too; both counts follow', () => {
  const before = splitItems(step);
  const noted = step.map(it => (it.id === 4 ? { ...it, text: 'เส้นนี้คือทางที่ควรไป' } : it));
  const after = splitItems(noted);
  assert.deepEqual(ids(after.notes), [1, 2, 4, 6]);
  assert.deepEqual(ids(after.drawings), [3, 5]);
  assert.deepEqual([panelCounts(before).comments, panelCounts(before).drawings], [3, 3]);
  assert.deepEqual([panelCounts(after).comments, panelCounts(after).drawings], [4, 2]);

  const replied = splitItems(step, [{ id: 20, item_id: 5, body: 'ใช่' }]);
  assert.deepEqual(ids(replied.drawings), [3, 4], 'the arrow someone replied to is a comment now');
});

test('the open tab is remembered per viewer: a stored tab comes back, anything else is ความเห็น', () => {
  const store = new Map();
  const get = k => JSON.parse(store.get(k) ?? 'null');
  const set = (k, v) => store.set(k, JSON.stringify(v));
  assert.equal(tabOf(get('kradan:panel-tab')), 'comments', 'ความเห็น until they pick');
  set('kradan:panel-tab', 'drawings');
  assert.equal(tabOf(get('kradan:panel-tab')), 'drawings');
  set('kradan:panel-tab', 'items');
  assert.equal(tabOf(get('kradan:panel-tab')), 'comments', 'an old or unknown value');
  assert.equal(tabOf(true), 'comments', 'the old fold flag');
  assert.deepEqual(PANEL_TABS, ['comments', 'drawings']);
});

test('arrow keys move between the tabs and wrap; Home and End go to the ends; other keys are not ours', () => {
  assert.equal(tabKey('ArrowRight', 'comments'), 'drawings');
  assert.equal(tabKey('ArrowRight', 'drawings'), 'comments');
  assert.equal(tabKey('ArrowLeft', 'comments'), 'drawings');
  assert.equal(tabKey('ArrowDown', 'comments'), 'drawings');
  assert.equal(tabKey('Home', 'drawings'), 'comments');
  assert.equal(tabKey('End', 'comments'), 'drawings');
  assert.equal(tabKey('Enter', 'comments'), null);
  assert.equal(tabKey('a', 'comments'), null);
});
