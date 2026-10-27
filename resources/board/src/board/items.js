/*
 * What people add to the board themselves (T192 item 11, 2-board-payload.md "Items"): notes, text, pasted images,
 * dropped files, and drawings (pen, arrow, rectangle, ellipse).
 *
 * Every item hangs off an option group, so it stays put whatever the mode, device or zoom:
 *   - on a frame (anchor.on): x/y in that frame's own pixels, like pins; drawn in the frame's item layer
 *   - beside it: x/y from the top-left of the group's screens at zoom 1; drawn in the group's item layer
 * Anyone moves an item (and resizes a note). Only its author edits, recolours or deletes it.
 */
import { t } from './i18n.js';
import { $, $$, esc, clamp, shortDate, when, toast } from './util.js';
import { avatar } from './presence.js';

export const DRAW_TOOLS = ['note', 'text', 'pen', 'arrow', 'rect', 'ellipse'];
export const STROKES = { ink: '#1d2127', red: '#d6336c', orange: '#e8590c', green: '#2f9e44', blue: '#1c7ed6' };
export const STICKIES = { yellow: '#fff3bf', pink: '#ffdeeb', green: '#d3f9d8', blue: '#d0ebff' };
const ICON = { note: '🗒', text: '🗒', image: '🖼', file: '📎', arrow: '➚', rect: '▭', ellipse: '◯', stroke: '〰' };
const PAD = 8;

/* the bounding box of points, and the points relative to it */
export function boxOf(points) {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, points: points.map(([a, b]) => [Math.round(a - x), Math.round(b - y)]) };
}
/* anchor.on as sent in a form ("1"/"0") or as JSON */
const anchorOn = a => [true, 1, '1', 'true'].includes(a?.on);
export const isOn = it => anchorOn(it.anchor);
/* the same place: the same frame (option, device, screen), or beside the same option group */
export function sameAnchor(a, b) {
  if (anchorOn(a) !== anchorOn(b) || (a?.option ?? null) !== (b?.option ?? null)) { return false; }
  return !anchorOn(a) || (a.device === b.device && a.src === b.src);
}
/* what a move sends: x/y, plus the new anchor when the item was dropped onto a frame, off it, or onto another
   group (x/y are then in the new anchor's space) */
export function movePatch(it, tg) {
  if (!tg || sameAnchor(it.anchor, tg.anchor)) { return { x: Math.round(it.x), y: Math.round(it.y) }; }
  return { anchor: { ...tg.anchor, on: anchorOn(tg.anchor) }, x: Math.round(tg.x), y: Math.round(tg.y) };
}
/* does this item belong in this place? frames by option, device and src; groups by option */
export function onFrame(it, f) {
  return isOn(it) && (it.anchor.option ?? '') === (f.option ?? '') && it.anchor.device === f.device && it.anchor.src === f.src;
}
export function besideGroup(it, option) {
  return !isOn(it) && (it.anchor?.option ?? '') === (option ?? '');
}
/* one line per item: what the panel, the thread and the hover tip say */
export function summary(it) {
  const said = it.texts?.length ? `“${it.texts.slice(0, 3).join('”, “')}”` : '';
  switch (it.kind) {
    case 'note': case 'text': return it.text || '';
    case 'image': case 'file': return it.file?.name || '';
    case 'arrow': return said ? t('points_at', { what: said }) : t('arrow');
    case 'rect': return said ? t('boxed', { what: said }) : t('box_drawn');
    case 'ellipse': return said ? t('circled', { what: said }) : t('ellipse');
    default: return t('stroke');
  }
}
const kb = n => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const extOf = name => (String(name).includes('.') ? String(name).split('.').pop() : '').slice(0, 4).toUpperCase();
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'];
/* an image shows on the board; anything else (an svg too) is a file card */
export const kindOf = file => (file.type.startsWith('image/') && IMAGE_EXTS.includes(extOf(file.name).toLowerCase()) ? 'image' : 'file');
/* config lists extensions (the package) or MIME types; either works */
export function typeAllowed(file, types) {
  if (!Array.isArray(types) || !types.length) { return true; }
  const ext = extOf(file.name).toLowerCase();
  return types.some(x => (String(x).includes('/') ? x === file.type : String(x).toLowerCase() === ext));
}

