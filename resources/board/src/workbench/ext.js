/*
 * What the design workbench adds to the board (3-shared-core.md, `ext`), none of which Kradan has:
 *  - ส่ง: the review goes to the inbox Claude runs (inbox.py on 127.0.0.1:8765–8769), with drafts saved as you go.
 *    Every step must be answered first, or the owner says to skip the rest (see workbench.md).
 *  - the inbox finder: which pages some Claude waits on (รอตอบ in the page list).
 *  - the page manager: every review page in index.json, เก็บ / เอากลับมา / ลบ through pages.php.
 *  - the footer: which core build this is.
 */
import { $, esc, toast, modal } from '../board/util.js';
import { LOCALE } from '../board/i18n.js';

const th = {
  send: 'ส่ง', send_tip: 'ส่งรีวิวให้ Claude ทำต่อ', send_off: 'Claude ไม่ได้รอรีวิวอยู่ ใช้คัดลอกให้ Claude', send_menu: 'ส่งให้ Claude',
  sent: 'ส่งรีวิวแล้ว Claude ทำต่อได้เลย', send_failed: 'ส่งไม่ได้ ใช้คัดลอกให้ Claude แทน',
  missing_n: 'ยังไม่ได้ตอบ {n} ข้อ', unseen: 'มีอัปเดต ยังไม่ได้ดู', unpicked: 'ยังไม่เลือก', unread: 'ยังไม่อ่าน',
  skip_rest: 'ข้ามที่เหลือ', go_back: 'กลับไปตอบ', skip_send: 'ข้ามที่เหลือแล้วส่ง', check_sub: 'ข้อที่ไม่มีความเห็น ติ๊ก ข้ามข้อนี้ หรือ อ่านแล้ว ที่แผงขวา',
  overall: 'ภาพรวม', pages: 'หน้ารีวิว', manage: 'จัดการหน้ารีวิว', live: 'ใช้อยู่', archived: 'เก็บแล้ว', page: 'หน้า', status: 'สถานะ', edited: 'แก้ไข',
  none_archived: 'ยังไม่มีหน้าที่เก็บไว้', no_pages: 'ไม่มีหน้า', old: 'เลือกที่ไม่ได้แก้เกิน 30 วัน', picked_n: 'เลือก {n} หน้า',
  archive: 'เก็บ', restore: 'เอากลับมา', delete: 'ลบ', close: 'ปิด', cancel: 'ยกเลิก', done_n: '{verb} {n} หน้าแล้ว', skipped: 'ข้าม {name} {why}',
  cant: 'ทำไม่ได้ {why}', delete_n: 'ลบ {n} หน้า', delete_sub: 'ย้ายไปถังขยะ กู้คืนจาก Trash ได้', waits: 'Claude รอคำตอบหน้านี้อยู่',
  wait: 'Claude รอคำตอบ', upd: 'มีอัปเดต', sent_on: 'ส่งแล้ว {date}', answered: 'ตอบแล้ว {done}{total}', core: 'core {version} · {sha}',
};
const en = {
  send: 'Send', send_tip: 'Send the review to Claude', send_off: 'Claude isn’t waiting for a review; copy it instead', send_menu: 'Send to Claude',
  sent: 'Review sent, Claude can carry on', send_failed: 'Couldn’t send; copy it for Claude instead',
  missing_n: '{n} not answered yet', unseen: 'updated, not looked at', unpicked: 'not picked', unread: 'not read',
  skip_rest: 'Skip the rest', go_back: 'Go back', skip_send: 'Skip the rest and send', check_sub: 'With nothing to say, tick skip or read in the panel',
  overall: 'Overall', pages: 'Review pages', manage: 'Manage review pages', live: 'In use', archived: 'Archived', page: 'Page', status: 'Status', edited: 'Edited',
  none_archived: 'Nothing archived yet', no_pages: 'No pages', old: 'Pick those not edited for 30 days', picked_n: '{n} picked',
  archive: 'Archive', restore: 'Bring back', delete: 'Delete', close: 'Close', cancel: 'Cancel', done_n: '{verb} {n} pages', skipped: 'skipped {name} {why}',
  cant: 'Couldn’t {why}', delete_n: 'Delete {n} pages', delete_sub: 'They go to the Trash and can be restored', waits: 'A Claude is waiting on this page',
  wait: 'Claude waiting', upd: 'Updated', sent_on: 'Sent {date}', answered: 'Answered {done}{total}', core: 'core {version} · {sha}',
};
const w = (k, vars = {}) => ((LOCALE.code === 'en' ? en : th)[k] ?? th[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => vars[x] ?? '');

/* the board's own strings that read differently here (a page, not a board) */
export const STRINGS = {
  th: { boards_more: 'หน้าอื่น {n}', boards: 'หน้ารีวิว', steps_here: 'ข้อในหน้านี้', rounds: 'รอบของหน้านี้', copy: 'Review & copy', fresh: 'มีอัปเดต โหลดใหม่' },
  en: { boards_more: '{n} other pages', boards: 'Review pages', steps_here: 'Steps on this page', rounds: 'Rounds of this page', copy: 'Review & copy' },
};

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const thaiDate = t => { const d = new Date(t); return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)}`; };
const SLIDERS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>';
const PORTS = [8765, 8766, 8767, 8768, 8769];

export function createExt({ store, stamp = {}, fetch: fetchFn = globalThis.fetch?.bind(globalThis) }) {
  const inbox = { port: null };
  let host = null;
  let draftTimer;

  /* ---------- the inbox ---------- */
  async function findInbox() {
    const found = await Promise.all(PORTS.map(async port => {
      try {
        const c = new AbortController();
        setTimeout(() => c.abort(), 600);
        const r = await fetchFn(`http://127.0.0.1:${port}/ping?slug=${encodeURIComponent(store.slug)}`, { signal: c.signal });
        return { port, ...(await r.json()) };
      } catch { return null; }
    }));
    /* an inbox from before page management answers only "accepts", and waits on this page */
    const ours = found.filter(x => x && (x.has ?? x.accepts));
    const was = [inbox.port, [...store.waiting].join()].join('|');
    inbox.port = ours.find(x => x.accepts)?.port || null;
    store.waiting.clear();
    ours.map(x => (x.waiting === undefined ? store.slug : x.waiting)).filter(s => s && s !== '*').forEach(s => store.waiting.add(s));
    if (was !== [inbox.port, [...store.waiting].join()].join('|')) { renderSend(); host?.reloadBoards(); pushDraft(); }
  }
  function renderSend() {
    const b = $('#sendb');
    if (!b) { return; }
    b.disabled = !inbox.port || host.old();
    b.dataset.tip = inbox.port ? w('send_tip') : w('send_off');
  }
  async function postReview(sent) {
    if (!inbox.port) { return false; }
    try {
      const review = await store.review(sent, host.missing());
      const r = await fetchFn(`http://127.0.0.1:${inbox.port}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: store.slug, review }) });
      if (!r.ok) { throw new Error(String(r.status)); }
      return true;
    } catch { inbox.port = null; renderSend(); return false; }
  }
  function pushDraft() {
    if (!inbox.port || host?.old()) { return; }
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => postReview(false), 800);
  }
  async function send(checked = false) {
    if (host.old()) { return; }
    if (!checked && host.missing().length) { openCheck(); return; }
    clearTimeout(draftTimer);
    if (await postReview(true)) {
      store.markSent();
      store.waiting.delete(store.slug);
      inbox.port = null;
      renderSend();
      host.reloadBoards();
      toast(w('sent'));
    } else { toast(w('send_failed')); }
  }

  /* ---------- every step answered before ส่ง ---------- */
  function missHtml(skip) {
    const ms = host.missing();
    if (!ms.length) { return ''; }
    const steps = host.steps();
    return `<div class="wb-miss"><h3>${esc(w('missing_n', { n: ms.length }))}</h3>${ms.map(n => `<button class="ln" data-goto="${n}"><span class="tnum">${n}.</span><span class="t">${esc(steps[n - 1].title)}</span><span class="k">${esc(w(host.why(n)))}</span></button>`).join('')}${skip ? `<div class="acts"><button class="k-btn" data-skipall>${esc(w('skip_rest'))}</button></div>` : ''}</div>`;
  }
  const goto = (e, m) => {
    const g = e.target.closest('[data-goto]');
    if (!g) { return false; }
    document.querySelectorAll('.k-modal').forEach(x => x.remove());
    host.go(+g.dataset.goto);
    return true;
  };
  function openCheck() {
    const m = modal(`<div class="box narrow">${missHtml(false)}<p class="k-sub">${esc(w('check_sub'))}</p>
      <div class="row"><button class="k-btn" data-goto="${host.missing()[0]}">${esc(w('go_back'))}</button><button class="k-btn k-primary" data-skipsend>${esc(w('skip_send'))}</button></div></div>`, { onClick: goto });
    $('[data-skipsend]', m).onclick = async () => { m.remove(); await host.skipRest(); send(true); };
  }

  /* ---------- the page manager ---------- */
  const mg = { tab: 'live', sel: new Set(), msg: '', el: null };
  function pageFacts(p) {
    const path = p.local;
    const sum = store.summary(path);
    const loc = sum?.title === p.title ? sum : null, srv = p.review?.title === p.title ? p.review : null;
    return {
      waiting: store.waiting.has(p.slug), updated: p.updated,
      sentAt: [srv?.sent ? srv.savedAt : '', loc?.sentAt || ''].filter(Boolean).sort().pop() || '',
      done: Math.max(loc?.done || 0, srv?.done || 0), total: loc?.total || srv?.total || 0,
    };
  }
  /* plain grey text; only Claude waiting and an update since the last look are coloured */
  function pageStatus(p) {
    const f = pageFacts(p), parts = [];
    if (f.waiting) { parts.push(`<span class="wait">${esc(w('wait'))}</span>`); }
    if (f.updated) { parts.push(`<span class="upd">${esc(w('upd'))}</span>`); }
    if (f.sentAt && !f.waiting) { parts.push(esc(w('sent_on', { date: thaiDate(f.sentAt) }))); } else if (f.done) { parts.push(esc(w('answered', { done: f.done, total: f.total ? ` / ${f.total}` : '' }))); }
    return parts.join(' · ');
  }
  let ROWS = [];
  async function openManage() {
    mg.sel.clear();
    mg.msg = '';
    ROWS = (await store.boards()).boards;
    mg.el = modal('<div class="box wide" id="wbmg"></div>', {
      onClick: e => {
        const b = e.target.closest('button');
        if (!b) { return; }
        if (b.dataset.tab) { mg.tab = b.dataset.tab; mg.sel.clear(); mg.msg = ''; renderManage(); }
        if (b.dataset.old !== undefined) {
          const before = Date.now() / 1000 - 30 * 86400;
          ROWS.filter(p => !p.archived && p.modified < before && !store.waiting.has(p.slug)).forEach(p => mg.sel.add(p.slug));
          renderManage();
        }
        if (b.dataset.do) { doPages(b.dataset.do); }
      },
    });
    mg.el.addEventListener('change', e => {
      if (e.target.dataset.sel) { if (e.target.checked) { mg.sel.add(e.target.dataset.sel); } else { mg.sel.delete(e.target.dataset.sel); } }
      if (e.target.dataset.selall !== undefined) {
        mg.el.querySelectorAll('input[data-sel]:not(:disabled)').forEach(i => { i.checked = e.target.checked; if (e.target.checked) { mg.sel.add(i.dataset.sel); } else { mg.sel.delete(i.dataset.sel); } });
      }
      renderManage();
    });
    renderManage();
  }
  function renderManage() {
    const box = mg.el?.isConnected && $('#wbmg', mg.el);
    if (!box) { return; }
    const arch = mg.tab === 'archived', rows = ROWS.filter(p => !!p.archived === arch);
    const nArch = ROWS.filter(p => p.archived).length, can = mg.sel.size > 0;
    const scroll = $('.wb-mglist', box)?.scrollTop || 0;
    box.innerHTML = `
      <div class="wb-mghead"><h2>${esc(w('pages'))}</h2><span class="k-tabs"><button data-tab="live" aria-pressed="${!arch}">${esc(w('live'))} <span class="tnum">${ROWS.length - nArch}</span></button><button data-tab="archived" aria-pressed="${arch}">${esc(w('archived'))} <span class="tnum">${nArch}</span></button></span></div>
      <div class="wb-mglist"><table><thead><tr><th><input type="checkbox" data-selall ${rows.length && rows.every(p => mg.sel.has(p.slug) || store.waiting.has(p.slug)) ? 'checked' : ''}></th><th>${esc(w('page'))}</th><th>${esc(w('status'))}</th><th>${esc(w('edited'))}</th></tr></thead><tbody>
      ${rows.map(p => {
        const waits = store.waiting.has(p.slug);
        return `<tr><td><input type="checkbox" data-sel="${esc(p.slug)}" ${mg.sel.has(p.slug) ? 'checked' : ''} ${waits ? `disabled title="${esc(w('waits'))}"` : ''}></td>
          <td><a href="${esc(p.url)}">${esc(p.title)}</a><div class="slug">${esc(p.slug)}</div></td>
          <td class="st">${pageStatus(p)}</td><td class="dt tnum">${p.modified ? thaiDate(p.modified * 1000) : ''}</td></tr>`;
      }).join('') || `<tr><td></td><td class="st" colspan="3">${esc(arch ? w('none_archived') : w('no_pages'))}</td></tr>`}
      </tbody></table></div>
      <div class="wb-mgfoot row">
        ${arch ? '' : `<button class="k-btn" data-old>${esc(w('old'))}</button>`}
        <span class="grow">${esc(mg.msg || (mg.sel.size ? w('picked_n', { n: mg.sel.size }) : ''))}</span>
        <button class="k-btn" data-x>${esc(w('close'))}</button>
        <button class="k-btn" data-do="${arch ? 'restore' : 'archive'}" ${can ? '' : 'disabled'}>${esc(arch ? w('restore') : w('archive'))}</button>
        <button class="k-btn wb-danger" data-do="delete" ${can ? '' : 'disabled'}>${esc(w('delete'))}</button>
      </div>`;
    $('.wb-mglist', box).scrollTop = scroll;
  }
  function confirmDelete(slugs) {
    return new Promise(done => {
      const m = modal(`<div class="box narrow"><h2>${esc(w('delete_n', { n: slugs.length }))}</h2><p class="k-sub">${esc(w('delete_sub'))}</p>
        <ul>${slugs.map(s => `<li>${esc(ROWS.find(p => p.slug === s)?.title || s)}</li>`).join('')}</ul>
        <div class="row"><button class="k-btn" data-x>${esc(w('cancel'))}</button><button class="k-btn wb-danger" data-yes>${esc(w('delete_n', { n: slugs.length }))}</button></div></div>`,
      { onClick: e => { if (e.target.closest('[data-x]')) { done(false); } } });
      $('[data-yes]', m).onclick = () => { m.remove(); done(true); };
    });
  }
  async function doPages(action) {
    const slugs = [...mg.sel];
    if (!slugs.length || (action === 'delete' && !await confirmDelete(slugs))) { return; }
    try {
      /* pages.php sits next to the workbench, so it runs under the project's own PHP */
      const res = await fetchFn(store.pagesUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, slugs }) });
      const r = await res.json();
      if (!r.ok) { throw new Error(r.why || res.status); }
      mg.sel.clear();
      mg.msg = w('done_n', { verb: w(action), n: r.done.length }) + (r.skipped || []).map(x => ` · ${w('skipped', { name: ROWS.find(p => p.slug === x.slug)?.title || x.slug, why: x.why })}`).join('');
      if (action === 'delete' && r.done.includes(store.slug)) { location.href = '?'; return; }
      ROWS = (await store.boards()).boards;
      host.reloadBoards();
      renderManage();
    } catch (err) {
      mg.msg = w('cant', { why: err.message });
      renderManage();
    }
  }

  return {
    keepParams: ['page'],
    /* the workbench opens fitted, side by side when that stays readable (its own default, as before) */
    view: { zoom: 'fit', arr: 'auto' },
    /* the keys the old workbench kept: the sidebar widths and whether หน้าอื่น was open */
    localKeys: { side: 'wb:sw', panel: 'wb:pw', boardsFold: 'wb:pgopen', drawingsFold: 'wb:drawopen' },
    /* ภาพรวม: one note for the whole page, at the end of the panel, saved as you type (not in an older round) */
    panelEnd: h => (h.old() ? '' : `<div class="k-hr"></div><div class="k-lab">${esc(w('overall'))}</div><textarea class="wb-overall" data-wboverall rows="2">${esc(store.overall())}</textarea>`),
    bar: h => `<button class="k-btn k-primary wb-send" data-act="wb-send" id="sendb" disabled data-tip="${esc(w('send_off'))}" data-tip-end>${esc(w('send'))}</button>`,
    menu: (h, item) => item('ext:send', w('send_menu'), '', { disabled: !inbox.port || h.old() }),
    act(name, h) {
      if (name === 'wb-send' || name === 'send') { send(); return true; }
      if (name === 'wb-pages') { openManage(); return true; }
      return false;
    },
    boardsTool: () => `<button class="k-ib" data-act="wb-pages" data-tip="${esc(w('manage'))}" aria-label="${esc(w('manage'))}">${SLIDERS}</button>`,
    sideEnd: () => (stamp.version ? `<div class="wb-core tnum">${esc(w('core', { version: stamp.version, sha: stamp.sha || '' }))}</div>` : ''),
    copyHead: () => missHtml(true),
    copyOpened(h, m, refill) {
      m.addEventListener('click', async e => {
        if (goto(e, m)) { return; }
        if (!e.target.closest('[data-skipall]')) { return; }
        await h.skipRest();
        const head = $('[data-exthead]', m);
        if (head) { head.innerHTML = ''; }
        refill();
      });
    },
    /* copying for Claude counts as sent in this browser, as before */
    copied: h => { store.markSent(); h.reloadBoards(); },
    start(h) {
      host = h;
      renderSend();
      store.onWrite(pushDraft);
      let overallTimer;
      document.addEventListener('input', e => {
        const ta = e.target.closest?.('[data-wboverall]');
        if (!ta) { return; }
        ta.style.height = 'auto';
        ta.style.height = Math.min(innerHeight * 0.5, ta.scrollHeight + 2) + 'px';
        clearTimeout(overallTimer);
        overallTimer = setTimeout(() => store.setOverall(ta.value), 400);
      });
      findInbox();
      setInterval(findInbox, 8000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { h.reloadBoards(); } });
    },
  };
}
