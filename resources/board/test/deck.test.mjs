import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { fitScale, buildSteps, shownAt, step, clampAt, linkSpec, edgePoint, connector, morphName, modeOf } from '../src/deck/core.js';
import { createDeck } from '../src/deck/runtime.js';
import { keyAction, presentUrl } from '../src/present.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const APP = 'https://app.example.com';

/* ---------- core ---------- */
test('the slide fits the viewport whole, letterboxed', () => {
  assert.equal(fitScale(1920, 1080), 1);
  assert.equal(fitScale(960, 1080), 0.5);
  assert.equal(fitScale(3840, 1080), 1);
  assert.equal(fitScale(0, 0), 1);
});

test('builds number themselves in order, an explicit number sets the step and equal numbers show together', () => {
  assert.deepEqual(buildSteps([null, null, '']), { per: [1, 2, 3], steps: [1, 2, 3] });
  assert.deepEqual(buildSteps(['2', null, '2', '1']), { per: [2, 3, 2, 1], steps: [1, 2, 3] });
  const { steps } = buildSteps(['1', '3', '3']);
  assert.equal(shownAt(1, 0, steps), false);
  assert.equal(shownAt(1, 1, steps), true);
  assert.equal(shownAt(3, 1, steps), false);
  assert.equal(shownAt(3, 2, steps), true);
});

test('next reveals builds, then opens the next slide bare; back hides them, then opens the previous slide built', () => {
  const builds = [0, 2, 0];
  assert.deepEqual(step({ n: 1, build: 0 }, 1, builds), { n: 2, build: 0 });
  assert.deepEqual(step({ n: 2, build: 0 }, 1, builds), { n: 2, build: 1 });
  assert.deepEqual(step({ n: 2, build: 2 }, 1, builds), { n: 3, build: 0 });
  assert.deepEqual(step({ n: 3, build: 0 }, 1, builds), { n: 3, build: 0 });
  assert.deepEqual(step({ n: 3, build: 0 }, -1, builds), { n: 2, build: 2 });
  assert.deepEqual(step({ n: 2, build: 1 }, -1, builds), { n: 2, build: 0 });
  assert.deepEqual(step({ n: 1, build: 0 }, -1, builds), { n: 1, build: 0 });
});

test('a goto is clamped, and build -1 shows every build', () => {
  assert.deepEqual(clampAt(9, 0, [0, 2]), { n: 2, build: 0 });
  assert.deepEqual(clampAt(2, -1, [0, 2]), { n: 2, build: 2 });
  assert.deepEqual(clampAt('x', 5, [0, 2]), { n: 1, build: 0 });
});

test('a link reads its ends and options from the label', () => {
  const { document } = parseHTML('<span data-k-link=" api  db " data-k-style="dashed" data-k-dir="both" data-k-route="elbow">x</span><span data-k-link="a b" data-k-style="wavy" data-k-dir="none"></span>');
  const [a, b] = document.querySelectorAll('span');
  assert.deepEqual(linkSpec(a), { from: 'api', to: 'db', style: 'dashed', start: true, end: true, route: 'elbow' });
  assert.deepEqual(linkSpec(b), { from: 'a', to: 'b', style: 'solid', start: false, end: false, route: 'straight' });
});

test('a straight link runs between the borders of its boxes, the label in the middle', () => {
  const a = { x: 0, y: 0, w: 200, h: 100 }, b = { x: 400, y: 0, w: 200, h: 100 };
  assert.deepEqual(edgePoint(a, 500, 50), { x: 200, y: 50 });
  assert.deepEqual(connector(a, b, { gap: 0 }), { d: 'M200 50L400 50', label: { x: 300, y: 50 } });
  const below = connector(a, { x: 0, y: 300, w: 200, h: 100 }, { gap: 6 });
  assert.equal(below.d, 'M100 106L100 294');
});

