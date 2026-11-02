import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAgent, validParent, boot, readSteps } from '../src/agent.js';

const APP = 'https://app.example.com';

/* just enough of a window for the message path: a parent that records posts, and a scroller */
function fakeWin() {
  const posted = [];
  const listeners = {};
  const parent = { postMessage: (msg, origin) => posted.push({ msg, origin }) };
  const scroller = { scrollTop: 0, scrollHeight: 3000, scrollWidth: 1440, scrollTo({ top }) { this.scrollTop = top; } };
  const doc = {
    scrollingElement: scroller, documentElement: scroller, body: { scrollHeight: 3000 },
    querySelectorAll: () => [],
  };
  const win = {
    parent, document: doc, innerHeight: 900, innerWidth: 1440, location: { hash: '', href: 'https://app.example.com/kradan/f/1/x/y/index.html' },
    requestAnimationFrame: fn => fn(),
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
  };
  return { win, doc, parent, posted, listeners, scroller };
}

const msg = (w, data, origin = APP, source = w.parent) => ({ source, origin, data });

test('validParent takes only a real http(s) origin', () => {
  assert.equal(validParent(APP), true);
  assert.equal(validParent('http://localhost:5178'), true);
  assert.equal(validParent('*'), false);
  assert.equal(validParent('null'), false);
  assert.equal(validParent('https://app.example.com/path'), false);
  assert.equal(validParent(undefined), false);
  assert.equal(validParent('javascript:alert(1)'), false);
});

test('accepts only window.parent at data-parent with a kradan message', () => {
  const w = fakeWin();
  const a = createAgent({ win: w.win, doc: w.doc, parentOrigin: APP });
  assert.equal(a.accepts(msg(w, { kradan: 1, type: 'measure' })), true);
  assert.equal(a.accepts(msg(w, { kradan: 1, type: 'measure' }, 'https://evil.example')), false, 'other origin');
  assert.equal(a.accepts(msg(w, { kradan: 1, type: 'measure' }, 'null')), false, 'opaque origin');
  assert.equal(a.accepts(msg(w, { kradan: 1, type: 'measure' }, APP, {})), false, 'not the parent window');
  assert.equal(a.accepts(msg(w, { type: 'measure' })), false, 'no kradan flag');
  assert.equal(a.accepts(msg(w, { kradan: 2, type: 'measure' })), false, 'wrong version');
  assert.equal(a.accepts(msg(w, 'measure')), false, 'not an object');
  assert.equal(a.accepts(msg(w, null)), false);
});

test('a request is answered to the parent origin with re = id', () => {
  const w = fakeWin();
  const a = createAgent({ win: w.win, doc: w.doc, parentOrigin: APP });
  assert.equal(a.onMessage(msg(w, { kradan: 1, type: 'measure', id: 7 })), true);
  assert.equal(w.posted.length, 1);
  const { msg: reply, origin } = w.posted[0];
  assert.equal(origin, APP, 'never "*"');
  assert.deepEqual(reply, { kradan: 1, type: 'measure', re: 7, width: 1440, height: 3000, vw: 1440, vh: 900, scrollY: 0 });
});

test('a rejected message is not answered and runs nothing', () => {
  const w = fakeWin();
  const a = createAgent({ win: w.win, doc: w.doc, parentOrigin: APP });
  assert.equal(a.onMessage(msg(w, { kradan: 1, type: 'scroll', y: 500, id: 1 }, 'https://evil.example')), false);
  assert.equal(w.scroller.scrollTop, 0);
  assert.equal(w.posted.length, 0);
});

test('unknown and inherited types are ignored', () => {
  const w = fakeWin();
  const a = createAgent({ win: w.win, doc: w.doc, parentOrigin: APP });
  assert.equal(a.onMessage(msg(w, { kradan: 1, type: 'eval', code: '1', id: 1 })), false);
  assert.equal(a.onMessage(msg(w, { kradan: 1, type: 'constructor', id: 2 })), false);
  assert.equal(a.onMessage(msg(w, { kradan: 1, type: '__proto__', id: 3 })), false);
  assert.equal(w.posted.length, 0);
});

