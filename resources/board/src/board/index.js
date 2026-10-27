/*
 * /kradan: every board the user may see. Panels on the left, open boards and ประวัติ (decided or archived) as
 * tabs, and one search over the title, the task and the step titles. Status is grey text; มีอัปเดต is the
 * only coloured state.
 */
import { t } from './i18n.js';
import { $, esc, shortDate, getLocal, setLocal } from './util.js';
import { avatar, avatarRow } from './presence.js';

export function mountIndex(boot, root) {
  const ME = boot.user || {};
  const data = boot.index || boot;
  const panels = data.panels || [];
  const boards = data.boards || [];
  const Q = new URLSearchParams(location.search);
  const ui = {
    panel: data.panel || Q.get('panel') || getLocal('kradan:panel') || panels[0]?.key || '',
    tab: Q.get('tab') === 'history' ? 'history' : 'open',
    q: data.q || Q.get('q') || '',
  };
  if (!panels.some(p => p.key === ui.panel)) { ui.panel = panels[0]?.key || ''; }
  const brand = boot.brand || {};
  const isPast = b => b.status !== 'open';
  const inPanel = b => b.panel === ui.panel;

  root.innerHTML = `<div class="k-index">
    <header class="k-bar">
      <a class="k-brand" href="${esc(boot.routes?.index || '/kradan')}">${brand.logo ? `<img class="k-logo" src="${esc(brand.logo)}" alt="">` : `<span class="k-logo">${esc((brand.name || 'K').slice(0, 2))}</span>`}<span class="k-bname">${esc(brand.name || 'Kradan')}</span></a>
      <span class="k-sp"></span><span class="k-avs">${avatar(ME, { tip: ME.name })}</span>
    </header>
    <div class="k-ibody"><nav class="k-inav" id="nav"></nav><main class="k-imain" id="main"></main></div>
  </div>`;

  /* search matches the title, the task ref and any step title, each word on its own */
  function matches(b) {
    const words = ui.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) { return true; }
    const hay = [b.title, b.task_ref, b.round?.title, ...(b.steps || [])].join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  }

  function writeUrl() {
    const p = new URLSearchParams();
    if (ui.tab === 'history') { p.set('tab', 'history'); }
    if (ui.q) { p.set('q', ui.q); }
    const panel = panels.find(x => x.key === ui.panel);
    window.history.replaceState(null, '', `${panel?.url || location.pathname}${p.toString() ? '?' + p : ''}`);
  }

  function renderNav() {
    $('#nav').innerHTML = panels.map(p => `<a href="${esc(p.url || '#')}" data-panel="${esc(p.key)}" aria-current="${p.key === ui.panel}">${esc(p.title)}<span class="n tnum">${boards.filter(b => b.panel === p.key && !isPast(b)).length}</span></a>`).join('');
  }

  function row(b) {
    const date = b.status === 'decided' && b.decided_at ? t('decided_on', { date: shortDate(b.decided_at) }) : shortDate(b.round?.pushed_at || b.updated_at);
    const answered = typeof b.answered === 'number' ? (b.answered ? t('people_n', { n: b.answered }) : t('nobody')) : '';
    return `<tr><td><a class="t" href="${esc(b.url)}">${esc(b.title)}</a><div class="r">${esc([b.task_ref, b.round ? t('round_n', { n: b.round.number }) : '', b.status === 'archived' ? t('archived') : ''].filter(Boolean).join(' · '))}</div></td>
      <td class="g tnum">${esc(date)}</td><td class="g tnum">${esc(answered)}</td>
      <td><span class="k-avs">${avatarRow(b.viewers || [], { me: ME.id, max: 4 })}</span></td>
      <td class="u">${b.updated ? `<span class="k-upd">${t('updated')}</span>` : ''}</td></tr>`;
  }

  function renderMain() {
    const panel = panels.find(p => p.key === ui.panel);
    const all = boards.filter(inPanel);
    const open = all.filter(b => !isPast(b)), past = all.filter(isPast);
    const list = (ui.tab === 'history' ? past : open).filter(matches)
      .sort((a, b) => String(b.round?.pushed_at || b.updated_at || '').localeCompare(String(a.round?.pushed_at || a.updated_at || '')));
    const scroll = $('#main').scrollTop;
    const focus = document.activeElement?.id === 'q';
    $('#main').innerHTML = `<h1>${esc(panel?.title || '')}</h1>
      <div class="k-tool"><span class="k-tabs"><button data-tab="open" aria-pressed="${ui.tab === 'open'}">${t('open')} <span class="tnum">${open.length}</span></button><button data-tab="history" aria-pressed="${ui.tab === 'history'}">${t('history')} <span class="tnum">${past.length}</span></button></span>
      <label class="k-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="q" type="search" value="${esc(ui.q)}" placeholder="${esc(t('search'))}" autocomplete="off"></label></div>
      ${list.length ? `<table class="k-table"><thead><tr><th>${t('board')}</th><th>${t('last_push')}</th><th>${t('answered')}</th><th>${t('viewers')}</th><th></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table>`
        : `<div class="k-none">${esc(ui.q ? t('no_match', { q: ui.q }) : t('no_boards'))}</div>`}`;
    $('#main').scrollTop = scroll;
    if (focus) { const i = $('#q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }

  function render() { renderNav(); renderMain(); writeUrl(); }

  root.addEventListener('click', e => {
    const p = e.target.closest('[data-panel]');
    if (p) { e.preventDefault(); ui.panel = p.dataset.panel; ui.tab = 'open'; setLocal('kradan:panel', ui.panel); render(); return; }
    const tab = e.target.closest('[data-tab]');
    if (tab) { ui.tab = tab.dataset.tab; render(); }
  });
  root.addEventListener('input', e => { if (e.target.id === 'q') { ui.q = e.target.value; renderMain(); writeUrl(); } });
  render();
}
