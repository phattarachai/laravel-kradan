/*
 * Undo and redo of what I did to my own items (owner, 2026-10-28): add, move, delete, recolour, a note, a copy.
 * One stack per board and round, for this visit only. It works through the store's own writes:
 *   - undo an add is a delete, and its redo creates the item again
 *   - undo a delete creates the item again; the new id replaces the old one everywhere in the stack
 *   - undo a patch (a move, a colour, a note) writes the fields as they were
 * ops: { create(fields) → item, patch(id, fields), remove(id) }. A write that fails (the item is gone) drops its entry.
 */
const LIMIT = 100;

/* the fields that make an item again; the store fills in its id, author and time */
export const KEEP = ['kind', 'step', 'anchor', 'x', 'y', 'w', 'h', 'color', 'text', 'points', 'texts'];
export const fieldsOf = it => Object.fromEntries(KEEP.filter(k => it[k] !== undefined && it[k] !== null).map(k => [k, structuredClone(it[k])]));

/* the browser's own undo stays in a text box */
export const typing = el => !!el?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
/* ⌘Z / Ctrl+Z undo; ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y redo */
export function undoKey(e) {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) { return null; }
  const k = String(e.key).toLowerCase();
  if (k === 'z') { return e.shiftKey ? 'redo' : 'undo'; }
  if (k === 'y' && e.ctrlKey && !e.metaKey) { return 'redo'; }
  return null;
}

export function createUndo(ops, onChange = () => {}) {
  const done = [], undone = [];
  /* one handle per item, shared by every entry about it, so a re-created item's new id reaches them all */
  const handles = new Map();
  const handle = id => { const k = String(id); if (!handles.has(k)) { handles.set(k, { id }); } return handles.get(k); };
  const rehome = (h, id) => { handles.delete(String(h.id)); h.id = id; handles.set(String(id), h); };
  let busy = false;

  function push(entry) {
    done.push(entry);
    if (done.length > LIMIT) { done.shift(); }
    undone.length = 0;
    onChange();
  }
  const record = {
    add: it => push({ type: 'add', h: handle(it.id), fields: fieldsOf(it) }),
    remove: it => push({ type: 'del', h: handle(it.id), fields: fieldsOf(it) }),
    /* before and after hold only the fields that changed */
    patch: (it, before, after) => push({ type: 'patch', h: handle(it.id), before, after }),
  };

  async function apply(entry, back) {
    const { h } = entry;
    const make = async () => { const it = await ops.create(entry.fields); rehome(h, it.id); };
    if (entry.type === 'add') { return back ? ops.remove(h.id) : make(); }
    if (entry.type === 'del') { return back ? make() : ops.remove(h.id); }
    return ops.patch(h.id, back ? entry.before : entry.after);
  }
  async function step(from, to, back) {
    if (busy || !from.length) { return false; }
    busy = true;
    const entry = from.pop();
    try {
      await apply(entry, back);
      to.push(entry);
      return true;
    } catch {
      return false;
    } finally {
      busy = false;
      onChange();
    }
  }

  return {
    record,
    undo: () => step(done, undone, true),
    redo: () => step(undone, done, false),
    canUndo: () => done.length > 0,
    canRedo: () => undone.length > 0,
    /* while undo or redo writes, the writes it makes are not new entries */
    get applying() { return busy; },
  };
}