test('scroll sets the page position by ratio or y', () => {
  const w = fakeWin();
  const a = createAgent({ win: w.win, doc: w.doc, parentOrigin: APP });
  a.onMessage(msg(w, { kradan: 1, type: 'scroll', ratio: 0.5, id: 1 }));
  assert.equal(w.scroller.scrollTop, (3000 - 900) / 2);
  a.onMessage(msg(w, { kradan: 1, type: 'scroll', y: 120, id: 2 }));
  assert.equal(w.scroller.scrollTop, 120);
});

test('a scroll the board asked for reports as mirrored however late it lands, a scroll by hand does not', () => {
  const w = fakeWin();
  w.win.getComputedStyle = () => ({});
  const a = createAgent({ win: w.win, doc: w.doc, parentOrigin: APP });
  a.listen();
  a.onMessage(msg(w, { kradan: 1, type: 'scroll', y: 500, id: 1 }));
  w.posted.length = 0;
  w.listeners.scroll.forEach(fn => fn());
  w.scroller.scrollTop = 900;
  w.listeners.scroll.forEach(fn => fn());
  w.scroller.scrollTop = 500;
  w.listeners.scroll.forEach(fn => fn());
  assert.deepEqual(w.posted.map(p => [p.msg.type, p.msg.y, p.msg.mirrored]), [['scrolled', 500, true], ['scrolled', 900, false], ['scrolled', 500, false]]);
});

test('hash follows a sibling frame and ignores non-strings', () => {
  const w = fakeWin();
  const a = createAgent({ win: w.win, doc: w.doc, parentOrigin: APP });
  a.onMessage(msg(w, { kradan: 1, type: 'hash', hash: '#s=plan' }));
  assert.equal(w.win.location.hash, '#s=plan');
  a.onMessage(msg(w, { kradan: 1, type: 'hash', hash: { toString: () => '#x' } }));
  assert.equal(w.win.location.hash, '#s=plan');
});

test('a handler that throws answers with an error instead of breaking the page', () => {
  const w = fakeWin();
  const a = createAgent({ win: w.win, doc: w.doc, parentOrigin: APP });
  a.onMessage(msg(w, { kradan: 1, type: 'hit', x: 1, y: 1, id: 9 }));
  assert.equal(w.posted[0].msg.re, 9);
  assert.match(w.posted[0].msg.error, /elementFromPoint/);
});

test('events go to the parent origin without re', () => {
  const w = fakeWin();
  const a = createAgent({ win: w.win, doc: w.doc, parentOrigin: APP });
  a.ready();
  assert.equal(w.posted[0].origin, APP);
  assert.equal(w.posted[0].msg.type, 'ready');
  assert.equal(w.posted[0].msg.re, undefined);
  assert.deepEqual(w.posted[0].msg.steps, []);
});

test('boot does nothing outside a frame or without a valid data-parent', () => {
  const w = fakeWin();
  const top = { ...w.win };
  top.parent = top;
  assert.equal(boot(top, { dataset: { parent: APP } }), null, 'not framed');
  assert.equal(boot(w.win, { dataset: { parent: '*' } }), null, 'wildcard');
  assert.equal(boot(w.win, { dataset: {} }), null, 'missing');
  assert.equal(boot(w.win, null), null, 'no script');
});

test('boot listens and announces ready inside a frame', () => {
  const w = fakeWin();
  w.doc.readyState = 'complete';
  const a = boot(w.win, { dataset: { parent: APP } });
  assert.ok(a);
  assert.ok(w.listeners.message?.length === 1);
  assert.equal(w.posted.at(-1).msg.type, 'ready');
});

