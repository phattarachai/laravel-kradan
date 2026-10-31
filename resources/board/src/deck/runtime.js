/*
 * Kradan deck runtime. The server injects it (with deck.css) into every page whose <body> has data-k-deck;
 * `kradan:deck` copies it next to a deck for a local preview. Markup contract v0:
 *
 *   <body data-dp="Deck title" data-k-deck>
 *   <section data-dp-step data-title="…" data-k-transition="fade|slide|zoom|morph">   one slide, 1920×1080
 *     [data-k-build="n"]       revealed in steps     <aside data-k-notes>  speaker notes, never on the slide
 *     [data-k-id="x"]          morphs into the element with the same id on the next slide (View Transitions)
 *     [data-k-diagram]         a diagram: [data-k-node="id"] boxes laid out with CSS, and
 *       <span data-k-link="a b" data-k-style="dashed|dotted" data-k-dir="both|none" data-k-route="elbow">label</span>
 *                              drawn as an SVG connector, redrawn on resize and on every build
 *
 * Modes (core.js modeOf): review stacks every slide for the board to crop, all builds shown; present and
 * thumb show one slide scaled to the frame; solo is the page opened on its own, with its own keys.
 *
 * In present mode the parent page drives it over postMessage, `{kradan: 1, type, …}` like agent.js:
 *   parent → deck   goto {n, build}   nav {dir}   (a request with `id` gets `re: id` and {n, build})
 *   deck → parent   deck {slides: [{title, builds, notes}], n, build}   on load
 *                   at {n, build, builds, total}                        after every move
 *                   deck-key {code}                                     a key or click in the slide
 * Messages come only from window.parent at data-parent's origin, and go only there.
 */
import { W, H, fitScale, buildSteps, shownAt, step, clampAt, linkSpec, connector, morphName } from './core.js';

const SVG = 'http://www.w3.org/2000/svg';
const NAV_KEYS = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Space', 'PageUp', 'PageDown', 'Home', 'End', 'Enter', 'Backspace', 'KeyB', 'Period', 'KeyF', 'Escape'];

