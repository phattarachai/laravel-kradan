import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBridge, allowedOrigins } from '../src/bridge.js';

const APP = 'https://app.example.com';
const fakeWin = () => ({ listeners: [], addEventListener(t, fn) { this.listeners.push(fn); } });
const frameWin = () => ({ sent: [], postMessage(m, o) { this.sent.push({ m, o }); } });

test('allowedOrigins: opaque always, plus a separate content origin (option C)', () => {
  assert.deepEqual([...allowedOrigins('/kradan/f/1/2/sig/', APP)], ['null']);
  assert.deepEqual([...allowedOrigins(`${APP}/kradan/f/1/2/sig/`, APP)], ['null']);
  assert.deepEqual([...allowedOrigins('https://design.example.com/kradan/f/1/2/sig/', APP)], ['null', 'https://design.example.com']);
});

test('only frames the board created, from an allowed origin', () => {
  const b = createBridge({ win: fakeWin() });
  const fw = frameWin(), stranger = frameWin();
  const got = [];
  b.add(fw, { origins: new Set(['null']), on: (type, d) => got.push(type) });
  assert.equal(b.onMessage({ source: fw, origin: 'null', data: { kradan: 1, type: 'ready' } }), true);
  assert.equal(b.onMessage({ source: stranger, origin: 'null', data: { kradan: 1, type: 'ready' } }), false, 'not ours');
  assert.equal(b.onMessage({ source: fw, origin: APP, data: { kradan: 1, type: 'ready' } }), false, 'app origin: not a sandboxed frame');
  assert.equal(b.onMessage({ source: fw, origin: 'https://evil.example', data: { kradan: 1, type: 'ready' } }), false);
  assert.equal(b.onMessage({ source: fw, origin: 'null', data: { type: 'ready' } }), false, 'no kradan flag');
  assert.equal(b.onMessage({ source: fw, origin: 'null', data: 'ready' }), false);
  assert.deepEqual(got, ['ready']);
});

test('ask posts a request and resolves with the matching reply only', async () => {
  const b = createBridge({ win: fakeWin() });
  const fw = frameWin(), other = frameWin();
  b.add(fw, { origins: new Set(['null']) });
  b.add(other, { origins: new Set(['null']) });
  const p = b.ask(fw, 'hit', { x: 10, y: 20 });
  const { m, o } = fw.sent[0];
  assert.equal(o, '*');
  assert.equal(m.type, 'hit');
  assert.equal(m.kradan, 1);
  /* another frame can't answer for this one */
  b.onMessage({ source: other, origin: 'null', data: { kradan: 1, type: 'hit', re: m.id, text: 'forged' } });
  b.onMessage({ source: fw, origin: 'null', data: { kradan: 1, type: 'hit', re: m.id, text: 'ยืนยัน' } });
  const r = await p;
  assert.equal(r.text, 'ยืนยัน');
});

test('ask resolves null when the frame never answers', async () => {
  const b = createBridge({ win: fakeWin(), timeout: 20 });
  const fw = frameWin();
  b.add(fw, { origins: new Set(['null']) });
  assert.equal(await b.ask(fw, 'measure'), null);
});

test('removing a frame drops its messages and settles its requests', async () => {
  const b = createBridge({ win: fakeWin() });
  const fw = frameWin();
  const got = [];
  b.add(fw, { origins: new Set(['null']), on: t => got.push(t) });
  const p = b.ask(fw, 'measure');
  b.remove(fw);
  assert.equal(await p, null);
  assert.equal(b.onMessage({ source: fw, origin: 'null', data: { kradan: 1, type: 'ready' } }), false);
  assert.deepEqual(got, []);
});
