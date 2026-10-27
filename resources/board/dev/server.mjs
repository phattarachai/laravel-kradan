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
 * /dev/secret answers only with the session cookie, and /dev/log lists every call it got, with the origin
 * and whether the cookie came along: open a frame's console and fetch it to prove a frame can't.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

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
const stripHarness = html => html.replace(/<!-- dp:harness:start -->[\s\S]*?<!-- dp:harness:end -->/, '');
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
  return { title, steps, prints };
}

let roundSeq = 0;
const ROUNDS = {};   // id → { dir }
/* a markdown flow: index.md becomes index.html through the package's own renderer (needs composer install) */
function pageOf(dir) {
  const md = path.join(dir, 'index.md');
  if (exists(path.join(dir, 'index.html')) || !exists(md)) { return null; }
  return JSON.parse(execFileSync('php', [path.join(HERE, 'markdown.php'), md], { encoding: 'utf8' })).html;
}
function round(dir, number, pushedMinsAgo, retitle) {
  const rendered = pageOf(dir);
  const html = rendered ?? fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const p = parse(html);
  const id = ++roundSeq;
  ROUNDS[id] = { dir, html: rendered };
  return { id, number, title: retitle || p.title, pushed_at: minsAgo(pushedMinsAgo), steps: p.steps, prints: p.prints };
}
function baseUrl(r) {
  const expires = Math.floor(Date.now() / 1000) + TTL;
  return `${CONTENT}/kradan/f/${r.id}/${expires}/${sign(r.id, expires)}/`;
}
const sign = (id, expires) => crypto.createHmac('sha256', SECRET).update(`${id}|${expires}`).digest('hex').slice(0, 32);

const LOCAL = path.join(FIX, 'local');
const BOARDS = [];
function board(slug, panel, kind, title, taskRef, rounds, extra = {}) {
  if (!rounds.length) { return; }
  BOARDS.push({ id: BOARDS.length + 1, slug, panel, kind, title, task_ref: taskRef, status: 'open', decided_at: null, decided_by: null,
    rounds, picks: {}, comments: [], viewers: {}, ...extra });
}
const demo = path.join(FIX, 'demo-frames');
board('demo-cart', 'decisions', 'decision', 'Demo ตะกร้า', 'T000', [round(demo, 1, 60 * 30)]);
if (exists(path.join(LOCAL, 'launchpad-search/2'))) {
  board('t190-launchpad-search', 'decisions', 'decision', 'V2 Launchpad search', 'T190', [
    round(path.join(LOCAL, 'launchpad-search/1'), 1, 60 * 26),
    round(path.join(LOCAL, 'launchpad-search/2'), 2, 40, 'V2 Launchpad search รอบ 2'),
  ]);
}
if (exists(path.join(LOCAL, 'ws1-roundup/1'))) {
  board('t179-roundup', 'decisions', 'decision', 'T179 ข้อ 17 การปัดเศษ', 'T179', [round(path.join(LOCAL, 'ws1-roundup/1'), 1, 60 * 30)]);
}
if (exists(path.join(LOCAL, 'leave-cover/1'))) {
  board('t185-leave-cover', 'flows', 'flow', 'การรับแทนทำงานอย่างไร', 'T185', [round(path.join(LOCAL, 'leave-cover/1'), 1, 60 * 50)]);
}
board('demo-decided', 'decisions', 'decision', 'Demo ปุ่มยืนยัน', 'T001', [round(demo, 1, 60 * 24 * 9)],
  { status: 'decided', decided_at: minsAgo(60 * 24 * 7), decided_by: userOf(1) });
board('demo-flow', 'flows', 'flow', 'Demo flow ตะกร้า', 'T002', [round(demo, 1, 60 * 24 * 3)]);
board('isolation-probe', 'flows', 'flow', 'Isolation probe', 'T192', [round(path.join(FIX, 'security'), 1, 5)]);
if (exists(path.join(ROOT, 'vendor/autoload.php'))) {
  board('demo-markdown', 'flows', 'flow', 'ตะกร้ายืนยันอย่างไร', 'T188', [round(path.join(FIX, 'markdown'), 1, 15)]);
}

