/* board.js entry: the boot payload is window.Kradan, printed by the Blade shell. */
import { setLocale, t } from './i18n.js';
import { esc, tint } from './util.js';
import { mountBoard } from './board.js';
import { mountIndex } from './index.js';

const boot = window.Kradan || {};
setLocale(boot.locale || 'th');
document.documentElement.lang = boot.locale === 'en' ? 'en' : 'th';

/* branding: the accent drives picks, the active tab and the primary marks */
const accent = boot.brand?.accent;
if (accent && /^#[0-9a-f]{6}$/i.test(accent)) {
  document.documentElement.style.setProperty('--k-accent', accent);
  document.documentElement.style.setProperty('--k-accent-bg', tint(accent, 0.1));
}

const root = document.getElementById('kradan');
try {
  if (boot.board) { mountBoard(boot, root); } else { mountIndex(boot, root); }
} catch (err) {
  root.innerHTML = `<div class="k-empty">${esc(t('cant_open', { why: err.message }))}</div>`;
  throw err;
}
