/*
 * review.md from a board payload (2-board-payload.md), line for line the same as the PHP ReviewBuilder::markdown().
 * The workbench's LocalStore uses it; tests/Fixtures/export holds the case both sides are checked against.
 */
const WORDS = {
  th: { round: 'รอบ {n}', skip: 'ข้าม', read: 'อ่านแล้ว', no_answer: 'ยังไม่มีคนตอบ', arrow: 'ชี้ที่', rect: 'ตีกรอบ', ellipse: 'วงไว้', stroke: 'วาดเส้น', near: 'ใกล้' },
  en: { round: 'round {n}', skip: 'skip', read: 'read', no_answer: 'no answer yet', arrow: 'points at', rect: 'boxed', ellipse: 'circled', stroke: 'drew', near: 'near' },
};
const INDENT = '   ';

/* the title with the task in front, unless the title already starts with it (Board::labelFor) */
export function labelFor(taskRef, title) {
  const ref = String(taskRef || '').trim(), t = String(title || '').trim();
  if (!ref) { return t; }
  const starts = t.toLowerCase().startsWith(ref.toLowerCase()) && !/[\p{L}\p{N}]/u.test(t.charAt(ref.length));
  return starts ? t : `${ref} ${t}`;
}

/* where kradan:pull saves an upload (Item::localPath) */
export function localPath(id, name) {
  const clean = String(name || '').replace(/[^\p{L}\p{M}\p{N}._-]+/gu, '-').replace(/^[-.]+|[-.]+$/g, '') || 'file';
  return `attachments/${id}-${clean}`;
}

const where = (...parts) => { const p = parts.filter(x => x !== null && x !== undefined && x !== ''); return p.length ? ` (${p.join(', ')})` : ''; };
function quoted(text) {
  const list = (text === null || text === undefined ? [] : Array.isArray(text) ? text : [text]).map(x => String(x).trim()).filter(Boolean);
  return list.length ? ' ' + list.map(x => `“${x}”`).join(', ') : '';
}
function block(indent, text) {
  return String(text).replace(/\r\n/g, '\n').trim().split('\n').map((line, i) => indent + (i ? '  ' : '') + line);
}
/* by time, comments before items at the same moment, then by id */
const order = (at, type, id) => `${String(Date.parse(at || '') || 0).padStart(15, '0')}|${type}|${String(id).padStart(12, '0')}`;

export function exportMd({ board, round, picks = [], comments = [], items = [], locale = 'th' }) {
  const w = WORDS[locale] || WORDS.th;
  const name = u => u?.name ?? '';
  const top = comments.filter(c => !c.parent_id && !c.item_id);
  /* pins are numbered across the round, in the order they were written */
  const pinNo = new Map(top.filter(c => c.pin && !c.edit).sort((a, b) => a.id - b.id).map((c, i) => [c.id, i + 1]));
  const shown = items.filter(it => (it.round ?? round.number) <= round.number);

  function answer(step) {
    const ps = picks.filter(p => p.step === step.key);
    const seen = ps.filter(p => p.seen && !(p.options || []).length).map(p => name(p.user));
    if (step.kind === 'screen') { return seen.length ? `${w.read}: ${seen.join(', ')}` : ''; }
    const parts = (step.options || []).map(o => [o.key, ps.filter(p => (p.options || []).includes(o.key)).map(p => name(p.user))])
      .filter(([, n]) => n.length).map(([k, n]) => `${k}: ${n.join(', ')}`);
    if (seen.length) { parts.push(`${w.skip}: ${seen.join(', ')}`); }
    return parts.length ? parts.join(' · ') : w.no_answer;
  }
  function commentLine(c) {
    const who = name(c.user);
    if (c.edit) {
      const body = String(c.body || '').trim() === '' ? '' : `: ${c.body}`;
      return `✎ ${who}${where(c.pin?.option)}: “${c.edit.from}” → “${c.edit.to}”${body}`;
    }
    if (c.pin) {
      const box = c.pin.box || null;
      return `${box ? '▭' : '📍'}${pinNo.get(c.id)} ${who}${where(c.pin.option, c.pin.device)}${quoted(box?.texts ?? c.pin.text ?? null)}: ${c.body}`;
    }
    return `💬 ${who}: ${c.body}`;
  }
  function itemLine(it) {
    const who = name(it.user), at = where(it.anchor?.option, it.anchor?.device), texts = it.texts || [];
    const path = it.file?.path || localPath(it.id, it.file?.name);
    switch (it.kind) {
      case 'note': case 'text': return `🗒 ${who}: ${String(it.text || '').trim()}`;
      case 'image': return `🖼 ${who}: ${it.file?.name} (${path})`;
      case 'file': return `📎 ${who}: ${it.file?.name} (${path})`;
      case 'arrow': return `➚ ${who}${at}${texts.length ? ` ${w.arrow}${quoted(texts[0])}` : ''}`;
      case 'rect': return `▭ ${who}${at} ${w.rect}${quoted(texts)}`;
      case 'ellipse': return `▭ ${who}${at} ${w.ellipse}${quoted(texts)}`;
      default: return `〰 ${who}${at} ${w.stroke}${texts.length ? ` ${w.near}${quoted(texts[0])}` : ''}`;
    }
  }
  const repliesOf = list => [...list].sort((a, b) => a.id - b.id);
  function details(key) {
    const entries = [
      ...top.filter(c => c.step === key).map(c => [order(c.created_at, 0, c.id), commentLine(c), c.replies || []]),
      ...shown.filter(it => it.step === key).map(it => [order(it.created_at, 1, it.id), itemLine(it), comments.filter(c => c.item_id === it.id)]),
    ].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return entries.flatMap(([, line, replies]) => [
      ...block(INDENT, line),
      ...repliesOf(replies).flatMap(r => block(INDENT + INDENT, `↳ ${name(r.user)}: ${r.body}`)),
    ]);
  }

  const lines = [[labelFor(board.task_ref, board.title), w.round.replace('{n}', round.number), board.url].join(' · '), ''];
  let group = '';
  (round.steps || []).forEach((step, i) => {
    if (step.group !== '' && step.group !== group) {
      if (lines.at(-1) !== '') { lines.push(''); }
      lines.push(step.group);
    }
    group = step.group;
    const a = answer(step);
    lines.push(`${i + 1}. ${step.title}${a === '' ? '' : ` → ${a}`}`);
    lines.push(...details(step.key));
  });
  return lines.join('\n') + '\n';
}
