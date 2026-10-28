/*
 * What is typed in the panel outlives a re-render (T192): someone else's answer, a pick, a step switch.
 *   - a box has a key: a composer by its step and what it answers, an edit by its comment, a host's box by data-keep
 *   - a composer or an edit that differs from what it started with is kept per step until it is sent
 *   - the box being typed in gets its focus and caret back
 * A host's data-keep box (ภาพรวม) saves itself, so only the render in between keeps it.
 */
const BOXES = 'textarea';

export function fieldKey(el, scope) {
  if (el.dataset?.keep) { return el.dataset.keep; }
  const f = el.closest?.('[data-compose], [data-editform]');
  if (!f) { return null; }
  return f.dataset.editform ? `${scope}|edit:${f.dataset.editform}` : `${scope}|compose:${f.dataset.compose}`;
}

export function createKeep() {
  const drafts = new Map();
  let focus = null;

  /* before a render: what each box holds, and where the caret is. A box being sent (disabled) is done */
  function save(root, scope) {
    const active = root.ownerDocument?.activeElement;
    focus = null;
    root.querySelectorAll(BOXES).forEach(el => {
      const key = fieldKey(el, scope);
      if (!key) { return; }
      if (!el.disabled && el.value !== el.defaultValue) { drafts.set(key, el.value); } else { drafts.delete(key); }
      if (el === active && !el.disabled) { focus = { key, start: el.selectionStart, end: el.selectionEnd, dir: el.selectionDirection, top: el.scrollTop }; }
    });
  }

  /* on each keystroke: the draft is kept before any render asks */
  function note(el, scope) {
    const key = fieldKey(el, scope);
    if (!key?.includes('|')) { return; }
    if (!el.disabled && el.value !== el.defaultValue) { drafts.set(key, el.value); } else { drafts.delete(key); }
  }

  /* after it: open(what) brings back a box the render left out ('compose:12', 'edit:7'); returns the boxes filled */
  function restore(root, scope, open = () => {}) {
    const here = () => [...root.querySelectorAll(BOXES)].map(el => [el, fieldKey(el, scope)]).filter(([, k]) => k);
    const keys = new Set(here().map(([, k]) => k));
    [...drafts.keys()].filter(k => k.startsWith(`${scope}|`) && !keys.has(k)).forEach(k => open(k.slice(scope.length + 1)));
    const filled = [];
    here().forEach(([el, key]) => {
      if (drafts.has(key)) { el.value = drafts.get(key); filled.push(el); }
      if (focus?.key === key) {
        el.focus({ preventScroll: true });
        el.setSelectionRange?.(focus.start, focus.end, focus.dir || 'none');
        el.scrollTop = focus.top;
      }
    });
    [...drafts.keys()].filter(k => !k.includes('|')).forEach(k => drafts.delete(k));
    focus = null;
    return filled;
  }

  return { save, note, restore, drafts };
}

/*
 * The answers as the board shows them, so a refresh after my own write is a no-op: picks by step and person,
 * comments and items by id, and an empty field the same as a missing one.
 */
const canon = v => (Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== null && v[k] !== undefined).map(k => [k, canon(v[k])]))
    : v);
const byId = list => [...(list || [])].sort((a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
const byStep = list => [...(list || [])].sort((a, b) => `${a.step}\u0000${a.user?.id}`.localeCompare(`${b.step}\u0000${b.user?.id}`, 'en'));
export const answersKey = ({ picks, comments, items }) => JSON.stringify(canon({
  picks: byStep(picks),
  comments: byId(comments).map(c => ({ ...c, replies: byId(c.replies) })),
  items: byId(items),
}));
