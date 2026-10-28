import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { answersKey } from '../src/board/keep.js';

/*
 * The board itself in linkedom, over a store that keeps its rows in id order the way the server does (T192: the
 * เขียนความเห็น box lost what was typed whenever a refresh found a change). linkedom has no focus or caret and
 * keeps a textarea's value in its text, so those are filled in here the way a browser has them.
 */
function browser() {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="kradan"></div></body></html>');
  let active = null;
  const ev = (type, related) => Object.assign(new window.Event(type, { bubbles: true }), { relatedTarget: related });
  const H = window.HTMLElement.prototype;
  H.focus = function () { if (active === this) { return; } const prev = active; active = this; prev?.dispatchEvent(ev('focusout', this)); };
  H.blur = function () { if (active !== this) { return; } active = null; this.dispatchEvent(ev('focusout', null)); };
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  Object.defineProperty(document, 'activeElement', { get: () => (active?.isConnected ? active : document.body), configurable: true });
  const T = window.HTMLTextAreaElement.prototype;
  const own = (el, k, d) => (Object.hasOwn(el, k) ? el[k] : d);
  Object.defineProperties(T, {
    value: { get() { return own(this, '_v', this.textContent); }, set(v) { this._v = String(v); this._sel = [this._v.length, this._v.length, 'none']; }, configurable: true },
    defaultValue: { get() { return this.textContent; }, configurable: true },
    selectionStart: { get() { return own(this, '_sel', [this.value.length])[0]; }, configurable: true },
    selectionEnd: { get() { return own(this, '_sel', [0, this.value.length])[1]; }, configurable: true },
    selectionDirection: { get() { return own(this, '_sel', [0, 0, 'none'])[2]; }, configurable: true },
  });
  T.setSelectionRange = function (s, e, d = 'none') { this._sel = [s, e, d]; };

  const ls = new Map();
  /* the heartbeat's timers don't keep the test running */
  const every = globalThis.realSetInterval ??= setInterval;
  Object.assign(globalThis, {
    setInterval: (f, ms) => { const h = every(f, ms); h.unref?.(); return h; },
    window, document, innerWidth: 1400, innerHeight: 900,
    getComputedStyle: () => ({}), requestAnimationFrame: f => setTimeout(f, 0), cancelAnimationFrame: () => {},
    matchMedia: () => ({ matches: false, addEventListener() {} }), ResizeObserver: class { observe() {} disconnect() {} },
    localStorage: { getItem: k => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
    history: { replaceState() {}, pushState() {} },
    location: new URL('http://localhost/kradan/b/demo'),
    addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window),
  });
  Object.defineProperty(globalThis, 'navigator', { value: { platform: 'MacIntel' }, configurable: true });
  return window;
}

const ME = { id: 'u1', name: 'ภัทร', avatar: null };
const OTHER = { id: 'u2', name: 'นก', avatar: null };
const opts = [{ key: 'A', label: 'แบบ A' }, { key: 'B', label: 'แบบ B' }];
const ROUND = { number: 1, prints: {}, steps: [{ key: 'a', title: 'หน้าแรก', options: opts, shots: [] }, { key: 'b', title: 'ตะกร้า', options: opts, shots: [] }] };

