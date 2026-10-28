import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { createUndo, undoKey, typing, fieldsOf } from '../src/board/undo.js';

/* a store in memory: the same three writes items.js hands the stack */
function fakeStore() {
  const items = new Map();
  let next = 1;
  const log = [];
  return {
    items, log,
    ops: {
      create: async fields => { const it = { ...structuredClone(fields), id: next++ }; items.set(it.id, it); log.push(['create', it.id]); return it; },
      patch: async (id, fields) => { const it = items.get(id); if (!it) { throw new Error('gone'); } Object.assign(it, structuredClone(fields)); log.push(['patch', id]); return it; },
      remove: async id => { if (!items.delete(id)) { throw new Error('gone'); } log.push(['remove', id]); return true; },
    },
    /* what the board does: write, then record it */
    async add(stack, fields) { const it = await this.ops.create(fields); stack.record.add(it); return it; },
  };
}
const box = { kind: 'rect', step: 'a|b', anchor: { option: 'A', device: 'desktop', src: 'crop', on: true }, x: 10, y: 20, w: 90, h: 40, color: 'orange', texts: ['ยอดรวม'] };

test('undo an add deletes it; redo makes it again', async () => {
  const s = fakeStore(), u = createUndo(s.ops);
  const it = await s.add(u, box);
  assert.equal(u.canUndo(), true);
  assert.equal(await u.undo(), true);
  assert.equal(s.items.size, 0);
  assert.equal(u.canRedo(), true);
  assert.equal(await u.redo(), true);
  assert.equal(s.items.size, 1);
  const again = [...s.items.values()][0];
  assert.notEqual(again.id, it.id, 'the store gives it a new id');
  assert.deepEqual(fieldsOf(again), fieldsOf(it));
});

test('undo a move puts it back, anchor and all; redo moves it again', async () => {
  const s = fakeStore(), u = createUndo(s.ops);
  const it = await s.add(u, box);
  const to = { anchor: { ...box.anchor, option: 'B' }, x: 300, y: 5 };
  await s.ops.patch(it.id, to);
  u.record.patch(it, { anchor: box.anchor, x: 10, y: 20 }, to);
  await u.undo();
  assert.deepEqual([s.items.get(it.id).anchor.option, s.items.get(it.id).x, s.items.get(it.id).y], ['A', 10, 20]);
  await u.redo();
  assert.deepEqual([s.items.get(it.id).anchor.option, s.items.get(it.id).x], ['B', 300]);
});

test('undo a delete makes it again, and later entries follow the new id', async () => {
  const s = fakeStore(), u = createUndo(s.ops);
  const it = await s.add(u, box);
  await s.ops.patch(it.id, { color: 'red' });
  u.record.patch(it, { color: 'orange' }, { color: 'red' });
  const gone = { ...s.items.get(it.id) };
  await s.ops.remove(it.id);
  u.record.remove(gone);

  await u.undo();
  const back = [...s.items.values()][0];
  assert.equal(back.color, 'red', 'made again as it was when deleted');
  assert.notEqual(back.id, it.id);
  await u.undo();
  assert.equal(s.items.get(back.id).color, 'orange', 'the colour undo reaches the new id');
  await u.undo();
  assert.equal(s.items.size, 0, 'and so does the add');
  assert.equal(u.canUndo(), false);

  await u.redo(); await u.redo(); await u.redo();
  assert.equal(s.items.size, 0, 'redo all the way: added, recoloured, deleted');
  assert.deepEqual(s.log.slice(-3).map(x => x[0]), ['create', 'patch', 'remove']);
});

test('a new write clears redo; a write that fails drops its entry', async () => {
  const s = fakeStore(), u = createUndo(s.ops);
  const a = await s.add(u, box);
  await u.undo();
  assert.equal(u.canRedo(), true);
  await s.add(u, { ...box, x: 50 });
  assert.equal(u.canRedo(), false, 'redo is gone after something new');

  const b = [...s.items.values()][0];
  s.items.delete(b.id); /* someone else's delete reached the board first */
  assert.equal(await u.undo(), false);
  assert.equal(u.canUndo(), false, 'the entry is dropped, not retried forever');
  assert.ok(a);
});

test('the stack tells the board when to repaint its buttons', async () => {
  const s = fakeStore();
  let n = 0;
  const u = createUndo(s.ops, () => { n++; });
  await s.add(u, box);
  await u.undo();
  await u.redo();
  assert.equal(n, 3);
});

test('keys: ⌘Z and Ctrl+Z undo; ⇧⌘Z, Ctrl+Shift+Z and Ctrl+Y redo; nothing else', () => {
  assert.equal(undoKey({ key: 'z', metaKey: true }), 'undo');
  assert.equal(undoKey({ key: 'z', ctrlKey: true }), 'undo');
  assert.equal(undoKey({ key: 'Z', metaKey: true, shiftKey: true }), 'redo');
  assert.equal(undoKey({ key: 'Z', ctrlKey: true, shiftKey: true }), 'redo');
  assert.equal(undoKey({ key: 'y', ctrlKey: true }), 'redo');
  assert.equal(undoKey({ key: 'y', metaKey: true }), null);
  assert.equal(undoKey({ key: 'z' }), null);
  assert.equal(undoKey({ key: 'z', metaKey: true, altKey: true }), null);
});

test('while typing, the browser keeps its own undo', () => {
  const doc = new DOMParser().parseFromString('<html><body><textarea id="t"></textarea><input id="i"><div contenteditable="plaintext-only"><b id="e">x</b></div><div contenteditable="false" id="off"></div><div id="c"></div></body></html>', 'text/html');
  const el = id => doc.getElementById(id);
  assert.equal(typing(el('t')), true);
  assert.equal(typing(el('i')), true);
  assert.equal(typing(el('e')), true, 'inside a note being edited');
  assert.equal(typing(el('off')), false);
  assert.equal(typing(el('c')), false, 'the canvas');
  assert.equal(typing(null), false);
});