export function createDeck({ win, doc, mode, parentOrigin = null }) {
  const root = doc.documentElement;
  const slides = [...doc.querySelectorAll('[data-dp-step]')];
  const builds = slides.map(s => {
    const els = [...s.querySelectorAll('[data-k-build]')];
    const { per, steps } = buildSteps(els.map(el => el.getAttribute('data-k-build')));
    els.forEach((el, i) => { el.__kStep = per[i]; });
    return { els, steps };
  });
  const counts = builds.map(b => b.steps.length);
  const one = mode !== 'review';
  const at = { n: 1, build: 0 };
  const reduced = () => !!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  root.classList.add('k-deck', `k-${mode}`, ...(one ? ['k-one'] : []));

  /* ---------- builds and links ---------- */
  function paintBuilds(i, build) {
    const { els, steps } = builds[i];
    els.forEach(el => el.toggleAttribute('data-k-shown', !one || shownAt(el.__kStep, build, steps)));
  }
  /* hidden when the label, or either end, sits inside a build not shown yet */
  const hidden = el => !!el?.closest?.('[data-k-build]:not([data-k-shown])');

  function drawLinks(scope) {
    scope.querySelectorAll('[data-k-diagram]').forEach(box => {
      let svg = [...box.children].find(c => c.classList?.contains('k-links'));
      if (!svg) {
        svg = doc.createElementNS(SVG, 'svg');
        svg.setAttribute('class', 'k-links');
        svg.setAttribute('aria-hidden', 'true');
        svg.innerHTML = '<defs><marker id="k-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs><g class="k-paths"></g>';
        box.prepend(svg);
      }
      const b = box.getBoundingClientRect();
      const s = box.offsetWidth ? b.width / box.offsetWidth : 1;
      if (!b.width || !s) { return; }
      const rect = el => {
        const r = el.getBoundingClientRect();
        return { x: (r.left - b.left) / s - (box.clientLeft || 0), y: (r.top - b.top) / s - (box.clientTop || 0), w: r.width / s, h: r.height / s };
      };
      const paths = [];
      box.querySelectorAll('[data-k-link]').forEach(label => {
        const spec = linkSpec(label);
        const node = id => box.querySelector(`[data-k-node="${String(id || '').replace(/["\\]/g, '\\$&')}"]`);
        const a = node(spec.from), z = node(spec.to);
        const off = !a || !z || hidden(label) || hidden(a) || hidden(z);
        label.toggleAttribute('data-k-off', off);
        if (off) { return; }
        const c = connector(rect(a), rect(z), { route: spec.route });
        label.style.left = `${c.label.x}px`;
        label.style.top = `${c.label.y}px`;
        paths.push(`<path class="k-${spec.style}" d="${c.d}"${spec.end ? ' marker-end="url(#k-ah)"' : ''}${spec.start ? ' marker-start="url(#k-ah)"' : ''}/>`);
      });
      svg.querySelector('.k-paths').innerHTML = paths.join('');
    });
  }
  const redraw = () => (one ? slides[at.n - 1] && drawLinks(slides[at.n - 1]) : drawLinks(doc));

  /* ---------- one slide at a time ---------- */
  function fit() { root.style.setProperty('--k-scale', fitScale(win.innerWidth, win.innerHeight)); redraw(); }

  /* only the slide on show names its morphing elements: a name must be unique on the page */
  function name(i) {
    slides.forEach(s => s.querySelectorAll('[data-k-id]').forEach(el => { el.style.viewTransitionName = ''; }));
    const seen = new Set();
    slides[i]?.querySelectorAll('[data-k-id]').forEach(el => {
      const n = morphName(el.getAttribute('data-k-id'));
      if (!seen.has(n)) { seen.add(n); el.style.viewTransitionName = n; }
    });
  }
  /* the position moves now; the DOM follows, inside the view transition's callback when there is one */
  function show(n, build) {
    at.n = n;
    at.build = build;
    slides.forEach((s, i) => s.classList.toggle('k-on', i === n - 1));
    paintBuilds(n - 1, build);
    name(n - 1);
    redraw();
  }

  let current = null;
  function go(n, build, dir = 0) {
    const to = clampAt(n, build, counts);
    if (to.n === at.n) {
      at.build = to.build;
      paintBuilds(to.n - 1, to.build);
      redraw();
      moved();
      return to;
    }
    const back = dir < 0 || (!dir && to.n < at.n);
    /* a transition belongs to the slide coming in; going back, to the one leaving */
    const tr = (back ? slides[at.n - 1] : slides[to.n - 1])?.getAttribute('data-k-transition') || 'fade';
    if (mode !== 'thumb' && !reduced() && doc.startViewTransition) {
      root.setAttribute('data-k-tr', tr);
      root.toggleAttribute('data-k-back', back);
      at.n = to.n;
      at.build = to.build;
      const vt = doc.startViewTransition(() => show(to.n, to.build));
      current = vt;
      /* a move during a transition skips it; only the latest one clears the marks */
      const done = () => { if (current === vt) { root.removeAttribute('data-k-tr'); root.removeAttribute('data-k-back'); } };
      vt.finished.then(done, done);
    } else {
      show(to.n, to.build);
      if (mode !== 'thumb' && !reduced()) { const s = slides[to.n - 1]; s.classList.remove('k-in'); void s.offsetWidth; s.classList.add('k-in'); }
    }
    moved();
    return to;
  }
  const nav = dir => { const to = step(at, dir, counts); return go(to.n, to.build, dir); };

  /* ---------- the parent (present) or the page itself (solo) ---------- */
  const post = msg => { if (parentOrigin) { win.parent.postMessage({ kradan: 1, ...msg }, parentOrigin); } };
  function moved() {
    if (mode === 'present') { post({ type: 'at', n: at.n, build: at.build, builds: counts[at.n - 1] || 0, total: slides.length }); }
    if (mode === 'solo' && win.history?.replaceState) { win.history.replaceState(null, '', `#${at.n}`); }
  }
  const info = () => slides.map((s, i) => ({
    title: (s.getAttribute('data-title') || '').trim(),
    builds: counts[i],
    notes: [...s.querySelectorAll('[data-k-notes]')].map(n => n.textContent.trim()).filter(Boolean).join('\n\n'),
  }));

  function onMessage(e) {
    const d = e.data;
    if (e.source !== win.parent || e.origin !== parentOrigin || !d || d.kradan !== 1) { return false; }
    let out;
    if (d.type === 'goto') { out = go(d.n, d.build ?? 0); } else if (d.type === 'nav') { out = nav(+d.dir < 0 ? -1 : 1); } else { return false; }
    if (d.id !== undefined) { post({ type: d.type, re: d.id, ...out }); }
    return true;
  }

  const black = () => root.classList.toggle('k-black');
  function soloKey(code) {
    if (['ArrowRight', 'ArrowDown', 'Space', 'PageDown', 'Enter'].includes(code)) { nav(1); }
    if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(code)) { nav(-1); }
    if (code === 'Home') { go(1, 0); }
    if (code === 'End') { go(slides.length, -1); }
    if (code === 'KeyB' || code === 'Period') { black(); }
    if (code === 'KeyF') { doc.fullscreenElement ? doc.exitFullscreen?.() : root.requestFullscreen?.(); }
  }
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || !NAV_KEYS.includes(e.code) || e.target?.closest?.('input, textarea, [contenteditable="true"]')) { return; }
    e.preventDefault();
    if (mode === 'present') { post({ type: 'deck-key', code: e.code }); } else { soloKey(e.code); }
  }

  function listen() {
    if (mode === 'review') {
      if (win.ResizeObserver) { new win.ResizeObserver(() => redraw()).observe(doc.body); }
      doc.fonts?.ready?.then(redraw);
      return;
    }
    win.addEventListener('resize', fit);
    doc.fonts?.ready?.then(fit);
    if (mode === 'thumb') { return; }
    win.addEventListener('keydown', onKey);
    if (mode === 'present') {
      win.addEventListener('message', onMessage);
      win.addEventListener('click', e => { if (e.button === 0 && !e.target.closest?.('a, button, input')) { post({ type: 'deck-key', code: 'Click' }); } });
    } else {
      win.addEventListener('hashchange', () => { const n = +win.location.hash.slice(1); if (n && n !== at.n) { go(n, 0); } });
    }
  }

  function start(n = 1, build = 0) {
    slides.forEach((_, i) => paintBuilds(i, 0));
    if (!one) { slides.forEach(s => s.classList.add('k-on')); redraw(); return; }
    const to = clampAt(n, build, counts);
    show(to.n, to.build);
    fit();
    if (mode === 'present') { post({ type: 'deck', slides: info(), n: at.n, build: at.build }); }
    moved();
  }

  return { slides, counts, at, go, nav, start, listen, redraw, onMessage, info, W, H };
}

/* a real origin only: never "*" and never "null" (agent.js validParent) */
const validParent = o => typeof o === 'string' && /^https?:\/\/[^/\s]+$/.test(o);

/* the origin present mode answers: data-parent from the server, or this page's own origin when a local
   workbench frames it same-origin */
export function parentOf(script, win) {
  const named = script?.dataset?.parent;
  if (validParent(named)) { return named; }
  try { return win.parent !== win && win.parent.location.origin === win.location.origin && validParent(win.location.origin) ? win.location.origin : null; } catch { return null; }
}
