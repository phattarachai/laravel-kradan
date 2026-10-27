/* board.js entry: the boot payload is window.Kradan, printed by the Blade shell. */
import { setLocale, t } from './i18n.js';
import { esc, tint, getLocal, setLocal } from './util.js';
import { mountBoard } from './board.js';
import { mountIndex } from './index.js';
import { setFavicon } from './icon.js';

const boot = window.Kradan || {};
setLocale(boot.locale || 'th');
document.documentElement.lang = boot.locale === 'en' ? 'en' : 'th';

/* branding: the app's accent; theme A picks with it, B and C use it only for the workspace badge */
const accent = boot.brand?.accent;
if (accent && /^#[0-9a-f]{6}$/i.test(accent)) {
  document.documentElement.style.setProperty('--brand', accent);
  document.documentElement.style.setProperty('--brand-bg', tint(accent, 0.1));
}
/* design round 3: ?theme=a|b|c, remembered in this browser, until the owner picks one */
const asked = new URLSearchParams(location.search).get('theme');
if (/^[abc]$/.test(asked || '')) { setLocal('kradan:theme', asked); }
document.documentElement.dataset.theme = (/^[abc]$/.test(asked || '') ? asked : getLocal('kradan:theme')) || boot.theme || 'a';

setFavicon();

const root = document.getElementById('kradan');
try {
  if (boot.page === 'board' || boot.board) { mountBoard(boot, root); } else { mountIndex(boot, root); }
} catch (err) {
  root.innerHTML = `<div class="k-empty">${esc(t('cant_open', { why: err.message }))}</div>`;
  throw err;
}
