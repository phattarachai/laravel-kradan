/*
 * dist/present.js: the share page (/kradan/p/{token}). Its only input is the JSON the server printed: the deck's
 * signed index.html, the content origin and where to start. No user, no API, no board.
 */
import { createPresenter } from './present.js';
import { allowedOrigins } from './bridge.js';

const LABELS = {
  th: { prev: 'ก่อนหน้า (←)', next: 'ถัดไป (→)', full: 'เต็มจอ (F)', close: 'ปิด', pdf: 'บันทึกเป็น PDF' },
  en: { prev: 'Previous (←)', next: 'Next (→)', full: 'Fullscreen (F)', close: 'Close', pdf: 'Save as PDF' },
};

const boot = JSON.parse(document.getElementById('kradan-share')?.textContent || '{}');
if (boot.page_url) {
  const presenter = createPresenter({
    pageUrl: boot.page_url,
    origins: allowedOrigins(boot.page_url, location.origin),
    closable: false,
    printable: true,
    labels: { ...(LABELS[document.documentElement.lang] || LABELS.th), title: boot.title || '' },
    onMove: n => history.replaceState(null, '', `?present=${n}`),
  });
  presenter.open(boot.start || 1, { full: false });
}
