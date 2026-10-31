/*
 * Kradan dev harness: the board without the Laravel backend.
 *
 *   npm run build && npm run dev        → http://localhost:5178/kradan
 *   KRADAN_DEV_CONTENT=c npm run dev    → round files from http://127.0.0.1:5179 (option C)
 *
 * It renders the real Blade shells (resources/views/*.blade.php, a few Blade expressions only) with a mock
 * boot payload in the contract's shape (2-board-payload.md), answers the board JSON API from memory, and serves round files the way the package does:
 * a path-signed prefix, `Content-Security-Policy: sandbox allow-scripts`, the harness block stripped and
 * agent.js injected. So the isolation the board relies on is the browser's, not a mock.
 *
 * Sign in as someone else with ?as=2 (users below). The session is a cookie (HttpOnly, SameSite=Lax), and
 * writes need the boot payload's CSRF token, like Laravel's web middleware.
 *
 * /design/_workbench/index.html is the design workbench (dist/workbench.js on a LocalStore) over the fixture folder
 * resources/board/dev/design, as the design skill links it into a project's public/design. pages.php is mocked
 * here (archive, restore, delete and upload change memory only).
 *
 * /dev/secret answers only with the session cookie, and /dev/log lists every call it got, with the origin
 * and whether the cookie came along: open a frame's console and fetch it to prove a frame can't.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = +process.env.PORT || 5178;
const CONTENT_PORT = PORT + 1;
const APP = `http://localhost:${PORT}`;
const OPTION_C = process.env.KRADAN_DEV_CONTENT === 'c';
const CONTENT = OPTION_C ? `http://127.0.0.1:${CONTENT_PORT}` : APP;
const SECRET = crypto.randomBytes(16).toString('hex');
const CSRF = crypto.randomBytes(12).toString('hex');
const TTL = 240 * 60;

/* ---------- people ---------- */
const USERS = {
  1: { id: 1, name: 'พัทธ์', avatar: null, manage: true },
  2: { id: 2, name: 'สมชาย ใจดี', avatar: null, manage: false },
  3: { id: 3, name: 'วิภา', avatar: null, manage: false },
  4: { id: 4, name: 'นิดา', avatar: null, manage: true },
  5: { id: 5, name: 'ต้น', avatar: null, manage: false },
};
const userOf = id => { const u = USERS[id]; return u && { id: u.id, name: u.name, avatar: u.avatar }; };
const minsAgo = m => new Date(Date.now() - m * 60000).toISOString();

/* ---------- rounds from fixtures ---------- */
const FIX = path.join(HERE, 'fixtures');
const exists = p => fs.existsSync(p);
const stripHarness = html => html.replace(/<!-- (dp:harness|kradan:deck):start -->[\s\S]*?<!-- \1:end -->/g, '');
const isDeck = html => /<body\b[^>]*\sdata-k-deck\b/i.test(html);
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"') : ''; };
const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

/* the same shape StepParser gives, read with regexes: good enough for fixtures */
function parse(html) {
  html = stripHarness(html);
  const title = attr(html.match(/<body[^>]*>/i)?.[0] || '', 'data-dp') || html.match(/<title>([^<]*)/i)?.[1] || '';
  const steps = [], prints = {};
  const tokens = [...html.matchAll(/<[a-z]+\b[^>]*\sdata-dp-(group|step|option)\b[^>]*>/gi)];
  let group = '';
  const taken = new Set();
  tokens.forEach((t, i) => {
    const kind = t[1].toLowerCase(), tag = t[0];
    if (kind === 'group') { group = attr(tag, 'data-title'); return; }
    if (kind === 'step') {
      const g = attr(tag, 'data-group') || group, title = attr(tag, 'data-title');
      let key = `${g}|${title}`;
      for (let n = 2; taken.has(key); n++) { key = `${g}|${title}|${n}`; }
      taken.add(key);
      const next = tokens.slice(i + 1).find(x => x[1].toLowerCase() === 'step');
      prints[key] = sha(html.slice(t.index, next ? next.index : undefined));
      steps.push({ key, group: g, title, sub: attr(tag, 'data-sub'), kind: 'screen', options: [] });
      return;
    }
    const st = steps.at(-1);
    if (st) { st.kind = 'question'; st.options.push({ key: attr(tag, 'data-key'), title: attr(tag, 'data-label') }); }
  });
  /* a page without data-dp-step is one screen step, as the backend's StepParser gives it */
  if (!steps.length) {
    const key = `|${title}`;
    steps.push({ key, group: '', title, sub: '', kind: 'screen', options: [] });
    prints[key] = sha(html);
  }
  return { title, steps, prints, kind: isDeck(html) ? 'deck' : 'decision' };
}

let roundSeq = 0;
const ROUNDS = {};   // id → { dir }
function round(dir, number, pushedMinsAgo, retitle) {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const p = parse(html);
  const id = ++roundSeq;
  ROUNDS[id] = { dir };
  return { id, number, title: retitle || p.title, pushed_at: minsAgo(pushedMinsAgo), steps: p.steps, prints: p.prints, kind: p.kind };
}
function baseUrl(r) {
  const expires = Math.floor(Date.now() / 1000) + TTL;
  return `${CONTENT}/kradan/f/${r.id}/${expires}/${sign(r.id, expires)}/`;
}
const sign = (id, expires) => crypto.createHmac('sha256', SECRET).update(`${id}|${expires}`).digest('hex').slice(0, 32);