test('an elbow link leaves from the facing sides and turns twice', () => {
  const a = { x: 0, y: 0, w: 200, h: 100 }, b = { x: 600, y: 300, w: 200, h: 100 };
  assert.deepEqual(connector(a, b, { route: 'elbow', gap: 0 }), { d: 'M200 50H400V350H600', label: { x: 400, y: 200 } });
  const down = connector(a, { x: 50, y: 600, w: 200, h: 100 }, { route: 'elbow', gap: 0 });
  assert.equal(down.d, 'M100 100V350H150V600');
});

test('a morph name is safe for view-transition-name, and the mode follows the frame and ?k=', () => {
  assert.equal(morphName('db main/1'), 'k-db_main_1');
  assert.equal(modeOf('', false), 'solo');
  assert.equal(modeOf('?k=present&n=3', true), 'present');
  assert.equal(modeOf('?k=thumb', true), 'thumb');
  assert.equal(modeOf('?k=evil', true), 'review');
});

/* ---------- the runtime on a page ---------- */
const PAGE = `<html><head></head><body data-k-deck>
  <section data-dp-step data-title="ปก"><h1 data-k-id="t">ปก</h1><aside data-k-notes>สวัสดี</aside></section>
  <section data-dp-step data-title="ภาพรวม" data-k-transition="slide">
    <h2 data-k-id="t">ภาพรวม</h2>
    <div data-k-diagram><div data-k-node="a">A</div><div data-k-node="b" data-k-build>B</div>
      <span data-k-link="a b">เรียก</span><span data-k-link="a z">ไม่มีปลาย</span></div>
  </section></body></html>`;

/* linkedom has no layout: boxes get rects by node id, and the diagram sits at the origin at scale 1 */
function page(mode) {
  const { window, document } = parseHTML(PAGE);
  const rects = { a: [0, 0, 200, 100], b: [400, 0, 200, 100] };
  for (const el of document.querySelectorAll('[data-k-diagram], [data-k-node]')) {
    const [x, y, w, h] = rects[el.getAttribute('data-k-node')] || [0, 0, 1000, 600];
    el.getBoundingClientRect = () => ({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h });
    Object.defineProperty(el, 'offsetWidth', { value: w });
  }
  const posted = [];
  const listeners = {};
  const win = {
    document, innerWidth: 960, innerHeight: 540, location: { hash: '' },
    parent: { postMessage: (msg, origin) => posted.push({ msg, origin }) },
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    matchMedia: () => ({ matches: false }),
  };
  const deck = createDeck({ win, doc: document, mode, parentOrigin: mode === 'present' ? APP : null });
  return { deck, document, win, posted, listeners };
}

test('review stacks every slide with every build shown, and draws the links', () => {
  const { deck, document } = page('review');
  deck.start();
  assert.ok(document.documentElement.classList.contains('k-review'));
  assert.ok(!document.documentElement.classList.contains('k-one'));
  assert.equal(document.querySelectorAll('[data-dp-step].k-on').length, 2);
  assert.ok(document.querySelector('[data-k-node="b"]').hasAttribute('data-k-shown'));
  const paths = [...document.querySelectorAll('.k-paths path')];
  assert.equal(paths.length, 1, 'a link to a missing node draws nothing');
  assert.equal(paths[0].getAttribute('d'), 'M206 50L394 50');
  const label = document.querySelector('[data-k-link="a b"]');
  assert.equal(label.style.left, '300px');
  assert.ok(document.querySelector('[data-k-link="a z"]').hasAttribute('data-k-off'));
});

