/*
 * The board: the design skill's workbench (~/.claude/skills/design/workbench) ported to Kradan.
 *  - Frames are sandboxed (`sandbox="allow-scripts"`, an opaque origin) and load the round's signed
 *    base_url. Crops, pins, boxes, text edits and scroll sync go through agent.js over postMessage.
 *  - Answers live on the server (picks, comments, pins, edits) and save as they are made. localStorage only
 *    keeps UI conveniences; the view itself (step, mode, zoom…) lives in the URL.
 */
import { t } from './i18n.js';
import { $, $$, esc, clamp, shortDate, when, toast, modal, copyText, getLocal, setLocal } from './util.js';
import { KradanStore } from './api.js';
import { createBridge, allowedOrigins } from '../bridge.js';
import { avatar, avatarRow, startPresence } from './presence.js';
import { corner } from './icon.js';
import { createItems, DRAW_TOOLS, STROKES, STICKIES } from './items.js';

const DEV = {
  desktop: { w: 1440, h: 900, icon: '<rect x="2" y="4" width="20" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/>' },
  laptop: { w: 1280, h: 800, icon: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>' },
  tablet: { w: 820, h: 1180, icon: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M11 18h2"/>' },
  phone: { w: 390, h: 844, icon: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>' },
};
const DEV_ORDER = ['desktop', 'laptop', 'tablet', 'phone'];
/* toolbar A (owner's pick, item 11): look, then mark the screens, then add to the board */
const TOOLS = ['hand', 'use', 'pin', 'edit', ...DRAW_TOOLS];
const TOOL_KEYS = { hand: 'H', use: 'V', pin: 'C', edit: 'E', note: 'N', text: 'T', pen: 'P', arrow: 'A', rect: 'R', ellipse: 'O' };
const VIEW_TOOLS = ['hand', 'use'];
const devName = d => (d === 'custom' ? t('width') : t(`dev_${d}`));

const IC = {
  side: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  prev: '<path d="M15 6l-6 6 6 6"/>', next: '<path d="M9 6l6 6-6 6"/>',
  options: '<rect x="3" y="5" width="8" height="14" rx="1.5"/><rect x="13" y="5" width="8" height="14" rx="1.5"/>',
  sizes: '<rect x="2" y="5" width="13" height="10" rx="1.5"/><path d="M6 19h5"/><rect x="17" y="8" width="5" height="11" rx="1.2"/>',
  zout: '<path d="M6 12h12"/>', zin: '<path d="M6 12h12M12 6v12"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  arr: '<rect x="4" y="3" width="16" height="7" rx="1.5"/><rect x="4" y="14" width="16" height="7" rx="1.5"/>',
  sync: '<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>',
  mini: '<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="6" height="5" rx="1"/>',
  reload: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>',
  reply: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v4"/>',
  pencil: '<path d="M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16z"/><path d="M14 7l3 3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h2"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11.5V4a1.5 1.5 0 0 1 3 0v7.5"/><path d="M14 11.5V5.5a1.5 1.5 0 0 1 3 0V14"/><path d="M8 12.5 6.6 11a1.6 1.6 0 0 0-2.4 2.1L8 18.5A5 5 0 0 0 12 21h1a5 5 0 0 0 5-5v-4.5a1.5 1.5 0 0 0-3 0"/>',
  use: '<path d="M5 3l14 7-6 2-2 6z"/>',
  note: '<path d="M5 4h14v10l-5 6H5z"/><path d="M14 20v-6h5"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  pen: '<path d="M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16z"/><path d="M14 7l3 3"/>',
  arrow: '<path d="M5 19L19 5M10 5h9v9"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1.5"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>',
  edit: '<path d="M4 7V5h11v2M9.5 5v14M7 19h5"/><path d="M15 15l4-4 2 2-4 4h-2z"/>',
  pin: '<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
};
const svg = (k, inner = IC[k]) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const ib = (attrs, k, tip, end = false) => `<button class="k-ib" ${attrs} data-tip="${esc(tip)}" ${end ? 'data-tip-end' : ''}>${svg(k)}</button>`;

/*
 * `store` is where everything is read and written (KradanStore by default, the workbench's LocalStore locally);
 * `ext` holds the hooks a host adds (3-shared-core.md). The core never asks which store it has.
 */
export function mountBoard(boot, root, { store, ext = {} } = {}) {
  const api = store || KradanStore(boot);
  const ME = boot.user || {};
  const Q = new URLSearchParams(location.search);
  let B = boot.board;
  const LATEST = () => B.rounds.at(-1)?.number;
  let R = B.rounds.find(r => r.number === B.current) || B.rounds.at(-1);
  const OLD = () => R.number !== LATEST();
  const CAN_PICK = () => !OLD() && B.status === 'open' && !B.picks_locked;
  const CAN_WRITE = () => !OLD();

  const ui = {
    step: Math.max(1, +Q.get('step') || 1),
    mode: ['options', 'sizes', 'real'].includes(Q.get('mode')) ? Q.get('mode') : 'options',
    dev: (Q.get('dev') || '').split(',').filter(d => DEV[d]),
    /* a board opens at 100% with the options stacked (owner, 2026-10-28) */
    zoom: Q.get('zoom') || '100',
    arr: ['row', 'col', 'auto'].includes(Q.get('arr')) ? Q.get('arr') : 'col',
    opt: Q.get('opt') || '',
    w: +Q.get('w') || 0,
    sync: Q.get('sync') !== 'off',
    side: Q.get('side') !== 'off',
    panel: Q.get('panel') !== 'off',
    tool: TOOLS.includes(Q.get('tool')) ? Q.get('tool') : 'hand',
    mini: Q.get('mini') !== 'off',
  };
  const view = { x: 32, y: 32, z: 1 };

  /* ---------- steps: the payload's, then the agent's detail (trade-offs, frames) ---------- */
  let STEPS = [];
  function stepsFrom(payload, detail) {
    const byKey = new Map((detail || []).map(s => [s.key, s]));
    const list = payload.length ? payload : (detail || []);
    const steps = list.map((s, si) => {
      const d = byKey.get(s.key) || {};
      const opts = (s.options || []).map(o => ({ ...o, ...(d.options || []).find(x => x.key === o.key) }));
      const shots = (frames, key) => (frames || []).length
        ? frames.map(b => ({ src: safeSrc(b.src), raw: b.src, show: (b.show || []).filter(x => DEV[x]), height: +b.height || 0, cap: b.cap || '' })).filter(x => x.src)
        : [{ crop: true, si, key }];
      return {
        key: s.key, group: s.group || '', title: s.title || '', sub: s.sub || d.sub || '',
        pickable: opts.length > 0, index: d.index ?? si,
        options: opts.length
          ? opts.map(o => ({ key: o.key, label: o.title || o.label || '', trade: o.trade || '', shots: shots(o.frames, o.key) }))
          : [{ key: '', label: '', trade: '', shots: shots(d.frames, '') }],
      };
    });
    /* a page with no data-dp-step (a flow written as one page) is one screen */
    return steps.length ? steps : [{ key: `|${R.title}`, group: '', title: B.title, sub: '', pickable: false, index: 0, whole: true,
      options: [{ key: '', label: '', trade: '', shots: [{ crop: true, si: 0, key: '', whole: true }] }] }];
  }
  /* a frame may only load files under this round's signed prefix */
  function safeSrc(src) {
    try {
      const base = new URL(R.base_url, location.href);
      const u = new URL(src, new URL('index.html', base));
      return /^https?:$/.test(u.protocol) && u.origin === base.origin && u.pathname.startsWith(base.pathname) ? u.href : '';
    } catch { return ''; }
  }
  const pageUrl = () => new URL('index.html', new URL(R.base_url, location.href)).href;
  const step = () => STEPS[ui.step - 1];

  /* ---------- answers ---------- */
  let PICKS = B.picks || [];
  let COMMENTS = B.comments || [];
  const isMe = u => String(u?.id) === String(ME.id);
  const picksFor = key => PICKS.filter(p => p.step === key);
  const myPick = key => picksFor(key).find(p => isMe(p.user));
  const myKeys = key => myPick(key)?.options || [];
  const mySeen = key => !!myPick(key)?.seen;
  /* comment threads of a step; replies to an item (item_id) belong to that item */
  const threads = key => COMMENTS.filter(c => c.step === key && !c.item_id);
  const pinned = key => threads(key).filter(c => c.pin && !c.edit);
  const edits = key => threads(key).filter(c => c.edit);
  const pinNo = c => pinned(c.step).indexOf(c) + 1;
  function pickLabel(st, keys) { return keys.length > 1 && keys.length === st.options.length ? t('all') : keys.join(' + '); }
  /* someone answered a step with a pick, a ข้าม/อ่านแล้ว tick or any comment */
  const answeredBy = (uid, key) => picksFor(key).some(p => String(p.user.id) === String(uid) && (p.options.length || p.seen))
    || COMMENTS.some(c => c.step === key && (String(c.user.id) === String(uid) || (c.replies || []).some(r => String(r.user.id) === String(uid))));

  /* ---------- มีอัปเดต: this viewer's seen_prints against the round's prints ---------- */
  const looked = { upd: new Set(), pending: {} };
  function loadLooked() {
    looked.upd.clear();
    if (OLD()) { return; }
    const seen = B.seen_prints;
    const prints = R.prints || {};
    if (!seen) { Object.assign(looked.pending, prints); return; }
    STEPS.forEach((s, i) => { if (prints[s.key] && seen[s.key] !== prints[s.key]) { looked.upd.add(i + 1); } });
    /* the steps that didn't change count as seen now */
    STEPS.forEach((s, i) => { if (!looked.upd.has(i + 1) && prints[s.key] && seen[s.key] !== prints[s.key]) { looked.pending[s.key] = prints[s.key]; } });
  }
  function lookAt(n) {
    const s = STEPS[n - 1];
    if (!s || !looked.upd.has(n)) { return; }
    looked.upd.delete(n);
    if (R.prints?.[s.key]) { looked.pending[s.key] = R.prints[s.key]; presence?.beat(); }
  }
  const isNew = s => !!B.seen_prints && !(s.key in B.seen_prints);

  /* ---------- url ---------- */
  let urlTimer;
  function writeUrl() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => {
      const p = new URLSearchParams();
      if (OLD()) { p.set('round', R.number); }
      p.set('step', ui.step);
      if (ui.mode !== 'options') { p.set('mode', ui.mode); }
      if (ui.dev.length) { p.set('dev', ui.dev.join(',')); }
      if (ui.zoom !== '100') { p.set('zoom', ui.zoom); }
      if (ui.arr !== 'col') { p.set('arr', ui.arr); }
      if (ui.opt) { p.set('opt', ui.opt); }
      if (ui.mode === 'real' && ui.w) { p.set('w', ui.w); }
      if (!ui.sync) { p.set('sync', 'off'); }
      if (ui.tool !== 'hand') { p.set('tool', ui.tool); }
      if (!ui.mini) { p.set('mini', 'off'); }
      if (!ui.side) { p.set('side', 'off'); }
      if (!ui.panel) { p.set('panel', 'off'); }
      history.replaceState(null, '', '?' + p.toString());
    }, 150);
  }

  /* ---------- shell ---------- */
  root.innerHTML = `<div class="k-app" id="app">
    <header class="k-bar">
      ${ib('data-act="side"', 'side', t('side'))}
      ${corner(boot)}
      <span class="k-crumb">/</span>
      <button class="k-ttl" id="ttl" data-act="rounds"></button>
      <span class="k-old" id="oldr" hidden>${t('old_round')}</span>
      <button class="k-btn k-fresh" data-act="latest" id="latestb" hidden>${t('latest_round')}</button>
      <span class="k-sep"></span>
      <span class="k-pager tnum">${ib('data-act="prev"', 'prev', t('prev'))}<span id="pos"></span>${ib('data-act="next"', 'next', t('next'))}</span>
      <span class="k-sep"></span>
      <button class="k-viewb" id="viewb" data-act="view" data-tip="${esc(t('view_menu'))}"></button>
      <span class="k-sp"></span>
      <button class="k-ib k-fresh" data-act="reload" id="freshb" hidden data-tip="${esc(t('fresh'))}">${svg('reload')}</button>
      <span class="k-avs" id="avs"></span>
      <span class="k-sep"></span>
      <span class="k-zoom tnum">${ib('data-act="zout"', 'zout', t('zoom_out'))}<button class="k-pct" id="zpct" data-act="z100" data-tip="${esc(t('zoom_100'))}"></button>${ib('data-act="zin"', 'zin', t('zoom_in'))}${ib('data-act="fit" id="fitb"', 'fit', t('fit'))}</span>
      ${ib('data-act="arr" id="arr"', 'arr', t('arrange'))}${ib('data-act="sync" id="sync"', 'sync', t('sync'))}${ib('data-act="mini" id="minib"', 'mini', t('mini'), true)}
      ${ib('data-act="panel"', 'panel', t('panel'), true)}
      <span id="statusb"></span>
      ${ib('data-act="copy"', 'copy', t('copy'), true)}
    </header>
    <nav class="k-side" id="side"></nav>
    <main class="k-canvas" id="canvas" data-drop="${esc(t('drop_here'))}"></main>
    <aside class="k-panel" id="panel"></aside>
  </div>`;

  /* ---------- frames, through the agent ---------- */
  const bridge = createBridge({ win: window });
  const ORIGINS = allowedOrigins(R.base_url, location.origin);
  let frames = [];
  let userMoved = false;

  function newFrame(attrs = {}) {
    const ifr = document.createElement('iframe');
    ifr.setAttribute('sandbox', 'allow-scripts');
    ifr.setAttribute('referrerpolicy', 'no-referrer');
    ifr.title = 'preview';
    Object.assign(ifr, attrs);
    return ifr;
  }

  /* one hidden frame of index.html tells the board each step's trade-offs and frames */
  function probeSteps() {
    return new Promise(resolve => {
      const ifr = newFrame();
      ifr.className = 'k-probe';
      document.body.appendChild(ifr);
      const done = steps => { clearTimeout(timer); bridge.remove(ifr.contentWindow); ifr.remove(); resolve(steps); };
      const timer = setTimeout(() => done(null), 8000);
      bridge.add(ifr.contentWindow, { origins: ORIGINS, on: (type, d) => { if (type === 'ready') { done(Array.isArray(d.steps) ? d.steps : null); } } });
      ifr.src = pageUrl();
    });
  }

  function onFrame(type, d, f) {
    if (!frames.includes(f)) { return; }
    if (type === 'ready') { hookFrame(f); return; }
    if (type === 'cropped' && f.crop && d.rect) { recrop(f, d.rect); return; }
    if (type === 'resized') { if (f.cell.shot.whole && f.crop) { growWhole(f, +d.height); } return; }
    const r = () => f.ifr.getBoundingClientRect();
    if (type === 'wheel') {
      const b = r();
      if (d.zoom) { zoomAt(b.left + d.x * view.z, b.top + d.y * view.z, Math.exp(-d.dy * 0.01)); } else { pan(-d.dx, -d.dy); }
      return;
    }
    if (type === 'contextmenu') { const b = r(); openCtx(b.left + d.x * view.z, b.top + d.y * view.z, f); return; }
    if (type === 'pointerdown') { closeCtx(); return; }
    if (type === 'key') {
      if (d.code === 'Space') { spacePan(!d.up); return; }
      if (d.code === 'Escape') { closeCtx(); closePop(false); return; }
      toolKey(d.code);
      return;
    }
    if (type === 'scrolled') {
      f.scrollY = +d.y || 0;
      renderPins();
      const fl = $('.k-flin', f.fig);
      if (fl) { fl.style.transform = `translateY(${-f.scrollY}px)`; }
      if (ui.sync && !d.mirrored && !f.crop) { peers(f).forEach(p => bridge.tell(p.ifr.contentWindow, 'scroll', { ratio: d.ratio })); }
      return;
    }
    if (type === 'hash') { if (ui.sync) { peers(f).forEach(p => bridge.tell(p.ifr.contentWindow, 'hash', { hash: d.hash })); } return; }
    if (type === 'edit-end') { editEnded(f, d); }
  }

  async function hookFrame(f) {
    f.scrollY = 0;
    if (f.crop) {
      const st = step();
      const r = f.cell.shot.whole ? null : await bridge.ask(f.ifr.contentWindow, 'crop', { step: f.cell.shot.si, key: st?.key, option: f.cell.shot.key });
      /* no such step in the page: a page without data-dp-step (a markdown flow), which the backend sends as one
         "|title" step. It shows whole */
      if (r?.rect) { recrop(f, r.rect); } else if (r || f.cell.shot.whole) { f.cell.shot.whole = true; wholePage(f); }
    }
    applyEdits(f);
  }
  /* a page with no steps shows whole, at its own height */
  /* a page without steps opens fitted to its width, like a document, unless the URL asks for a zoom */
  async function wholePage(f) {
    const m = await bridge.ask(f.ifr.contentWindow, 'measure');
    if (!m) { return; }
    f.crop = { x: 0, y: 0, w: f.size.w, h: Math.min(16000, m.height) };
    f.ifr.style.height = f.crop.h + 'px';
    sizeFrames();
    if ((ui.zoom === 'fit' || !Q.get('zoom')) && !userMoved) { fit(); } else { applyView(); }
  }
  /* the whole page grew after load (a mermaid diagram, an image): the frame follows its height */
  function growWhole(f, height) {
    const h = Math.min(16000, Math.max(1, Math.ceil(height || 0)));
    if (!h || Math.abs(h - f.crop.h) < 2) { return; }
    f.crop.h = h;
    f.ifr.style.height = h + 'px';
    sizeFrames();
    applyView();
    renderPins();
  }
  function recrop(f, rect) {
    f.crop = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    f.ifr.style.height = Math.min(6000, Math.max(f.size.h, Math.ceil(rect.y + rect.h + 40))) + 'px';
    sizeFrames();
    if (ui.zoom === 'fit' && !userMoved) { fit(); } else { applyView(); }
    renderPins();
  }
  const frameSrc = f => (f.crop ? 'crop' : f.cell.shot.raw);
  const frameEdits = f => edits(step().key).filter(c => c.pin?.option === (f.opt.key || null) && c.pin?.src === frameSrc(f)).map(c => ({ from: c.edit.from, to: c.edit.to }));
  function applyEdits(f) { bridge.ask(f.ifr.contentWindow, 'apply-edits', { edits: frameEdits(f) }); }

  /* ---------- what the canvas shows ---------- */
  function stepDevs(st) {
    const all = new Set(st.options.flatMap(o => o.shots.flatMap(s => s.show || [])));
    return DEV_ORDER.filter(d => all.has(d));
  }
  const currentOpt = st => st.options.find(o => o.key === ui.opt) || st.options[0];
  function devsFor(st) {
    if (ui.mode === 'sizes') { return ui.dev.length ? ui.dev : ['desktop', 'tablet', 'phone']; }
    return [ui.dev[0] || stepDevs(st)[0] || 'desktop'];
  }
  function frameSize(dev, shot) {
    if (dev === 'custom') { return { w: ui.w || 1024, h: 900 }; }
    const d = DEV[dev];
    return { w: d.w, h: (dev === 'desktop' || dev === 'laptop') && shot.height ? shot.height : d.h };
  }
  function plan() {
    const st = step();
    if (ui.mode === 'options') {
      const dev = devsFor(st)[0];
      return st.options.map(o => ({ opt: o, cells: o.shots.map(sh => ({ shot: sh, dev })) }));
    }
    const o = currentOpt(st);
    if (ui.mode === 'sizes') { return o.shots.map(sh => ({ opt: o, shotCap: sh.cap, cells: devsFor(st).map(dev => ({ shot: sh, dev })) })); }
    return [{ opt: o, cells: [{ shot: o.shots[0], dev: ui.w ? 'custom' : devsFor(st)[0] }] }];
  }

  /* ---------- render ---------- */
  function render() {
    writeUrl();
    const st = step();
    const app = $('#app');
    app.classList.toggle('noside', !ui.side);
    app.classList.toggle('nopanel', !ui.panel);
    app.classList.toggle('ro', OLD());
    renderBar();
    $('#sync').setAttribute('aria-pressed', ui.sync);
    $('#minib').setAttribute('aria-pressed', ui.mini);
    $('#arr').style.display = ui.mode === 'real' ? 'none' : '';
    renderView(st);
    renderSide();
    renderPanel();
    renderCanvas();
  }
  function renderBar() {
    $('#ttl').innerHTML = `<span class="k-t">${esc(B.label || B.title)}</span><span class="k-round">${esc(t('round_n', { n: R.number }))}</span><span class="k-caret">▾</span>`;
    $('#ttl').dataset.tip = R.title;
    $('#oldr').hidden = $('#latestb').hidden = !OLD();
    $('#pos').textContent = `${ui.step}/${STEPS.length}`;
    $('#statusb').innerHTML = B.status !== 'open'
      ? `<span class="k-status">${esc(t(B.status === 'decided' ? 'decided_on' : 'archived_on', { date: shortDate(B.decided_at) }))}</span>` : '';
  }
  /* mode and device fold into one button (owner, 2026-10-28): it shows the current device, and opens to choose, like
     Chrome DevTools' device toolbar. Most boards never touch it */
  function viewLabel(st) {
    if (ui.mode === 'sizes') { return { icon: svg('sizes'), text: t('mode_sizes') }; }
    const d = ui.mode === 'real' && ui.w ? null : devsFor(st)[0];
    const text = d ? `${devName(d)}${ui.mode === 'real' ? ' 1:1' : ''}` : `1:1 ${ui.w}`;
    return { icon: d ? svg(d, DEV[d].icon) : '<span class="k-one">1:1</span>', text };
  }
  function renderView(st) {
    const v = viewLabel(st);
    /* an icon is enough (owner, 2026-10-28); what it shows is in the tooltip */
    $('#viewb').innerHTML = v.icon;
    $('#viewb').dataset.tip = `${t('view_menu')} · ${v.text}`;
  }
  function setMode(m) { ui.mode = m; ui.dev = []; ui.opt = ''; if (ui.mode !== 'real') { ui.w = 0; } render(); }
  function setDev(dv) {
    if (ui.mode === 'sizes') {
      const cur = devsFor(step());
      ui.dev = cur.includes(dv) ? cur.filter(x => x !== dv) : DEV_ORDER.filter(x => x === dv || cur.includes(x));
      if (!ui.dev.length) { ui.dev = [dv]; }
    } else { ui.dev = [dv]; ui.w = 0; }
    render();
  }
  function openView(anchor) {
    closeCtx();
    const el = document.createElement('div');
    el.className = 'k-ctx k-viewmenu';
    const row = (attr, val, label, ic, on, kb = '') => `<button ${attr}="${val}" class="${on ? 'on' : ''}"><span class="ck">${on ? '✓' : ''}</span><span class="ic">${ic}</span>${esc(label)}<span class="kb">${esc(kb)}</span></button>`;
    const draw = () => {
      el.innerHTML = `<div class="lab">${esc(t('view_mode'))}</div>`
        + row('data-vmode', 'options', t('mode_options'), svg('options'), ui.mode === 'options')
        + row('data-vmode', 'sizes', t('mode_sizes'), svg('sizes'), ui.mode === 'sizes')
        + row('data-vmode', 'real', t('mode_real_short'), '<span class="k-one">1:1</span>', ui.mode === 'real')
        + `<hr><div class="lab">${esc(t('view_device'))}</div>`
        + DEV_ORDER.map(d => row('data-vdev', d, devName(d), svg(d, DEV[d].icon), devsFor(step()).includes(d) && !(ui.mode === 'real' && ui.w), `${DEV[d].w}`)).join('');
    };
    draw();
    document.body.appendChild(el);
    const b = anchor.getBoundingClientRect();
    el.style.left = Math.min(b.left, innerWidth - el.offsetWidth - 8) + 'px';
    el.style.top = b.bottom + 4 + 'px';
    ctx = el;
    el.addEventListener('click', e => {
      const x = e.target.closest('button');
      if (!x) { return; }
      if (x.dataset.vmode) { setMode(x.dataset.vmode); closeCtx(); return; }
      /* in เทียบขนาดจอ several devices toggle, so the menu stays open */
      if (x.dataset.vdev) { setDev(x.dataset.vdev); if (ui.mode === 'sizes') { draw(); } else { closeCtx(); } }
    });
  }

  /* one line under each step in the list: picks (grey), and มีอัปเดต (the one coloured state) */
  /* one line per step, as in the design workbench (2026-10-30): a ring with the number until this viewer answered
     it, then a check; their own answer on the right; มีอัปเดต in orange; everyone's counts in the title */
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const DOC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>';
  const GRID = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>';
  function everyone(s) {
    const ps = picksFor(s.key);
    const counts = s.options.filter(o => o.key).map(o => [o.key, ps.filter(p => p.options.includes(o.key)).length]).filter(([, c]) => c);
    const seen = ps.filter(p => p.seen).length;
    const cm = threads(s.key).length + (items?.forStep(s.key).length || 0);
    return [...counts.map(([k, c]) => `${k} ${c}`), seen ? `${s.pickable ? t('skipped') : t('read')} ${seen}` : '', cm ? t('comments_n', { n: cm }) : ''].filter(Boolean).join(' · ');
  }
  function stepRow(s, n) {
    const done = answeredBy(ME.id, s.key), upd = looked.upd.has(n), keys = myKeys(s.key);
    const noted = threads(s.key).length + (items?.forStep(s.key).length || 0) > 0;
    const mark = done && !upd ? `<span class="st done">${CHECK}</span>` : `<span class="st tnum ${upd ? 'upd' : ''}">${n}</span>`;
    const right = upd ? `<span class="key upd">${isNew(s) ? t('new_step') : t('updated')}</span>`
      : s.pickable && keys.length ? `<span class="key">${esc(pickLabel(s, keys))}</span>`
      : mySeen(s.key) ? `<span class="key plain">${s.pickable ? t('skipped') : t('read')}</span>` : '';
    const tip = [s.title, everyone(s)].filter(Boolean).join(' · ');
    return `<a href="#" class="r ${done ? 'done' : 'todo'}" data-step="${n}" aria-current="${n === ui.step}" title="${esc(tip)}">${mark}<span class="t">${esc(s.title)}</span>${noted ? '<i class="dot"></i>' : ''}${right}</a>`;
  }
  /* the open boards sit on top, like Figma's Pages over Layers, all of them (owner, 2026-10-28): a board leaves the list
     when it is filed into history, from the title menu or a right-click here. Then the steps of this board */
  let BOARDS = null;
  async function loadBoards() {
    try { BOARDS = (await api.boards())?.boards || []; } catch { BOARDS = []; }
    renderSide();
  }
  function boardRow(b) {
    const cur = b.slug === B.slug;
    return `<a class="pg" href="${esc(b.url)}" data-board="${esc(b.slug)}" aria-current="${cur}" title="${esc(b.label || b.title)}">${DOC}<span class="t">${esc(b.label || b.title)}</span>${b.updated && !cur ? `<span class="wt">${t('updated')}</span>` : ''}</a>`;
  }
  function boardsHtml() {
    if (!BOARDS?.length) { return ''; }
    const open = BOARDS.filter(b => b.status === 'open' || b.slug === B.slug)
      .sort((a, b) => String(b.round?.pushed_at || b.updated_at || '').localeCompare(String(a.round?.pushed_at || a.updated_at || '')));
    return `<div class="pages"><div class="hd"><span>${t('boards')}</span><span class="sp"></span><a class="k-ib" href="${esc(boot.routes?.index || '/kradan')}" data-tip="${esc(t('all_boards'))}" aria-label="${esc(t('all_boards'))}">${GRID}</a></div>
      ${open.map(boardRow).join('')}</div><div class="divide"></div>`;
  }
  function renderSide() {
    const mine = STEPS.filter(s => answeredBy(ME.id, s.key)).length;
    $('#side').innerHTML = boardsHtml()
      + `<div class="hd"><span>${t('steps_here')}</span><span class="sp"></span>${STEPS.length > 1 ? `<span class="num tnum">${esc(t('answered_n', { done: mine, total: STEPS.length }))}</span>` : ''}</div>`
      + STEPS.map((s, i) => {
        /* a section whose only step has the section's name adds nothing, so it gets no heading */
        const alone = s.group === s.title && STEPS[i + 1]?.group !== s.group;
        const head = s.group && s.group !== STEPS[i - 1]?.group && !alone ? `<h4 class="k-sec">${esc(s.group)}</h4>` : '';
        return head + stepRow(s, i + 1);
      }).join('');
  }

  /* who picked an option: avatars, the name on hover (owner's pick B + C, 2026-10-27) */
  function pickers(key, opt, cls = 'sm') {
    const ps = picksFor(key).filter(p => p.options.includes(opt));
    return ps.length ? `<span class="k-avs k-pickers">${ps.map(p => avatar(p.user, { cls, tip: isMe(p.user) ? `${p.user.name} (${t('you')})` : p.user.name })).join('')}</span>` : '';
  }
  function renderPanel() {
    const st = step(), n = ui.step, key = st.key;
    const keys = myKeys(key);
    const seenBy = picksFor(key).filter(p => p.seen);
    const scroll = $('#panel').scrollTop;
    const added = items.forStep(key);
    /* what people added sits in its own section at the end, folded like a Figma section (owner, 2026-10-28) */
    const extra = `<div class="k-hr"></div><button class="k-fold" data-addedfold aria-expanded="${addedOpen}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 6l6 6-6 6"/></svg>${esc(t('tab_items'))}${added.length ? ` <span class="tnum">${added.length}</span>` : ''}</button>${addedOpen ? items.tabHtml(key) : ''}`;
    /* comments and what people added, one thread by time (owner's pick C) */
    const entries = [...threads(key).map(c => ({ at: c.created_at, html: commentHtml(c, true) })),
      ...added.filter(it => !it.draft).map(it => ({ at: it.created_at, html: items.threadEntry(it, COMMENTS, commentHtml, composer) }))]
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
    $('#panel').innerHTML = `
      ${st.group ? `<div class="k-kicker">${esc(st.group)}</div>` : ''}
      <h2>${esc(st.title)}</h2>
      ${looked.upd.has(n) ? `<div class="k-sub k-upd">${isNew(st) ? t('new_since') : t('updated_since')}</div>` : ''}
      ${st.sub ? `<p class="k-sub">${esc(st.sub)}</p>` : ''}
      ${st.pickable && CAN_PICK() ? `<div class="k-picktools"><button data-pickall ${keys.length === st.options.length ? 'disabled' : ''}>${t('pick_all')}</button><button data-pickclear ${keys.length ? '' : 'disabled'}>${t('clear')}</button></div>` : ''}
      ${st.pickable ? `<div class="k-ol" data-n="${st.options.length}">${st.options.map(o => `
        <label class="k-opt"><input type="checkbox" name="pick" value="${esc(o.key)}" ${keys.includes(o.key) ? 'checked' : ''} ${CAN_PICK() ? '' : 'disabled'}>
          <span class="k-optkey">${esc(o.key)}</span>
          <span class="k-optbody"><span class="lb">${esc(o.label)}</span>${o.trade ? `<span class="tr">${esc(o.trade)}</span>` : ''}${pickers(key, o.key)}</span>
          <span class="k-optmark">${CHECK}</span></label>`).join('')}</div>` : ''}
      ${`<label class="k-seen"><input type="checkbox" name="seen" ${mySeen(key) ? 'checked' : ''} ${CAN_PICK() ? '' : 'disabled'}><span>${st.pickable ? `${t('skip')}<br><span class="tr">${t('skip_sub')}</span>` : t('read_box')}</span>${seenBy.length ? `<span class="k-avs k-pickers">${seenBy.map(p => avatar(p.user, { cls: 'sm', tip: p.user.name })).join('')}</span>` : ''}</label>`}
      <div class="k-hr"></div>
      <div class="k-lab">${entries.length ? esc(t('comments_n', { n: entries.length })) : esc(t('no_comments'))}</div>
      <div class="k-thread">${entries.map(x => x.html).join('')}</div>
      ${CAN_WRITE() ? composer('') : ''}
      ${extra}`;
    $('#panel').scrollTop = scroll;
    renderThread();
  }
  let addedOpen = !!getLocal('kradan:added-open');
  function where(c) {
    const p = c.pin;
    if (!p) { return ''; }
    const dev = p.src === 'crop' ? '' : devName(p.device);
    if (c.edit) { return `<div class="k-at"><span class="k-pnum edit">✎</span>${esc([p.option, dev].filter(Boolean).join(' '))} “${esc(c.edit.from)}” → “${esc(c.edit.to)}”</div>`; }
    return `<div class="k-at" data-pinref="${c.id}"><span class="k-pnum ${p.box ? 'box' : ''}">${pinNo(c)}</span>${esc([p.option, dev, p.text ? `“${p.text}”` : ''].filter(Boolean).join(' '))}</div>`;
  }
  /* in the pin's popover (pop) the reply box is always open, and editing happens in the panel */
  function commentHtml(c, top, pop = false) {
    const mine = c.mine ?? isMe(c.user);
    /* small actions are icons with a tooltip (owner, 2026-10-28) */
    const act = (attr, k, label) => `<button ${attr}="${c.id}" data-tip="${esc(label)}" aria-label="${esc(label)}">${svg(k)}</button>`;
    const acts = CAN_WRITE() ? [top && !pop ? act('data-reply', 'reply', t('reply')) : '', mine && !c.edit && !pop ? act('data-cedit', 'pencil', t('edit')) : '', mine ? act('data-cdel', 'trash', t('delete')) : ''].join('') : '';
    const edited = c.updated_at && c.created_at && Date.parse(c.updated_at) - Date.parse(c.created_at) > 1000 ? ` · ${t('edited')}` : '';
    return `<div class="k-cm" ${pop ? '' : `id="c-${c.id}"`} data-cid="${c.id}">${avatar(c.user, { tip: c.user.name })}<div class="h"><b>${esc(c.user.name)}</b><span data-tip="${esc(shortDate(c.created_at, true))}">${esc(when(c.created_at))}${edited}</span>${acts ? `<span class="acts">${acts}</span>` : ''}</div>
      ${where(c)}${c.body ? `<div class="b">${esc(c.body)}</div>` : ''}
      ${top && (c.replies || []).length ? `<div class="k-replies">${c.replies.map(r => commentHtml(r, false, pop)).join('')}</div>` : ''}
      ${top && !pop ? `<div class="k-replybox" data-replybox="${c.id}" hidden></div>` : ''}</div>`;
  }
  const composer = (parent, ph = t('comment_ph')) => `<form class="k-compose" data-compose="${parent}"><textarea rows="1" placeholder="${esc(ph)}"></textarea><button class="k-btn" type="submit">${t('send')}</button></form>`;

  function renderCanvas() {
    closePop();
    closeThread();
    const st = step();
    const cv = $('#canvas');
    bridge.clear();
    const groups = plan();
    cv.innerHTML = `<div class="k-board" id="board">${groups.map((g, gi) => groupHtml(st, g, gi)).join('')}</div>
      <div class="k-hint">${t('hint')}</div>
      <div class="k-tools" id="tools">${toolbar()}</div>
      <div class="k-mini ${ui.mini ? '' : 'off'}" id="mini"><div class="k-mini-in"></div></div>`;
    setTool(CAN_WRITE() || ['hand', 'use'].includes(ui.tool) ? ui.tool : 'hand');
    frames = [];
    $$('figure.k-fr', cv).forEach(fig => {
      const g = groups[+fig.dataset.g], c = g.cells[+fig.dataset.c];
      const f = { fig, scr: $('.scr', fig), cell: c, opt: g.opt, size: frameSize(c.dev, c.shot), crop: c.shot.crop ? { x: 0, y: 0, w: 0, h: 0 } : null, scrollY: 0 };
      const ifr = newFrame();
      f.ifr = ifr;
      $('.scr', fig).prepend(ifr);
      if (f.crop) { ifr.style.width = f.size.w + 'px'; ifr.style.height = '1200px'; }
      bridge.add(ifr.contentWindow, { origins: ORIGINS, on: onFrame, f });
      /* the frame object is what onFrame gets as its third argument */
      bridge.frames.set(ifr.contentWindow, Object.assign(f, { win: ifr.contentWindow, origins: ORIGINS, on: onFrame }));
      ifr.src = f.crop ? pageUrl() : c.shot.src;
      frames.push(f);
    });
    sizeFrames();
    userMoved = false;
    if (ui.zoom === 'fit') { fit(); } else { $('#board').classList.toggle('col', ui.mode !== 'real' && ui.arr !== 'row'); view.z = clamp(+ui.zoom / 100 || 1, 0.05, 4); view.x = 32; view.y = 32; applyView(); }
    items.render();
    paintColor();
  }
  /* มือจับ กดในจอ | ปักโน้ต แก้คำ | โน้ต ข้อความ ปากกา ลูกศร สี่เหลี่ยม วงรี | สี */
  function toolbar() {
    const btn = k => `<button class="k-ib" data-tool="${k}" data-tip="${esc(t(`tool_${k}`))} (${TOOL_KEYS[k]})">${svg(k)}</button>`;
    const sep = '<span class="k-tsep"></span>';
    if (!CAN_WRITE()) { return VIEW_TOOLS.map(btn).join(''); }
    return [VIEW_TOOLS, ['pin', 'edit'], DRAW_TOOLS].map(g => g.map(btn).join('')).join(sep)
      + `${sep}<button class="k-ib k-colorb" data-act="colors" data-tip="${esc(t('colour'))}"><span class="k-dot" id="colordot"></span></button>`;
  }
  function paintColor() {
    const dot = $('#colordot');
    if (!dot || !items) { return; }
    dot.style.background = ui.tool === 'note' ? STICKIES[items.state.noteColor] : STROKES[items.state.color];
  }
  function openColors(anchor) {
    closeCtx();
    const el = document.createElement('div');
    el.className = 'k-ctx k-colors';
    const row = (pal, cur, attr) => `<div class="row">${Object.entries(pal).map(([k, c]) => `<button class="sw ${k === cur ? 'on' : ''}" ${attr}="${k}" style="background:${c}" aria-label="${k}"></button>`).join('')}</div>`;
    el.innerHTML = row(STROKES, items.state.color, 'data-stroke') + row(STICKIES, items.state.noteColor, 'data-sticky');
    document.body.appendChild(el);
    const b = anchor.getBoundingClientRect();
    el.style.left = Math.min(b.left - 40, innerWidth - el.offsetWidth - 8) + 'px';
    el.style.top = b.top - el.offsetHeight - 8 + 'px';
    ctx = el;
    el.addEventListener('click', e => {
      const x = e.target.closest('button');
      if (!x) { return; }
      if (x.dataset.stroke) { items.state.color = x.dataset.stroke; if (ui.tool === 'note' || !DRAW_TOOLS.includes(ui.tool)) { setTool('pen'); } }
      if (x.dataset.sticky) { items.state.noteColor = x.dataset.sticky; setTool('note'); }
      closeCtx();
      paintColor();
    });
  }

  function groupHtml(st, g, gi) {
    const picked = st.pickable && myKeys(st.key).includes(g.opt.key);
    const head = (ui.mode === 'options' && st.pickable)
      ? `<div class="grp-h"><span class="key">${esc(g.opt.key)}</span><span class="lbl">${esc(g.opt.label)}</span>
         <span class="k-headwho">${pickers(st.key, g.opt.key, '')}</span>
         ${CAN_PICK() ? `<button class="pick" data-pick="${esc(g.opt.key)}">${picked ? t('picked') : t('pick')}</button>` : ''}</div>`
      : (g.shotCap ? `<div class="grp-h"><span class="lbl">${esc(g.shotCap)}</span></div>` : '');
    const cells = g.cells.map((c, ci) => `<figure class="k-fr" data-g="${gi}" data-c="${ci}">
        <figcaption><span class="cap">${esc(ui.mode === 'sizes' ? '' : c.shot.cap)}</span><span class="dim tnum"></span></figcaption>
        <div class="vp ${c.shot.crop ? 'crop' : c.dev}"><div class="scr"><div class="k-flayer"><div class="k-flin"></div></div><div class="pinlayer"></div></div>${ui.mode === 'real' ? `<div class="handle" data-tip="${esc(t('drag_width'))}"></div>` : ''}</div>
      </figure>`).join('');
    return `<section class="grp ${picked ? 'picked' : ''}" data-key="${esc(g.opt.key)}">${head}<div class="shots">${cells}<div class="k-ilayer" data-opt="${esc(g.opt.key)}"></div></div></section>`;
  }
  /* a pick only changes marks; the canvas, its frames and the view stay as they are */
  function refreshPicks() {
    const st = step(), keys = myKeys(st.key);
    $$('.grp[data-key]').forEach(g => {
      const on = keys.includes(g.dataset.key);
      g.classList.toggle('picked', on);
      const b = $('.pick', g);
      if (b) { b.textContent = on ? t('picked') : t('pick'); }
      const w = $('.k-headwho', g);
      if (w) { w.innerHTML = pickers(st.key, g.dataset.key, ''); }
    });
    renderSide();
    renderPanel();
  }

  function sizeFrames() {
    frames.forEach(f => {
      let w = f.size.w, h = f.size.h;
      if (f.crop) {
        w = f.crop.w || Math.min(f.size.w, 480);
        h = f.crop.h || 240;
        f.ifr.style.left = -f.crop.x + 'px';
        f.ifr.style.top = -f.crop.y + 'px';
      } else {
        f.ifr.style.width = w + 'px';
        f.ifr.style.height = h + 'px';
      }
      f.scr.style.width = w + 'px';
      f.scr.style.height = h + 'px';
      const bezel = f.crop ? 2 : (f.cell.dev === 'phone' || f.cell.dev === 'tablet') ? 24 : 2;
      f.fig.style.width = (w + bezel) + 'px';
      $('.dim', f.fig).textContent = f.crop ? t('page_width', { w: f.size.w }) : `${devName(f.cell.dev)} ${f.size.w}`;
    });
  }
  let repaintTimer;
  function applyView() {
    const board = $('#board');
    if (!board) { return; }
    board.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
    $('#canvas').style.setProperty('--z', view.z);
    $('#zpct').textContent = Math.round(view.z * 100) + '%';
    $('#fitb').setAttribute('aria-pressed', ui.zoom === 'fit');
    $('#arr').setAttribute('aria-pressed', board.classList.contains('col'));
    renderMini();
    clearTimeout(repaintTimer);
    repaintTimer = setTimeout(repaintFrames, 150);
  }
  /* Chrome skips painting a frame's fixed layers when it loaded off screen; a 1px nudge brings them back */
  function repaintFrames() {
    const cv = $('#canvas').getBoundingClientRect();
    frames.forEach(f => {
      const r = f.scr.getBoundingClientRect();
      if (r.right < cv.left || r.left > cv.right || r.bottom < cv.top || r.top > cv.bottom) { return; }
      const w = f.ifr.style.width;
      f.ifr.style.width = f.ifr.offsetWidth + 1 + 'px';
      requestAnimationFrame(() => requestAnimationFrame(() => { f.ifr.style.width = w; }));
    });
  }
  function fit() {
    const cv = $('#canvas'), board = $('#board');
    if (!board) { return; }
    const pad = 32, cw = cv.clientWidth - pad * 2, ch = cv.clientHeight - pad * 2 - 60;
    const measure = col => {
      board.classList.toggle('col', col);
      let z = view.z || 1;
      for (let i = 0; i < 3; i++) { cv.style.setProperty('--z', z); z = Math.min(1, cw / board.offsetWidth, col ? Infinity : ch / board.offsetHeight); }
      return z;
    };
    let col = false;
    if (ui.mode !== 'real' && board.children.length > 1) {
      if (ui.arr === 'col') { col = true; } else if (ui.arr === 'auto') { const zr = measure(false), zc = measure(true); col = zr < 0.6 && zc > zr * 1.3; }
    }
    /* a whole page (a flow without steps) reads like a document: fit its width, start at the top */
    const whole = frames.length > 0 && frames.every(f => f.cell.shot.whole);
    view.z = ui.mode === 'real' ? 1 : whole ? Math.min(1, cw / board.offsetWidth) : measure(col);
    board.classList.toggle('col', col);
    cv.style.setProperty('--z', view.z);
    view.x = Math.max(pad, (cv.clientWidth - board.offsetWidth * view.z) / 2);
    view.y = pad;
    applyView();
  }
  function zoomAt(cx, cy, factor) {
    const r = $('#canvas').getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top, z2 = clamp(view.z * factor, 0.05, 4);
    view.x = px - (px - view.x) * z2 / view.z;
    view.y = py - (py - view.y) * z2 / view.z;
    view.z = z2;
    ui.zoom = String(Math.round(z2 * 100));
    userMoved = true;
    applyView();
    writeUrl();
  }
  function zoomCenter(factor) { const r = $('#canvas').getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor); }
  function pan(dx, dy) { view.x += dx; view.y += dy; userMoved = true; applyView(); }
  /* frames that started on the same hash move together, as in the workbench */
  const hashOf = f => (f.cell.shot.raw || '').split('#')[1] || '';
  const peers = f => frames.filter(p => p !== f && !p.crop && hashOf(p) === hashOf(f));

  /* ---------- pins and boxes: comments with a place on a frame ---------- */
  function framePoint(f, ev) {
    const r = f.scr.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / view.z, y: (ev.clientY - r.top) / view.z };
  }
  const docPoint = (f, x, y) => (f.crop ? { x: x + f.crop.x, y: y + f.crop.y } : { x, y });
  const pinMatches = (c, f) => c.pin && c.step === step().key && (c.pin.option || '') === (f.opt.key || '') && c.pin.device === f.cell.dev && c.pin.src === frameSrc(f);
  function renderPins() {
    frames.forEach(f => {
      const sy = f.crop ? 0 : f.scrollY;
      $('.pinlayer', f.fig).innerHTML = pinned(step().key).filter(c => pinMatches(c, f)).map(c => c.pin.box
        ? `<span class="boxmark" data-pin="${c.id}" style="left:${+c.pin.x}px;top:${+c.pin.y - sy}px;width:${+c.pin.box.w}px;height:${+c.pin.box.h}px" title="${esc(c.user.name)}"><b>${pinNo(c)}</b></span>`
        : `<span class="pinmark" data-pin="${c.id}" style="left:${+c.pin.x}px;top:${+c.pin.y - sy}px" title="${esc(c.user.name)}">${pinNo(c)}</span>`).join('');
    });
  }
  /* a pin's thread opens next to it on the canvas (owner's pick C), and stays in the panel too (A) */
  let threadPop = null;
  function closeThread() { threadPop?.el.remove(); threadPop = null; }
  function openThread(id, anchor) {
    closeThread();
    closePop(true);
    const el = document.createElement('div');
    el.className = 'k-pop k-tpop';
    document.body.appendChild(el);
    threadPop = { el, id, anchor };
    renderThread();
    $('textarea', el)?.focus();
  }
  function renderThread() {
    if (!threadPop) { return; }
    const c = COMMENTS.find(x => x.id === threadPop.id);
    if (!c) { closeThread(); return; }
    const typing = threadPop.el.contains(document.activeElement) ? document.activeElement.value : null;
    threadPop.el.innerHTML = `<div class="k-thread">${commentHtml(c, true, true)}</div>${CAN_WRITE() ? composer(c.id, t('reply_ph')) : ''}`;
    if (typing !== null) { const ta = $('textarea', threadPop.el); if (ta) { ta.value = typing; ta.focus(); } }
    const r = (threadPop.anchor.isConnected ? threadPop.anchor : $(`[data-pin="${c.id}"]`) || threadPop.anchor).getBoundingClientRect();
    const el = threadPop.el;
    el.style.left = Math.max(8, Math.min(innerWidth - el.offsetWidth - 8, r.right + 10)) + 'px';
    el.style.top = Math.max(60, Math.min(innerHeight - el.offsetHeight - 8, r.top - 8)) + 'px';
  }

  let pop = null;
  function closePop(save = false) {
    if (!pop) { return; }
    const p = pop;
    pop = null;
    const note = $('textarea', p.el).value.trim();
    p.el.remove();
    if (save && note) { postComment({ step: p.step, body: note, pin: p.pin }); }
  }
  async function dropPin(f, ev) {
    if (!CAN_WRITE()) { return; }
    closePop(true);
    const { x, y } = framePoint(f, ev);
    const hit = await bridge.ask(f.ifr.contentWindow, 'hit', docPoint(f, x, y));
    openPop({ option: f.opt.key || null, device: f.cell.dev, src: frameSrc(f), x: Math.round(x), y: Math.round(y + (f.crop ? 0 : f.scrollY)), text: hit?.text || '', box: null }, ev);
  }
  function openPop(pin, ev) {
    const el = document.createElement('div');
    el.className = 'k-pop';
    el.style.left = Math.min(innerWidth - 300, ev.clientX + 12) + 'px';
    el.style.top = Math.min(innerHeight - 180, ev.clientY + 12) + 'px';
    const at = [pin.option, pin.src === 'crop' ? '' : devName(pin.device), pin.text ? `“${pin.text}”` : ''].filter(Boolean).join(' ');
    el.innerHTML = `<div class="at">${esc(at)}</div><textarea placeholder="${esc(t('pin_ph'))}"></textarea><div class="row"><button class="k-btn" data-x>${t('cancel')}</button><button class="k-btn k-primary" data-ok>${pin.box ? t('box_ok') : t('pin_ok')}</button></div>`;
    document.body.appendChild(el);
    pop = { el, pin, step: step().key };
    $('textarea', el).focus();
    $('[data-x]', el).onclick = () => closePop(false);
    $('[data-ok]', el).onclick = () => closePop(true);
    $('textarea', el).addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { closePop(true); }
      if (e.key === 'Escape') { closePop(false); }
    });
  }

  /* ---------- แก้คำ: the agent makes the text editable; an edit is a comment with edit {from, to} ---------- */
  let editing = null;
  async function startEdit(f, ev) {
    if (!CAN_WRITE()) { return; }
    endEdit(true);
    const { x, y } = framePoint(f, ev);
    f.ifr.focus();
    const r = await bridge.ask(f.ifr.contentWindow, 'edit-begin', docPoint(f, x, y));
    if (!r?.from) { return; }
    editing = { f };
    $('#canvas').classList.add('editing');
  }
  function endEdit(keep) {
    if (!editing) { return; }
    bridge.ask(editing.f.ifr.contentWindow, 'edit-end', { keep });
  }
  async function editEnded(f, d) {
    editing = null;
    $('#canvas').classList.remove('editing');
    window.focus();
    if (!d.keep || !CAN_WRITE()) { return; }
    const pin = { option: f.opt.key || null, device: f.cell.dev, src: frameSrc(f), x: 0, y: 0, text: '', box: null };
    const mine = edits(step().key).filter(c => isMe(c.user) && c.edit.from === d.from && c.pin?.src === pin.src && (c.pin?.option || '') === (pin.option || '') && c.pin?.device === pin.device);
    for (const c of mine) { await removeComment(c.id, false); }
    if (d.to && d.to !== d.from) { await postComment({ step: step().key, body: '', pin, edit: { from: d.from, to: d.to } }); }
    frames.forEach(applyEdits);
  }

  /* ---------- writes ---------- */
  async function setPicks(keys, seen = false) {
    if (!CAN_PICK()) { return; }
    const st = step();
    const want = new Set(keys);
    const options = st.options.map(o => o.key).filter(k => want.has(k));
    /* optimistic: the mark moves now, the server's answer replaces it */
    const mine = { step: st.key, user: { id: ME.id, name: ME.name, avatar: ME.avatar ?? null }, options, seen: options.length ? false : seen, updated_at: new Date().toISOString() };
    const before = PICKS;
    PICKS = [...PICKS.filter(p => !(p.step === st.key && isMe(p.user))), ...(options.length || mine.seen ? [mine] : [])];
    refreshPicks();
    try {
      const r = await api.pick(B.slug, R.number, st.key, { options, seen: mine.seen });
      /* {picks} is every pick on the step (2-board-payload.md); a lone {pick} is only mine */
      PICKS = Array.isArray(r?.picks) ? [...PICKS.filter(p => p.step !== st.key), ...r.picks]
        : [...PICKS.filter(p => !(p.step === st.key && isMe(p.user))), ...(r?.pick ? [r.pick] : [])];
      refreshPicks();
    } catch { PICKS = before; refreshPicks(); toast(t('save_failed')); }
  }
  function togglePick(key) { const cur = myKeys(step().key); setPicks(cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key]); }

  async function postComment(body) {
    try {
      const res = await api.comment(B.slug, R.number, body);
      const c = res?.comment ?? res;
      if (body.parent_id && !body.item_id) {
        const top = COMMENTS.find(x => x.id === body.parent_id);
        if (top) { top.replies = [...(top.replies || []), c]; }
      } else {
        COMMENTS = [...COMMENTS, { replies: [], ...c }];
      }
      renderSide(); renderPanel(); renderPins();
      return c;
    } catch { toast(t('save_failed')); return null; }
  }
  async function removeComment(id, refresh = true) {
    try { await api.deleteComment(id); } catch { toast(t('save_failed')); return; }
    COMMENTS = COMMENTS.filter(c => c.id !== id).map(c => ({ ...c, replies: (c.replies || []).filter(r => r.id !== id) }));
    if (refresh) { renderSide(); renderPanel(); renderPins(); frames.forEach(applyEdits); }
  }
  async function patchComment(id, text) {
    try {
      const res = await api.editComment(id, text);
      const c = res?.comment ?? res;
      COMMENTS = COMMENTS.map(x => (x.id === id ? { ...x, ...c, replies: x.replies } : { ...x, replies: (x.replies || []).map(r => (r.id === id ? { ...r, ...c } : r)) }));
      renderPanel();
    } catch { toast(t('save_failed')); }
  }

  /* ---------- fresh answers from everyone, and a re-push of this round ---------- */
  async function refresh() {
    if (document.visibilityState === 'hidden') { return; }
    let fresh;
    try { fresh = await api.board(B.slug, R.number); } catch { return; }
    const latest = fresh.rounds.at(-1);
    const same = fresh.rounds.find(r => r.number === R.number);
    $('#freshb').hidden = !(latest.number !== LATEST() || JSON.stringify(same?.prints || {}) !== JSON.stringify(R.prints || {}));
    const typing = document.activeElement?.closest?.('.k-panel textarea, .k-pop');
    const changed = JSON.stringify([fresh.picks, fresh.comments, fresh.items]) !== JSON.stringify([PICKS, COMMENTS, items.all().filter(x => !x.pending && !x.draft)]);
    B = { ...B, status: fresh.status, decided_at: fresh.decided_at, decided_by: fresh.decided_by, picks_locked: fresh.picks_locked, uploads: fresh.uploads ?? B.uploads };
    if (!changed) { return; }
    items.merge(fresh.items || []);
    PICKS = fresh.picks || [];
    COMMENTS = fresh.comments || [];
    renderSide();
    if (!typing) { renderPanel(); }
    renderPins();
    refreshPicks();
  }

  /* ---------- right-click menu ---------- */
  let ctx = null;
  function closeCtx() { ctx?.remove(); ctx = null; }
  async function openCtx(x, y, f) {
    closeCtx();
    closePop(true);
    const ev = { clientX: x, clientY: y };
    const st = step(), key = f?.opt.key;
    let hasText = false;
    if (f && CAN_WRITE()) {
      const p = framePoint(f, ev);
      const hit = await bridge.ask(f.ifr.contentWindow, 'hit', docPoint(f, p.x, p.y));
      hasText = !!hit?.editable;
    }
    const picked = key && myKeys(st.key).includes(key);
    const icon = k => svg(k);
    const item = (act, label, kb = '', { check = false, disabled = false, ic = '' } = {}) =>
      `<button data-ctx="${act}" class="${check ? 'on' : ''}" ${disabled ? 'disabled' : ''}><span class="ck">${check ? '✓' : ''}</span><span class="ic">${ic}</span>${esc(label)}<span class="kb">${esc(kb)}</span></button>`;
    const here = f ? [
      CAN_WRITE() ? item('pin', t('pin_here'), '', { ic: icon('pin') }) : '',
      CAN_WRITE() ? item('edit', t('edit_here'), '', { disabled: !hasText, ic: icon('edit') }) : '',
      item('zoomto', t('zoom_here'), t('dblclick'), { ic: icon('zin') }),
      st.pickable && key && CAN_PICK() ? item('pick', picked ? t('unpick', { k: key }) : t('pick_k', { k: key })) : '',
      '<hr>',
    ].join('') : '';
    const tools = TOOLS.filter(k => CAN_WRITE() || VIEW_TOOLS.includes(k))
      .map(k => item(`tool:${k}`, t(`tool_${k}`), TOOL_KEYS[k], { check: ui.tool === k, ic: icon(k) })).join('');
    const el = document.createElement('div');
    el.className = 'k-ctx';
    el.innerHTML = here + tools + '<hr>'
      + item('fit', t('fit').replace(/ \(.*\)/, ''), '⇧1', { ic: icon('fit') }) + item('z100', t('view_100'), '⇧0', { ic: '<span class="k-one">100</span>' })
      + item('mini', t('mini').replace(/ \(.*\)/, ''), 'M', { check: ui.mini, ic: icon('mini') })
      + '<hr>' + item('copy', t('copy'))
      + `<div class="foot">${esc(t('browser_menu'))}</div>`;
    document.body.appendChild(el);
    el.style.left = Math.min(x, innerWidth - el.offsetWidth - 8) + 'px';
    el.style.top = Math.min(y, innerHeight - el.offsetHeight - 8) + 'px';
    ctx = el;
    el.addEventListener('click', e => {
      const b = e.target.closest('button[data-ctx]');
      if (!b || b.disabled) { return; }
      const a = b.dataset.ctx;
      closeCtx();
      if (a.startsWith('tool:')) { setTool(a.slice(5)); writeUrl(); }
      if (a === 'pin') { dropPin(f, ev); }
      if (a === 'edit') { startEdit(f, ev); }
      if (a === 'zoomto') { zoomTo($('.vp', f.fig)); }
      if (a === 'pick') { togglePick(key); }
      if (a === 'fit') { ui.zoom = 'fit'; writeUrl(); fit(); }
      if (a === 'z100') { zoomCenter(1 / view.z); }
      if (a === 'mini') { toggleMini(); }
      if (a === 'copy') { openCopy(); }
    });
  }

  /* ---------- คัดลอกให้ Claude: the server's export.md ---------- */
  async function openCopy() {
    closePop(true);
    const m = modal(`<div class="box"><pre>${esc(t('loading'))}</pre><div class="row"><button class="k-btn" data-x>${t('close')}</button><button class="k-btn k-primary" data-copy disabled>${t('copy')}</button></div></div>`);
    let text = '';
    try { text = await api.exportMd(B.slug); } catch { $('pre', m).textContent = t('offline'); return; }
    $('pre', m).textContent = text;
    const btn = $('[data-copy]', m);
    btn.disabled = false;
    btn.onclick = async () => {
      if (!await copyText(text)) {
        getSelection().selectAllChildren($('pre', m));
        btn.textContent = t('copy_manual');
        return;
      }
      btn.textContent = t('copied');
    };
  }

  /* ---------- จัดเก็บ: a decision board becomes decided, a flow archived (the backend's decide) ---------- */
  /* file a board into history: this one from its title menu, any open one by right-clicking it in the list */
  function openArchive(slug = B.slug) {
    const other = BOARDS?.find(b => b.slug === slug);
    const name = slug === B.slug ? (B.label || B.title) : (other?.label || other?.title || slug);
    const m = modal(`<div class="box narrow"><h2>${t('archive_title')}</h2><p class="k-sub"><b>${esc(name)}</b><br>${t('archive_decision')}</p>
      <div class="row"><button class="k-btn" data-x>${t('cancel')}</button><button class="k-btn k-primary" data-yes>${t('archive')}</button></div></div>`);
    $('[data-yes]', m).onclick = async () => {
      try {
        const r = await api.decide(slug);
        const fresh = r?.board ?? r;
        m.remove();
        if (BOARDS) { BOARDS = BOARDS.map(b => (b.slug === slug ? { ...b, status: fresh?.status || 'decided' } : b)); }
        if (slug === B.slug) {
          B = { ...B, status: fresh?.status || 'decided', decided_at: fresh?.decided_at || new Date().toISOString(), picks_locked: true };
          render();
        } else { renderSide(); toast(t('archived_board', { name })); }
      } catch { toast(t('save_failed')); }
    };
  }
  function openBoardMenu(x, y, slug) {
    closeCtx();
    const el = document.createElement('div');
    el.className = 'k-ctx';
    const b = BOARDS?.find(z => z.slug === slug);
    el.innerHTML = `<button data-bopen><span class="ck"></span>${esc(t('open_new_tab'))}</button>`
      + (ME.can?.manage && b?.status === 'open' ? `<hr><button data-barchive><span class="ck"></span>${esc(t('archive'))}</button>` : '');
    document.body.appendChild(el);
    el.style.left = Math.min(x, innerWidth - el.offsetWidth - 8) + 'px';
    el.style.top = Math.min(y, innerHeight - el.offsetHeight - 8) + 'px';
    ctx = el;
    el.addEventListener('click', e => {
      const z = e.target.closest('button');
      if (!z) { return; }
      closeCtx();
      if (z.dataset.bopen !== undefined && b) { window.open(b.url, '_blank', 'noopener'); }
      if (z.dataset.barchive !== undefined) { openArchive(slug); }
    });
  }

  /* ---------- rounds: the title opens the list; ดูทุกรอบ shows every round's answers ---------- */
  const roundUrl = (r, n = 1) => `?${new URLSearchParams({ ...(r.number !== LATEST() ? { round: r.number } : {}), step: n })}`;
  function openRounds(anchor) {
    closeCtx();
    const el = document.createElement('div');
    el.className = 'k-ctx k-rmenu';
    el.innerHTML = [...B.rounds].reverse().map(r => `<button data-round="${r.number}"><span class="ck">${r.number === R.number ? '✓' : ''}</span><span class="rt"><b>${esc(r.title)}</b><span>${esc([shortDate(r.pushed_at), t('steps_n', { n: (r.steps || []).length })].join(' · '))}</span></span></button>`).join('')
      + `<hr><button data-allrounds><span class="ck"></span>${t('all_rounds')}</button>`
      + (ME.can?.manage && B.status === 'open' && !OLD() ? `<button data-archive><span class="ck"></span>${t('archive')}</button>` : '');
    document.body.appendChild(el);
    const b = anchor.getBoundingClientRect();
    el.style.left = Math.min(b.left, innerWidth - el.offsetWidth - 8) + 'px';
    el.style.top = b.bottom + 4 + 'px';
    ctx = el;
    el.addEventListener('click', e => {
      const x = e.target.closest('button');
      if (!x) { return; }
      closeCtx();
      if (x.dataset.allrounds !== undefined) { openAllRounds(); return; }
      if (x.dataset.archive !== undefined) { openArchive(); return; }
      const r = B.rounds.find(y => y.number === +x.dataset.round);
      if (r && r.number !== R.number) { location.href = roundUrl(r); }
    });
  }
  async function openAllRounds() {
    const m = modal(`<div class="box wide"><h2>${t('all_rounds')}</h2><div class="k-rounds">${esc(t('loading'))}</div><div class="row"><button class="k-btn" data-x>${t('close')}</button></div></div>`);
    const parts = await Promise.all(B.rounds.map(async r => {
      let p;
      try { p = r.number === R.number ? { picks: PICKS, comments: COMMENTS } : await api.board(B.slug, r.number); } catch { p = { picks: [], comments: [] }; }
      const people = new Set([...(p.picks || []).map(x => x.user.id), ...(p.comments || []).map(x => x.user.id)]);
      const body = (r.steps || []).map((s, i) => {
        const ps = (p.picks || []).filter(x => x.step === s.key);
        const ans = (s.options || []).map(o => [o.key, ps.filter(x => x.options.includes(o.key)).map(x => x.user.name)]).filter(([, n]) => n.length).map(([k, n]) => `${k}: ${n.join(', ')}`).join(' · ');
        const cms = (p.comments || []).filter(c => c.step === s.key);
        const head = s.group && s.group !== r.steps[i - 1]?.group ? `<div class="grp">${esc(s.group)}</div>` : '';
        return `${head}<a class="q" href="${roundUrl(r, i + 1)}"><span class="tnum">${i + 1}.</span><span class="t">${esc(s.title)}</span>${ans ? `<span class="a">→ ${esc(ans)}</span>` : ''}</a>${cms.length ? `<div class="d">${cms.map(c => `${esc(c.user.name)}: ${esc(c.edit ? `“${c.edit.from}” → “${c.edit.to}”` : c.body)}`).join('<br>')}</div>` : ''}`;
      }).join('');
      return `<section class="${r.number === R.number ? 'cur' : ''}"><div class="rh"><b>${esc(r.title)}</b><span>${esc([shortDate(r.pushed_at), t('answered_people', { n: people.size })].join(' · '))}</span><a href="${roundUrl(r)}">${t('open_round')}</a></div>${body}</section>`;
    }));
    $('.k-rounds', m).innerHTML = parts.join('');
    $('.k-rounds', m).lastElementChild?.scrollIntoView({ block: 'start' });
  }

  /* ---------- tools, minimap, zoom-to ---------- */
  function go(n) { lookAt(ui.step); ui.step = clamp(n, 1, STEPS.length); ui.opt = ''; render(); lookAt(ui.step); }
  function toolKey(code) {
    const tool = TOOLS.find(k => `Key${TOOL_KEYS[k]}` === code);
    if (tool) { setTool(tool); writeUrl(); return true; }
    if (code === 'KeyM') { toggleMini(); return true; }
    return false;
  }
  function spacePan(on) { $('#canvas').classList.toggle('spacepan', on); }
  function setTool(tool) {
    if (!CAN_WRITE() && !VIEW_TOOLS.includes(tool)) { tool = 'hand'; }
    ui.tool = tool;
    const cv = $('#canvas');
    TOOLS.forEach(k => cv.classList.toggle(`tool-${k}`, k === tool));
    if (tool !== 'edit') { endEdit(true); }
    $$('#tools button').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === tool));
    if (tool !== 'pin') { closePop(false); }
    if (!VIEW_TOOLS.includes(tool)) { items?.deselect(); }
    paintColor();
  }
  function toggleMini() {
    ui.mini = !ui.mini;
    $('#mini')?.classList.toggle('off', !ui.mini);
    $('#minib').setAttribute('aria-pressed', ui.mini);
    writeUrl();
    renderMini();
  }
  function zoomTo(el) {
    const cv = $('#canvas'), c = cv.getBoundingClientRect(), r = el.getBoundingClientRect();
    const bx = (r.left - c.left - view.x) / view.z, by = (r.top - c.top - view.y) / view.z;
    const bw = r.width / view.z, bh = r.height / view.z;
    const z = clamp(Math.min((cv.clientWidth - 64) / bw, (cv.clientHeight - 64) / bh), 0.05, 4);
    view.z = z;
    view.x = (cv.clientWidth - bw * z) / 2 - bx * z;
    view.y = Math.max(32, (cv.clientHeight - bh * z) / 2) - by * z;
    ui.zoom = String(Math.round(z * 100));
    userMoved = true;
    applyView();
    writeUrl();
  }
  let miniScale = 1;
  function renderMini() {
    const mini = $('#mini'), board = $('#board'), cv = $('#canvas');
    if (!mini || !board || !ui.mini) { return; }
    const bw = board.offsetWidth, bh = board.offsetHeight;
    if (!bw || !bh) { return; }
    const m = miniScale = Math.min(184 / bw, 120 / bh);
    const c = cv.getBoundingClientRect(), b = board.getBoundingClientRect();
    const toMini = r => ({ x: (r.left - b.left) / view.z * m, y: (r.top - b.top) / view.z * m, w: r.width / view.z * m, h: r.height / view.z * m });
    const blocks = frames.map(f => { const q = toMini($('.vp', f.fig).getBoundingClientRect()); return `<i class="mini-f" style="left:${q.x}px;top:${q.y}px;width:${Math.max(2, q.w)}px;height:${Math.max(2, q.h)}px"></i>`; });
    const keys = $$('.grp[data-key]', board).filter(g => g.dataset.key).map(g => { const q = toMini($('.shots', g).getBoundingClientRect()); return `<span class="mini-k" style="left:${q.x}px;top:${q.y}px">${esc(g.dataset.key)}</span>`; });
    const vx = -view.x / view.z * m, vy = -view.y / view.z * m, vw = c.width / view.z * m, vh = c.height / view.z * m;
    const inner = $('.k-mini-in', mini);
    inner.style.width = bw * m + 'px';
    inner.style.height = bh * m + 'px';
    inner.innerHTML = blocks.join('') + keys.join('') + `<i class="mini-v" style="left:${vx}px;top:${vy}px;width:${vw}px;height:${vh}px"></i>`;
  }
  function miniJump(e) {
    const inner = $('#mini .k-mini-in'), r = inner.getBoundingClientRect(), cv = $('#canvas');
    const bx = (e.clientX - r.left) / miniScale, by = (e.clientY - r.top) / miniScale;
    view.x = cv.clientWidth / 2 - bx * view.z;
    view.y = cv.clientHeight / 2 - by * view.z;
    userMoved = true;
    applyView();
  }
  function focusComment(id, open = true) {
    if (!ui.panel && !open) { return; }
    if (!ui.panel) { ui.panel = true; $('#app').classList.remove('nopanel'); }
    const el = $(`#c-${id}`);
    if (!el) { return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1200);
  }

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const t0 = e.target.closest('button, a, .pinlayer, .pinmark, .boxmark, [data-goitem]');
    if (!t0) { return; }
    if (t0.matches('.pinmark, .boxmark') && t0.dataset.pin) { openThread(+t0.dataset.pin, t0); focusComment(t0.dataset.pin, false); return; }
    if (t0.classList.contains('pinlayer')) {
      const f = frames.find(x => x.fig.contains(t0));
      if (f && ui.tool === 'pin') { dropPin(f, e); }
      if (f && ui.tool === 'edit') { startEdit(f, e); }
      return;
    }
    if (t0.closest('.k-pop:not(.k-tpop), .k-modal, .k-ctx')) { return; }
    if (items.click(e)) { return; }
    if (t0.dataset.addedfold !== undefined) { addedOpen = !addedOpen; setLocal('kradan:added-open', addedOpen); renderPanel(); return; }
    const d = t0.dataset;
    if (d.step) { e.preventDefault(); go(+d.step); return; }
    if (d.tool) { setTool(d.tool); writeUrl(); return; }
    if (d.pick) { togglePick(d.pick); return; }
    if (d.pickall !== undefined) { setPicks(step().options.map(o => o.key)); return; }
    if (d.pickclear !== undefined) { setPicks([]); return; }
    if (d.reply) { const box = $(`[data-replybox="${d.reply}"]`); box.hidden = false; box.innerHTML = composer(d.reply, t('reply_ph')); $('textarea', box).focus(); return; }
    if (d.cdel) { removeComment(+d.cdel); return; }
    if (d.cedit) {
      const c = COMMENTS.flatMap(x => [x, ...(x.replies || [])]).find(x => x.id === +d.cedit);
      const b = $(`#c-${d.cedit} > .b`);
      if (!c || !b) { return; }
      b.innerHTML = `<form class="k-compose" data-editform="${c.id}"><textarea rows="2">${esc(c.body)}</textarea><button class="k-btn" type="submit">${t('save')}</button></form>`;
      $('textarea', b).focus();
      return;
    }
    const act = d.act;
    if (act === 'prev') { go(ui.step - 1); }
    if (act === 'next') { go(ui.step + 1); }
    if (act === 'sync') { ui.sync = !ui.sync; $('#sync').setAttribute('aria-pressed', ui.sync); writeUrl(); }
    if (act === 'mini') { toggleMini(); }
    if (act === 'arr') { ui.arr = $('#board')?.classList.contains('col') ? 'row' : 'col'; writeUrl(); if (ui.zoom === 'fit') { fit(); } else { $('#board')?.classList.toggle('col', ui.arr === 'col'); applyView(); } }
    if (act === 'fit') { ui.zoom = 'fit'; writeUrl(); fit(); }
    if (act === 'z100') { zoomCenter(1 / view.z); }
    if (act === 'zin') { zoomCenter(1.25); }
    if (act === 'zout') { zoomCenter(0.8); }
    if (act === 'side') { ui.side = !ui.side; $('#app').classList.toggle('noside', !ui.side); writeUrl(); requestAnimationFrame(() => (ui.zoom === 'fit' ? fit() : applyView())); }
    if (act === 'panel') { ui.panel = !ui.panel; $('#app').classList.toggle('nopanel', !ui.panel); writeUrl(); requestAnimationFrame(() => (ui.zoom === 'fit' ? fit() : applyView())); }
    if (act === 'copy') { openCopy(); }
    if (act === 'colors') { openColors(t0); }
    if (act === 'view') { openView(t0); }
    if (act === 'rounds') { openRounds(t0); }
    if (act === 'latest') { location.href = roundUrl(B.rounds.at(-1), 1); }
    if (act === 'reload') { location.reload(); }
  });
  document.addEventListener('submit', async e => {
    const form = e.target.closest('.k-compose');
    if (!form) { return; }
    e.preventDefault();
    const ta = $('textarea', form), text = ta.value.trim();
    if (!text) { return; }
    ta.disabled = true;
    if (form.dataset.editform) { await patchComment(+form.dataset.editform, text); return; }
    /* "item:12" is a reply to an item (its comments carry item_id), a number a reply to a comment */
    const to = form.dataset.compose || '';
    const parent = /^\d+$/.test(to) ? +to : null, itemId = to.startsWith('item:') ? +to.slice(5) : null;
    const c = await postComment({ step: step().key, body: text, ...(parent ? { parent_id: parent } : {}), ...(itemId ? { item_id: itemId } : {}) });
    if (!c) { ta.disabled = false; }
  });
  document.addEventListener('keydown', e => {
    if (e.target.closest?.('.k-compose textarea') && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.target.form?.requestSubmit(); return; }
    if (e.target.closest?.('textarea, input, [contenteditable="true"], [contenteditable="plaintext-only"]')) { return; }
    if (items.keyDown(e)) { return; }
    if (e.code === 'Space') { e.preventDefault(); spacePan(true); return; }
    if (!e.metaKey && !e.ctrlKey && !e.altKey && toolKey(e.code)) { return; }
    if (e.key === 'ArrowRight') { go(ui.step + 1); }
    if (e.key === 'ArrowLeft') { go(ui.step - 1); }
    if (e.shiftKey && e.code === 'Digit1') { ui.zoom = 'fit'; writeUrl(); fit(); }
    if (e.shiftKey && e.code === 'Digit0') { zoomCenter(1 / view.z); }
    if (e.key === 'Escape') { closeCtx(); closePop(false); closeThread(); $$('.k-modal').pop()?.remove(); }
  });
  document.addEventListener('keyup', e => { if (e.code === 'Space') { spacePan(false); } });
  document.addEventListener('change', e => {
    if (e.target.name === 'pick') { togglePick(e.target.value); }
    if (e.target.name === 'seen') { setPicks([], e.target.checked); }
  });
  document.addEventListener('input', e => {
    /* every note box grows with what is typed (owner, round 2) */
    if (e.target.matches('.k-compose textarea, .k-pop textarea')) { e.target.style.height = 'auto'; e.target.style.height = Math.min(innerHeight * 0.5, e.target.scrollHeight + 2) + 'px'; }
  });
  document.addEventListener('contextmenu', e => {
    const row = !e.shiftKey && e.target.closest('#side [data-board]');
    if (row) { e.preventDefault(); openBoardMenu(e.clientX, e.clientY, row.dataset.board); return; }
    if (e.shiftKey || !e.target.closest('#canvas')) { return; }
    e.preventDefault();
    openCtx(e.clientX, e.clientY, frames.find(f => f.fig.contains(e.target)));
  });
  document.addEventListener('pointerdown', e => { if (ctx && !e.target.closest('.k-ctx')) { closeCtx(); } }, true);
  addEventListener('blur', () => closeCtx());
  document.addEventListener('wheel', e => {
    closeCtx();
    if (!e.target.closest('#canvas')) { return; }
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01)); } else { pan(-e.deltaX, -e.deltaY); }
  }, { passive: false });
  document.addEventListener('pointerdown', e => {
    if (pop && !e.target.closest('.k-pop') && !e.target.closest('.pinlayer')) { closePop(true); }
    if (threadPop && !e.target.closest('.k-tpop, .pinmark, .boxmark')) { closeThread(); }
    if (items.pointerDown(e)) { return; }
    const cv = $('#canvas');
    const h = e.target.closest('.handle');
    if (h) {
      e.preventDefault();
      const f = frames[0], startX = e.clientX, startW = f.size.w;
      f.ifr.style.pointerEvents = 'none';
      const move = ev => { ui.w = Math.round(clamp(startW + (ev.clientX - startX) / view.z, 320, 1920)); f.size.w = ui.w; f.cell.dev = 'custom'; sizeFrames(); applyView(); };
      const up = () => { f.ifr.style.pointerEvents = ''; removeEventListener('pointermove', move); removeEventListener('pointerup', up); writeUrl(); renderView(step()); };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      return;
    }
    if (e.target.closest('#mini')) {
      e.preventDefault();
      miniJump(e);
      const move = ev => miniJump(ev);
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      return;
    }
    if (!e.target.closest('#canvas') || e.target.closest('button, .pinlayer, .pinmark, .boxmark, .handle, .k-tools, [data-item]')) { return; }
    const onBackground = e.target === cv || e.target.id === 'board' || e.target.matches('.grp, .shots, .k-hint');
    const handy = cv.classList.contains('tool-hand') || cv.classList.contains('spacepan');
    if (!(handy || onBackground || e.button === 1)) { return; }
    e.preventDefault();
    let lx = e.clientX, ly = e.clientY;
    cv.classList.add('dragging');
    const move = ev => { pan(ev.clientX - lx, ev.clientY - ly); lx = ev.clientX; ly = ev.clientY; };
    const up = () => { cv.classList.remove('dragging'); removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });
  addEventListener('resize', () => (ui.zoom === 'fit' ? fit() : applyView()));
  document.addEventListener('dblclick', e => {
    if (items.dblclick(e)) { return; }
    const vp = e.target.closest('#canvas .vp');
    if (vp && !e.target.closest('.pinlayer, .handle')) { zoomTo(vp); }
  });
  document.addEventListener('mousedown', e => { if (e.button === 1 && e.target.closest('#canvas')) { e.preventDefault(); } });
  /* hovering a comment with a pin lights it up on the canvas */
  document.addEventListener('mouseover', e => {
    const ref = e.target.closest?.('[data-pinref]');
    $$('.pinmark.hl, .boxmark.hl').forEach(x => x.classList.remove('hl'));
    if (ref) { $$(`[data-pin="${ref.dataset.pinref}"]`).forEach(x => x.classList.add('hl')); }
  });

  /* ---------- presence ---------- */
  let presence = null;
  let lastChanged = B.changed_at || null;
  function renderAvatars(viewers, online) {
    $('#avs').innerHTML = avatarRow(viewers, { me: ME.id, online });
  }

  /* ---------- what people add to the board (item 11) ---------- */
  function centerOn(el) {
    const cv = $('#canvas').getBoundingClientRect(), r = el.getBoundingClientRect();
    view.x += cv.left + cv.width / 2 - (r.left + r.width / 2);
    view.y += cv.top + cv.height / 2 - (r.top + r.height / 2);
    userMoved = true;
    applyView();
    items.renderSelection();
  }
  const items = createItems({
    api, bridge, ME, view, frameSrc, docPoint,
    board: () => B, round: () => R, step, frames: () => frames, tool: () => ui.tool, canWrite: CAN_WRITE, centerOn,
    onChange: () => { renderSide(); if (!document.activeElement?.closest?.('.k-panel textarea')) { renderPanel(); } },
  });

  /* ---------- start ---------- */
  STEPS = stepsFrom(R.steps || [], null);
  ui.step = Math.min(ui.step, STEPS.length || 1);
  renderBar();
  renderSide();
  $('#canvas').innerHTML = `<div class="k-empty">${esc(t('loading'))}</div>`;
  probeSteps().then(detail => {
    STEPS = stepsFrom(R.steps || [], detail);
    ui.step = Math.min(ui.step, STEPS.length || 1);
    loadLooked();
    render();
    lookAt(ui.step);
    presence = startPresence({
      boot, api, slug: B.slug, round: R.number,
      onChange: renderAvatars,
      seen: () => { const p = looked.pending; looked.pending = {}; return p; },
      /* live refresh: the heartbeat's changed_at moving on means someone wrote; a server without it is polled */
      onBeat: r => {
        if (!r.changed_at) { refresh(); return; }
        if (lastChanged && r.changed_at > lastChanged) { refresh(); }
        lastChanged = r.changed_at;
      },
    });
    presence.start(B.viewers || []);
    loadBoards();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { refresh(); } });
  });
}
