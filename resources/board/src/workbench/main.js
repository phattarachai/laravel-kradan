/*
 * workbench.js entry: the board on a LocalStore, for a review page under public/design/ (3-shared-core.md).
 * The skill's index.html is a thin shell: <div id="kradan"></div>, workbench.css and this script, with agent.js,
 * pages.php and workbench.json next to it. ?page=../<slug>/index.html picks the page, as before.
 */
import { setLocale, strings, t } from '../board/i18n.js';
import { esc } from '../board/util.js';
import { mountBoard } from '../board/board.js';
import { applyTheme } from '../board/theme.js';
import { setFavicon } from '../board/icon.js';
import { LocalStore } from './local-store.js';
import { createExt, STRINGS } from './ext.js';
import { ME } from './state.js';

/* stamped by build.mjs: {version, sha, src_hash} */
const STAMP = typeof __WB_STAMP__ === 'undefined' ? {} : __WB_STAMP__;
const HERE = new URL('.', document.currentScript?.src || location.href);

async function start() {
  const Q = new URLSearchParams(location.search);
  const locale = Q.get('lang') === 'en' ? 'en' : 'th';
  setLocale(locale);
  Object.entries(STRINGS).forEach(([code, map]) => Object.assign(strings[code], map));
  applyTheme({ name: 'workbench' }, 'workbench');
  setFavicon();
  const root = document.getElementById('kradan');

  /* no ?page=: the newest page in use, as before */
  let page = Q.get('page');
  if (!page) {
    try { const list = await (await fetch('../index.json', { cache: 'no-store' })).json(); page = (list.find(p => !p.archived) || list[0])?.path; } catch { /* no index.json */ }
  }
  const pageUrl = new URL(page || '../', location.href);
  const store = LocalStore({
    page: pageUrl.href, agentUrl: new URL('agent.js', HERE).href, pagesUrl: new URL('pages.php', HERE).href,
    parse: html => new DOMParser().parseFromString(html, 'text/html'),
  });
  try {
    /* ?round= is a round number, or a rounds/NN folder name as the old workbench wrote it */
    const first = await store.board(store.slug);
    const r = Q.get('round');
    const n = r ? (first.rounds.find(x => x.dir === r || String(x.number) === String(+r))?.number || null) : null;
    const board = n && n !== first.current ? await store.board(store.slug, n) : first;
    document.title = board.title || 'Design workbench';
    const boot = { page: 'board', locale, user: { ...ME, can: { manage: false } }, routes: { index: `?page=${encodeURIComponent(page || '')}` }, brand: {}, presence: { mode: 'off', heartbeat: 8 }, board };
    mountBoard(boot, root, { store, ext: createExt({ store, stamp: STAMP }) });
  } catch (err) {
    root.innerHTML = `<div class="k-empty">${esc(t('cant_open', { why: `${pageUrl.href} (${err.message})` }))}</div>`;
    throw err;
  }
}

start();