test('present shows one slide, holds a link back until its end is built, and reports to the parent', () => {
  const { deck, document, posted } = page('present');
  deck.start(2, 0);
  assert.ok(document.documentElement.classList.contains('k-one'));
  assert.deepEqual([...document.querySelectorAll('[data-dp-step]')].map(s => s.classList.contains('k-on')), [false, true]);
  assert.equal(document.querySelectorAll('.k-paths path').length, 0);
  assert.ok(document.querySelector('[data-k-link="a b"]').hasAttribute('data-k-off'));
  const hello = posted.find(p => p.msg.type === 'deck');
  assert.equal(hello.origin, APP);
  assert.deepEqual(hello.msg.slides, [{ title: 'ปก', builds: 0, notes: 'สวัสดี' }, { title: 'ภาพรวม', builds: 1, notes: '' }]);

  deck.nav(1);
  assert.deepEqual(deck.at, { n: 2, build: 1 });
  assert.equal(document.querySelectorAll('.k-paths path').length, 1);
  assert.deepEqual(posted.at(-1).msg, { kradan: 1, type: 'at', n: 2, build: 1, builds: 1, total: 2 });
});

test('the slide on show names its morphing elements, and no other slide does', () => {
  const { deck, document } = page('present');
  deck.start(1);
  const [t1, t2] = document.querySelectorAll('[data-k-id="t"]');
  assert.equal(t1.style.viewTransitionName, 'k-t');
  assert.ok(!t2.style.viewTransitionName);
  deck.go(2, 0);
  assert.ok(!t1.style.viewTransitionName);
  assert.equal(t2.style.viewTransitionName, 'k-t');
});

test('present takes goto and nav only from the parent origin, and answers a request', () => {
  const { deck, win, posted } = page('present');
  deck.start(1);
  const from = (data, origin = APP, source = win.parent) => deck.onMessage({ data: { kradan: 1, ...data }, origin, source });
  assert.equal(from({ type: 'goto', n: 2, build: -1 }, 'https://evil.example'), false);
  assert.equal(from({ type: 'goto', n: 2, build: -1 }, APP, {}), false);
  assert.deepEqual(deck.at, { n: 1, build: 0 });
  assert.equal(from({ type: 'goto', n: 2, build: -1, id: 7 }), true);
  assert.deepEqual(deck.at, { n: 2, build: 1 });
  assert.deepEqual(posted.at(-1).msg, { kradan: 1, type: 'goto', re: 7, n: 2, build: 1 });
  from({ type: 'nav', dir: -1 });
  assert.deepEqual(deck.at, { n: 2, build: 0 });
});

/* ---------- the parent's keys ---------- */
test('present keys: next, back, ends, black, fullscreen, and Esc only where the show can close', () => {
  assert.deepEqual(keyAction('Space'), { nav: 1 });
  assert.deepEqual(keyAction('Click'), { nav: 1 });
  assert.deepEqual(keyAction('PageUp'), { nav: -1 });
  assert.deepEqual(keyAction('End'), { goto: ['end', -1] });
  assert.deepEqual(keyAction('KeyB'), { black: true });
  assert.deepEqual(keyAction('KeyF'), { full: true });
  assert.deepEqual(keyAction('Escape'), { close: true });
  assert.equal(keyAction('Escape', { closable: false }), null);
  assert.equal(keyAction('KeyQ'), null);
});

test('the present frame loads the signed page with ?k=present&n=', () => {
  assert.equal(presentUrl('https://c.example/kradan/f/1/2/ab/index.html', 3), 'https://c.example/kradan/f/1/2/ab/index.html?k=present&n=3');
  assert.equal(presentUrl('https://c.example/x/index.html?k=thumb&n=9', 0, 'thumb'), 'https://c.example/x/index.html?k=thumb&n=1');
});

/* ---------- build budget and the no-clip rule ---------- */
const gz = f => zlib.gzipSync(fs.readFileSync(path.join(ROOT, 'dist', f)), { level: 9 }).length;

test('the deck runtime stays under 15 KB gzipped, and the share page under 6 KB', () => {
  const deck = gz('deck.js') + gz('deck.css');
  const share = gz('present.js') + gz('present.css');
  assert.ok(deck < 15 * 1024, `deck.js + deck.css are ${deck} B gzipped`);
  assert.ok(share < 6 * 1024, `present.js + present.css are ${share} B gzipped`);
});

