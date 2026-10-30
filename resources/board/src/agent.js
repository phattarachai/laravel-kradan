/*
 * Kradan frame agent. The server injects it into every HTML page a round serves:
 *
 *   <script src=".../agent.js" data-parent="https://app.example.com"></script>
 *
 * The page runs in an opaque origin (`Content-Security-Policy: sandbox allow-scripts`), so the board
 * can't read its DOM. Everything the local workbench did through `iframe.contentDocument` happens
 * here instead, over postMessage. Messages are `{kradan: 1, type, id?, re?, ...}`:
 *
 *   board → frame (a request with `id`; the reply is the same type with `re: id`)
 *     crop {step, key, option}   hide all but one step or option     → {rect, height}
 *     hit {x, y}                 what sits at a point                → {text, option, editable}
 *     box {rect}                 the text inside a box               → {texts}
 *     edit-begin {x, y}          make the text at a point editable   → {from} or {from: null}
 *     edit-end {keep}            finish the edit (sends edit-end below)
 *     apply-edits {edits}        show these {from, to} edits, undo the rest → {applied}
 *     scroll {y?, ratio?}        scroll the page (scroll sync)
 *     highlight {rect|null}      outline an area
 *     measure                    → {width, height, vw, vh, scrollY}
 *     hash {hash}                follow a sibling frame's hash (tap sync)
 *
 *   frame → board (events, no `re`)
 *     ready {steps, height, url}   on load: the page's steps as the workbench reads them
 *     cropped {rect, height}       the cropped target moved or resized
 *     scrolled {y, ratio}          the page scrolled (mirrored: true when a scroll request caused it)
 *     edit-end {from, to, keep}    an edit finished (Enter, Esc, blur, or edit-end from the board)
 *     wheel {x, y, dx, dy, zoom}   a wheel the page can't use: the board pans or zooms instead
 *     contextmenu {x, y}           right-click (Shift + right-click keeps the browser's menu)
 *     pointerdown {}               a press inside the page closes the board's menus
 *     key {code, key, up}          Space and the tool keys, outside the page's own inputs
 *     hash {hash}                  the page's hash changed
 *     resized {width, height}      the page grew or shrank after load (mermaid, images, fonts)
 *
 * The agent only takes messages from window.parent whose origin is data-parent, and posts only to that
 * origin. It never evaluates anything it receives; text from the board lands through textContent.
 */

const OFF = 'data-wb-off';
const MAX_EDIT = 200;

/* the element whose own text sits at a point: what a pin names and what แก้คำ edits */
export function textTarget(el) {
  for (; el && el.nodeType === 1; el = el.parentElement) {
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (own) { return el; }
  }
  return null;
}

const firstLine = (s, n = 40) => String(s || '').trim().split('\n')[0].trim().slice(0, n);

/* the steps of a review page, read from the same markup as the harness and the workbench */
export function readSteps(doc) {
  const taken = new Set();
  return [...doc.querySelectorAll('[data-dp-step]')].map((s, index) => {
    const group = (s.closest('[data-dp-group]')?.dataset.title || s.dataset.group || '').trim();
    const title = (s.dataset.title || '').trim();
    let key = `${group}|${title}`;
    for (let n = 2; taken.has(key); n++) { key = `${group}|${title}|${n}`; }
    taken.add(key);
    const frames = el => [...el.querySelectorAll('[data-dp-frames]')].map(b => ({
      src: b.dataset.src || '',
      show: (b.dataset.show || 'desktop phone').split(/\s+/).map(x => x === 'responsive' ? 'desktop' : x).filter(Boolean),
      height: +b.dataset.height || 0,
      cap: b.previousElementSibling?.classList.contains('lbl') ? b.previousElementSibling.textContent.trim() : '',
    }));
    const opts = [...s.querySelectorAll('[data-dp-option]')];
    return {
      index, key, group, title, sub: (s.dataset.sub || '').trim(),
      kind: opts.length ? 'question' : 'screen',
      frames: opts.length ? [] : frames(s),
      options: opts.map(o => ({ key: (o.dataset.key || '').trim(), title: (o.dataset.label || '').trim(), trade: (o.dataset.trade || '').trim(), frames: frames(o) })),
    };
  });
}