const LOCAL = path.join(FIX, 'local');
const BOARDS = [];
/* every board is a decision board (owner, 2026-10-28: flows moved to laravel-ai-docs) */
function board(slug, title, taskRef, rounds, extra = {}) {
  if (!rounds.length) { return; }
  BOARDS.push({ id: BOARDS.length + 1, slug, title, task_ref: taskRef, kind: rounds.at(-1).kind, status: 'open', decided_at: null, decided_by: null,
    rounds, picks: {}, comments: [], items: [], viewers: {}, changedAt: new Date().toISOString(), ...extra });
}
const demo = path.join(FIX, 'demo-frames');
board('demo-cart', 'Demo ตะกร้า', 'T000', [round(demo, 1, 60 * 30)]);
if (exists(path.join(LOCAL, 'launchpad-search/2'))) {
  board('t190-launchpad-search', 'V2 Launchpad search', 'T190', [
    round(path.join(LOCAL, 'launchpad-search/1'), 1, 60 * 26),
    round(path.join(LOCAL, 'launchpad-search/2'), 2, 40, 'V2 Launchpad search รอบ 2'),
  ]);
}
if (exists(path.join(LOCAL, 'ws1-roundup/1'))) {
  board('t179-roundup', 'T179 ข้อ 17 การปัดเศษ', 'T179', [round(path.join(LOCAL, 'ws1-roundup/1'), 1, 60 * 30)]);
}
if (exists(path.join(LOCAL, 'leave-cover/1'))) {
  /* a page without data-dp-step: one screen step, shown whole */
  board('t185-leave-cover', 'การรับแทนทำงานอย่างไร', 'T185', [round(path.join(LOCAL, 'leave-cover/1'), 1, 60 * 50)]);
}
board('demo-decided', 'Demo ปุ่มยืนยัน', 'T001', [round(demo, 1, 60 * 24 * 9)],
  { status: 'decided', decided_at: minsAgo(60 * 24 * 7), decided_by: userOf(1) });
/* a deck: slides with a diagram, builds and a morph; /kradan/p/demo-deck is its public link */
board('demo-deck', 'Demo deck: ย้ายระบบ v1 ไป v2', null, [round(path.join(FIX, 'demo-deck'), 1, 20)]);
board('isolation-probe', 'Isolation probe', 'T192', [round(path.join(FIX, 'security'), 1, 5)]);

/* seed answers from other people on the newest round of the first boards */
let commentSeq = 0;
function seed(b) {
  const r = b.rounds.at(-1), st = r.steps;
  if (!st.length) { return; }
  const q = st.find(s => s.kind === 'question');
  if (q) {
    pick(b, r, q.key, 2, [q.options[0].key], false, 50);
    pick(b, r, q.key, 3, [q.options[0].key, q.options.at(-1).key], false, 30);
    pick(b, r, q.key, 5, [], true, 20);
  }
  const c = comment(b, r, { step: st[0].key, body: 'ถ้าเลือกแบบนี้ ต้องมีทางให้ sales แก้เอง', user: 4, mins: 45 });
  comment(b, r, { step: st[0].key, body: 'เห็นด้วย', parent_id: c.id, user: 2, mins: 20 });
  const note = item(b, r, { step: st[0].key, kind: 'note', anchor: { option: q?.options[0]?.key ?? null, device: 'desktop', src: 'crop', on: false }, x: -220, y: 40, w: 180, h: 120, color: 'yellow', text: 'sales ต้องแก้เลข SO เองได้ ไม่ต้องโทรหาไอที' }, 3, 25);
  comment(b, r, { step: st[0].key, body: 'เห็นด้วย ให้ RM แก้แทนได้', item_id: note.id, user: 2, mins: 15 });
  b.viewers[2] = { last_seen_at: minsAgo(1), seen_prints: { ...r.prints } };
  b.viewers[3] = { last_seen_at: minsAgo(9), seen_prints: { ...r.prints } };
  b.viewers[4] = { last_seen_at: minsAgo(60 * 26), seen_prints: {} };
  /* the signed-in owner saw round 1 of launchpad: round 2 reads มีอัปเดต on the steps that changed */
  if (b.rounds.length > 1) { b.viewers[1] = { last_seen_at: minsAgo(60 * 24), seen_prints: { ...b.rounds[0].prints } }; }
}
function pick(b, r, step, uid, options, seen, mins = 0) {
  (b.picks[r.number] ||= {});
  const k = `${step}\u0000${uid}`;
  if (!options.length && !seen) { delete b.picks[r.number][k]; return; }
  b.picks[r.number][k] = { step, user: userOf(uid), options, seen, updated_at: minsAgo(mins) };
}
function comment(b, r, { step, body, parent_id = null, item_id = null, pin = null, edit = null, user, mins = 0 }) {
  const c = { id: ++commentSeq, round: r.number, step, parent_id, item_id, user: userOf(user), body: body || '', pin, edit, created_at: minsAgo(mins), updated_at: minsAgo(mins), deleted: false };
  b.comments.push(c);
  touch(b);
  return c;
}
/* the heartbeat's changed_at: the latest write to picks, comments or items */
function touch(b) { b.changedAt = new Date().toISOString(); }

