/*
 * The board: the design skill's workbench (~/.claude/skills/design/workbench) ported to Kradan.
 *  - Frames are sandboxed (`sandbox="allow-scripts"`, an opaque origin) and load the round's signed
 *    base_url. Crops, pins, boxes, text edits and scroll sync go through agent.js over postMessage.
 *  - Answers live on the server (picks, comments, pins, edits) and save as they are made. localStorage only
 *    keeps UI conveniences; the view itself (step, mode, zoom…) lives in the URL.
 */
import { t } from './i18n.js';
import { $, $$, esc, clamp, shortDate, when, toast, modal, copyText } from './util.js';
import { createApi } from './api.js';
import { createBridge, allowedOrigins } from '../bridge.js';
import { avatar, avatarRow, startPresence } from './presence.js';

const DEV = {
  desktop: { w: 1440, h: 900, icon: '<rect x="2" y="4" width="20" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/>' },
  laptop: { w: 1280, h: 800, icon: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>' },
  tablet: { w: 820, h: 1180, icon: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M11 18h2"/>' },
  phone: { w: 390, h: 844, icon: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>' },
};
const DEV_ORDER = ['desktop', 'laptop', 'tablet', 'phone'];
const TOOLS = ['hand', 'use', 'box', 'edit', 'pin'];
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
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11.5V4a1.5 1.5 0 0 1 3 0v7.5"/><path d="M14 11.5V5.5a1.5 1.5 0 0 1 3 0V14"/><path d="M8 12.5 6.6 11a1.6 1.6 0 0 0-2.4 2.1L8 18.5A5 5 0 0 0 12 21h1a5 5 0 0 0 5-5v-4.5a1.5 1.5 0 0 0-3 0"/>',
  use: '<path d="M5 3l14 7-6 2-2 6z"/>',
  box: '<rect x="4" y="5" width="16" height="14" rx="1.5" stroke-dasharray="3 2.4"/>',
  edit: '<path d="M4 7V5h11v2M9.5 5v14M7 19h5"/><path d="M15 15l4-4 2 2-4 4h-2z"/>',
  pin: '<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
};
const svg = (k, inner = IC[k]) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const ib = (attrs, k, tip, end = false) => `<button class="k-ib" ${attrs} data-tip="${esc(tip)}" ${end ? 'data-tip-end' : ''}>${svg(k)}</button>`;

export function mountBoard(boot, root) {
  const api = createApi(boot);
  const ME = boot.user || {};
  const Q = new URLSearchParams(location.search);
  let B = boot.board;
  const LATEST = () => B.rounds.at(-1)?.number;
  let R = B.rounds.find(r => r.number === B.current) || B.rounds.at(-1);
  const OLD = () => R.number !== LATEST();
  const DECISION = () => B.kind === 'decision';
  const CAN_PICK = () => DECISION() && !OLD() && B.status === 'open' && !B.picks_locked;
  const CAN_WRITE = () => !OLD();

  const ui = {
    step: Math.max(1, +Q.get('step') || 1),
    mode: ['options', 'sizes', 'real'].includes(Q.get('mode')) ? Q.get('mode') : 'options',
    dev: (Q.get('dev') || '').split(',').filter(d => DEV[d]),
    zoom: Q.get('zoom') || 'fit',
    arr: Q.get('arr') || 'auto',
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
  const threads = key => COMMENTS.filter(c => c.step === key);
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
      if (ui.zoom !== 'fit') { p.set('zoom', ui.zoom); }
      if (ui.arr !== 'auto') { p.set('arr', ui.arr); }
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
  const brand = boot.brand || {};
  root.innerHTML = `<div class="k-app" id="app">
    <header class="k-bar">
      ${ib('data-act="side"', 'side', t('side'))}
      <a class="k-brand" href="${esc(boot.routes?.index || '/kradan')}">${brand.logo ? `<img class="k-logo" src="${esc(brand.logo)}" alt="">` : `<span class="k-logo">${esc((brand.name || 'K').slice(0, 2))}</span>`}<span class="k-bname">${esc(brand.name || 'Kradan')}</span></a>
      <span class="k-crumb">/</span>
      <button class="k-ttl" id="ttl" data-act="rounds"></button>
      <span class="k-old" id="oldr" hidden>${t('old_round')}</span>
      <button class="k-btn k-fresh" data-act="latest" id="latestb" hidden>${t('latest_round')}</button>
      <span class="k-sep"></span>
      <span class="k-pager tnum">${ib('data-act="prev"', 'prev', t('prev'))}<span id="pos"></span>${ib('data-act="next"', 'next', t('next'))}</span>
      <span class="k-sep"></span>
      <span class="k-grp" id="mode">${ib('data-mode="options"', 'options', t('mode_options'))}${ib('data-mode="sizes"', 'sizes', t('mode_sizes'))}<button class="k-ib" data-mode="real" data-tip="${esc(t('mode_real'))}"><span class="k-one">1:1</span></button></span>
      <span class="k-sep"></span>
      <span class="k-grp" id="devs"></span>
      <span class="k-sp"></span>
      <button class="k-btn k-fresh" data-act="reload" id="freshb" hidden data-tip="${esc(t('fresh_tip'))}" data-tip-end>${t('fresh')}</button>
      <span class="k-avs" id="avs"></span>
      <span class="k-sep"></span>
      <span class="k-zoom tnum">${ib('data-act="zout"', 'zout', t('zoom_out'))}<button class="k-pct" id="zpct" data-act="z100" data-tip="${esc(t('zoom_100'))}"></button>${ib('data-act="zin"', 'zin', t('zoom_in'))}${ib('data-act="fit" id="fitb"', 'fit', t('fit'))}</span>
      ${ib('data-act="arr" id="arr"', 'arr', t('arrange'))}${ib('data-act="sync" id="sync"', 'sync', t('sync'))}${ib('data-act="mini" id="minib"', 'mini', t('mini'), true)}
      ${ib('data-act="panel"', 'panel', t('panel'), true)}
      <span id="decideb"></span>
      <button class="k-btn k-primary" data-act="copy">${t('copy')}</button>
    </header>
    <nav class="k-side" id="side"></nav>
    <main class="k-canvas" id="canvas"></main>
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
      if (r?.rect) { recrop(f, r.rect); } else if (f.cell.shot.whole) { wholePage(f); }
    }
    applyEdits(f);
  }
  /* a page with no steps shows whole, at its own height */
  async function wholePage(f) {
    const m = await bridge.ask(f.ifr.contentWindow, 'measure');
    if (!m) { return; }
    f.crop = { x: 0, y: 0, w: f.size.w, h: Math.min(6000, m.height) };
    f.ifr.style.height = f.crop.h + 'px';
    sizeFrames();
    if (ui.zoom === 'fit' && !userMoved) { fit(); } else { applyView(); }
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
    app.classList.toggle('flow', !DECISION());
    renderBar();
    $$('#mode button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === ui.mode));
    $('#sync').setAttribute('aria-pressed', ui.sync);
    $('#minib').setAttribute('aria-pressed', ui.mini);
    $('#arr').style.display = ui.mode === 'real' ? 'none' : '';
    renderDevs(st);
    renderSide();
    renderPanel();
    renderCanvas();
  }
  function renderBar() {
    $('#ttl').innerHTML = `<span class="k-t">${esc(B.title)}</span><span class="k-round">${esc(t('round_n', { n: R.number }))}</span>${B.rounds.length > 1 ? '<span class="k-caret">▾</span>' : ''}`;
    $('#ttl').dataset.tip = R.title;
    $('#oldr').hidden = $('#latestb').hidden = !OLD();
    $('#pos').textContent = `${ui.step}/${STEPS.length}`;
    const canDecide = DECISION() && ME.can?.manage && B.status === 'open' && !OLD();
    $('#decideb').innerHTML = B.status !== 'open'
      ? `<span class="k-status">${esc(t('decided_on', { date: shortDate(B.decided_at) }))}</span>`
      : canDecide ? `<button class="k-btn" data-act="decide">${t('decide')}</button>` : '';
  }
  function renderDevs(st) {
    const active = devsFor(st);
    $('#devs').innerHTML = DEV_ORDER.map(d => `<button class="k-ib" data-dev="${d}" data-tip="${esc(devName(d))} ${DEV[d].w}" aria-pressed="${active.includes(d) && !(ui.mode === 'real' && ui.w)}">${svg(d, DEV[d].icon)}</button>`).join('');
  }

  /* one line under each step in the list: picks (grey), and มีอัปเดต (the one coloured state) */
  function stepMark(s, n) {
    const ps = picksFor(s.key);
    let ans;
    if (DECISION() && s.pickable) {
      const counts = s.options.map(o => [o.key, ps.filter(p => p.options.includes(o.key)).length]).filter(([, c]) => c);
      const skip = ps.filter(p => p.seen).length;
      ans = [...counts.map(([k, c]) => `<b>${esc(k)}</b> ${c}`), skip ? `${t('skipped')} ${skip}` : ''].filter(Boolean).join(' · ');
    } else if (DECISION()) {
      const read = ps.filter(p => p.seen).length;
      ans = read ? `${t('read')} ${read}` : '';
    }
    const cm = threads(s.key).length;
    ans = [ans, cm ? t('comments_n', { n: cm }) : ''].filter(Boolean).join(' · ') || (DECISION() ? (s.pickable ? t('not_picked') : t('not_read')) : '');
    return looked.upd.has(n) ? `<span class="k-upd">${isNew(s) ? t('new_step') : t('updated')}</span>${ans ? ' · ' + ans : ''}` : ans;
  }
  /* how far each person got: "สมชาย 6 / 6" */
  function progress() {
    const people = new Map();
    PICKS.forEach(p => people.set(String(p.user.id), p.user));
    COMMENTS.forEach(c => { people.set(String(c.user.id), c.user); (c.replies || []).forEach(r => people.set(String(r.user.id), r.user)); });
    return [...people.values()].map(u => ({ u, done: STEPS.filter(s => answeredBy(u.id, s.key)).length }))
      .sort((a, b) => b.done - a.done);
  }
  function renderSide() {
    const prog = DECISION() && STEPS.length > 1 ? progress() : [];
    const viewers = !DECISION() ? (presence?.state.viewers || B.viewers || []) : [];
    $('#side').innerHTML = (prog.length ? `<div class="k-prog tnum">${prog.map(x => esc(t('progress', { name: x.u.name.split(/\s+/)[0], done: x.done, total: STEPS.length }))).join(' · ')}</div>` : '')
      + (viewers.length ? `<div class="k-prog">${viewers.slice(0, 4).map(v => `${esc(v.user.name.split(/\s+/)[0])} ${esc(shortDate(v.last_seen_at))}`).join(' · ')}</div>` : '')
      + STEPS.map((s, i) => {
        const n = i + 1;
        const head = s.group && s.group !== STEPS[i - 1]?.group ? `<h4 class="k-sec">${esc(s.group)}</h4>` : '';
        const mark = stepMark(s, n);
        return `${head}<a href="#" data-step="${n}" aria-current="${n === ui.step}"><span class="n tnum">${n}</span><span class="t">${esc(s.title)}${mark ? `<br><span class="k">${mark}</span>` : ''}</span></a>`;
      }).join('');
  }

  function whoPicked(key, opt) {
    const names = picksFor(key).filter(p => p.options.includes(opt)).map(p => (isMe(p.user) ? t('you') : p.user.name));
    return names.length ? `<span class="k-who">${names.map(n => `<b>${esc(n)}</b>`).join(', ')}</span>` : '';
  }
  function renderPanel() {
    const st = step(), n = ui.step, key = st.key;
    const keys = myKeys(key);
    const seenBy = picksFor(key).filter(p => p.seen).map(p => (isMe(p.user) ? t('you') : p.user.name));
    const scroll = $('#panel').scrollTop;
    $('#panel').innerHTML = `
      ${st.group ? `<div class="k-kicker">${esc(st.group)}</div>` : ''}
      <h2>${esc(st.title)}</h2>
      ${looked.upd.has(n) ? `<div class="k-sub k-upd">${isNew(st) ? t('new_since') : t('updated_since')}</div>` : ''}
      ${st.sub ? `<p class="k-sub">${esc(st.sub)}</p>` : ''}
      ${DECISION() && st.pickable && CAN_PICK() ? `<div class="k-picktools"><button data-pickall ${keys.length === st.options.length ? 'disabled' : ''}>${t('pick_all')}</button><button data-pickclear ${keys.length ? '' : 'disabled'}>${t('clear')}</button></div>` : ''}
      ${DECISION() && st.pickable ? `<div class="k-ol">${st.options.map(o => `
        <label><input type="checkbox" name="pick" value="${esc(o.key)}" ${keys.includes(o.key) ? 'checked' : ''} ${CAN_PICK() ? '' : 'disabled'}>
          <span class="lb">${esc(o.key)} ${esc(o.label)}</span>${o.trade ? `<span class="tr">${esc(o.trade)}</span>` : ''}${whoPicked(key, o.key)}</label>`).join('')}</div>` : ''}
      ${DECISION() ? `<label class="k-seen"><input type="checkbox" name="seen" ${mySeen(key) ? 'checked' : ''} ${CAN_PICK() ? '' : 'disabled'}><span>${st.pickable ? `${t('skip')}<br><span class="tr">${t('skip_sub')}</span>` : t('read_box')}</span>${seenBy.length ? `<span class="k-who">${seenBy.map(esc).join(', ')}</span>` : ''}</label>` : ''}
      ${DECISION() ? '<div class="k-hr"></div>' : ''}
      <div class="k-lab">${threads(key).length ? esc(t('comments_n', { n: threads(key).length })) : esc(t('no_comments'))}</div>
      <div class="k-thread">${threads(key).map(c => commentHtml(c, true)).join('')}</div>
      ${CAN_WRITE() ? composer('') : ''}`;
    $('#panel').scrollTop = scroll;
  }
  function where(c) {
    const p = c.pin;
    if (!p) { return ''; }
    const dev = p.src === 'crop' ? '' : devName(p.device);
    if (c.edit) { return `<div class="k-at"><span class="k-pnum edit">✎</span>${esc([p.option, dev].filter(Boolean).join(' '))} “${esc(c.edit.from)}” → “${esc(c.edit.to)}”</div>`; }
    return `<div class="k-at" data-pinref="${c.id}"><span class="k-pnum ${p.box ? 'box' : ''}">${pinNo(c)}</span>${esc([p.option, dev, p.text ? `“${p.text}”` : ''].filter(Boolean).join(' '))}</div>`;
  }
  function commentHtml(c, top) {
    const mine = c.mine ?? isMe(c.user);
    const acts = CAN_WRITE() ? [top ? `<button data-reply="${c.id}">${t('reply')}</button>` : '', mine && !c.edit ? `<button data-cedit="${c.id}">${t('edit')}</button>` : '', mine ? `<button data-cdel="${c.id}">${t('delete')}</button>` : ''].join('') : '';
    const edited = c.updated_at && c.created_at && Date.parse(c.updated_at) - Date.parse(c.created_at) > 1000 ? ` · ${t('edited')}` : '';
    return `<div class="k-cm" id="c-${c.id}" data-cid="${c.id}">${avatar(c.user, { tip: c.user.name })}<div class="h"><b>${esc(c.user.name)}</b><span data-tip="${esc(shortDate(c.created_at, true))}">${esc(when(c.created_at))}${edited}</span></div>
      ${where(c)}${c.body ? `<div class="b">${esc(c.body)}</div>` : ''}${acts ? `<div class="acts">${acts}</div>` : ''}
      ${top && (c.replies || []).length ? `<div class="k-replies">${c.replies.map(r => commentHtml(r, false)).join('')}</div>` : ''}
      ${top ? `<div class="k-replybox" data-replybox="${c.id}" hidden></div>` : ''}</div>`;
  }
  const composer = (parent, ph = t('comment_ph')) => `<form class="k-compose" data-compose="${parent}"><textarea rows="1" placeholder="${esc(ph)}"></textarea><button class="k-btn" type="submit">${t('send')}</button></form>`;

  function renderCanvas() {
    closePop();
    const st = step();
    const cv = $('#canvas');
    bridge.clear();
    const groups = plan();
    cv.innerHTML = `<div class="k-board" id="board">${groups.map((g, gi) => groupHtml(st, g, gi)).join('')}</div>
      <div class="k-hint">${t('hint')}</div>
      <div class="k-tools" id="tools">${TOOLS.filter(k => CAN_WRITE() || k === 'hand' || k === 'use').map(k => `<button class="k-ib" data-tool="${k}" data-tip="${esc(t(`tool_${k}`))} (${({ hand: 'H', use: 'V', box: 'R', edit: 'E', pin: 'C' })[k]})">${svg(k)}</button>`).join('')}</div>
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
    if (ui.zoom === 'fit') { fit(); } else { view.z = clamp(+ui.zoom / 100 || 1, 0.05, 4); view.x = 32; view.y = 32; applyView(); }
  }
  function groupHtml(st, g, gi) {
    const picked = st.pickable && myKeys(st.key).includes(g.opt.key);
    const others = picksFor(st.key).filter(p => p.options.includes(g.opt.key) && !isMe(p.user));
    const head = (ui.mode === 'options' && st.pickable)
      ? `<div class="grp-h"><span class="key">${esc(g.opt.key)}</span><span class="lbl">${esc(g.opt.label)}</span>
         ${DECISION() ? `<span class="k-headwho">${others.length ? `${others.length + (picked ? 1 : 0)} ${t('picked')}` : ''}</span>` : ''}
         ${DECISION() && CAN_PICK() ? `<button class="pick" data-pick="${esc(g.opt.key)}">${picked ? t('picked') : t('pick')}</button>` : ''}</div>`
      : (g.shotCap ? `<div class="grp-h"><span class="lbl">${esc(g.shotCap)}</span></div>` : '');
    const cells = g.cells.map((c, ci) => `<figure class="k-fr" data-g="${gi}" data-c="${ci}">
        <figcaption><span class="cap">${esc(ui.mode === 'sizes' ? '' : c.shot.cap)}</span><span class="dim tnum"></span></figcaption>
        <div class="vp ${c.shot.crop ? 'crop' : c.dev}"><div class="scr"><div class="pinlayer"></div></div>${ui.mode === 'real' ? `<div class="handle" data-tip="${esc(t('drag_width'))}"></div>` : ''}</div>
      </figure>`).join('');
    return `<section class="grp ${picked ? 'picked' : ''}" data-key="${esc(g.opt.key)}">${head}<div class="shots">${cells}</div></section>`;
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
      if (w) { const c = picksFor(st.key).filter(p => p.options.includes(g.dataset.key)).length; w.textContent = c && (c > 1 || !on) ? `${c} ${t('picked')}` : ''; }
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
    view.z = ui.mode === 'real' ? 1 : measure(col);
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
  const peers = f => frames.filter(p => p !== f && !p.crop && p.cell.shot.raw?.split('#')[0] === f.cell.shot.raw?.split('#')[0]);

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
  function drawBox(f, ev) {
    if (!CAN_WRITE()) { return; }
    closePop(true);
    const start = framePoint(f, ev), layer = $('.pinlayer', f.fig);
    const mark = document.createElement('span');
    mark.className = 'boxmark';
    layer.appendChild(mark);
    let b = { x: start.x, y: start.y, w: 0, h: 0 };
    const move = e => {
      const p = framePoint(f, e);
      b = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
      Object.assign(mark.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
    };
    const up = async e => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      if (b.w < 6 || b.h < 6) { mark.remove(); return; }
      const o = docPoint(f, b.x, b.y);
      const r = await bridge.ask(f.ifr.contentWindow, 'box', { rect: { x: o.x, y: o.y, w: b.w, h: b.h } });
      mark.remove();
      const texts = r?.texts || [];
      openPop({ option: f.opt.key || null, device: f.cell.dev, src: frameSrc(f), x: Math.round(b.x), y: Math.round(b.y + (f.crop ? 0 : f.scrollY)), text: texts.slice(0, 3).join('”, “'), box: { w: Math.round(b.w), h: Math.round(b.h), texts } }, e);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
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
      if (body.parent_id) {
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
    const changed = JSON.stringify([fresh.picks, fresh.comments]) !== JSON.stringify([PICKS, COMMENTS]);
    B = { ...B, status: fresh.status, decided_at: fresh.decided_at, decided_by: fresh.decided_by, picks_locked: fresh.picks_locked };
    if (!changed) { return; }
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
    const tools = [['hand', 'H'], ['use', 'V'], ['box', 'R'], ['edit', 'E'], ['pin', 'C']].filter(([k]) => CAN_WRITE() || k === 'hand' || k === 'use')
      .map(([k, kb]) => item(`tool:${k}`, t(`tool_${k}`), kb, { check: ui.tool === k, ic: icon(k) })).join('');
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

  /* ---------- ตัดสินใจแล้ว ---------- */
  function openDecide() {
    const m = modal(`<div class="box narrow"><h2>${t('decide_title')}</h2><p class="k-sub">${t('decide_body')}</p>
      <div class="row"><button class="k-btn" data-x>${t('cancel')}</button><button class="k-btn k-primary" data-yes>${t('decide_ok')}</button></div></div>`);
    $('[data-yes]', m).onclick = async () => {
      try {
        const r = await api.decide(B.slug);
        const fresh = r?.board ?? r;
        B = { ...B, status: fresh?.status || 'decided', decided_at: fresh?.decided_at || new Date().toISOString(), picks_locked: true };
        m.remove();
        render();
      } catch { toast(t('save_failed')); }
    };
  }

  /* ---------- rounds: the title opens the list; ดูทุกรอบ shows every round's answers ---------- */
  const roundUrl = (r, n = 1) => `?${new URLSearchParams({ ...(r.number !== LATEST() ? { round: r.number } : {}), step: n })}`;
  function openRounds(anchor) {
    closeCtx();
    const el = document.createElement('div');
    el.className = 'k-ctx k-rmenu';
    el.innerHTML = [...B.rounds].reverse().map(r => `<button data-round="${r.number}"><span class="ck">${r.number === R.number ? '✓' : ''}</span><span class="rt"><b>${esc(r.title)}</b><span>${esc([shortDate(r.pushed_at), t('steps_n', { n: (r.steps || []).length })].join(' · '))}</span></span></button>`).join('')
      + `<hr><button data-allrounds><span class="ck"></span>${t('all_rounds')}</button>`;
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
    const tool = { KeyH: 'hand', KeyV: 'use', KeyC: 'pin', KeyR: 'box', KeyE: 'edit' }[code];
    if (tool) { setTool(tool); writeUrl(); return true; }
    if (code === 'KeyM') { toggleMini(); return true; }
    return false;
  }
  function spacePan(on) { $('#canvas').classList.toggle('spacepan', on); }
  function setTool(tool) {
    if (!CAN_WRITE() && !['hand', 'use'].includes(tool)) { tool = 'hand'; }
    ui.tool = tool;
    const cv = $('#canvas');
    TOOLS.forEach(k => cv.classList.toggle(`tool-${k}`, k === tool));
    if (tool !== 'edit') { endEdit(true); }
    $$('#tools button').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === tool));
    if (tool !== 'pin' && tool !== 'box') { closePop(false); }
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
  function focusComment(id) {
    if (!ui.panel) { ui.panel = true; $('#app').classList.remove('nopanel'); }
    const el = $(`#c-${id}`);
    if (!el) { return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1200);
  }

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const t0 = e.target.closest('button, a, .pinlayer, .pinmark, .boxmark');
    if (!t0) { return; }
    if (t0.matches('.pinmark, .boxmark') && t0.dataset.pin) { focusComment(t0.dataset.pin); return; }
    if (t0.classList.contains('pinlayer')) {
      const f = frames.find(x => x.fig.contains(t0));
      if (f && ui.tool === 'pin') { dropPin(f, e); }
      if (f && ui.tool === 'edit') { startEdit(f, e); }
      return;
    }
    if (t0.closest('.k-pop, .k-modal, .k-ctx')) { return; }
    const d = t0.dataset;
    if (d.step) { e.preventDefault(); go(+d.step); return; }
    if (d.tool) { setTool(d.tool); writeUrl(); return; }
    if (d.mode) { ui.mode = d.mode; ui.dev = []; ui.opt = ''; if (ui.mode === 'real') { ui.zoom = '100'; } else { ui.w = 0; ui.zoom = 'fit'; } render(); return; }
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
    if (d.dev) {
      const dv = d.dev;
      if (ui.mode === 'sizes') {
        const cur = devsFor(step());
        ui.dev = cur.includes(dv) ? cur.filter(x => x !== dv) : DEV_ORDER.filter(x => x === dv || cur.includes(x));
        if (!ui.dev.length) { ui.dev = [dv]; }
      } else { ui.dev = [dv]; ui.w = 0; }
      render();
      return;
    }
    const act = d.act;
    if (act === 'prev') { go(ui.step - 1); }
    if (act === 'next') { go(ui.step + 1); }
    if (act === 'sync') { ui.sync = !ui.sync; $('#sync').setAttribute('aria-pressed', ui.sync); writeUrl(); }
    if (act === 'mini') { toggleMini(); }
    if (act === 'arr') { ui.arr = $('#board')?.classList.contains('col') ? 'row' : 'col'; ui.zoom = 'fit'; writeUrl(); fit(); }
    if (act === 'fit') { ui.zoom = 'fit'; writeUrl(); fit(); }
    if (act === 'z100') { zoomCenter(1 / view.z); }
    if (act === 'zin') { zoomCenter(1.25); }
    if (act === 'zout') { zoomCenter(0.8); }
    if (act === 'side') { ui.side = !ui.side; $('#app').classList.toggle('noside', !ui.side); writeUrl(); requestAnimationFrame(() => (ui.zoom === 'fit' ? fit() : applyView())); }
    if (act === 'panel') { ui.panel = !ui.panel; $('#app').classList.toggle('nopanel', !ui.panel); writeUrl(); requestAnimationFrame(() => (ui.zoom === 'fit' ? fit() : applyView())); }
    if (act === 'copy') { openCopy(); }
    if (act === 'decide') { openDecide(); }
    if (act === 'rounds' && B.rounds.length > 1) { openRounds(t0); }
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
    const parent = form.dataset.compose ? +form.dataset.compose : null;
    const c = await postComment({ step: step().key, body: text, ...(parent ? { parent_id: parent } : {}) });
    if (!c) { ta.disabled = false; }
  });
  document.addEventListener('keydown', e => {
    if (e.target.closest?.('.k-compose textarea') && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.target.form?.requestSubmit(); return; }
    if (e.target.closest?.('textarea, input')) { return; }
    if (e.code === 'Space') { e.preventDefault(); spacePan(true); return; }
    if (!e.metaKey && !e.ctrlKey && !e.altKey && toolKey(e.code)) { return; }
    if (e.key === 'ArrowRight') { go(ui.step + 1); }
    if (e.key === 'ArrowLeft') { go(ui.step - 1); }
    if (e.shiftKey && e.code === 'Digit1') { ui.zoom = 'fit'; writeUrl(); fit(); }
    if (e.shiftKey && e.code === 'Digit0') { zoomCenter(1 / view.z); }
    if (e.key === 'Escape') { closeCtx(); closePop(false); $$('.k-modal').pop()?.remove(); }
  });
  document.addEventListener('keyup', e => { if (e.code === 'Space') { spacePan(false); } });
  document.addEventListener('change', e => {
    if (e.target.name === 'pick') { togglePick(e.target.value); }
    if (e.target.name === 'seen') { setPicks([], e.target.checked); }
  });
  document.addEventListener('input', e => {
    if (e.target.matches('.k-compose textarea')) { e.target.style.height = 'auto'; e.target.style.height = Math.min(200, e.target.scrollHeight) + 'px'; }
  });
  document.addEventListener('contextmenu', e => {
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
    const layer = e.target.closest('.pinlayer');
    if (layer && ui.tool === 'box' && e.button === 0) {
      e.preventDefault();
      const f = frames.find(x => x.fig.contains(layer));
      if (f) { drawBox(f, e); }
      return;
    }
    const cv = $('#canvas');
    const h = e.target.closest('.handle');
    if (h) {
      e.preventDefault();
      const f = frames[0], startX = e.clientX, startW = f.size.w;
      f.ifr.style.pointerEvents = 'none';
      const move = ev => { ui.w = Math.round(clamp(startW + (ev.clientX - startX) / view.z, 320, 1920)); f.size.w = ui.w; f.cell.dev = 'custom'; sizeFrames(); applyView(); };
      const up = () => { f.ifr.style.pointerEvents = ''; removeEventListener('pointermove', move); removeEventListener('pointerup', up); writeUrl(); renderDevs(step()); };
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
    if (!e.target.closest('#canvas') || e.target.closest('button, .pinlayer, .handle, .k-tools')) { return; }
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
  function renderAvatars(viewers, online) {
    $('#avs').innerHTML = avatarRow(viewers, { me: ME.id, online });
    if (!DECISION()) { renderSide(); }
  }

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
    });
    presence.start(B.viewers || []);
    setInterval(refresh, 30 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { refresh(); } });
  });
}
