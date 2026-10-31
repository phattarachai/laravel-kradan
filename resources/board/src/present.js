/*
 * Present mode, the parent page's side: one frame of the deck in present mode (?k=present&n=N) over the whole
 * window, fullscreen when a key or click asked for it. The board opens it with ▶ or F; the public share page
 * (/kradan/p/{token}) is nothing else. Moves go to the deck runtime as goto/nav over the frame bridge; the
 * runtime answers `at` after every move and forwards the keys pressed inside the slide as `deck-key`.
 *
 * Keys: → Space PageDown Enter or a click: next · ← PageUp Backspace: back · Home End · B or .: black screen ·
 * F: fullscreen · Esc: leave (the share page has nowhere to leave to).
 */
import { createBridge } from './bridge.js';

const NEXT = ['ArrowRight', 'ArrowDown', 'Space', 'PageDown', 'Enter', 'Click'];
const BACK = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'];

const ICON = {
  prev: '<path d="M15 6l-6 6 6 6"/>', next: '<path d="M9 6l6 6-6 6"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>',
  pdf: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
};
const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;

/* what a key does, apart from the DOM so it can be tested */
export function keyAction(code, { closable = true } = {}) {
  if (NEXT.includes(code)) { return { nav: 1 }; }
  if (BACK.includes(code)) { return { nav: -1 }; }
  if (code === 'Home') { return { goto: [1, 0] }; }
  if (code === 'End') { return { goto: ['end', -1] }; }
  if (code === 'KeyB' || code === 'Period') { return { black: true }; }
  if (code === 'KeyF') { return { full: true }; }
  if (code === 'Escape' && closable) { return { close: true }; }
  return null;
}

/* the deck page in present mode, at slide n */
export function presentUrl(pageUrl, n = 1, mode = 'present') {
  const u = new URL(pageUrl);
  u.searchParams.set('k', mode);
  u.searchParams.set('n', String(Math.max(1, +n || 1)));
  return u.href;
}

/* the deck's print view in a tab of its own: every slide one page, and the print dialog opens by itself */
export function printDeck(pageUrl, win = window) {
  const u = new URL(pageUrl);
  u.searchParams.set('k', 'print');
  return win.open(u.href, '_blank', 'noopener');
}

/*
 * pageUrl: the deck's index.html (signed). origins: what the frame may post from. load: how a frame loads a URL
 * (the workbench serves frames its own way). sandbox: the frame's sandbox, null for none. closable: Esc and ✕
 * leave. printable: a PDF button that opens the print view. labels: the controls' tooltips. onMove(n) after
 * every slide change; onClose(n) when it closes.
 */