/* ---------- items (item 11, 2-board-payload.md "Items") ---------- */
let itemSeq = 0;
const FILES = {};   // id → { name, type, buf }
const UPLOADS = { max_kb: 20480, types: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'zip'] };
const KINDS = ['note', 'text', 'image', 'file', 'stroke', 'arrow', 'rect', 'ellipse'];
function item(b, r, fields, user, mins = 0) {
  const it = { id: ++itemSeq, round: r.number, step: fields.step, kind: fields.kind, user: userOf(user),
    anchor: fields.anchor || { option: null, device: 'desktop', src: 'crop', on: false },
    x: +fields.x || 0, y: +fields.y || 0, w: +fields.w || 0, h: +fields.h || 0, color: fields.color || null,
    text: fields.text ?? null, points: fields.points || null, texts: fields.texts || null, file: fields.file || null,
    created_at: minsAgo(mins), updated_at: minsAgo(mins), deleted: false };
  b.items.push(it);
  touch(b);
  return it;
}
const fileUrl = (id, disposition) => { const exp = Math.floor(Date.now() / 1000) + TTL; return `${APP}/kradan/files/${id}/${exp}/${sign(`file${id}`, exp)}${disposition ? '?download=1' : ''}`; };
function itemOut(it, b, me) {
  const { deleted, file, ...rest } = it;
  const out = { ...rest, mine: it.user.id === me, reply_count: b.comments.filter(c => c.item_id === it.id && !c.deleted).length };
  if (file) { out.file = { name: file.name, type: file.type, size: file.size, url: fileUrl(file.id, !file.type.startsWith('image/')), thumb: file.type.startsWith('image/') ? fileUrl(file.id) : null }; }
  return out;
}
/* just enough multipart: text fields (with a[b] brackets) and one file */
function multipart(buf, type) {
  const boundary = '--' + (type.match(/boundary=(?:"([^"]+)"|([^;]+))/) || [])[1 + (type.includes('boundary="') ? 0 : 1)];
  const out = { fields: {}, file: null };
  let at = buf.indexOf(boundary);
  while (at !== -1) {
    const next = buf.indexOf(boundary, at + boundary.length);
    if (next === -1) { break; }
    const part = buf.subarray(at + boundary.length + 2, next - 2);
    const split = part.indexOf('\r\n\r\n');
    const head = part.subarray(0, split).toString('utf8'), body = part.subarray(split + 4);
    const name = head.match(/name="([^"]*)"/)?.[1], filename = head.match(/filename="([^"]*)"/)?.[1];
    if (filename !== undefined) {
      out.file = { name: filename, type: head.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] || 'application/octet-stream', buf: Buffer.from(body) };
    } else if (name) {
      const keys = name.replace(/\]/g, '').split('[');
      let o = out.fields;
      keys.slice(0, -1).forEach(k => { o = (o[k] ||= {}); });
      o[keys.at(-1)] = body.toString('utf8');
    }
    at = next;
  }
  return out;
}
const readRaw = req => new Promise(done => { const parts = []; req.on('data', c => parts.push(c)); req.on('end', () => done(Buffer.concat(parts))); });
BOARDS.filter(b => b.status === 'open').slice(0, 3).forEach(seed);

/* ---------- payloads (the shapes in board-payload.md) ---------- */
const viewersOf = b => Object.entries(b.viewers)
  .map(([uid, v]) => ({ user: userOf(uid), last_seen_at: v.last_seen_at, active: Date.now() - Date.parse(v.last_seen_at) < 120000, recent: Date.now() - Date.parse(v.last_seen_at) < 900000 }))
  .sort((a, c) => c.last_seen_at.localeCompare(a.last_seen_at));
