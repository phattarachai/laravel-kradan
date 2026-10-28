/* board.js entry: the boot payload is window.Kradan, printed by the Blade shell. */
import { setLocale, t } from './i18n.js';
import { esc, tint } from './util.js';
import { mountBoard } from './board.js';
import { KradanStore } from './api.js';
import { mountIndex } from './index.js';
import { setFavicon } from './icon.js';

const boot = window.Kradan || {};
setLocale(boot.locale || 'th');
document.documentElement.lang = boot.locale === 'en' ? 'en' : 'th';

/* branding: the app's accent shows on the workspace badge; Kradan's own green does the picking */
const accent = boot.brand?.accent;
if (accent && /^#[0-9a-f]{6}$/i.test(accent)) {
  document.documentElement.style.setProperty('--brand', accent);
  document.documentElement.style.setProperty('--brand-bg', tint(accent, 0.1));
}

setFavicon();


const root = document.getElementById('kradan');
try {
  if (boot.page === 'board' || boot.board) { mountBoard(boot, root, { store: KradanStore(boot) }); } else { mountIndex(boot, root); }
} catch (err) {
  root.innerHTML = `<div class="k-empty">${esc(t('cant_open', { why: err.message }))}</div>`;
  throw err;
}