test('dist/deck.js is built from the current source', () => {
  const built = fs.readFileSync(path.join(ROOT, 'dist/deck.js'), 'utf8');
  assert.match(built, /data-k-deck/);
  assert.match(built, /deck-key/);
});

test('no deck text box clips: no hidden overflow, no ellipsis, Thai-safe line heights', () => {
  const css = fs.readFileSync(path.join(ROOT, 'resources/board/src/deck.css'), 'utf8');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }));
  const text = rules.filter(r => /\.k-(box|chip|zone|kicker|big|timeline|shot)|\[data-k-link\]|h1|h2|h3/.test(r.sel));
  for (const r of text) {
    assert.doesNotMatch(r.body, /overflow\s*:\s*(hidden|clip)|text-overflow/, r.sel);
    const lh = r.body.match(/line-height\s*:\s*([\d.]+)\s*;/);
    if (lh) { assert.ok(+lh[1] >= 1.15, `${r.sel} line-height ${lh[1]}`); }
  }
});

test('a deck\'s own CSS wins over deck.css, which loads after it: the defaults and the kit\'s look sit in :where()', () => {
  const css = fs.readFileSync(path.join(ROOT, 'resources/board/src/deck.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] })).filter(r => !r.sel.startsWith('@') && !/^(from|to)$/.test(r.sel));
  const tokens = rules.filter(r => /--k-(slide|link|stage)[\w-]*\s*:/.test(r.body));
  assert.deepEqual(tokens.map(r => r.sel), [':where(:root)']);
  /* a kit class may appear outside :where() only to set what the runtime needs: position, layers, visibility */
  const MECHANICS = /^(position|z-index|left|top|inset|transform|width|height|overflow|box-sizing|visibility|display|margin|pointer-events|opacity|transition|animation(-[\w-]+)?|content|background)$/;
  for (const r of rules.filter(x => /\.k-(box|chip|zone|kicker|muted|cover|cols|big|timeline|shot)\b|\[data-k-(link|diagram)\]/.test(x.sel) && !x.sel.startsWith(':where('))) {
    for (const decl of r.body.split(';').map(d => d.trim()).filter(Boolean)) {
      assert.match(decl.split(':')[0].trim(), MECHANICS, `${r.sel} sets ${decl} outside :where()`);
    }
  }
});

test('a link whose label sits inside a zone is placed against the zone, not the diagram', () => {
  const { document } = parseHTML(`<html><body data-k-deck><section data-dp-step data-title="x"><div data-k-diagram>
    <div class="k-zone" data-k-node="z"><div data-k-node="a">A</div><div data-k-node="b">B</div><span data-k-link="a b">x</span></div>
  </div></section></body></html>`);
  const rects = { z: [100, 50, 800, 400], a: [150, 100, 200, 100], b: [550, 100, 200, 100] };
  for (const el of document.querySelectorAll('[data-k-diagram], [data-k-node]')) {
    const [x, y, w, h] = rects[el.getAttribute('data-k-node')] || [0, 0, 1000, 600];
    el.getBoundingClientRect = () => ({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h });
    Object.defineProperty(el, 'offsetWidth', { value: w });
  }
  const label = document.querySelector('[data-k-link]');
  Object.defineProperty(label, 'offsetParent', { value: document.querySelector('.k-zone') });
  const win = { document, innerWidth: 1920, innerHeight: 1080, location: { hash: '' }, parent: {}, addEventListener() {}, matchMedia: () => ({ matches: false }) };
  createDeck({ win, doc: document, mode: 'review' }).start();
  assert.equal(document.querySelector('.k-paths path').getAttribute('d'), 'M356 150L544 150');
  /* the midpoint (450, 150) in diagram space is (350, 100) inside the zone */
  assert.equal(label.style.left, '350px');
  assert.equal(label.style.top, '100px');
});