const boardUrl = b => `/kradan/${b.slug}`;
const answeredIn = (b, r) => new Set([...Object.values(b.picks[r.number] || {}).map(p => p.user.id), ...b.comments.filter(c => c.round === r.number && !c.deleted).map(c => c.user.id)]);
function commentOut(c, me) {
  const { round, deleted, ...rest } = c;
  return { ...rest, mine: c.user.id === me };
}
/* the title with the task in front, unless the title already starts with it (the backend's label) */
const labelOf = b => (b.task_ref && !b.title.startsWith(b.task_ref) ? `${b.task_ref} ${b.title}` : b.title);
function boardPayload(b, me, number) {
  const latest = b.rounds.at(-1).number;
  const cur = b.rounds.find(r => r.number === +number) || b.rounds.at(-1);
  const live = b.comments.filter(c => c.round === cur.number && !c.deleted);
  const picks = Object.values(b.picks[cur.number] || {});
  const comments = live.filter(c => !c.parent_id).map(c => ({ ...commentOut(c, me), replies: live.filter(x => x.parent_id === c.id).map(x => commentOut(x, me)) }));
  const items = b.items.filter(it => !it.deleted).map(it => itemOut(it, b, me));
  const people = new Map([...picks.map(p => [p.user.id, p.user]), ...live.map(c => [c.user.id, c.user])]);
  return {
    slug: b.slug, title: b.title, label: labelOf(b), kind: b.kind, status: b.status, task_ref: b.task_ref,
    decided_at: b.decided_at, decided_by: b.decided_by, updated_at: b.rounds.at(-1).pushed_at, url: boardUrl(b),
    rounds: b.rounds.map(r => ({ number: r.number, title: r.title, pushed_at: r.pushed_at, steps: r.steps, prints: r.prints, base_url: baseUrl(r), readonly: r.number !== latest })),
    current: cur.number, latest, picks_locked: b.status !== 'open' || cur.number !== latest,
    picks, comments, items, uploads: UPLOADS, changed_at: b.changedAt,
    progress: [...people.values()].map(u => ({ user: u, answered: cur.steps.filter(s => picks.some(p => p.user.id === u.id && p.step === s.key) || live.some(c => c.user.id === u.id && c.step === s.key)).length, total: cur.steps.length })),
    viewers: viewersOf(b),
    seen_prints: b.viewers[me]?.seen_prints || null,
  };
}
/* index rows: the backend's shape plus answered, viewers and updated (asked for, 2026-10-27) */
function indexRows(me) {
  return BOARDS.map(b => {
    const r = b.rounds.at(-1), seen = b.viewers[me]?.seen_prints;
    return {
      slug: b.slug, title: b.title, label: labelOf(b), kind: b.kind, status: b.status, task_ref: b.task_ref,
      decided_at: b.decided_at, decided_by: b.decided_by, updated_at: r.pushed_at, url: boardUrl(b),
      round: { number: r.number, title: r.title, pushed_at: r.pushed_at }, steps: r.steps.map(s => s.title),
      answered: answeredIn(b, r).size, viewers: viewersOf(b).filter(v => v.recent),
      updated: !!seen && r.steps.some(s => seen[s.key] !== r.prints[s.key]),
    };
  });
}
function boot(me, page, extra) {
  const u = USERS[me];
  return {
    version: mtime('board.js'), page, locale: process.env.KRADAN_LOCALE || 'th',
    brand: { name: 'RR Admin', logo: null, accent: '#ba1a1a' },
    user: { id: u.id, name: u.name, avatar: u.avatar, can: { manage: u.manage, edit: u.manage } },
    csrf: CSRF, routes: { api: '/kradan/api', index: '/kradan' },
    presence: { mode: 'polling', heartbeat: 30, reverb: null, channel: null, authEndpoint: '/broadcasting/auth' },
    ...extra,
  };
}

