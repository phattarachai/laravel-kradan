import { LOCALE } from './i18n.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* short Thai dates with the พ.ศ. year: 27 ต.ค. 69, and 27 ต.ค. 69 14:05 with the time */
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function shortDate(value, withTime = false) {
  if (!value) { return ''; }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) { return ''; }
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = LOCALE.code === 'en'
    ? `${d.getDate()} ${EN_MONTHS[d.getMonth()]} ${d.getFullYear()}`
    : `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)}`;
  return withTime ? `${day} ${hm}` : day;
}
/* today shows only the time; older shows the date and time */
export function when(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) { return ''; }
  return d.toDateString() === new Date().toDateString()
    ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    : shortDate(d, true);
}

export function toast(msg) {
  const el = document.createElement('div');
  el.className = 'k-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

export function modal(html, { onClick } = {}) {
  const m = document.createElement('div');
  m.className = 'k-modal';
  m.innerHTML = html;
  document.body.appendChild(m);
  m.addEventListener('click', e => {
    if (e.target === m || e.target.closest('[data-x]')) { m.remove(); return; }
    onClick?.(e, m);
  });
  return m;
}

/* navigator.clipboard exists only on https or localhost; a .test host is plain http, so fall back to execCommand */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* next */ }
  const ta = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* manual */ }
  ta.remove();
  return ok;
}

export const getLocal = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
export const setLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };

/* a colour from the brand accent, for --accent-bg */
export function tint(hex, alpha = 0.1) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) { return null; }
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