/* the server: rows in id order, a pick updated in place, its own shape on every answer */
function server(seed = {}) {
  const db = { picks: [], comments: [], ...structuredClone(seed) };
  let id = 100;
  const at = () => new Date(Date.UTC(2026, 9, 28, 10, 0, id)).toISOString();
  const pickOf = (step, user, body) => ({ step, user: { ...user }, options: body.options, seen: !!body.seen, updated_at: at() });
  return {
    db,
    /* someone else's write, straight into the store */
    theyPick(step, options) { id++; const i = db.picks.findIndex(p => p.step === step && p.user.id === OTHER.id); const p = pickOf(step, OTHER, { options }); if (i < 0) { db.picks.push(p); } else { db.picks[i] = p; } },
    store: {
      caps: { multiUser: false, presence: false, decide: false },
      frames: { load: () => setTimeout(() => window.dispatchEvent(Object.assign(new window.Event('message'), { source: undefined, origin: 'null', data: { kradan: 1, type: 'ready', steps: null } })), 0) },
      board: async () => ({ slug: 'demo', title: 'Demo', status: 'open', current: 1, rounds: [ROUND], viewers: [], items: [], ...structuredClone(db) }),
      boards: async () => [],
      heartbeat: async () => ({}),
      pick: async (slug, round, step, body) => {
        id++;
        const i = db.picks.findIndex(p => p.step === step && p.user.id === ME.id);
        const p = pickOf(step, ME, body);
        if (i < 0) { db.picks.push(p); } else { db.picks[i] = p; }
        return { picks: structuredClone(db.picks.filter(x => x.step === step)) };
      },
      comment: async (slug, round, body) => {
        const c = { id: ++id, step: body.step, parent_id: body.parent_id ?? null, item_id: null, user: { ...ME }, mine: true, body: body.body, pin: null, edit: null, created_at: at(), updated_at: at(), replies: [] };
        db.comments.push(c);
        return structuredClone(c);
      },
      editComment: async (cid, text) => { const c = db.comments.find(x => x.id === cid); c.body = text; c.updated_at = at(); return structuredClone(c); },
    },
  };
}

const settle = () => new Promise(r => setTimeout(r, 30));
async function mount({ seed, ext } = {}) {
  const window = browser();
  const { mountBoard } = await import('../src/board/board.js');
  const srv = server(seed);
  mountBoard({ page: 'board', user: ME, board: await srv.store.board(), presence: { mode: 'off' }, routes: {} }, document.getElementById('kradan'), { store: srv.store, ext });
  await settle();
  const $ = s => document.querySelector(s);
  return {
    srv, window, $,
    composer: () => $('#panel [data-compose=""] textarea'),
    type(ta, text, caret = text.length) { ta.focus(); ta.value = text; ta.setSelectionRange(caret, caret); },
    async pick(key) { const cb = $(`#panel input[name="pick"][value="${key}"]`); cb.checked = !cb.checked; cb.dispatchEvent(new window.Event('change', { bubbles: true })); await settle(); },
    /* back to the tab: what the board does on visibilitychange and on a heartbeat whose changed_at moved */
    async refresh() { document.dispatchEvent(new window.Event('visibilitychange')); await settle(); },
    async key(k) { document.body.dispatchEvent(Object.assign(new window.Event('keydown', { bubbles: true }), { key: k, code: k })); await settle(); },
  };
}
const caret = ta => [ta.selectionStart, ta.selectionEnd];

test('typing in เขียนความเห็น survives a refresh that brings in someone else\'s pick: same box, text, focus and caret', async () => {
  const b = await mount();
  await b.pick('A');
  const ta = b.composer();
  b.type(ta, 'ปุ่มนี้เล็กไป', 4);
  b.srv.theyPick('b', ['B']);
  await b.refresh();
  const now = b.composer();
  assert.equal(now, ta, 'the box is not rebuilt while it is being typed in');
  assert.equal(now.value, 'ปุ่มนี้เล็กไป');
  assert.equal(document.activeElement, now);
  assert.deepEqual(caret(now), [4, 4]);

  /* typing stops: the panel catches up, and the draft goes with it */
  now.blur();
  await settle();
  assert.notEqual(b.composer(), ta, 'the panel re-rendered with the new answers');
  assert.equal(b.composer().value, 'ปุ่มนี้เล็กไป');
});

test('when the panel is rebuilt under the caret anyway, the box comes back focused with its caret and text', async () => {
  const b = await mount();
  const { createKeep } = await import('../src/board/keep.js');
  const keep = createKeep(), panel = b.$('#panel');
  const html = panel.innerHTML;
  b.type(b.composer(), 'ตัวหนังสือจางไป', 3);
  keep.save(panel, 'a');
  panel.innerHTML = html;
  const back = keep.restore(panel, 'a');
  assert.deepEqual(back, [b.composer()]);
  assert.equal(b.composer().value, 'ตัวหนังสือจางไป');
  assert.equal(document.activeElement, b.composer());
  assert.deepEqual(caret(b.composer()), [3, 3]);
  panel.innerHTML = html;
  keep.restore(panel, 'b');
  assert.equal(b.composer().value, '', 'another step\'s box is its own');
});