export function createItems(ctx) {
  const { api, bridge, ME } = ctx;
  let ITEMS = (ctx.board().items || []).slice();
  let selected = null, editing = null, dragging = null, drawing = null, temp = -1;
  const state = { color: 'orange', noteColor: 'yellow', mouse: null };
  const isMine = it => it.mine ?? String(it.user?.id) === String(ME.id);
  const forStep = key => ITEMS.filter(it => it.step === key);
  const byId = id => ITEMS.find(it => String(it.id) === String(id));

  /* ---------- render ---------- */
  function itemHtml(it) {
    const sel = String(selected) === String(it.id) ? ' sel' : '';
    const pos = `left:${+it.x}px;top:${+it.y}px`;
    const base = `class="k-item k-i-${it.kind}${sel}${it.pending ? ' pending' : ''}" data-item="${it.id}"`;
    const stroke = STROKES[it.color] || STROKES.orange;
    if (it.kind === 'note') {
      return `<div ${base} style="${pos};width:${+it.w || 180}px;min-height:${+it.h || 120}px;background:${STICKIES[it.color] || STICKIES.yellow}"><div class="tx">${esc(it.text)}</div><span class="by">${esc(it.user?.name || '')}</span>${sel ? '<i class="rz"></i>' : ''}</div>`;
    }
    if (it.kind === 'text') {
      return `<div ${base} style="${pos};color:${STROKES[it.color] || STROKES.ink}"><div class="tx">${esc(it.text)}</div></div>`;
    }
    if (it.kind === 'image') {
      const src = it.file?.thumb || it.file?.url || it.preview || '';
      return `<div ${base} style="${pos};width:${+it.w || 240}px">${src ? `<img src="${esc(src)}" alt="" draggable="false" referrerpolicy="no-referrer">` : '<div class="ph"></div>'}
        <div class="cap"><span>${esc(it.file?.name || '')}</span>${it.pending ? `<span class="tnum">${Math.round(it.progress || 0)}%</span>` : ''}</div>${it.pending ? `<div class="prog"><i style="width:${it.progress || 0}%"></i></div>` : ''}</div>`;
    }
    if (it.kind === 'file') {
      const ext = extOf(it.file?.name);
      return `<div ${base} style="${pos}"><span class="ic" data-ext="${esc(ext)}">${esc(ext || 'FILE')}</span><span class="nm">${esc(it.file?.name || '')}</span>
        <span class="mt tnum">${it.file?.size ? kb(it.file.size) : ''}${it.pending ? ` · ${t('uploading')}` : it.file?.url ? ` · <a href="${esc(it.file.url)}" download rel="noopener">${t('download')}</a>` : ''}</span>${it.pending ? `<div class="prog"><i style="width:${it.progress || 0}%"></i></div>` : ''}</div>`;
    }
    /* drawings: an svg the size of the item plus a margin for the stroke */
    const w = Math.max(+it.w || 0, 1), h = Math.max(+it.h || 0, 1);
    const box = `width:${w + PAD * 2}px;height:${h + PAD * 2}px;left:${+it.x - PAD}px;top:${+it.y - PAD}px`;
    let shape = '';
    if (it.kind === 'rect') { shape = `<rect x="${PAD}" y="${PAD}" width="${w}" height="${h}" rx="4" fill="${stroke}14" stroke="${stroke}" stroke-width="2.5"/>`; }
    if (it.kind === 'ellipse') { shape = `<ellipse cx="${PAD + w / 2}" cy="${PAD + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${stroke}10" stroke="${stroke}" stroke-width="2.5"/>`; }
    if (it.kind === 'stroke' || it.kind === 'arrow') {
      const pts = (it.points || []).map(([a, b]) => `${a + PAD},${b + PAD}`).join(' ');
      shape = it.kind === 'arrow'
        ? `<defs><marker id="ah${it.id}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${stroke}"/></marker></defs><polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" marker-end="url(#ah${it.id})"/>`
        : `<polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    return `<svg ${base} style="${box}" viewBox="0 0 ${w + PAD * 2} ${h + PAD * 2}">${shape}<rect class="hit" x="0" y="0" width="${w + PAD * 2}" height="${h + PAD * 2}" fill="transparent"/></svg>`;
  }

  function render() {
    const st = ctx.step();
    if (!st) { return; }
    const list = forStep(st.key);
    $$('.k-ilayer').forEach(layer => { layer.innerHTML = list.filter(it => besideGroup(it, layer.dataset.opt)).map(itemHtml).join(''); });
    ctx.frames().forEach(f => {
      const inner = $('.k-flin', f.fig);
      if (!inner) { return; }
      inner.style.transform = f.crop ? '' : `translateY(${-f.scrollY}px)`;
      inner.innerHTML = list.filter(it => onFrame(it, where(f))).map(itemHtml).join('');
    });
    renderSelection();
  }
  const where = f => ({ option: f.opt.key || null, device: f.cell.dev, src: ctx.frameSrc(f) });

  /* ---------- where a point on the canvas lands: on a frame, or beside a group ---------- */
  const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  /* (cx, cy) picks the place; `at` is the screen point whose coordinates come back (the point itself by default) */
  function targetAt(cx, cy, at = { x: cx, y: cy }) {
    const z = ctx.view.z;
    const f = ctx.frames().find(x => inside(x.scr.getBoundingClientRect(), cx, cy));
    if (f) {
      const r = f.scr.getBoundingClientRect();
      return { f, layer: $('.k-flin', f.fig), anchor: { ...where(f), on: true }, x: (at.x - r.left) / z, y: (at.y - r.top) / z + (f.crop ? 0 : f.scrollY) };
    }
    const shots = $$('#board .shots');
    if (!shots.length) { return null; }
    const dist = s => { const r = s.getBoundingClientRect(); return Math.hypot(Math.max(r.left - cx, 0, cx - r.right), Math.max(r.top - cy, 0, cy - r.bottom)); };
    const s = shots.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    const r = s.getBoundingClientRect(), g = s.closest('.grp');
    const first = ctx.frames().find(x => g.contains(x.fig));
    return { layer: $('.k-ilayer', s), anchor: { option: g.dataset.key || null, device: first?.cell.dev || 'desktop', src: first ? ctx.frameSrc(first) : 'crop', on: false }, x: (at.x - r.left) / z, y: (at.y - r.top) / z };
  }
  /* a frame point in the coordinates the agent uses (viewport of the frame's document) */
  function agentPoint(tg, x, y) {
    const p = ctx.docPoint(tg.f, x, y - (tg.f.crop ? 0 : tg.f.scrollY));
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  /* ---------- drawing ---------- */
  function startDraw(tool, ev) {
    if (!ctx.canWrite()) { return; }
    const tg = targetAt(ev.clientX, ev.clientY);
    if (!tg) { return; }
    if (tool === 'note' || tool === 'text') { newText(tool, tg); return; }
    const ns = 'http://www.w3.org/2000/svg';
    const preview = document.createElementNS(ns, 'svg');
    preview.setAttribute('class', 'k-preview');
    tg.layer.appendChild(preview);
    drawing = { tool, tg, points: [[tg.x, tg.y]], preview };
    const move = e => {
      const p = toLayer(tg, e);
      if (tool === 'pen') { drawing.points.push([p.x, p.y]); } else { drawing.points[1] = [p.x, p.y]; }
      drawPreview();
    };
    const up = async () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      const d = drawing;
      drawing = null;
      d.preview.remove();
      if (d.points.length < 2) { return; }
      await finishDraw(d);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }
  function toLayer(tg, e) {
    const z = ctx.view.z;
    const host = tg.f ? tg.f.scr : tg.layer.parentElement;
    const r = host.getBoundingClientRect();
    return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z + (tg.f && !tg.f.crop ? tg.f.scrollY : 0) };
  }
  function drawPreview() {
    const d = drawing, c = STROKES[state.color];
    const pts = d.points;
    const b = boxOf(pts.length > 1 ? pts : [...pts, pts[0]]);
    Object.assign(d.preview.style, { left: `${b.x - PAD}px`, top: `${b.y - PAD}px`, width: `${b.w + PAD * 2}px`, height: `${b.h + PAD * 2}px` });
    d.preview.setAttribute('viewBox', `0 0 ${b.w + PAD * 2} ${b.h + PAD * 2}`);
    const rel = b.points.map(([a, y]) => `${a + PAD},${y + PAD}`).join(' ');
    d.preview.innerHTML = d.tool === 'rect' ? `<rect x="${PAD}" y="${PAD}" width="${b.w}" height="${b.h}" rx="4" fill="${c}14" stroke="${c}" stroke-width="2.5"/>`
      : d.tool === 'ellipse' ? `<ellipse cx="${PAD + b.w / 2}" cy="${PAD + b.h / 2}" rx="${b.w / 2}" ry="${b.h / 2}" fill="none" stroke="${c}" stroke-width="2.5"/>`
      : `<polyline points="${rel}" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  async function finishDraw(d) {
    const kind = d.tool === 'pen' ? 'stroke' : d.tool;
    const b = boxOf(d.points);
    if (kind !== 'stroke' && kind !== 'arrow' && (b.w < 6 || b.h < 6)) { return; }
    if (kind === 'arrow' && Math.hypot(b.w, b.h) < 12) { return; }
    const fields = { kind, anchor: d.tg.anchor, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h), color: state.color };
    if (kind === 'stroke' || kind === 'arrow') { fields.points = b.points; }
    /* the text a box covers, or the text an arrow points at, read by the frame's agent */
    if (d.tg.f && (kind === 'rect' || kind === 'ellipse')) {
      const o = agentPoint(d.tg, b.x, b.y);
      const r = await bridge.ask(d.tg.f.ifr.contentWindow, 'box', { rect: { x: o.x, y: o.y, w: b.w, h: b.h } });
      if (r?.texts?.length) { fields.texts = r.texts; }
    }
    if (d.tg.f && kind === 'arrow') {
      const tip = d.points.at(-1);
      const r = await bridge.ask(d.tg.f.ifr.contentWindow, 'hit', agentPoint(d.tg, tip[0], tip[1]));
      if (r?.text) { fields.texts = [r.text]; }
    }
    if (d.tg.f && kind === 'stroke') {
      const mid = d.points[Math.floor(d.points.length / 2)];
      const r = await bridge.ask(d.tg.f.ifr.contentWindow, 'hit', agentPoint(d.tg, mid[0], mid[1]));
      if (r?.text) { fields.texts = [r.text]; }
    }
    await create(fields);
  }

  /* a note or a line of text, typed in place */
  function newText(kind, tg, text = '') {
    const it = { id: temp--, pending: false, draft: true, kind, step: ctx.step().key, user: { id: ME.id, name: ME.name, avatar: ME.avatar ?? null }, mine: true,
      anchor: tg.anchor, x: Math.round(tg.x), y: Math.round(tg.y), w: kind === 'note' ? 180 : 0, h: kind === 'note' ? 120 : 0,
      color: kind === 'note' ? state.noteColor : 'ink', text, created_at: new Date().toISOString() };
    ITEMS.push(it);
    render();
    edit(it.id);
    return it;
  }
  function edit(id) {
    const it = byId(id);
    if (!it || !isMine(it) || !['note', 'text'].includes(it.kind)) { return; }
    const el = $(`[data-item="${id}"] .tx`);
    if (!el) { return; }
    editing = id;
    el.contentEditable = 'plaintext-only';
    el.focus();
    getSelection().selectAllChildren(el);
    const done = async keep => {
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('keydown', onKey);
      editing = null;
      const text = el.innerText.trim();
      if (!keep || !text) {
        if (it.draft) { ITEMS = ITEMS.filter(x => x !== it); } else { el.textContent = it.text; }
        render();
        return;
      }
      if (it.draft) {
        ITEMS = ITEMS.filter(x => x !== it);
        await create({ kind: it.kind, anchor: it.anchor, x: it.x, y: it.y, w: it.w, h: it.h, color: it.color, text });
      } else if (text !== it.text) {
        await patch(it, { text });
      } else { render(); }
    };
    const onBlur = () => done(true);
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || it.kind === 'text')) { e.preventDefault(); el.blur(); }
    };
    el.addEventListener('blur', onBlur);
    el.addEventListener('keydown', onKey);
  }

  /* ---------- writes ---------- */
  async function create(fields) {
    const body = { round: ctx.round().number, step: ctx.step().key, ...fields };
    const local = { ...body, id: temp--, pending: true, user: { id: ME.id, name: ME.name, avatar: ME.avatar ?? null }, mine: true, created_at: new Date().toISOString() };
    ITEMS.push(local);
    render();
    try {
      const it = await api.createItem(ctx.board().slug, body);
      ITEMS = ITEMS.map(x => (x === local ? it : x));
    } catch { ITEMS = ITEMS.filter(x => x !== local); toast(t('save_failed')); }
    changed();
  }
  async function patch(it, fields) {
    const before = { ...it };
    Object.assign(it, fields);
    render();
    try {
      const fresh = await api.patchItem(it.id, fields);
      ITEMS = ITEMS.map(x => (x.id === it.id ? fresh : x));
    } catch { Object.assign(it, before); toast(t('save_failed')); }
    changed();
  }
  async function remove(it) {
    if (!isMine(it)) { return; }
    ITEMS = ITEMS.filter(x => x !== it);
    selected = null;
    changed();
    try { await api.deleteItem(it.id); } catch { ITEMS.push(it); toast(t('save_failed')); changed(); }
  }
  function changed() { render(); ctx.onChange(); }

  /* ---------- paste and drop: images and files upload, text becomes a note ---------- */
  function landing(cx, cy) {
    const cv = $('#canvas').getBoundingClientRect();
    const m = state.mouse;
    /* at the mouse when it is over the canvas (owner's pick A), else the middle of what is in view */
    if (cx !== undefined) { return targetAt(cx, cy); }
    if (m && inside(cv, m.x, m.y)) { return targetAt(m.x, m.y); }
    return targetAt(cv.left + cv.width / 2, cv.top + cv.height / 2);
  }
  function allowed(file) {
    const u = ctx.board().uploads || {};
    if (u.max_kb && file.size > u.max_kb * 1024) { toast(t('too_big', { name: file.name, max: kb(u.max_kb * 1024) })); return false; }
    if (!typeAllowed(file, u.types)) { toast(t('type_not_allowed', { name: file.name })); return false; }
    return true;
  }
  function upload(file, tg, offset = 0) {
    /* several files at once land in a row */
    if (!allowed(file)) { return; }
    const kind = kindOf(file);
    const local = { id: temp--, pending: true, progress: 0, kind, step: ctx.step().key, user: { id: ME.id, name: ME.name, avatar: ME.avatar ?? null }, mine: true,
      anchor: tg.anchor, x: Math.round(tg.x + offset), y: Math.round(tg.y), w: kind === 'image' ? 240 : 0, h: 0,
      file: { name: file.name, type: file.type, size: file.size }, preview: kind === 'image' ? URL.createObjectURL(file) : null, created_at: new Date().toISOString() };
    ITEMS.push(local);
    render();
    const fields = { round: ctx.round().number, step: local.step, kind, x: local.x, y: local.y, w: local.w, h: 0,
      'anchor[option]': local.anchor.option ?? '', 'anchor[device]': local.anchor.device, 'anchor[src]': local.anchor.src, 'anchor[on]': local.anchor.on ? '1' : '0' };
    api.uploadItem(ctx.board().slug, fields, file, pct => {
      local.progress = pct;
      const el = $(`[data-item="${local.id}"]`);
      el?.querySelectorAll('.prog i').forEach(i => { i.style.width = `${pct}%`; });
      const n = el?.querySelector('.cap .tnum');
      if (n) { n.textContent = `${Math.round(pct)}%`; }
    }).then(it => {
      if (local.preview) { URL.revokeObjectURL(local.preview); }
      ITEMS = ITEMS.map(x => (x === local ? it : x));
      changed();
    }).catch(() => {
      ITEMS = ITEMS.filter(x => x !== local);
      toast(t('upload_failed', { name: file.name }));
      changed();
    });
  }
  function onPaste(e) {
    if (!ctx.canWrite() || e.target.closest?.('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]')) { return; }
    const files = [...(e.clipboardData?.files || [])];
    const text = e.clipboardData?.getData('text/plain')?.trim();
    if (!files.length && !text) { return; }
    e.preventDefault();
    const tg = landing();
    if (!tg) { return; }
    if (files.length) { files.forEach((f, i) => upload(f, tg, i * 264)); return; }
    create({ kind: 'note', anchor: tg.anchor, x: Math.round(tg.x), y: Math.round(tg.y), w: 180, h: 120, color: state.noteColor, text: text.slice(0, 5000) });
  }
  function onDrop(e) {
    $('#canvas')?.classList.remove('dropping');
    if (!ctx.canWrite() || !e.dataTransfer?.files?.length) { return; }
    e.preventDefault();
    const tg = landing(e.clientX, e.clientY);
    if (tg) { [...e.dataTransfer.files].forEach((f, i) => upload(f, tg, i * 264)); }
  }

  /* ---------- select, move, resize ---------- */
  function select(id) { selected = id; render(); }
  function renderSelection() {
    $('.k-ibar')?.remove();
    const it = selected !== null && byId(selected);
    const el = it && $(`[data-item="${it.id}"]`);
    if (!el || editing !== null) { return; }
    const r = el.getBoundingClientRect();
    const bar = document.createElement('div');
    bar.className = 'k-ibar';
    const mine = isMine(it) && ctx.canWrite();
    const palette = it.kind === 'note' ? STICKIES : ['image', 'file'].includes(it.kind) ? {} : STROKES;
    bar.innerHTML = mine
      ? Object.entries(palette).map(([k, c]) => `<button class="sw ${k === it.color ? 'on' : ''}" data-icolor="${k}" style="background:${c}" aria-label="${k}"></button>`).join('')
        + (Object.keys(palette).length ? '<span class="vr"></span>' : '')
        + (['note', 'text'].includes(it.kind) ? `<button data-iedit>${t('edit')}</button>` : '')
        + (it.file?.url ? `<a href="${esc(it.file.url)}" download rel="noopener">${t('download')}</a>` : '')
        + `<button data-idel>${t('delete')}</button>`
      : `<span class="note">${esc(t('item_of', { name: it.user?.name || '', date: shortDate(it.created_at, true) }))}</span>${it.file?.url ? `<a href="${esc(it.file.url)}" download rel="noopener">${t('download')}</a>` : ''}`;
    document.body.appendChild(bar);
    bar.style.left = `${clamp(r.left, 8, innerWidth - bar.offsetWidth - 8)}px`;
    bar.style.top = `${r.bottom + 8 + bar.offsetHeight > innerHeight ? r.top - bar.offsetHeight - 8 : r.bottom + 8}px`;
  }
  function startMove(it, ev) {
    const el = $(`[data-item="${it.id}"]`);
    if (!el) { return; }
    const sx = ev.clientX, sy = ev.clientY, x0 = +it.x, y0 = +it.y;
    const resizing = ev.target.closest('.rz') && it.kind === 'note';
    const w0 = +it.w || 180, h0 = +it.h || 120;
    let moved = false;
    dragging = it.id;
    $('.k-ibar')?.remove();
    const move = e => {
      const dx = (e.clientX - sx) / ctx.view.z, dy = (e.clientY - sy) / ctx.view.z;
      if (!moved && Math.hypot(dx, dy) < 3) { return; }
      moved = true;
      if (resizing) {
        it.w = Math.round(clamp(w0 + dx, 100, 600));
        it.h = Math.round(clamp(h0 + dy, 60, 600));
        el.style.width = `${it.w}px`;
        el.style.minHeight = `${it.h}px`;
      } else {
        it.x = Math.round(x0 + dx);
        it.y = Math.round(y0 + dy);
        const pad = el.tagName.toLowerCase() === 'svg' ? PAD : 0;
        el.style.left = `${it.x - pad}px`;
        el.style.top = `${it.y - pad}px`;
      }
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      dragging = null;
      if (!moved || it.id <= 0) { renderSelection(); return; }
      if (resizing) { patch(it, { w: it.w, h: it.h }); return; }
      /* where it was dropped decides its anchor: its middle picks the frame or group, its top-left becomes x/y there */
      const r = el.getBoundingClientRect(), pad = el.tagName.toLowerCase() === 'svg' ? PAD * ctx.view.z : 0;
      patch(it, movePatch(it, targetAt(r.left + r.width / 2, r.top + r.height / 2, { x: r.left + pad, y: r.top + pad })));
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  /* ---------- the panel: the ข้อมูลเพิ่มเติม tab (pick B) and items in the thread (pick C) ---------- */
  function rowHtml(it) {
    const thumb = it.kind === 'image' && (it.file?.thumb || it.preview) ? `<img class="th" src="${esc(it.file?.thumb || it.preview)}" alt="" referrerpolicy="no-referrer">` : '';
    const file = it.kind === 'file' && it.file?.url ? ` · <a href="${esc(it.file.url)}" download rel="noopener">${t('download')}</a>` : '';
    const where = isOn(it) && it.anchor.option ? ` ${t('on_option', { o: it.anchor.option })}` : '';
    return `<div class="k-irow" data-goitem="${it.id}"><span class="ic k-i-ic-${it.kind}">${ICON[it.kind] || '•'}</span><span class="h"><b>${esc(it.user?.name || '')}</b> ${esc(when(it.created_at))}</span>
      <span class="b">${esc(summary(it))}${esc(where)}${file}</span>${thumb}</div>`;
  }
  function tabHtml(key) {
    const list = forStep(key);
    return list.length ? `<div class="k-ilist">${list.map(rowHtml).join('')}</div>` : `<div class="k-lab">${t('no_items')}</div>`;
  }
  /* an item as an entry of the thread, with its replies (comments whose item_id is this item) */
  function threadEntry(it, comments, commentHtml, composer) {
    const replies = comments.filter(c => String(c.item_id) === String(it.id));
    const thumb = it.kind === 'image' && (it.file?.thumb || it.preview) ? `<img class="th" src="${esc(it.file?.thumb || it.preview)}" alt="" referrerpolicy="no-referrer">` : '';
    const file = it.kind === 'file' && it.file?.url ? ` · <a href="${esc(it.file.url)}" download rel="noopener">${t('download')}</a>` : '';
    return `<div class="k-cm k-icm" data-goitem="${it.id}">${avatar(it.user, { tip: it.user?.name })}<div class="h"><b>${esc(it.user?.name || '')}</b><span>${esc(when(it.created_at))} · ${esc(t(`added_${it.kind}`))}</span></div>
      <div class="b"><span class="k-i-ic">${ICON[it.kind] || ''}</span> ${esc(summary(it))}${file}</div>${thumb ? `<div class="b">${thumb}</div>` : ''}
      ${ctx.canWrite() && it.id > 0 ? `<div class="acts"><button data-ireply="${it.id}">${t('reply')}</button></div>` : ''}
      ${replies.length ? `<div class="k-replies">${replies.map(r => commentHtml(r, false)).join('')}</div>` : ''}
      <div class="k-replybox" data-ireplybox="${it.id}" hidden>${composer(`item:${it.id}`, t('reply_ph'))}</div></div>`;
  }
  function goTo(id) {
    const it = byId(id);
    if (!it) { return; }
    select(it.id);
    const el = $(`[data-item="${it.id}"]`);
    if (el) { ctx.centerOn(el); }
  }

  /* ---------- tooltip: who added it and when ---------- */
  let tip = null;
  function showTip(it, e) {
    if (!tip) { tip = Object.assign(document.createElement('div'), { className: 'k-itip' }); document.body.appendChild(tip); }
    tip.textContent = `${ICON[it.kind] || ''} ${it.user?.name || ''} ${shortDate(it.created_at, true)}${['note', 'text'].includes(it.kind) ? '' : ` · ${summary(it)}`}`;
    tip.style.left = `${Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8)}px`;
    tip.style.top = `${e.clientY + 16}px`;
    tip.hidden = false;
  }
  function hideTip() { if (tip) { tip.hidden = true; } }

  /* ---------- events the board forwards ---------- */
  function pointerDown(e) {
    if (e.button !== 0) { return false; }
    const el = e.target.closest?.('[data-item]');
    const tool = ctx.tool();
    if (DRAW_TOOLS.includes(tool) && e.target.closest('#canvas') && !e.target.closest('.k-tools, .k-mini, button, .k-ibar') && !el?.matches('.k-i-note, .k-i-text')) {
      e.preventDefault();
      startDraw(tool, e);
      return true;
    }
    if (el && (tool === 'hand' || tool === 'use') && !e.target.closest('a')) {
      const it = byId(el.dataset.item);
      if (!it || editing !== null) { return false; }
      e.preventDefault();
      e.stopPropagation();
      select(it.id);
      if (ctx.canWrite()) { startMove(it, e); }
      return true;
    }
    if (selected !== null && !e.target.closest('.k-ibar, .k-panel')) { selected = null; render(); }
    return false;
  }
  function click(e) {
    const b = e.target.closest('[data-icolor], [data-iedit], [data-idel], [data-ireply], [data-goitem]');
    if (!b) { return false; }
    if (b.closest('a') || e.target.closest('a')) { return false; }
    const it = byId(selected);
    if (b.dataset.icolor && it) { patch(it, { color: b.dataset.icolor }); return true; }
    if (b.dataset.iedit !== undefined && it) { $('.k-ibar')?.remove(); edit(it.id); return true; }
    if (b.dataset.idel !== undefined && it) { remove(it); return true; }
    if (b.dataset.ireply) { const box = $(`[data-ireplybox="${b.dataset.ireply}"]`); if (box) { box.hidden = false; $('textarea', box)?.focus(); } return true; }
    if (b.dataset.goitem && !e.target.closest('.k-replies, .k-replybox, .acts')) { goTo(b.dataset.goitem); return true; }
    return false;
  }
  function keyDown(e) {
    if (editing !== null || e.target.closest?.('input, textarea, [contenteditable]')) { return false; }
    const it = selected !== null && byId(selected);
    if (it && (e.key === 'Delete' || e.key === 'Backspace') && isMine(it)) { e.preventDefault(); remove(it); return true; }
    if (it && e.key === 'Enter' && isMine(it)) { e.preventDefault(); edit(it.id); return true; }
    if (it && e.key === 'Escape') { select(null); return true; }
    return false;
  }
  function dblclick(e) {
    const el = e.target.closest?.('[data-item]');
    if (!el) { return false; }
    edit(el.dataset.item);
    return true;
  }

  document.addEventListener('paste', onPaste);
  document.addEventListener('dragover', e => {
    if (!ctx.canWrite() || ![...(e.dataTransfer?.types || [])].includes('Files') || !e.target.closest('#canvas')) { return; }
    e.preventDefault();
    $('#canvas').classList.add('dropping');
  });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget || !e.relatedTarget.closest?.('#canvas')) { $('#canvas')?.classList.remove('dropping'); } });
  document.addEventListener('drop', e => { if (e.target.closest?.('#canvas')) { onDrop(e); } });
  document.addEventListener('mousemove', e => {
    state.mouse = { x: e.clientX, y: e.clientY };
    const el = e.target.closest?.('[data-item]');
    const it = el && !dragging && byId(el.dataset.item);
    if (it) { showTip(it, e); } else { hideTip(); }
  });

  /* fresh items from the server; whatever is being typed or dragged here stays as it is */
  function merge(fresh) {
    const keep = ITEMS.filter(x => x.pending || x.draft || String(x.id) === String(editing) || String(x.id) === String(dragging));
    ITEMS = [...fresh.filter(x => !keep.some(k => String(k.id) === String(x.id))), ...keep];
    render();
  }

  return {
    render, merge, pointerDown, click, keyDown, dblclick, tabHtml, threadEntry, state, renderSelection,
    forStep, all: () => ITEMS, busy: () => editing !== null || dragging !== null || drawing !== null,
    deselect: () => { selected = null; $('.k-ibar')?.remove(); },
  };
}