/* seed answers from other people on the newest round of the first boards */
let commentSeq = 0;
function seed(b) {
  const r = b.rounds.at(-1), st = r.steps;
  if (!st.length) { return; }
  const q = st.find(s => s.kind === 'question');
  if (q && b.kind === 'decision') {
    pick(b, r, q.key, 2, [q.options[0].key], false, 50);
    pick(b, r, q.key, 3, [q.options[0].key, q.options.at(-1).key], false, 30);
    pick(b, r, q.key, 5, [], true, 20);
  }
  const c = comment(b, r, { step: st[0].key, body: 'ถ้าเลือกแบบนี้ ต้องมีทางให้ sales แก้เอง', user: 4, mins: 45 });
  comment(b, r, { step: st[0].key, body: 'เห็นด้วย', parent_id: c.id, user: 2, mins: 20 });
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
function comment(b, r, { step, body, parent_id = null, pin = null, edit = null, user, mins = 0 }) {
  const c = { id: ++commentSeq, round: r.number, step, parent_id, user: userOf(user), body: body || '', pin, edit, created_at: minsAgo(mins), updated_at: minsAgo(mins), deleted: false };
  b.comments.push(c);
  return c;
}
BOARDS.filter(b => b.status === 'open').slice(0, 3).forEach(seed);

/* ---------- payloads (the shapes in board-payload.md) ---------- */
const viewersOf = b => Object.entries(b.viewers)
  .map(([uid, v]) => ({ user: userOf(uid), last_seen_at: v.last_seen_at, active: Date.now() - Date.parse(v.last_seen_at) < 120000, recent: Date.now() - Date.parse(v.last_seen_at) < 900000 }))
  .sort((a, c) => c.last_seen_at.localeCompare(a.last_seen_at));
const boardUrl = b => `/kradan/${b.panel}/${b.slug}`;
const PANELS = [{ key: 'flows', kind: 'flow', title: 'Flow การทำงาน', url: '/kradan/flows' }, { key: 'decisions', kind: 'decision', title: 'เรื่องที่ต้องตัดสินใจ', url: '/kradan/decisions' }];
const answeredIn = (b, r) => new Set([...Object.values(b.picks[r.number] || {}).map(p => p.user.id), ...b.comments.filter(c => c.round === r.number && !c.deleted).map(c => c.user.id)]);
function commentOut(c, me) {
  const { round, deleted, ...rest } = c;
  return { ...rest, mine: c.user.id === me };
}
function boardPayload(b, me, number) {
  const latest = b.rounds.at(-1).number;
  const cur = b.rounds.find(r => r.number === +number) || b.rounds.at(-1);
  const live = b.comments.filter(c => c.round === cur.number && !c.deleted);
  const picks = Object.values(b.picks[cur.number] || {});
  const comments = live.filter(c => !c.parent_id).map(c => ({ ...commentOut(c, me), replies: live.filter(x => x.parent_id === c.id).map(x => commentOut(x, me)) }));
  const people = new Map([...picks.map(p => [p.user.id, p.user]), ...live.map(c => [c.user.id, c.user])]);
  return {
    slug: b.slug, title: b.title, kind: b.kind, panel: b.panel, status: b.status, task_ref: b.task_ref,
    decided_at: b.decided_at, decided_by: b.decided_by, updated_at: b.rounds.at(-1).pushed_at, url: boardUrl(b),
    rounds: b.rounds.map(r => ({ number: r.number, title: r.title, pushed_at: r.pushed_at, steps: r.steps, prints: r.prints, base_url: baseUrl(r), readonly: r.number !== latest })),
    current: cur.number, latest, picks_locked: b.status !== 'open' || cur.number !== latest,
    picks, comments,
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
      slug: b.slug, title: b.title, kind: b.kind, panel: b.panel, status: b.status, task_ref: b.task_ref,
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
    user: { id: u.id, name: u.name, avatar: u.avatar, can: { manage: u.manage } },
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
  const ours = { '__kradan/agent.js': path.join(ROOT, 'dist/agent.js'), '__kradan/mermaid.js': path.join(ROOT, 'resources/content/mermaid.min.js') };
  const agent = !!ours[rel];
  const file = ours[rel] || path.resolve(r?.dir || '/', decodeURIComponent(rel || 'index.html'));
  const page = r?.html && (rel === '' || rel === 'index.html') ? r.html : null;
  if (!ok || (!agent && !page && !file.startsWith(r.dir + path.sep)) || (!page && (!exists(file) || fs.statSync(file).isDirectory()))) { send(res, ok ? 404 : 403, ok ? 'not found' : 'bad signature'); return true; }
  const ext = path.extname(file);
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Content-Security-Policy': 'sandbox allow-scripts', 'X-Content-Type-Options': 'nosniff' };
  if (ext === '.html') {
    const tag = `<script src="${CONTENT}/kradan/f/${id}/${expires}/${sig}/__kradan/agent.js" data-parent="${APP}"></script>`;
    let html = stripHarness(page ?? fs.readFileSync(file, 'utf8'));
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${tag}</body>`) : html + tag;
    send(res, 200, html, headers);
  } else {
    send(res, 200, fs.readFileSync(file), headers);
  }
  return true;
}

async function api(req, res, url, me) {
  const p = url.pathname.replace(/^\/kradan\/api\//, '');
  const write = req.method !== 'GET';
  if (!me) { return sendJson(res, 401, { message: 'Unauthenticated.' }); }
  if (write && req.headers['x-csrf-token'] !== CSRF) { return sendJson(res, 419, { message: 'CSRF token mismatch.' }); }
  let m;
  const find = slug => BOARDS.find(b => b.slug === slug);
  if ((m = p.match(/^boards\/([^/]+)$/)) && req.method === 'GET') {
    const b = find(m[1]);
    return b ? sendJson(res, 200, boardPayload(b, me, url.searchParams.get('round'))) : sendJson(res, 404, {});
  }
  if ((m = p.match(/^boards\/([^/]+)\/rounds\/(\d+)\/picks\/(.+)$/)) && req.method === 'PUT') {
    const b = find(m[1]), r = b?.rounds.find(x => x.number === +m[2]), step = decodeURIComponent(m[3]);
    if (!r) { return sendJson(res, 404, {}); }
    if (r !== b.rounds.at(-1) || b.status !== 'open' || b.kind !== 'decision') { return sendJson(res, 409, { message: 'read only' }); }
    const body = await readBody(req);
    pick(b, r, step, me, Array.isArray(body?.options) ? body.options.map(String) : [], !!body?.seen);
    return sendJson(res, 200, { picks: Object.values(b.picks[r.number] || {}).filter(x => x.step === step) });
  }
  if ((m = p.match(/^boards\/([^/]+)\/rounds\/(\d+)\/comments$/)) && req.method === 'POST') {
    const b = find(m[1]), r = b?.rounds.find(x => x.number === +m[2]);
    if (!r) { return sendJson(res, 404, {}); }
    if (r !== b.rounds.at(-1)) { return sendJson(res, 409, { message: 'read only' }); }
    const body = await readBody(req);
    if (!body?.step || (!String(body.body || '').trim() && !body.edit)) { return sendJson(res, 422, { message: 'body required' }); }
    const parent = body.parent_id ? b.comments.find(c => c.id === +body.parent_id) : null;
    const c = comment(b, r, { step: body.step, body: String(body.body || ''), parent_id: parent ? (parent.parent_id || parent.id) : null, pin: body.pin || null, edit: body.edit || null, user: me });
    return sendJson(res, 201, { ...commentOut(c, me), replies: [] });
  }
  if ((m = p.match(/^comments\/(\d+)$/)) && (req.method === 'PATCH' || req.method === 'DELETE')) {
    const c = BOARDS.flatMap(b => b.comments).find(x => x.id === +m[1] && !x.deleted);
    if (!c) { return sendJson(res, 404, {}); }
    if (c.user.id !== me) { return sendJson(res, 403, { message: 'own comments only' }); }
    if (req.method === 'DELETE') { c.deleted = true; return send(res, 204, ''); }
    const body = await readBody(req);
    c.body = String(body?.body || c.body);
    c.updated_at = new Date().toISOString();
    return sendJson(res, 200, commentOut(c, me));
  }
  if ((m = p.match(/^boards\/([^/]+)\/heartbeat$/)) && req.method === 'POST') {
    const b = find(m[1]);
    if (!b) { return sendJson(res, 404, {}); }
    const body = await readBody(req);
    const v = (b.viewers[me] ||= { seen_prints: {} });
    v.last_seen_at = new Date().toISOString();
    v.seen_prints = { ...(v.seen_prints || {}), ...(body?.prints_seen || {}) };
    return sendJson(res, 200, { viewers: viewersOf(b) });
  }
  if ((m = p.match(/^boards\/([^/]+)\/decide$/)) && req.method === 'POST') {
    const b = find(m[1]);
    if (!USERS[me].manage) { return sendJson(res, 403, {}); }
    Object.assign(b, { status: b.kind === 'flow' ? 'archived' : 'decided', decided_at: new Date().toISOString(), decided_by: userOf(me) });
    return sendJson(res, 200, boardPayload(b, me));
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
  });
  return lines.join('\n') + '\n';
}

async function app(req, res) {
  const url = new URL(req.url, APP);
  if (serveContent(req, res, url)) { return; }
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
  if (url.pathname.startsWith('/kradan/assets/')) {
    const file = path.join(ROOT, 'dist', path.basename(url.pathname));
    return exists(file) ? send(res, 200, fs.readFileSync(file), { 'Content-Type': TYPES[path.extname(file)] || 'text/plain' }) : send(res, 404, 'run npm run build');
  }
  if (url.pathname.startsWith('/kradan/api/')) { return api(req, res, url, USERS[me] ? me : 0); }
  if (url.pathname === '/' ) { return send(res, 302, '', { Location: '/kradan' }); }
  const assets = `${APP}/kradan/assets`;
  const panel = url.pathname.match(/^\/kradan(?:\/(\w+))?\/?$/);
  if (panel && (!panel[1] || PANELS.some(p => p.key === panel[1]))) {
    const title = PANELS.find(p => p.key === panel[1])?.title || null;
    const data = { boot: boot(me, 'index', { index: { title, panel: panel[1] || null, q: url.searchParams.get('q') || '', panels: PANELS, boards: indexRows(me) } }), assets };
    return send(res, 200, blade('index', data), { 'Content-Type': TYPES['.html'], 'Set-Cookie': setCookie });
  }
  const m = url.pathname.match(/^\/kradan\/(\w+)\/([^/]+)$/);
  const b = m && BOARDS.find(x => x.panel === m[1] && x.slug === m[2]);
  if (b) {
    const data = { boot: boot(me, 'board', { board: boardPayload(b, me, url.searchParams.get('round')) }), assets };
    return send(res, 200, blade('board', data), { 'Content-Type': TYPES['.html'], 'Set-Cookie': setCookie });
  }
  send(res, 404, 'not found');
}

http.createServer((req, res) => app(req, res).catch(err => { console.error(err); send(res, 500, String(err)); })).listen(PORT, () => {
  console.log(`kradan dev → ${APP}/kradan  (${BOARDS.length} boards, content from ${CONTENT})`);
});
if (OPTION_C) {
  http.createServer((req, res) => serveContent(req, res, new URL(req.url, CONTENT)) || send(res, 404, 'content host')).listen(CONTENT_PORT);
}