/* ---------- a few Blade expressions, enough for our own shells ---------- */
function blade(name, data) {
  const src = fs.readFileSync(path.join(ROOT, 'resources/views', `${name}.blade.php`), 'utf8');
  const get = expr => expr.split('??').map(s => s.trim()).reduce((found, e) => {
    if (found !== undefined && found !== null) { return found; }
    const m = e.match(/^\$(\w+)((?:\['[^']*'\])*)$/);
    if (!m) { return e.replace(/^'|'$/g, ''); }
    return [...m[2].matchAll(/\['([^']*)'\]/g)].reduce((v, k) => v?.[k[1]], data[m[1]]);
  }, undefined);
  const html = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  const json = v => JSON.stringify(v).replace(/</g, '\\u003C').replace(/>/g, '\\u003E').replace(/&/g, '\\u0026').replace(/'/g, '\\u0027');
  return src.replace(/\{\{--[\s\S]*?--\}\}/g, '')
    .replace(/@json\((\$[^)]*)\)/g, (_, e) => json(get(e)))
    .replace(/\{\{\s*([\s\S]*?)\s*\}\}/g, (_, e) => html(get(e)));
}

/* ---------- http ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map(c => c.split('=').map(decodeURIComponent)));
const send = (res, status, body, headers = {}) => { res.writeHead(status, { 'Cache-Control': 'no-store', ...headers }); res.end(body); };
const sendJson = (res, status, data) => send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json' });
const readBody = req => new Promise(done => { let s = ''; req.on('data', c => { s += c; }); req.on('end', () => { try { done(s ? JSON.parse(s) : {}); } catch { done(null); } }); });
const SECRET_LOG = [];
const mtime = f => { try { return Math.floor(fs.statSync(path.join(ROOT, 'dist', f)).mtimeMs).toString(36); } catch { return '0'; } };

function serveContent(req, res, url) {
  const m = url.pathname.match(/^\/kradan\/f\/(\d+)\/(\d+)\/([a-f0-9]+)\/(.*)$/);
  if (!m) { return false; }
  const [, id, expires, sig, rel] = m;
  const r = ROUNDS[id];
  const ok = r && sig === sign(+id, +expires) && +expires > Date.now() / 1000;
  const ours = { '__kradan/agent.js': path.join(ROOT, 'dist/agent.js'), '__kradan/deck.js': path.join(ROOT, 'dist/deck.js'), '__kradan/deck.css': path.join(ROOT, 'dist/deck.css') };
  const agent = !!ours[rel];
  const file = ours[rel] || path.resolve(r?.dir || '/', decodeURIComponent(rel || 'index.html'));
  if (!ok || (!agent && !file.startsWith(r.dir + path.sep)) || !exists(file) || fs.statSync(file).isDirectory()) { send(res, ok ? 404 : 403, ok ? 'not found' : 'bad signature'); return true; }
  const ext = path.extname(file);
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Content-Security-Policy': 'sandbox allow-scripts', 'X-Content-Type-Options': 'nosniff' };
  if (ext === '.html') {
    const prefix = `${CONTENT}/kradan/f/${id}/${expires}/${sig}/__kradan`;
    let html = stripHarness(fs.readFileSync(file, 'utf8'));
    /* a deck also gets the deck runtime, as ContentController does */
    const deck = isDeck(html);
    const tag = `${deck ? `<script src="${prefix}/deck.js" data-parent="${APP}"></script>` : ''}<script src="${prefix}/agent.js" data-parent="${APP}"></script>`;
    if (deck) { html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `<link rel="stylesheet" href="${prefix}/deck.css"></head>`) : `<link rel="stylesheet" href="${prefix}/deck.css">${html}`; }
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${tag}</body>`) : html + tag;
    send(res, 200, html, headers);
  } else {
    send(res, 200, fs.readFileSync(file), headers);
  }
  return true;
}

/* a deck's public links, in memory: the token is shown once, like the backend's */
const SHARES = [];
const shareOut = x => ({ id: x.id, round: x.round, expires_at: x.expires_at, revoked_at: x.revoked_at, created_by: userOf(x.by), created_at: x.created_at, last_used_at: null,
  active: !x.revoked_at && (!x.expires_at || Date.parse(x.expires_at) > Date.now()) });

async function api(req, res, url, me) {
  const p = url.pathname.replace(/^\/kradan\/api\//, '');
  const write = req.method !== 'GET';
  if (!me) { return sendJson(res, 401, { message: 'Unauthenticated.' }); }
  if (write && req.headers['x-csrf-token'] !== CSRF) { return sendJson(res, 419, { message: 'CSRF token mismatch.' }); }
  let m;
  const find = slug => BOARDS.find(b => b.slug === slug);
  if ((m = p.match(/^boards\/([^/]+)\/shares$/))) {
    const b = find(m[1]);
    if (!b || b.kind !== 'deck') { return sendJson(res, b ? 422 : 404, {}); }
    if (!USERS[me].manage) { return sendJson(res, 403, {}); }
    if (req.method === 'GET') { return sendJson(res, 200, { shares: SHARES.filter(x => x.slug === b.slug).reverse().map(shareOut) }); }
    const body = await readBody(req) || {};
    const days = body.days ?? 14;
    const x = { id: SHARES.length + 1, slug: b.slug, token: crypto.randomBytes(24).toString('hex'), round: body.round || null, by: me, created_at: new Date().toISOString(),
      expires_at: days ? new Date(Date.now() + days * 864e5).toISOString() : null, revoked_at: null };
    SHARES.push(x);
    return sendJson(res, 201, { share: { ...shareOut(x), url: `${APP}/kradan/p/${x.token}` } });
  }
  if ((m = p.match(/^shares\/(\d+)$/)) && req.method === 'DELETE') {
    const x = SHARES.find(y => y.id === +m[1]);
    if (!x || !USERS[me].manage) { return sendJson(res, x ? 403 : 404, {}); }
    x.revoked_at ||= new Date().toISOString();
    return sendJson(res, 200, { share: shareOut(x) });
  }
  if (p === 'boards' && req.method === 'GET') {
    return sendJson(res, 200, { boards: indexRows(me) });
  }
  if ((m = p.match(/^boards\/([^/]+)$/)) && req.method === 'GET') {
    const b = find(m[1]);
    return b ? sendJson(res, 200, boardPayload(b, me, url.searchParams.get('round'))) : sendJson(res, 404, {});
  }
  if ((m = p.match(/^boards\/([^/]+)\/rounds\/(\d+)\/picks\/(.+)$/)) && req.method === 'PUT') {
    const b = find(m[1]), r = b?.rounds.find(x => x.number === +m[2]), step = decodeURIComponent(m[3]);
    if (!r) { return sendJson(res, 404, {}); }
    if (r !== b.rounds.at(-1) || b.status !== 'open') { return sendJson(res, 409, { message: 'read only' }); }
    const body = await readBody(req);
    pick(b, r, step, me, Array.isArray(body?.options) ? body.options.map(String) : [], !!body?.seen);
    touch(b);
    return sendJson(res, 200, { picks: Object.values(b.picks[r.number] || {}).filter(x => x.step === step) });
  }
  if ((m = p.match(/^boards\/([^/]+)\/rounds\/(\d+)\/comments$/)) && req.method === 'POST') {
    const b = find(m[1]), r = b?.rounds.find(x => x.number === +m[2]);
    if (!r) { return sendJson(res, 404, {}); }
    if (r !== b.rounds.at(-1)) { return sendJson(res, 409, { message: 'read only' }); }
    const body = await readBody(req);
    if (!body?.step || (!String(body.body || '').trim() && !body.edit)) { return sendJson(res, 422, { message: 'body required' }); }
    const parent = body.parent_id ? b.comments.find(c => c.id === +body.parent_id) : null;
    const c = comment(b, r, { step: body.step, body: String(body.body || ''), parent_id: parent ? (parent.parent_id || parent.id) : null, item_id: body.item_id ? +body.item_id : null, pin: body.pin || null, edit: body.edit || null, user: me });
    return sendJson(res, 201, { ...commentOut(c, me), replies: [] });
  }
  if ((m = p.match(/^comments\/(\d+)$/)) && (req.method === 'PATCH' || req.method === 'DELETE')) {
    const c = BOARDS.flatMap(b => b.comments).find(x => x.id === +m[1] && !x.deleted);
    if (!c) { return sendJson(res, 404, {}); }
    if (c.user.id !== me) { return sendJson(res, 403, { message: 'own comments only' }); }
    const owner = BOARDS.find(b => b.comments.includes(c));
    if (req.method === 'DELETE') { c.deleted = true; touch(owner); return send(res, 204, ''); }
    const body = await readBody(req);
    c.body = String(body?.body || c.body);
    c.updated_at = new Date().toISOString();
    touch(owner);
    return sendJson(res, 200, commentOut(c, me));
  }
  if ((m = p.match(/^boards\/([^/]+)\/heartbeat$/)) && req.method === 'POST') {
    const b = find(m[1]);
    if (!b) { return sendJson(res, 404, {}); }
    const body = await readBody(req);
    const v = (b.viewers[me] ||= { seen_prints: {} });
    v.last_seen_at = new Date().toISOString();
    v.seen_prints = { ...(v.seen_prints || {}), ...(body?.prints_seen || {}) };
    return sendJson(res, 200, { viewers: viewersOf(b), changed_at: b.changedAt });
  }
  if ((m = p.match(/^boards\/([^/]+)\/decide$/)) && req.method === 'POST') {
    const b = find(m[1]);
    if (!USERS[me].manage) { return sendJson(res, 403, {}); }
    Object.assign(b, { status: 'decided', decided_at: new Date().toISOString(), decided_by: userOf(me) });
    return sendJson(res, 200, boardPayload(b, me));
  }
  if ((m = p.match(/^boards\/([^/]+)\/items$/)) && req.method === 'POST') {
    const b = find(m[1]);
    if (!b) { return sendJson(res, 404, {}); }
    const type = req.headers['content-type'] || '';
    let fields, file = null;
    if (type.startsWith('multipart/form-data')) {
      const mp = multipart(await readRaw(req), type);
      fields = mp.fields;
      if (mp.file) {
        if (mp.file.buf.length > UPLOADS.max_kb * 1024) { return sendJson(res, 422, { message: 'too big' }); }
        if (!UPLOADS.types.includes(mp.file.name.split('.').pop().toLowerCase())) { return sendJson(res, 422, { message: 'type not allowed' }); }
        const id = Object.keys(FILES).length + 1;
        FILES[id] = mp.file;
        file = { id, name: mp.file.name, type: mp.file.type, size: mp.file.buf.length };
      }
      if (fields.anchor) { fields.anchor.on = fields.anchor.on === '1' || fields.anchor.on === 'true'; if (fields.anchor.option === '') { fields.anchor.option = null; } }
    } else {
      fields = await readBody(req);
    }
    const r = b.rounds.find(x => x.number === +fields?.round) || b.rounds.at(-1);
    if (!fields?.step || !KINDS.includes(fields.kind)) { return sendJson(res, 422, { message: 'step and kind required' }); }
    if (['image', 'file'].includes(fields.kind) && !file) { return sendJson(res, 422, { message: 'file required' }); }
    return sendJson(res, 201, itemOut(item(b, r, { ...fields, file }, me), b, me));
  }
  if ((m = p.match(/^items\/(\d+)$/)) && (req.method === 'PATCH' || req.method === 'DELETE')) {
    const b = BOARDS.find(x => x.items.some(it => it.id === +m[1] && !it.deleted));
    const it = b?.items.find(x => x.id === +m[1]);
    if (!it) { return sendJson(res, 404, {}); }
    if (req.method === 'DELETE') {
      if (it.user.id !== me) { return sendJson(res, 403, { message: 'own items only' }); }
      it.deleted = true; touch(b); return send(res, 204, '');
    }
    const body = await readBody(req) || {};
    const own = it.user.id === me;
    const authorOnly = ['text', 'color', 'points', 'texts'].filter(k => k in body);
    if (authorOnly.length && !own) { return sendJson(res, 403, { message: 'only the author edits' }); }
    ['x', 'y', 'w', 'h'].forEach(k => { if (k in body) { it[k] = +body[k]; } });
    /* anyone may move an item to another frame or group (the backend's rule) */
    if (body.anchor && typeof body.anchor === 'object') { it.anchor = { option: body.anchor.option ?? null, device: body.anchor.device, src: body.anchor.src, on: !!body.anchor.on }; }
    authorOnly.forEach(k => { it[k] = body[k]; });
    it.updated_at = new Date().toISOString();
    touch(b);
    return sendJson(res, 200, itemOut(it, b, me));
  }
  if ((m = p.match(/^boards\/([^/]+)\/export\.md$/)) && req.method === 'GET') {
    const b = find(m[1]);
    return b ? send(res, 200, exportMd(b, me), { 'Content-Type': 'text/markdown; charset=utf-8' }) : sendJson(res, 404, {});
  }
  return sendJson(res, 404, { message: 'no such endpoint' });
}

/* the review.md shape from the contract */
function exportMd(b, me) {
  const pl = boardPayload(b, me);
  const r = pl.rounds.find(x => x.number === pl.current);
  const lines = [`${b.task_ref ? b.task_ref + ' ' : ''}${b.title} · รอบ ${r.number} · ${APP}${pl.url}`, ''];
  let group = '';
  r.steps.forEach((s, i) => {
    if (s.group && s.group !== group) { if (lines.at(-1) !== '') { lines.push(''); } lines.push(s.group); group = s.group; }
    const ps = pl.picks.filter(p => p.step === s.key);
    const by = s.options.map(o => [o.key, ps.filter(p => p.options.includes(o.key)).map(p => p.user.name)]).filter(([, n]) => n.length).map(([k, n]) => `${k}: ${n.join(', ')}`);
    const skip = ps.filter(p => p.seen).map(p => p.user.name);
    if (skip.length) { by.push(`${s.kind === 'question' ? 'ข้าม' : 'อ่านแล้ว'}: ${skip.join(', ')}`); }
    lines.push(`${i + 1}. ${s.title}${by.length ? ` → ${by.join(' · ')}` : ''}`);
    let pin = 0;
    pl.comments.filter(c => c.step === s.key).forEach(c => {
      const where = c.pin ? ` (${[c.pin.option, c.pin.device].filter(Boolean).join(', ')})` : '';
      if (c.edit) { lines.push(`   ✎ ${c.user.name}${where}: “${c.edit.from}” → “${c.edit.to}”`); }
      else if (c.pin) { lines.push(`   ${c.pin.box ? '▭' : '📍'}${++pin} ${c.user.name}${where}${c.pin.text ? ` “${c.pin.text}”` : ''}: ${c.body}`); }
      else { lines.push(`   💬 ${c.user.name}: ${c.body}`); }
      c.replies.forEach(x => lines.push(`      ↳ ${x.user.name}: ${x.body}`));
    });
    pl.items.filter(it => it.step === s.key).forEach(it => {
      const where = it.anchor?.on ? ` (${[it.anchor.option, it.anchor.device].filter(Boolean).join(', ')})` : '';
      const said = it.texts?.length ? `“${it.texts.join('”, “')}”` : '';
      const line = {
        note: `🗒 ${it.user.name}: ${it.text}`, text: `🗒 ${it.user.name}: ${it.text}`,
        image: `🖼 ${it.user.name}: ${it.file?.name} (attachments/${b.slug}/${it.file?.name})`,
        file: `📎 ${it.user.name}: ${it.file?.name} (attachments/${b.slug}/${it.file?.name})`,
        arrow: `➚ ${it.user.name}${where} ชี้ที่ ${said}`, rect: `▭ ${it.user.name}${where} ตีกรอบ ${said}`,
        ellipse: `▭ ${it.user.name}${where} วงไว้ ${said}`, stroke: `〰 ${it.user.name}${where} วาดเส้น`,
      }[it.kind];
      lines.push(`   ${line.trimEnd()}`);
      pl.comments.filter(c => c.item_id === it.id).forEach(x => lines.push(`      ↳ ${x.user.name}: ${x.body}`));
    });
  });
  return lines.join('\n') + '\n';
}

/* ---------- the design workbench over a fixture public/design (dist/workbench.*, pages.php mocked) ---------- */
const DESIGN = path.join(HERE, 'design');
const WB_PAGES = JSON.parse(fs.readFileSync(path.join(DESIGN, 'index.json'), 'utf8'));
const WB_FILES = {};
async function serveDesign(req, res, url) {
  if (!url.pathname.startsWith('/design/')) { return false; }
  const rel = decodeURIComponent(url.pathname.slice('/design/'.length));
  if (rel === 'index.json') { sendJson(res, 200, WB_PAGES); return true; }
  if (rel === '_workbench/pages.php' && req.method === 'POST') {
    /* upload as the skill's pages.php takes it: the raw file, ?action=upload&slug=&name=, X-Workbench-Upload: 1 */
    if (url.searchParams.get('action') === 'upload') {
      if (req.headers['x-workbench-upload'] !== '1') { sendJson(res, 403, { ok: false, why: 'header' }); return true; }
      const buf = await readRaw(req), slug = url.searchParams.get('slug') || '';
      if (buf.length > 20 * 1024 * 1024) { sendJson(res, 413, { ok: false, why: 'too big' }); return true; }
      const name = `${Date.now().toString(36)}-${(url.searchParams.get('name') || 'file').replace(/[^\p{L}\p{M}\p{N}._-]+/gu, '-')}`;
      const mime = req.headers['content-type'] || 'application/octet-stream';
      WB_FILES[`${slug}/attachments/${name}`] = { buf, type: mime };
      sendJson(res, 200, { ok: true, url: `/design/${slug}/attachments/${name}`, name, size: buf.length, mime });
      return true;
    }
    const b = await readBody(req) || {};
    const done = [], skipped = [];
    (b.slugs || []).forEach(slug => {
      const i = WB_PAGES.findIndex(p => p.slug === slug);
      if (i < 0) { skipped.push({ slug, why: 'ไม่มีหน้านี้' }); return; }
      if (b.action === 'delete') { WB_PAGES.splice(i, 1); } else { WB_PAGES[i].archived = b.action === 'archive'; }
      done.push(slug);
    });
    sendJson(res, 200, { ok: true, done, skipped });
    return true;
  }
  if (WB_FILES[rel]) { send(res, 200, WB_FILES[rel].buf, { 'Content-Type': WB_FILES[rel].type }); return true; }
  const file = rel.startsWith('_workbench/')
    ? (rel === '_workbench/index.html' || rel === '_workbench/' ? path.join(HERE, 'workbench.html') : path.join(ROOT, 'dist', path.basename(rel)))
    : path.join(DESIGN, rel);
  if (!file.startsWith(HERE) && !file.startsWith(path.join(ROOT, 'dist'))) { send(res, 403, 'no'); return true; }
  if (!exists(file) || fs.statSync(file).isDirectory()) { send(res, 404, 'not found'); return true; }
  send(res, 200, fs.readFileSync(file), { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  return true;
}

async function app(req, res) {
  const url = new URL(req.url, APP);
  if (serveContent(req, res, url)) { return; }
  if (await serveDesign(req, res, url)) { return; }
  const jar = cookies(req);
  let me = +jar.kradan_dev_session || 0;
  const setCookie = [];
  const as = +url.searchParams.get('as');
  if (USERS[as]) { me = as; }
  if (!USERS[me] && ['GET', 'HEAD'].includes(req.method) && !url.pathname.startsWith('/kradan/api/')) { me = 1; }
  if (USERS[me]) { setCookie.push(`kradan_dev_session=${me}; Path=/; HttpOnly; SameSite=Lax`); }

  if (url.pathname === '/dev/secret') {
    SECRET_LOG.push({ at: new Date().toISOString(), origin: req.headers.origin || null, cookie: !!jar.kradan_dev_session, method: req.method });
    return jar.kradan_dev_session ? sendJson(res, 200, { user: userOf(jar.kradan_dev_session), secret: 'only with the session cookie' }) : sendJson(res, 401, { message: 'no session' });
  }
  if (url.pathname === '/dev/log') { return sendJson(res, 200, SECRET_LOG); }
  const fm = url.pathname.match(/^\/kradan\/files\/(\d+)\/(\d+)\/([a-f0-9]+)$/);
  if (fm) {
    const f = FILES[fm[1]];
    if (!f || fm[3] !== sign(`file${fm[1]}`, +fm[2]) || +fm[2] < Date.now() / 1000) { return send(res, 403, 'bad signature'); }
    const inline = f.type.startsWith('image/') && !url.searchParams.has('download');
    return send(res, 200, f.buf, { 'Content-Type': f.type, 'Content-Security-Policy': 'sandbox', 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}` });
  }
  if (url.pathname.startsWith('/kradan/assets/')) {
    const file = path.join(ROOT, 'dist', path.basename(url.pathname));
    return exists(file) ? send(res, 200, fs.readFileSync(file), { 'Content-Type': TYPES[path.extname(file)] || 'text/plain' }) : send(res, 404, 'run npm run build');
  }
  if (url.pathname.startsWith('/kradan/api/')) { return api(req, res, url, USERS[me] ? me : 0); }
  /* a deck's public link: /kradan/p/<any made token, or the board's slug>, no session, present only */
  const pm = url.pathname.match(/^\/kradan\/p\/([^/]+)$/);
  if (pm) {
    const share = SHARES.find(x => x.token === pm[1] && !x.revoked_at) || { slug: pm[1] };
    const sb = BOARDS.find(x => x.slug === share.slug && x.kind === 'deck');
    if (!sb) { return send(res, 404, 'ลิงก์นี้ใช้ไม่ได้'); }
    const r = sb.rounds.find(x => x.number === share.round) || sb.rounds.at(-1);
    const data = { title: r.title, locale: 'th', assets: `${APP}/kradan/assets`, version: mtime('present.js'),
      boot: { title: sb.title, page_url: `${baseUrl(r)}index.html`, origin: CONTENT, slides: r.steps.length, start: +url.searchParams.get('present') || 1 } };
    return send(res, 200, blade('share', data), { 'Content-Type': TYPES['.html'], 'Referrer-Policy': 'no-referrer' });
  }
  if (url.pathname === '/' ) { return send(res, 302, '', { Location: '/kradan' }); }
  const assets = `${APP}/kradan/assets`;
  if (url.pathname === '/kradan' || url.pathname === '/kradan/') {
    const data = { boot: boot(me, 'index', { index: { q: url.searchParams.get('q') || '', boards: indexRows(me) } }), assets };
    return send(res, 200, blade('index', data), { 'Content-Type': TYPES['.html'], 'Set-Cookie': setCookie });
  }
  const m = url.pathname.match(/^\/kradan\/([^/]+)$/);
  const b = m && BOARDS.find(x => x.slug === decodeURIComponent(m[1]));
  if (b) {
    const data = { boot: boot(me, 'board', { board: boardPayload(b, me, url.searchParams.get('round')) }), assets };
    return send(res, 200, blade('board', data), { 'Content-Type': TYPES['.html'], 'Set-Cookie': setCookie });
  }
  send(res, 404, 'not found');
}

http.createServer((req, res) => app(req, res).catch(err => { console.error(err); send(res, 500, String(err)); })).listen(PORT, () => {
  console.log(`kradan dev → ${APP}/kradan  (${BOARDS.length} boards, content from ${CONTENT})  · workbench → ${APP}/design/_workbench/index.html`);
});
if (OPTION_C) {
  http.createServer((req, res) => serveContent(req, res, new URL(req.url, CONTENT)) || send(res, 404, 'content host')).listen(CONTENT_PORT);
}