export function createAgent({ win, doc, parentOrigin }) {
  const parent = win.parent;
  const state = { target: null, editing: null, mirrorY: null, observer: null, overlay: null };

  const post = msg => parent.postMessage({ kradan: 1, ...msg }, parentOrigin);
  const emit = (type, data = {}) => post({ type, ...data });

  /* only our board, from the app origin the server named */
  function accepts(e) {
    return e.source === parent && e.origin === parentOrigin
      && !!e.data && typeof e.data === 'object' && e.data.kradan === 1 && typeof e.data.type === 'string';
  }

  const scroller = () => doc.scrollingElement || doc.documentElement;
  function rectOf(el) {
    const r = el.getBoundingClientRect(), pad = 16;
    const x = Math.max(0, Math.floor(r.left - pad)), y = Math.max(0, Math.floor(r.top - pad));
    return { x, y, w: Math.ceil(r.right + pad) - x, h: Math.ceil(r.bottom + pad) - y };
  }
  const docHeight = () => Math.max(scroller().scrollHeight || 0, doc.body?.scrollHeight || 0);

  const handlers = {
    crop({ step, key, option }) {
      const steps = [...doc.querySelectorAll('[data-dp-step]')];
      const keyed = key ? readSteps(doc).find(s => s.key === key) : null;
      const st = steps[keyed ? keyed.index : +step || 0];
      const t = !st ? null : option ? [...st.querySelectorAll('[data-dp-option]')].find(o => o.dataset.key === option) : st;
      if (!t) { return { rect: null, height: docHeight() }; }
      doc.querySelectorAll(`[${OFF}]`).forEach(el => el.removeAttribute(OFF));
      if (!doc.getElementById('kradan-crop')) {
        const style = doc.createElement('style');
        style.id = 'kradan-crop';
        style.textContent = `[${OFF}]{display:none!important}html,body{overflow:hidden!important}`;
        doc.head.appendChild(style);
      }
      for (let el = t; el && el !== doc.body && el.parentElement; el = el.parentElement) {
        for (const c of el.parentElement.children) {
          if (c !== el && !/^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(c.tagName)) { c.setAttribute(OFF, ''); }
        }
      }
      state.target = t;
      const report = () => emit('cropped', { rect: rectOf(t), height: docHeight() });
      state.observer?.disconnect();
      if (win.ResizeObserver) { state.observer = new win.ResizeObserver(report); state.observer.observe(t); }
      doc.fonts?.ready?.then(report);
      return { rect: rectOf(t), height: docHeight() };
    },

    hit({ x, y }) {
      const el = doc.elementFromPoint(+x, +y);
      const own = textTarget(el);
      return {
        text: firstLine(el?.innerText || el?.textContent),
        option: el?.closest?.('[data-dp-option]')?.dataset.key || null,
        editable: !!own && (own.innerText || own.textContent || '').trim().length <= MAX_EDIT,
      };
    },

    /* every piece of text whose middle sits inside the box, so Claude reads what was boxed */
    box({ rect }) {
      const out = [];
      const b = rect || {};
      const walk = doc.createTreeWalker(doc.body, 4 /* SHOW_TEXT */);
      const range = doc.createRange();
      for (let n = walk.nextNode(); n && out.length < 8; n = walk.nextNode()) {
        const s = n.textContent.trim();
        if (!s || n.parentElement.closest(`[${OFF}], script, style, #kradan-hl`)) { continue; }
        range.selectNodeContents(n);
        const r = range.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (r.width && cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h && !out.includes(s.slice(0, 40))) { out.push(s.slice(0, 40)); }
      }
      return { texts: out };
    },

    'edit-begin'({ x, y }) {
      finishEdit(true);
      const el = textTarget(doc.elementFromPoint(+x, +y));
      if (!el || (el.innerText || el.textContent).trim().length > MAX_EDIT) { return { from: null }; }
      const from = el.dataset.wbOrig ?? (el.innerText || el.textContent).trim();
      state.editing = { el, from, before: (el.innerText || el.textContent).trim(), outline: el.style.outline };
      el.dataset.wbOrig = from;
      el.contentEditable = 'true';
      el.style.outline = '2px solid #2563eb';
      win.focus();
      el.focus();
      win.getSelection?.()?.selectAllChildren(el);
      el.addEventListener('keydown', editKeys);
      el.addEventListener('blur', onBlur);
      return { from };
    },

    'edit-end'({ keep }) {
      finishEdit(keep !== false);
      return {};
    },

    'apply-edits'({ edits }) {
      const want = Array.isArray(edits) ? edits.filter(e => e && typeof e.from === 'string' && typeof e.to === 'string') : [];
      /* undo what is no longer wanted */
      doc.querySelectorAll('[data-wb-orig]').forEach(el => {
        if (state.editing?.el === el) { return; }
        const now = (el.innerText || el.textContent).trim();
        if (!want.some(e => e.from === el.dataset.wbOrig && e.to === now)) { el.textContent = el.dataset.wbOrig; el.removeAttribute('data-wb-orig'); }
      });
      let applied = 0;
      want.forEach(x => {
        const walk = doc.createTreeWalker(doc.body, 1 /* SHOW_ELEMENT */);
        for (let el = walk.nextNode(); el; el = walk.nextNode()) {
          const now = (el.innerText || el.textContent).trim();
          if (el.dataset.wbOrig === x.from && now === x.to) { applied++; break; }
          if (textTarget(el) === el && !el.dataset.wbOrig && now === x.from) { el.dataset.wbOrig = x.from; el.textContent = x.to; applied++; break; }
        }
      });
      return { applied };
    },

    scroll({ y, ratio }) {
      const el = scroller();
      const max = el.scrollHeight - win.innerHeight;
      /* instant, or a page with scroll-behavior: smooth glides there and every step on the way reads as a scroll by
         hand */
      el.scrollTo({ top: typeof ratio === 'number' ? ratio * max : +y || 0, behavior: 'instant' });
      state.mirrorY = el.scrollTop;
      return { y: el.scrollTop };
    },

    highlight({ rect }) {
      state.overlay?.remove();
      state.overlay = null;
      if (!rect) { return {}; }
      const o = doc.createElement('div');
      o.id = 'kradan-hl';
      o.style.cssText = `position:absolute;z-index:2147483647;pointer-events:none;border:2px solid #e8590c;background:rgba(232,89,12,.08);border-radius:3px;left:${+rect.x || 0}px;top:${(+rect.y || 0) + scroller().scrollTop}px;width:${+rect.w || 0}px;height:${+rect.h || 0}px`;
      doc.body.appendChild(o);
      state.overlay = o;
      return {};
    },

    measure() {
      const el = scroller();
      return { width: el.scrollWidth, height: docHeight(), vw: win.innerWidth, vh: win.innerHeight, scrollY: el.scrollTop };
    },

    hash({ hash }) {
      if (typeof hash === 'string' && win.location.hash !== hash) { win.location.hash = hash; }
      return {};
    },
  };

  function editKeys(e) {
    if (e.key === 'Enter') { e.preventDefault(); finishEdit(true); }
    if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); }
  }
  function onBlur() { finishEdit(true); }
  function finishEdit(keep) {
    const ed = state.editing;
    if (!ed) { return; }
    state.editing = null;
    const { el, from, before, outline } = ed;
    el.removeEventListener('keydown', editKeys);
    el.removeEventListener('blur', onBlur);
    el.removeAttribute('contenteditable');
    el.style.outline = outline;
    win.getSelection?.()?.removeAllRanges();
    if (!keep) { el.textContent = before; emit('edit-end', { from, to: before, keep: false }); return; }
    const to = (el.innerText || el.textContent).replace(/\s+/g, ' ').trim();
    if (!to) { el.textContent = from; }
    if (!to || to === from) { el.removeAttribute('data-wb-orig'); }
    emit('edit-end', { from, to: to || from, keep: true });
  }

  function onMessage(e) {
    if (!accepts(e)) { return false; }
    const { type, id } = e.data;
    const h = Object.prototype.hasOwnProperty.call(handlers, type) ? handlers[type] : null;
    if (!h) { return false; }
    let out;
    try { out = h(e.data) || {}; } catch (err) { out = { error: String(err?.message || err) }; }
    if (id !== undefined) { post({ type, re: id, ...out }); }
    return true;
  }

  /* can the element under the wheel scroll that way itself? if not, the board pans */
  function canScroll(el, dx, dy) {
    const vertical = Math.abs(dy) >= Math.abs(dx), d = vertical ? dy : dx;
    for (; el && el.nodeType === 1; el = el.parentElement) {
      const cs = win.getComputedStyle(el);
      const root = el === scroller();
      if (!root && !/(auto|scroll)/.test(vertical ? cs.overflowY : cs.overflowX)) { continue; }
      if (root && /hidden/.test(win.getComputedStyle(doc.documentElement)[vertical ? 'overflowY' : 'overflowX'])) { continue; }
      const pos = vertical ? el.scrollTop : el.scrollLeft;
      const max = vertical ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
      if ((d > 0 && pos < max - 1) || (d < 0 && pos > 0)) { return true; }
    }
    return false;
  }
  const inField = t => !!t?.closest?.('input, textarea, select, [contenteditable="true"]');
  const TOOL_KEYS = ['Space', 'KeyH', 'KeyV', 'KeyE', 'KeyC', 'KeyN', 'KeyT', 'KeyP', 'KeyA', 'KeyR', 'KeyO', 'KeyM', 'Escape'];

  function listen() {
    win.addEventListener('message', onMessage);
    win.addEventListener('wheel', e => {
      const zoom = e.ctrlKey || e.metaKey;
      if (!zoom && !state.target && canScroll(e.target, e.deltaX, e.deltaY)) { return; }
      e.preventDefault();
      emit('wheel', { x: e.clientX, y: e.clientY, dx: e.deltaX, dy: e.deltaY, zoom });
    }, { passive: false });
    win.addEventListener('contextmenu', e => {
      if (e.shiftKey) { return; }
      e.preventDefault();
      emit('contextmenu', { x: e.clientX, y: e.clientY });
    });
    win.addEventListener('pointerdown', () => emit('pointerdown'));
    win.addEventListener('keydown', e => {
      if (inField(e.target) || e.metaKey || e.ctrlKey || e.altKey || !TOOL_KEYS.includes(e.code)) { return; }
      e.preventDefault();
      emit('key', { code: e.code, key: e.key, shift: e.shiftKey, up: false });
    });
    win.addEventListener('keyup', e => { if (e.code === 'Space') { emit('key', { code: e.code, key: e.key, up: true }); } });
    let ticking = false;
    win.addEventListener('scroll', () => {
      if (ticking) { return; }
      ticking = true;
      win.requestAnimationFrame(() => {
        ticking = false;
        const el = scroller(), max = el.scrollHeight - win.innerHeight;
        /* still where the board put it: an echo of a sibling's scroll. A time-based guard let late scroll events
           echo back and yank the scrolled frame to the top (owner, 2026-10-30) */
        const mirrored = state.mirrorY !== null && Math.abs(el.scrollTop - state.mirrorY) < 2;
        if (!mirrored) { state.mirrorY = null; }
        emit('scrolled', { y: el.scrollTop, ratio: max > 0 ? el.scrollTop / max : 0, mirrored });
      });
    }, { passive: true });
    win.addEventListener('hashchange', () => emit('hash', { hash: win.location.hash }));
    /* a page drawn after load (mermaid, late images) changes height: the board resizes the frame to follow */
    if (win.ResizeObserver && doc.documentElement) {
      let last = docHeight();
      const ro = new win.ResizeObserver(() => {
        const h = docHeight();
        if (Math.abs(h - last) < 2) { return; }
        last = h;
        emit('resized', { width: scroller().scrollWidth, height: h });
      });
      ro.observe(doc.documentElement);
      if (doc.body) { ro.observe(doc.body); }
    }
  }

  function ready() {
    emit('ready', { steps: readSteps(doc), height: docHeight(), url: String(win.location.href) });
  }

  return { accepts, onMessage, handlers, listen, ready, state };
}

/* a real origin only: never "*" and never "null" */
export function validParent(origin) {
  return typeof origin === 'string' && /^https?:\/\/[^/\s]+$/.test(origin);
}

export function boot(win = globalThis.window, script = globalThis.document?.currentScript) {
  if (!win || !script || win.parent === win) { return null; }
  const parentOrigin = script.dataset?.parent;
  if (!validParent(parentOrigin)) { return null; }
  const agent = createAgent({ win, doc: win.document, parentOrigin });
  agent.listen();
  if (win.document.readyState === 'loading') { win.document.addEventListener('DOMContentLoaded', () => agent.ready()); } else { agent.ready(); }
  return agent;
}
