/*
 * The workbench's review state in localStorage, read and written in the shape the old workbench kept
 * (`wb:<page path>:<data-dp title>`), so the answers carry over and the old index.html can still read them:
 *
 *   { picks: {n: [keys]}, notes: {n: text}, pins: [{type: 'pin'|'box', step: n, key, dev, crop, src, x, y, w?, h?,
 *     texts?, text, id, no, note}], edits: [{step: n, key, dev, crop, src, id, from, to}], seen: {n: true}, overall }
 *
 * Version 2 adds `comments` (every free comment, so a step can hold more than one) and keeps `notes` as their
 * joined text. Steps are numbered from 1, as before; the board's step keys map to them through the round's steps.
 * Everything here is pure, so node tests it without a browser.
 */
export const ME = { id: 'me', name: 'คุณ', avatar: null };

export function emptyState() {
  return { v: 2, picks: {}, notes: {}, pins: [], edits: [], seen: {}, overall: '', comments: [] };
}

/* an old (v1) state becomes v2: each step's note is its first comment */
export function upgrade(raw) {
  const s = { ...emptyState(), ...(raw || {}) };
  s.pins = Array.isArray(s.pins) ? s.pins : [];
  s.edits = Array.isArray(s.edits) ? s.edits : [];
  s.seen = s.seen || {};
  s.picks = s.picks || {};
  s.notes = s.notes || {};
  if (raw?.v !== 2) {
    s.comments = Object.entries(s.notes).filter(([, body]) => String(body || '').trim())
      .map(([n, body]) => ({ id: +n, step: +n, body: String(body).trim(), at: raw?.savedAt || '' }));
    s.v = 2;
  }
  s.comments = Array.isArray(s.comments) ? s.comments : [];
  return s;
}

/* notes stay the joined comments of a step, for review.json and the old workbench */
export function syncNotes(s) {
  const notes = {};
  s.comments.filter(c => !c.parent && !c.item).forEach(c => { notes[c.step] = notes[c.step] ? `${notes[c.step]}\n\n${c.body}` : c.body; });
  s.notes = notes;
  return s;
}

const picksOf = (s, n) => { const v = s.picks[n]; return Array.isArray(v) ? v : v ? [v] : []; };
const iso = ms => (ms > 1e11 ? new Date(ms).toISOString() : '');

/*
 * Frame sources: the old state kept a frame's absolute URL (or `crop:<step index>:<option>`); the board keeps the
 * block's data-src as written (or "crop"). `ctx.abs(raw)` resolves a data-src against the page.
 */
export function createMapper(steps, abs) {
  const keyOf = n => steps[n - 1]?.key;
  const nOf = key => steps.findIndex(s => s.key === key) + 1;
  const raws = new Map();
  steps.forEach(s => [s, ...(s.options || [])].forEach(o => (o.frames || []).forEach(f => { if (f.src) { raws.set(abs(f.src), f.src); } })));
  const rawOf = src => (src?.startsWith('crop:') ? 'crop' : raws.get(src) ?? src);
  const absOf = (src, n, option) => (src === 'crop' ? `crop:${n - 1}:${option || ''}` : abs(src));
  const pinOf = p => ({
    option: p.key || null, device: p.dev, src: p.crop ? 'crop' : rawOf(p.src), x: Math.round(+p.x || 0), y: Math.round(+p.y || 0),
    text: p.text || '', box: p.type === 'box' ? { w: Math.round(+p.w || 0), h: Math.round(+p.h || 0), texts: p.texts || [] } : null,
  });
  return { keyOf, nOf, rawOf, absOf, pinOf };
}

/* the board's picks and comments for one round's state */
export function toPayload(s, map, me = ME) {
  const picks = [];
  Object.keys({ ...s.picks, ...s.seen }).forEach(n => {
    const key = map.keyOf(+n), options = picksOf(s, n), seen = !!s.seen[n] && !options.length;
    if (key && (options.length || seen)) { picks.push({ step: key, user: me, options, seen, updated_at: '' }); }
  });
  const base = { user: me, mine: true, replies: [], item_id: null, parent_id: null };
  const free = s.comments.filter(c => !c.parent).map(c => ({
    ...base, id: c.id, step: map.keyOf(c.step) ?? c.key, body: c.body, pin: null, edit: null, item_id: c.item ?? null,
    created_at: c.at || '', updated_at: c.upd || c.at || '',
    replies: s.comments.filter(r => r.parent === c.id).map(r => ({ ...base, id: r.id, step: map.keyOf(r.step), body: r.body, parent_id: c.id, created_at: r.at || '', updated_at: r.upd || r.at || '' })),
  }));
  const pins = s.pins.map(p => ({ ...base, id: p.id, step: map.keyOf(p.step), body: p.note || '', pin: map.pinOf(p), edit: null, created_at: p.at || iso(p.id), updated_at: p.upd || p.at || iso(p.id) }));
  const edits = s.edits.map(x => ({ ...base, id: x.id, step: map.keyOf(x.step), body: '', pin: { ...map.pinOf({ ...x, x: 0, y: 0, text: '' }), box: null }, edit: { from: x.from, to: x.to }, created_at: x.at || iso(x.id), updated_at: x.at || iso(x.id) }));
  const comments = [...free, ...pins, ...edits].filter(c => c.step).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id - b.id);
  return { picks, comments };
}

