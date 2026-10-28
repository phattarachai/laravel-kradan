/*
 * LocalStore: the board's store for the design workbench (3-shared-core.md). It answers the same calls as
 * KradanStore, in the shapes of 2-board-payload.md, from what sits next to a review page under public/design/:
 *   the page itself (steps and prints, read like StepParser), rounds/rounds.json and rounds/NN/ (older rounds),
 *   ../index.json (every review page), localStorage (answers, in the old wb:* keys) and pages.php (uploads).
 * One local user; no presence, no decide.
 */
import { readSteps } from '../agent.js';
import { exportMd } from '../board/export.js';
import { ME, upgrade, emptyState, syncNotes, createMapper, toPayload, setPick, addComment, editComment, deleteComment, answered, reviewJson, fromReviewJson } from './state.js';

export const LOCAL_CAPS = { multiUser: false, presence: false, decide: false, send: true, pages: true, uploads: true };
const HARNESS = /<!-- dp:harness:start -->[\s\S]*?<!-- dp:harness:end -->/;
const DATA_URL_MAX = 1536 * 1024;

/* the old workbench's step fingerprint, so a page open before keeps its มีอัปเดต baseline */
export function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

/* a page's title, steps (with options, trade-offs and frames) and prints, as StepParser gives them */
export async function readPage(raw, pageUrl, { parse, fetchText }) {
  const html = raw.replace(HARNESS, '');
  const doc = parse(html);
  const title = (doc.body?.dataset?.dp || doc.title || '').trim();
  let steps = readSteps(doc);
  const abs = src => new URL(src, pageUrl).href;
  const screens = {};
  await Promise.all([...new Set([...doc.querySelectorAll('[data-dp-frames]')].map(b => abs(b.dataset.src || '').split('#')[0]))]
    .map(async u => { try { screens[u] = (await fetchText(u)).replace(HARNESS, ''); } catch { screens[u] = ''; } }));
  const printOf = el => hash(el.outerHTML + [...el.querySelectorAll('[data-dp-frames]')].map(b => screens[abs(b.dataset.src || '').split('#')[0]]).join(''));
  const els = [...doc.querySelectorAll('[data-dp-step]')];
  const prints = {};
  steps.forEach((s, i) => { prints[s.key] = printOf(els[i]); delete s.index; });
  /* a page without data-dp-step is one screen step, as StepParser makes it */
  if (!steps.length) {
    steps = [{ key: `|${title}`, group: '', title, sub: '', kind: 'screen', frames: [], options: [] }];
    prints[steps[0].key] = doc.body ? printOf(doc.body) : '';
  }
  return { html, title, steps, prints };
}