test('my own pick coming back from the store is not a change: the refresh leaves the panel alone', async () => {
  const b = await mount({ seed: { picks: [
    { step: 'a', user: ME, options: ['A'], seen: false, updated_at: '2026-10-28T09:00:00.000Z' },
    { step: 'b', user: OTHER, options: ['B'], seen: false, updated_at: '2026-10-28T09:01:00.000Z' },
  ] } });
  await b.pick('B');
  const h2 = b.$('#panel h2');
  await b.refresh();
  assert.equal(b.$('#panel h2'), h2, 'no re-render');
  assert.equal(answersKey({ picks: [{ step: 'b', user: { id: 2 } }, { step: 'a', user: { id: 1 }, x: null }] }), answersKey({ picks: [{ step: 'a', user: { id: 1 } }, { step: 'b', user: { id: 2 } }] }));
});

test('typed, then left, then a pick: the draft is still there', async () => {
  const b = await mount();
  const ta = b.composer();
  b.type(ta, 'ขอสีเข้มกว่านี้');
  ta.blur();
  await b.pick('A');
  assert.notEqual(b.composer(), ta);
  assert.equal(b.composer().value, 'ขอสีเข้มกว่านี้');
  assert.notEqual(document.activeElement, b.composer(), 'focus is not pulled back');
});

test('a draft stays with its step: the next step starts empty, coming back brings it', async () => {
  const b = await mount();
  b.type(b.composer(), 'หน้าแรกยาวไป');
  b.composer().blur();
  await b.key('ArrowRight');
  assert.equal(b.$('#panel h2').textContent, 'ตะกร้า');
  assert.equal(b.composer().value, '');
  await b.key('ArrowLeft');
  assert.equal(b.$('#panel h2').textContent, 'หน้าแรก');
  assert.equal(b.composer().value, 'หน้าแรกยาวไป');
});

test('a sent comment does not come back into the box', async () => {
  const b = await mount();
  b.type(b.composer(), 'ส่งแล้ว');
  b.composer().closest('form').dispatchEvent(new b.window.Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  assert.equal(b.composer().value, '');
  assert.match(b.$('#panel .k-thread').textContent, /ส่งแล้ว/);
});

test('an edit going on comes back after a re-render, with what was typed', async () => {
  const b = await mount({ seed: { comments: [{ id: 7, step: 'a', parent_id: null, item_id: null, user: ME, mine: true, body: 'เดิม', pin: null, edit: null, created_at: '2026-10-28T09:00:00.000Z', updated_at: '2026-10-28T09:00:00.000Z', replies: [] }] } });
  b.$('#panel [data-cedit="7"]').dispatchEvent(new b.window.Event('click', { bubbles: true }));
  const ta = b.$('#panel [data-editform="7"] textarea');
  b.type(ta, 'เดิม แก้แล้ว');
  ta.blur();
  await b.pick('A');
  assert.equal(b.$('#panel [data-editform="7"] textarea')?.value, 'เดิม แก้แล้ว');
});

test('a host\'s box (ภาพรวม) keeps what was typed before its own save, and later shows what the host has', async () => {
  let saved = 'ภาพรวมโอเค';
  const ext = { panelEnd: () => `<textarea data-wboverall data-keep="overall">${saved}</textarea>` };
  const b = await mount({ ext });
  const box = () => b.$('#panel [data-keep="overall"]');
  b.type(box(), 'ภาพรวมโอเค แต่', 5);
  await b.pick('A');
  assert.equal(box().value, 'ภาพรวมโอเค แต่');
  assert.equal(document.activeElement, box());
  assert.deepEqual(caret(box()), [5, 5]);

  /* its own save lands; from then on a render shows what the host has, not an old copy */
  saved = 'ภาพรวมโอเค แต่';
  box().blur();
  await b.pick('A');
  assert.equal(box().value, 'ภาพรวมโอเค แต่');
  saved = 'ใหม่จากที่อื่น';
  await b.pick('A');
  assert.equal(box().value, 'ใหม่จากที่อื่น');
});