test('a page that grows after load reports its new height once', () => {
  const w = fakeWin();
  const observers = [];
  w.win.ResizeObserver = class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() {} };
  w.win.getComputedStyle = () => ({});
  const a = createAgent({ win: w.win, doc: w.doc, parentOrigin: APP });
  a.listen();
  w.scroller.scrollHeight = 3000;
  observers[0].fn();
  assert.equal(w.posted.length, 0, 'same height: nothing sent');
  w.scroller.scrollHeight = 4200;
  w.doc.body.scrollHeight = 4200;
  observers[0].fn();
  assert.deepEqual(w.posted.map(p => [p.origin, p.msg.type, p.msg.height]), [[APP, 'resized', 4200]]);
});

test('a question whose options are words only reads as a form, with each option\'s words', async () => {
  const { parseHTML } = await import('linkedom');
  const { document } = parseHTML(`<body>
    <section data-dp-step data-title="Words">
      <div data-dp-option data-key="1" data-label="Move"><div style="padding:16px" class="faint">The menu gets   shorter</div></div>
      <div data-dp-option data-key="2" data-label="Stay"></div>
    </section>
    <section data-dp-step data-title="Screens">
      <div data-dp-option data-key="A" data-label="Mock"><div data-v="A"></div></div>
      <div data-dp-option data-key="B" data-label="Badge"><span style="background:#e00;color:#fff">ด่วน</span></div>
    </section>
    <section data-dp-step data-title="Control"><div data-dp-option data-key="A" data-label="Button"><button>Save</button></div></section>
    <section data-dp-step data-title="Forced" data-dp-form><div data-dp-option data-key="A"><img src="a.png" alt=""></div></section>
    <section data-dp-step data-title="Kept" data-dp-form="off"><div data-dp-option data-key="A">Words</div></section>
    <section data-dp-step data-title="Screen"><p>Just a screen</p></section>
  </body>`);
  const steps = readSteps(document);
  assert.deepEqual(steps.map(s => [s.title, s.form]), [['Words', true], ['Screens', false], ['Control', false], ['Forced', true], ['Kept', false], ['Screen', false]]);
  assert.deepEqual(steps[0].options.map(o => o.text), ['The menu gets shorter', '']);
  assert.equal('text' in steps[1].options[0], false);
});

test('a pale sheet around sentences is still words, a coloured chip is a design', async () => {
  const { parseHTML } = await import('linkedom');
  const { document, window } = parseHTML(`<body>
    <section data-dp-step data-title="Sheet">
      <div data-dp-option data-key="1"><div class="sheet"><div>The picker lists web products only</div><div class="muted">Old codes stay</div></div></div>
    </section>
    <section data-dp-step data-title="Chip"><div data-dp-option data-key="A"><span class="chip">Urgent</span></div></section>
  </body>`);
  const none = { backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none', boxShadow: 'none' };
  ['Top', 'Right', 'Bottom', 'Left'].forEach(side => Object.assign(none, { [`border${side}Width`]: '0px', [`border${side}Style`]: 'none', [`border${side}Color`]: 'rgb(0, 0, 0)' }));
  const boxed = (bg, border) => ({ ...none, backgroundColor: bg, ...Object.fromEntries(['Top', 'Right', 'Bottom', 'Left'].flatMap(side => [[`border${side}Width`, '1px'], [`border${side}Style`, 'solid'], [`border${side}Color`, border]])) });
  window.getComputedStyle = el => el.classList.contains('sheet') ? boxed('rgb(255, 255, 255)', 'rgb(226, 228, 232)')
    : el.classList.contains('chip') ? boxed('rgb(220, 38, 38)', 'rgb(220, 38, 38)') : none;
  document.defaultView.getComputedStyle = window.getComputedStyle;
  const steps = readSteps(document);
  assert.deepEqual(steps.map(s => s.form), [true, false]);
  assert.equal(steps[0].options[0].text, 'The picker lists web products only\nOld codes stay');
});