/* ---------- writes, each in place on the state; they return what the board API would ---------- */
export function setPick(s, map, key, { options = [], seen = false }, me = ME) {
  const n = map.nOf(key);
  if (!n) { return { picks: [] }; }
  s.picks[n] = options;
  if (options.length || !seen) { delete s.seen[n]; } else { s.seen[n] = true; }
  return { picks: options.length || seen ? [{ step: key, user: me, options, seen: !options.length && seen, updated_at: new Date().toISOString() }] : [] };
}

export function nextId(s, now = Date.now()) {
  const ids = [...s.comments, ...s.pins, ...s.edits].map(x => +x.id || 0);
  return Math.max(now, ...ids.map(x => x + 1));
}

/* a comment: a free one, a pin or box (pin set), an edit (edit set), a reply (parent_id) or an item reply (item_id) */
export function addComment(s, map, body, me = ME, now = Date.now()) {
  const n = map.nOf(body.step);
  if (!n) { throw Object.assign(new Error('unknown step'), { status: 422 }); }
  const id = nextId(s, now), at = new Date(now).toISOString();
  if (body.edit) {
    const p = body.pin || {};
    const x = { step: n, key: p.option || '', dev: p.device, crop: p.src === 'crop', src: map.absOf(p.src, n, p.option), id, at, from: body.edit.from, to: body.edit.to };
    s.edits.push(x);
  } else if (body.pin) {
    const p = body.pin;
    const no = Math.max(0, ...s.pins.filter(q => q.step === n).map(q => +q.no || 0)) + 1;
    s.pins.push({ type: p.box ? 'box' : 'pin', step: n, key: p.option || '', dev: p.device, crop: p.src === 'crop', src: map.absOf(p.src, n, p.option),
      x: p.x, y: p.y, ...(p.box ? { w: p.box.w, h: p.box.h, texts: p.box.texts || [] } : {}), text: p.text || '', id, no, note: body.body || '', at });
  } else {
    s.comments.push({ id, step: n, body: body.body, at, ...(body.parent_id ? { parent: body.parent_id } : {}), ...(body.item_id ? { item: body.item_id } : {}) });
  }
  syncNotes(s);
  return toPayload(s, map, me).comments.flatMap(c => [c, ...c.replies]).find(c => c.id === id);
}

export function editComment(s, map, id, text, me = ME) {
  const at = new Date().toISOString();
  const c = s.comments.find(x => x.id === id), p = s.pins.find(x => x.id === id);
  if (c) { c.body = text; c.upd = at; } else if (p) { p.note = text; p.upd = at; } else { throw Object.assign(new Error('not found'), { status: 404 }); }
  syncNotes(s);
  return toPayload(s, map, me).comments.flatMap(x => [x, ...x.replies]).find(x => x.id === id);
}

export function deleteComment(s, id) {
  s.comments = s.comments.filter(c => c.id !== id && c.parent !== id);
  s.pins = s.pins.filter(p => p.id !== id);
  s.edits = s.edits.filter(x => x.id !== id);
  syncNotes(s);
  return null;
}

/* answered: a pick, a note, a pin, an edit, or ข้าม / อ่านแล้ว (the old workbench's rule) */
export function answered(s, n) {
  return picksOf(s, n).length > 0 || s.comments.some(c => c.step === n && !c.parent) || s.pins.some(p => p.step === n)
    || s.edits.some(x => x.step === n) || !!s.seen[n];
}

/* review.json for inbox.py, in the old workbench's shape */
export function reviewJson(s, { slug, page, title, steps, missing, text, sent }) {
  return {
    slug, page, title, sent, savedAt: new Date().toISOString(), text,
    steps: steps.map((st, i) => ({
      n: i + 1, group: st.group, title: st.title, options: (st.options || []).map(o => o.key), picks: picksOf(s, i + 1),
      note: s.notes[i + 1] || '', pins: s.pins.filter(p => p.step === i + 1), edits: s.edits.filter(x => x.step === i + 1), seen: !!s.seen[i + 1],
    })),
    missing, overall: s.overall || '',
  };
}

/* a round's answers as review.json filed them, in the shape of the state */
export function fromReviewJson(rv) {
  const s = emptyState();
  s.overall = rv?.overall || '';
  (rv?.steps || []).forEach(x => {
    s.picks[x.n] = x.picks || [];
    if (x.note) { s.notes[x.n] = x.note; s.comments.push({ id: x.n, step: x.n, body: x.note, at: rv.savedAt || '' }); }
    if (x.seen) { s.seen[x.n] = true; }
    s.pins.push(...(x.pins || []));
    s.edits.push(...(x.edits || []));
  });
  return s;
}