export function createPresenter({ win = window, doc = document, pageUrl, origins, load, sandbox = 'allow-scripts', closable = true, printable = false, labels = {}, onMove, onClose }) {
  const bridge = createBridge({ win });
  const state = { open: false, n: 1, build: 0, total: 0, slides: [], el: null, ifr: null, fullByKey: false };

  function tell(type, data) { if (state.ifr) { bridge.tell(state.ifr.contentWindow, type, data); } }
  function paint() {
    if (!state.el) { return; }
    state.el.querySelector('.k-pnum').textContent = state.total ? `${state.n} / ${state.total}` : '';
    state.el.querySelector('.k-ptitle').textContent = state.slides[state.n - 1]?.title || '';
  }
  function on(type, d) {
    if (type === 'deck') {
      state.slides = Array.isArray(d.slides) ? d.slides : [];
      state.total = state.slides.length;
    }
    if (type === 'deck' || type === 'at') {
      const moved = +d.n !== state.n;
      state.n = +d.n || 1;
      state.build = +d.build || 0;
      if (type === 'at' && +d.total) { state.total = +d.total; }
      paint();
      if (moved || type === 'deck') { onMove?.(state.n); }
    }
    if (type === 'deck-key') { act(d.code); }
  }

  function act(code) {
    const a = keyAction(code, { closable });
    if (!a) { return false; }
    if (a.nav) { tell('nav', { dir: a.nav }); }
    if (a.goto) { tell('goto', { n: a.goto[0] === 'end' ? state.total || 9999 : a.goto[0], build: a.goto[1] }); }
    if (a.black) { state.el.classList.toggle('black'); }
    if (a.full) { toggleFull(); }
    if (a.close) { close(); }
    return true;
  }
  function onKey(e) {
    if (!state.open || e.metaKey || e.ctrlKey || e.altKey) { return; }
    if (act(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }

  const isFull = () => !!doc.fullscreenElement;
  function toggleFull() {
    if (isFull()) { state.fullByKey = true; doc.exitFullscreen?.(); return; }
    state.el.requestFullscreen?.().catch(() => { /* not from a gesture: the window stays */ });
  }
  /* leaving fullscreen with the browser's own Esc ends the show, as in Keynote */
  function onFull() {
    if (!state.open) { return; }
    state.el.classList.toggle('full', isFull());
    if (!isFull() && !state.fullByKey && closable) { close(); }
    state.fullByKey = false;
  }

  let idle;
  function wake() {
    state.el?.classList.add('awake');
    clearTimeout(idle);
    idle = setTimeout(() => state.el?.classList.remove('awake'), 2200);
  }

  function open(n = 1, { full = true } = {}) {
    if (state.open) { tell('goto', { n, build: 0 }); return; }
    state.open = true;
    state.n = Math.max(1, +n || 1);
    const el = doc.createElement('div');
    el.className = 'k-present';
    el.tabIndex = -1;
    el.innerHTML = `<div class="k-pblack"></div><div class="k-pbar">
      <button data-p="prev" title="${labels.prev || ''}">${svg('prev')}</button><span class="k-pnum"></span><button data-p="next" title="${labels.next || ''}">${svg('next')}</button>
      <span class="k-ptitle"></span>
      ${printable ? `<button data-p="pdf" title="${labels.pdf || ''}">${svg('pdf')}</button>` : ''}<button data-p="full" title="${labels.full || ''}">${svg('full')}</button>${closable ? `<button data-p="close" title="${labels.close || ''}">${svg('close')}</button>` : ''}</div>`;
    const ifr = doc.createElement('iframe');
    if (sandbox !== null) { ifr.setAttribute('sandbox', sandbox); }
    ifr.setAttribute('referrerpolicy', 'no-referrer');
    ifr.setAttribute('allow', 'fullscreen');
    ifr.title = labels.title || 'deck';
    el.prepend(ifr);
    doc.body.appendChild(el);
    state.el = el;
    state.ifr = ifr;
    bridge.add(ifr.contentWindow, { origins, on });
    const url = presentUrl(pageUrl, state.n);
    if (load) { load(ifr, url); } else { ifr.src = url; }
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-p]');
      if (!b) { return; }
      if (b.dataset.p === 'prev') { tell('nav', { dir: -1 }); }
      if (b.dataset.p === 'next') { tell('nav', { dir: 1 }); }
      if (b.dataset.p === 'full') { toggleFull(); }
      if (b.dataset.p === 'pdf') { if (isFull()) { state.fullByKey = true; doc.exitFullscreen?.(); } printDeck(pageUrl, win); }
      if (b.dataset.p === 'close') { close(); }
      el.focus();
    });
    el.addEventListener('pointermove', wake);
    win.addEventListener('keydown', onKey, true);
    doc.addEventListener('fullscreenchange', onFull);
    el.focus();
    if (full) { el.requestFullscreen?.().catch(() => {}); }
    wake();
    paint();
  }

  function close() {
    if (!state.open) { return; }
    state.open = false;
    win.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('fullscreenchange', onFull);
    if (isFull()) { state.fullByKey = true; doc.exitFullscreen?.(); }
    bridge.clear();
    state.el?.remove();
    state.el = state.ifr = null;
    onClose?.(state.n);
  }

  return { open, close, act, state, goto: (n, build = 0) => tell('goto', { n, build }), nav: dir => tell('nav', { dir }) };
}