export function LocalStore({ page, pagesUrl = 'pages.php', storage = globalThis.localStorage, fetch: fetchFn = globalThis.fetch?.bind(globalThis), parse, agentUrl = '', origin = globalThis.location?.origin, me = ME, now = () => Date.now(), XMLHttpRequest: XMLHttpRequestImpl = globalThis.XMLHttpRequest }) {
  const MAIN = new URL(page);
  const PATH = MAIN.pathname;
  const SLUG = PATH.split('/').slice(-2)[0];
  const get = k => { try { return JSON.parse(storage.getItem(k) || 'null'); } catch { return null; } };
  const set = (k, v) => { try { storage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } };
  const fetchText = async u => { const r = await fetchFn(u, { cache: 'no-store' }); if (!r.ok) { throw new Error(String(r.status)); } return r.text(); };
  const fetchJson = async u => JSON.parse(await fetchText(u));

  let PAGES = [];
  let ROUNDS = [];           // the board's rounds, oldest first, each with dir/title/state key
  let latest = null;         // the page as read last: {html, title, steps, prints}
  let changedAt = new Date(now()).toISOString();
  const cache = new Map();   // round number → {html, steps, prints}
  const listeners = new Set();
  const waiting = new Set();

  /* index.json paths are written from a sibling folder (_workbench/), so they resolve against any page folder */
  const pathOf = p => new URL(p.path, MAIN).pathname;
  const pageRow = () => PAGES.find(p => pathOf(p) === PATH);
  const stateKey = title => `wb:${PATH}:${title}`;
  const roundOf = n => ROUNDS.find(r => r.number === n) || ROUNDS.at(-1);
  const isLatest = r => r === ROUNDS.at(-1);

  async function loadRounds() {
    let list = [];
    try { list = await fetchJson(new URL('rounds/rounds.json', MAIN).href); } catch { list = []; }
    if (!Array.isArray(list)) { list = []; }
    /* a round kept only as text (textOnly) has no screens to show */
    const kept = list.filter(r => r && r.dir && !r.textOnly && r.title !== latest.title);
    ROUNDS = kept.map((r, i) => ({
      number: i + 1, dir: r.dir, title: r.title, pushed_at: r.updated || r.created || '',
      base_url: new URL(`rounds/${r.dir}/`, MAIN).href, page_url: new URL(`rounds/${r.dir}/index.html`, MAIN).href,
    }));
    const own = list.find(r => r?.title === latest.title);
    ROUNDS.push({ number: ROUNDS.length + 1, dir: own?.dir || null, title: latest.title,
      pushed_at: own?.updated || own?.created || (pageRow()?.modified ? new Date(pageRow().modified * 1000).toISOString() : ''),
      base_url: new URL('./', MAIN).href, page_url: MAIN.href });
  }
  async function readRound(r) {
    if (isLatest(r)) { return latest; }
    if (!cache.has(r.number)) {
      try { cache.set(r.number, await readPage(await fetchText(r.page_url), r.page_url, { parse, fetchText })); } catch { cache.set(r.number, { html: '', title: r.title, steps: [], prints: {} }); }
    }
    return cache.get(r.number);
  }
  async function refreshLatest() {
    latest = await readPage(await fetchText(MAIN.href), MAIN.href, { parse, fetchText });
    return latest;
  }

  /* a round's answers: this browser's copy, or (an older round) the review.json filed with it */
  async function stateFor(r) {
    const local = get(stateKey(r.title));
    if (local) { return upgrade(local); }
    if (!isLatest(r) && r.dir) { try { return upgrade(fromReviewJson(await fetchJson(new URL(`rounds/${r.dir}/review.json`, MAIN).href))); } catch { /* none filed */ } }
    return emptyState();
  }
  const mapperFor = steps => createMapper(steps, src => new URL(src, MAIN).href);
  const ITEMS_KEY = `wb:items:${PATH}`;
  const items = () => get(ITEMS_KEY) || [];

  /* every write: the state in its old key, the page's summary (wb:sum) for the page list, then whoever listens */
  function saveLatest(s) {
    const r = ROUNDS.at(-1);
    s.savedAt = new Date(now()).toISOString();
    set(stateKey(r.title), s);
    const done = latest.steps.filter((_, i) => answered(s, i + 1)).length;
    const sum = get(`wb:sum:${PATH}`);
    set(`wb:sum:${PATH}`, { title: r.title, done, total: latest.steps.length, sentAt: sum?.title === r.title ? sum.sentAt || '' : '' });
    changedAt = s.savedAt;
    listeners.forEach(fn => fn());
  }
  async function writeLatest(fn) {
    const r = ROUNDS.at(-1);
    const s = await stateFor(r);
    const out = fn(s, mapperFor(latest.steps));
    saveLatest(s);
    return out;
  }
  const readOnly = () => Object.assign(new Error('read-only'), { status: 409 });

  async function board(slug, number) {
    if (!latest) { await refreshLatest(); await loadRounds(); }
    const r = roundOf(+number || ROUNDS.at(-1).number);
    const shown = await readRound(r);
    const look = get(`wb:look:${PATH}`);
    const { picks, comments } = toPayload(await stateFor(r), mapperFor(shown.steps), me);
    const rounds = await Promise.all(ROUNDS.map(async x => {
      const p = await readRound(x);
      return { number: x.number, dir: x.dir, title: x.title, pushed_at: x.pushed_at, steps: p.steps, prints: p.prints, base_url: x.base_url, page_url: x.page_url, readonly: !isLatest(x) };
    }));
    const itemReplies = comments.filter(c => c.item_id);
    return {
      slug: SLUG, title: latest.title, label: latest.title, task_ref: '', status: 'open', url: MAIN.href,
      decided_at: null, decided_by: null, picks_locked: false,
      rounds, current: r.number, latest: ROUNDS.at(-1).number,
      picks, comments: [...comments.filter(c => !c.item_id), ...itemReplies], items: items(), viewers: [],
      seen_prints: look?.prints || null, uploads: { max_kb: 10240, types: [] }, changed_at: changedAt,
    };
  }

  async function boards() {
    try { PAGES = await fetchJson(new URL('../index.json', MAIN).href); } catch { PAGES = []; }
    if (!Array.isArray(PAGES)) { PAGES = []; }
    return {
      boards: PAGES.map(p => {
        const path = pathOf(p), look = get(`wb:look:${path}`);
        const at = p.modified ? new Date(p.modified * 1000).toISOString() : '';
        return { slug: p.slug, title: p.title, label: p.title, status: p.archived ? 'archived' : 'open', url: `?page=${encodeURIComponent(p.path)}`,
          updated: !!look && p.modified > (look.modified || 0), waiting: waiting.has(p.slug), updated_at: at, round: { pushed_at: at }, review: p.review || null, modified: p.modified, archived: !!p.archived, path: p.path, local: path };
      }),
    };
  }

  /* the page or its screens changed while open: changed_at moves, and the board shows มีอัปเดต โหลดใหม่ */
  async function heartbeat(slug, round, printsSeen) {
    const rec = get(`wb:look:${PATH}`) || {};
    const modified = Math.max(pageRow()?.modified || 0, Math.floor(now() / 1000));
    set(`wb:look:${PATH}`, { ...rec, prints: { ...(rec.prints || {}), ...(printsSeen || {}) }, modified });
    const before = JSON.stringify(latest?.prints || {});
    try { await refreshLatest(); } catch { /* the page is being rewritten */ }
    if (JSON.stringify(latest.prints) !== before) { changedAt = new Date(now()).toISOString(); }
    return { viewers: [], changed_at: changedAt };
  }

  const guard = round => { if (+round !== ROUNDS.at(-1).number) { throw readOnly(); } };
  /*
   * pages.php upload (the skill, phase 3a): POST <workbench dir>/pages.php?action=upload&slug=&name= with the raw file
   * and X-Workbench-Upload: 1 → {ok, url, name, size, mime}, url root-relative. 413 is too big (20 MB), 400/403 a
   * refusal. With no pages.php (404, or no PHP at all) the file stays in the browser as a data URL, up to a cap.
   */
  const NO_PHP = Symbol('no php');
  function post(file, onProgress) {
    return new Promise((resolve, reject) => {
      const u = new URL(pagesUrl, MAIN);
      Object.entries({ action: 'upload', slug: SLUG, name: file.name }).forEach(([k, v]) => u.searchParams.set(k, v));
      const xhr = new XMLHttpRequestImpl();
      xhr.open('POST', u.href);
      xhr.setRequestHeader('X-Workbench-Upload', '1');
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = e => { if (e.lengthComputable) { onProgress?.(e.loaded / e.total * 100); } };
      xhr.onload = () => {
        let r = null;
        try { r = JSON.parse(xhr.responseText); } catch { /* not pages.php */ }
        if (xhr.status >= 200 && xhr.status < 300 && r?.ok && r.url) { resolve(r); return; }
        if (xhr.status === 404 || (xhr.status < 300 && !r)) { reject(NO_PHP); return; }
        reject(Object.assign(new Error(r?.why || String(xhr.status)), { status: xhr.status }));
      };
      xhr.onerror = () => reject(NO_PHP);
      xhr.send(file);
    });
  }
  async function upload(file, onProgress) {
    try {
      const r = await post(file, onProgress);
      const url = new URL(r.url, MAIN);
      /* where it sits next to the page, for review.md: attachments/<name> */
      const dir = new URL('./', MAIN).pathname;
      return { url: url.href, path: url.pathname.startsWith(dir) ? decodeURIComponent(url.pathname.slice(dir.length)) : '', name: r.name || file.name };
    } catch (err) {
      if (err !== NO_PHP) { throw err; }
    }
    if (file.size > DATA_URL_MAX) { throw Object.assign(new Error('too big'), { status: 413 }); }
    const url = await new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = reject; fr.readAsDataURL(file); });
    return { url, path: '', name: file.name };
  }
  const putItems = list => { set(ITEMS_KEY, list); changedAt = new Date(now()).toISOString(); listeners.forEach(fn => fn()); };
  const newItem = body => {
    const list = items(), at = new Date(now()).toISOString();
    const it = { ...body, id: Math.max(now(), ...list.map(x => x.id + 1)), round: ROUNDS.at(-1).number, user: me, mine: true, created_at: at, updated_at: at, reply_count: 0 };
    putItems([...list, it]);
    return it;
  };

  const store = {
    caps: LOCAL_CAPS,
    waiting,
    /* frames are same-origin here: the page itself loads as srcdoc without the harness, screens by URL; both get agent.js */
    frames: {
      sandbox: null,
      origins: origin ? [origin] : [],
      allow: u => /^https?:$/.test(u.protocol),
      load(ifr, url) {
        const page = ROUNDS.find(r => r.page_url === url);
        if (page) {
          readRound(page).then(p => {
            const head = `<base href="${url.replace(/"/g, '&quot;')}">`;
            const agent = `<script src="${agentUrl}" data-parent="${origin}"></script>`;
            ifr.srcdoc = p.html.replace(/<head([^>]*)>/i, `<head$1>${head}`).replace(/<\/body>/i, `${agent}</body>`);
          });
          return;
        }
        ifr.addEventListener('load', () => {
          let doc;
          try { doc = ifr.contentDocument; } catch { return; }
          if (!doc?.body || doc.querySelector('script[data-kradan-agent]')) { return; }
          const s = doc.createElement('script');
          s.src = agentUrl;
          s.dataset.parent = origin;
          s.dataset.kradanAgent = '';
          doc.body.appendChild(s);
        });
        ifr.src = url;
      },
    },
    onWrite: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    boards,
    board,
    pick: async (slug, round, step, body) => { guard(round); return writeLatest((s, map) => setPick(s, map, step, body, me)); },
    comment: async (slug, round, body) => { guard(round); return writeLatest((s, map) => addComment(s, map, body, me, now())); },
    editComment: (id, text) => writeLatest((s, map) => editComment(s, map, id, text, me)),
    deleteComment: id => writeLatest(s => deleteComment(s, id)),
    heartbeat,
    decide: async () => { throw Object.assign(new Error('not offered'), { status: 405 }); },
    createItem: async (slug, body) => newItem(body),
    patchItem: async (id, fields) => {
      const list = items(), it = list.find(x => x.id === id);
      if (!it) { throw Object.assign(new Error('not found'), { status: 404 }); }
      Object.assign(it, fields, { updated_at: new Date(now()).toISOString() });
      putItems(list);
      return it;
    },
    deleteItem: async id => { putItems(items().filter(x => x.id !== id)); return null; },
    uploadItem: async (slug, fields, file, onProgress) => {
      const f = await upload(file, onProgress);
      onProgress?.(100);
      /* the board sends the multipart fields: anchor[option] and friends, numbers as text */
      const body = { step: fields.step, x: +fields.x || 0, y: +fields.y || 0, w: +fields.w || 0, h: +fields.h || 0,
        anchor: { option: fields['anchor[option]'] || null, device: fields['anchor[device]'], src: fields['anchor[src]'], on: fields['anchor[on]'] === '1' } };
      const image = /^image\//.test(file.type);
      return newItem({ ...body, kind: image ? 'image' : 'file', file: { name: file.name, type: file.type, size: file.size, url: f.url, thumb: image ? f.url : null, path: f.path } });
    },
    exportMd: async () => {
      const r = ROUNDS.at(-1);
      const { picks, comments } = toPayload(await stateFor(r), mapperFor(latest.steps), me);
      return exportMd({ board: { title: latest.title, task_ref: '', url: MAIN.href }, round: { number: r.number, steps: latest.steps }, picks, comments, items: items() });
    },

    /* for the workbench's ext: what ส่ง and the page manager need */
    slug: SLUG,
    pagesUrl,
    page: MAIN,
    pages: () => PAGES,
    async review(sent, missing) {
      const s = await stateFor(ROUNDS.at(-1));
      return reviewJson(syncNotes(s), { slug: SLUG, page: MAIN.href, title: latest.title, steps: latest.steps, missing, text: await store.exportMd(), sent });
    },
    markSent() {
      const sum = get(`wb:sum:${PATH}`) || {};
      set(`wb:sum:${PATH}`, { ...sum, title: latest.title, sentAt: new Date(now()).toISOString() });
    },
    summary: path => get(`wb:sum:${path}`),
  };
  return store;
}
