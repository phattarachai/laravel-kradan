/*
 * /kradan: every board the user may see in one list, open boards and ประวัติ (decided or archived) as tabs, and one
 * search over the title, the task and the step titles. Status is grey text; มีอัปเดต is the only coloured state.
 */
import { t } from './i18n.js';
import { $, esc, shortDate } from './util.js';
import { avatar, avatarRow } from './presence.js';
import { corner } from './icon.js';

export function mountIndex(boot, root) {
  const ME = boot.user || {};
  const boards = boot.index?.boards || boot.boards || [];
  const Q = new URLSearchParams(location.search);
  const ui = { tab: ['history', 'decks'].includes(Q.get('tab')) ? Q.get('tab') : 'open', q: boot.index?.q || Q.get('q') || '' };
  /* decks have their own tab and no decided flow; ประวัติ is decided decision boards */
  const isDeck = b => b.kind === 'deck';
  const isPast = b => !isDeck(b) && b.status !== 'open';

  root.innerHTML = `<div class="k-index">
    <header class="k-bar">${corner(boot)}<span class="k-sp"></span><span class="k-avs">${avatar(ME, { tip: ME.name })}</span></header>
    <main class="k-imain" id="main"></main>
  </div>`;

  /* search matches the title, the task ref and any step title, each word on its own */
  function matches(b) {
    const words = ui.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) { return true; }
    const hay = [b.label, b.title, b.task_ref, b.round?.title, ...(b.steps || [])].join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  }

  function writeUrl() {
    const p = new URLSearchParams();
    if (ui.tab !== 'open') { p.set('tab', ui.tab); }
    if (ui.q) { p.set('q', ui.q); }
    window.history.replaceState(null, '', `${location.pathname}${p.toString() ? '?' + p : ''}`);
  }

  function row(b) {
    const date = b.status !== 'open' && b.decided_at ? t(b.status === 'decided' ? 'decided_on' : 'archived_on', { date: shortDate(b.decided_at) }) : shortDate(b.round?.pushed_at || b.updated_at);
    const answered = typeof b.answered === 'number' ? (b.answered ? t('people_n', { n: b.answered }) : t('nobody')) : '';
    /* label is the title with the task in front unless the title already starts with it; the task isn't repeated below */
    return `<tr><td><a class="t" href="${esc(b.url)}">${esc(b.label || b.title)}</a><div class="r">${esc([b.label ? '' : b.task_ref, b.round ? t('round_n', { n: b.round.number }) : '', isDeck(b) ? `${(b.steps || []).length} ${t('slides')}` : ''].filter(Boolean).join(' · '))}</div></td>
      <td class="g tnum">${esc(date)}</td><td class="g tnum">${esc(answered)}</td>
      <td><span class="k-avs">${avatarRow(b.viewers || [], { me: ME.id, max: 4 })}</span></td>
      <td class="u">${b.updated ? `<span class="k-upd">${t('updated')}</span>` : ''}</td></tr>`;
  }

  /* one plain list of boards (owner, 2026-10-28): open ones, and ประวัติ for decided or archived */
  function render() {
    const open = boards.filter(b => !isDeck(b) && !isPast(b)), past = boards.filter(isPast), decks = boards.filter(isDeck);
    const list = ({ history: past, decks }[ui.tab] || open).filter(matches)
      .sort((a, b) => String(b.round?.pushed_at || b.updated_at || '').localeCompare(String(a.round?.pushed_at || a.updated_at || '')));
    const focus = document.activeElement?.id === 'q';
    $('#main').innerHTML = `<div class="k-tool"><span class="k-tabs"><button data-tab="open" aria-pressed="${ui.tab === 'open'}">${t('open')} <span class="tnum">${open.length}</span></button>${decks.length ? `<button data-tab="decks" aria-pressed="${ui.tab === 'decks'}">${t('decks')} <span class="tnum">${decks.length}</span></button>` : ''}<button data-tab="history" aria-pressed="${ui.tab === 'history'}">${t('history')} <span class="tnum">${past.length}</span></button></span>
      <label class="k-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="q" type="search" value="${esc(ui.q)}" placeholder="${esc(t('search'))}" autocomplete="off"></label></div>
      ${list.length ? `<table class="k-table"><thead><tr><th>${t('board')}</th><th>${t('last_push')}</th><th>${t('answered')}</th><th>${t('viewers')}</th><th></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table>`
        : `<div class="k-none">${esc(ui.q ? t('no_match', { q: ui.q }) : t('no_boards'))}</div>`}`;
    if (focus) { const i = $('#q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    writeUrl();
  }

  root.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { ui.tab = tab.dataset.tab; render(); }
  });
  root.addEventListener('input', e => { if (e.target.id === 'q') { ui.q = e.target.value; render(); } });
  render();
}
