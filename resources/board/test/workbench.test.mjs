import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from 'linkedom';
import { LocalStore } from '../src/workbench/local-store.js';
import { upgrade } from '../src/workbench/state.js';
import { srcHash, stamp, behindLine } from '../stamp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESIGN = path.join(HERE, '../dev/design');
const ROOT = path.resolve(HERE, '../../..');
const BASE = 'http://localhost/design/';
const PAGE = `${BASE}2610-90-wb-demo/index.html`;
const KEY = 'wb:/design/2610-90-wb-demo/index.html:Workbench demo รอบ 2';

/* the fixture design folder over a fake fetch, and localStorage as a Map */
function env(seed = {}, more = {}) {
  const map = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  const storage = { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
  const fetch = async u => {
    const rel = decodeURIComponent(new URL(u).pathname.replace('/design/', ''));
    const file = path.join(DESIGN, rel);
    const ok = fs.existsSync(file) && fs.statSync(file).isFile();
    return { ok, status: ok ? 200 : 404, text: async () => (ok ? fs.readFileSync(file, 'utf8') : ''), json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
  };
  const store = LocalStore({ page: PAGE, storage, fetch, parse: html => new DOMParser().parseFromString(html, 'text/html'), agentUrl: `${BASE}_workbench/agent.js`, origin: 'http://localhost', now: () => Date.parse('2026-10-28T10:00:00Z'), ...more });
  return { store, read: k => JSON.parse(map.get(k) || 'null') };
}

test('the board payload has the shapes of 2-board-payload.md, read from the page and rounds.json', async () => {
  const { store } = env();
  const b = await store.board(store.slug);
  assert.equal(b.slug, '2610-90-wb-demo');
  assert.equal(b.title, 'Workbench demo รอบ 2');
  assert.deepEqual(b.rounds.map(r => [r.number, r.title, r.readonly, !!r.text_only]), [[1, 'Workbench demo รอบ 0', true, true], [2, 'Workbench demo รอบ 1', true, false], [3, 'Workbench demo รอบ 2', false, false]]);
  assert.equal(b.current, 3);
  const [one, two, three] = b.rounds[2].steps;
  assert.deepEqual([one.key, two.key, three.key], ['ตะกร้า|ปุ่มยืนยัน', 'ตะกร้า|ยอดรวม', 'หน้าจอ|หน้ายืนยัน']);
  assert.deepEqual(one.options.map(o => [o.key, o.title, o.trade]), [['A', 'ปุ่มเดียว', 'ง่าย แต่กดพลาดได้'], ['B', 'สองขั้น', 'ช้ากว่าหนึ่งคลิก']]);
  assert.equal(three.kind, 'screen');
  assert.equal(three.frames[0].src, 'screen.html#s=confirm');
  assert.deepEqual(Object.keys(b.rounds[2].prints), [one.key, two.key, three.key]);
  assert.equal(b.rounds[2].page_url, PAGE);
  assert.equal(b.rounds[1].page_url, `${BASE}2610-90-wb-demo/rounds/01/index.html`);
  assert.deepEqual([b.picks, b.comments, b.items, b.viewers, b.seen_prints], [[], [], [], [], null]);
  assert.equal(store.caps.multiUser, false);
});

test('the old workbench keys carry over: picks, ข้าม, notes, pins, boxes, edits and the last look', async () => {
  const { store } = env({
    [KEY]: {
      picks: { 1: ['B'] }, notes: { 1: 'สองขั้นดีกว่า' }, seen: { 2: true }, overall: '',
      pins: [{ type: 'box', step: 3, key: '', dev: 'phone', crop: false, src: `${BASE}2610-90-wb-demo/screen.html#s=confirm`, x: 10, y: 20, w: 90, h: 40, texts: ['11,651 / 10,000'], text: '11,651 / 10,000', id: 1761400000000, no: 1, note: 'เลขเล็กไป' }],
      edits: [{ step: 1, key: 'A', dev: 'desktop', crop: true, src: 'crop:0:A', id: 1761400001000, from: 'ส่งคำสั่งซื้อ', to: 'ยืนยัน' }],
    },
    'wb:look:/design/2610-90-wb-demo/index.html': { prints: { 'ตะกร้า|ปุ่มยืนยัน': 'old' }, modified: 1 },
  });
  const b = await store.board(store.slug);
  assert.deepEqual(b.picks.map(p => [p.step, p.options, p.seen]), [['ตะกร้า|ปุ่มยืนยัน', ['B'], false], ['ตะกร้า|ยอดรวม', [], true]]);
  const note = b.comments.find(c => !c.pin);
  assert.deepEqual([note.step, note.body, note.user.name], ['ตะกร้า|ปุ่มยืนยัน', 'สองขั้นดีกว่า', 'คุณ']);
  const box = b.comments.find(c => c.pin?.box);
  assert.deepEqual(box.pin, { option: null, device: 'phone', src: 'screen.html#s=confirm', x: 10, y: 20, text: '11,651 / 10,000', box: { w: 90, h: 40, texts: ['11,651 / 10,000'] } });
  const edit = b.comments.find(c => c.edit);
  assert.deepEqual([edit.pin.option, edit.pin.src, edit.edit.to], ['A', 'crop', 'ยืนยัน']);
  assert.deepEqual(b.seen_prints, { 'ตะกร้า|ปุ่มยืนยัน': 'old' });
});

test('writes land in the old shape, so review.json and the old workbench read them', async () => {
  const { store, read } = env();
  const b = await store.board(store.slug);
  const step = b.rounds[2].steps[0].key;
  assert.deepEqual((await store.pick(store.slug, 3, step, { options: ['A'], seen: false })).picks.map(p => p.options), [['A']]);
  await store.comment(store.slug, 3, { step, body: 'ข้อแรก' });
  await store.comment(store.slug, 3, { step, body: 'ข้อสอง' });
  const pin = await store.comment(store.slug, 3, { step, body: 'แดงกว่านี้', pin: { option: 'A', device: 'desktop', src: 'crop', x: 5, y: 6, text: 'ส่งคำสั่งซื้อ', box: null } });
  assert.equal(pin.pin.src, 'crop');
  const s = read(KEY);
  assert.deepEqual(s.picks, { 1: ['A'] });
  assert.equal(s.notes[1], 'ข้อแรก\n\nข้อสอง');
  assert.deepEqual([s.pins[0].src, s.pins[0].crop, s.pins[0].no, s.pins[0].note], ['crop:0:A', true, 1, 'แดงกว่านี้']);
  assert.deepEqual(read('wb:sum:/design/2610-90-wb-demo/index.html'), { title: 'Workbench demo รอบ 2', done: 1, total: 3, sentAt: '' });
  await store.pick(store.slug, 3, b.rounds[2].steps[1].key, { options: [], seen: true });
  assert.deepEqual(read(KEY).seen, { 2: true });
  await assert.rejects(store.pick(store.slug, 1, step, { options: ['A'] }), { status: 409 });
  const md = await store.exportMd();
  await store.setOverall('ภาพรวมดี');
  assert.equal(store.overall(), 'ภาพรวมดี');
  assert.equal(read(KEY).overall, 'ภาพรวมดี');
  assert.equal(await store.exportMd(), 'Workbench demo รอบ 2\n\nตะกร้า\n1. ปุ่มยืนยัน → A\n   ↳ ข้อแรก\n   ↳ ข้อสอง\n   📍1 A “ส่งคำสั่งซื้อ”: แดงกว่านี้\n2. ยอดรวม → ข้าม\n\nหน้าจอ\n3. หน้ายืนยัน\n\nOverall\n   ↳ ภาพรวมดี\n\nQ1:A  Q2:ข้าม\n');
  const review = await store.review(true, [3]);
  assert.deepEqual([review.slug, review.sent, review.missing, review.steps[0].picks, review.steps[0].note, review.overall], ['2610-90-wb-demo', true, [3], ['A'], 'ข้อแรก\n\nข้อสอง', 'ภาพรวมดี']);
  assert.match(review.text, /^Workbench demo รอบ 2\n/);
});

test('an older round reads its answers from the review.json filed with it', async () => {
  const { store } = env();
  const b = await store.board(store.slug, 2);
  assert.equal(b.current, 2);
  assert.deepEqual(b.rounds[1].steps.map(s => s.title), ['ปุ่มยืนยัน', 'ยอดรวมเดิม', 'หน้ายืนยัน']);
  assert.deepEqual(b.picks.map(p => [p.step, p.options, p.seen]), [['ตะกร้า|ปุ่มยืนยัน', ['B'], false], ['ตะกร้า|ยอดรวมเดิม', [], true], ['หน้าจอ|หน้ายืนยัน', [], true]]);
  assert.equal(b.comments[0].body, 'สองขั้นดีกว่า');
});

test('a v1 state upgrades once: each note becomes a comment, and a v2 state keeps its comments', () => {
  const v1 = upgrade({ picks: {}, notes: { 2: ' โน้ต ' }, pins: [], edits: [], seen: {} });
  assert.deepEqual(v1.comments.map(c => [c.step, c.body]), [[2, 'โน้ต']]);
  const v2 = upgrade({ v: 2, notes: { 2: 'joined' }, comments: [{ id: 9, step: 2, body: 'one' }] });
  assert.deepEqual(v2.comments.map(c => c.body), ['one']);
});

test('the bundle stamp: src_hash is stable, and the build says when a vendored copy is behind', () => {
  const s = stamp(ROOT);
  assert.match(s.src_hash, /^[0-9a-f]{64}$/);
  assert.equal(srcHash(ROOT), s.src_hash);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-'));
  assert.equal(behindLine(ROOT, dir), '');
  fs.writeFileSync(path.join(dir, 'workbench.json'), JSON.stringify({ ...s, src_hash: 'old', sha: 'abc1234' }));
  assert.match(behindLine(ROOT, dir), /^workbench core เก่ากว่า kradan \(abc1234 → .*\): npm run sync:workbench$/);
  fs.writeFileSync(path.join(dir, 'workbench.json'), JSON.stringify(s));
  assert.equal(behindLine(ROOT, dir), '');
  fs.rmSync(dir, { recursive: true });
});

test('src_hash is the skill recipe: sha256 over "<sha256>  <path>\\n" lines, paths sorted by bytes, dot names skipped', async () => {
  const crypto = await import('node:crypto');
  const sha = b => crypto.createHash('sha256').update(b).digest('hex');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wbh-'));
  const src = path.join(root, 'resources/board/src');
  const put = (rel, body) => { fs.mkdirSync(path.dirname(path.join(src, rel)), { recursive: true }); fs.writeFileSync(path.join(src, rel), body); };
  put('b.js', 'b'); put('a/Z.js', 'z'); put('a/a.js', 'a'); put('.DS_Store', 'x'); put('.cache/skip.js', 'x'); put('B.css', 'B');
  const manifest = ['B.css', 'a/Z.js', 'a/a.js', 'b.js'].map(rel => `${sha(fs.readFileSync(path.join(src, rel)))}  ${rel}\n`).join('');
  assert.equal(srcHash(root), sha(manifest));
  fs.rmSync(root, { recursive: true });
});

test('src_hash of the board source at 8c37484 is the value harness.sh got', async () => {
  const { execFileSync } = await import('node:child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb8-'));
  try { execFileSync('sh', ['-c', `git -C "${ROOT}" archive 8c37484 resources/board/src | tar -x -C "${root}"`], { stdio: 'ignore' }); } catch { fs.rmSync(root, { recursive: true }); return; }
  assert.equal(srcHash(root), '0b221b849784556c2dc1da7e55e5d15f0e05ab6eacb567582b2578d08ee9aaeb');
  fs.rmSync(root, { recursive: true });
});

test('a round kept only as text lists, opens as its review.md, and never becomes the shown round', async () => {
  const rounds = JSON.parse(fs.readFileSync(path.join(DESIGN, '2610-90-wb-demo/rounds/rounds.json'), 'utf8'));
  assert.ok(rounds.some(r => r.textOnly), 'the fixture has a textOnly round');
  const { store } = env();
  const b = await store.board(store.slug);
  const t0 = b.rounds.find(r => r.text_only);
  assert.deepEqual([t0.number, t0.steps], [1, []]);
  assert.match(await store.roundText(store.slug, t0.number), /ข้อเดียว/);
  assert.equal((await store.board(store.slug, t0.number)).current, b.latest);
});

test('the page list marks this page and the pages Claude waits on; the rest fold', async () => {
  const { store } = env();
  await store.board(store.slug);
  store.waiting.add('2610-91-wb-plain');
  const rows = (await store.boards()).boards;
  assert.deepEqual(rows.map(r => [r.slug, r.pinned]), [['2610-90-wb-demo', true], ['2610-91-wb-plain', true], ['2610-80-old', false]]);
  store.waiting.clear();
  assert.equal((await store.boards()).boards.find(r => r.slug === '2610-91-wb-plain').pinned, false);
});

test('another tab writing this page moves changed_at, so the next heartbeat refreshes this one', async () => {
  const events = new EventTarget();
  let t = Date.parse('2026-10-28T10:00:00Z');
  const { store } = env({}, { events, now: () => (t += 1000) });
  const first = (await store.heartbeat(store.slug, 3)).changed_at;
  const storage = (key) => Object.assign(new Event('storage'), { key });
  events.dispatchEvent(storage('wb:look:/design/other/index.html'));
  assert.equal((await store.heartbeat(store.slug, 3)).changed_at, first, 'another page is not ours');
  events.dispatchEvent(storage(KEY));
  assert.ok((await store.heartbeat(store.slug, 3)).changed_at > first, 'this page\'s answers were written elsewhere');
});
