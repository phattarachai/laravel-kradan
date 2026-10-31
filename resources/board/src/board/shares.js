/*
 * ลิงก์สาธารณะ (the แชร์ button): a deck's public, present-only links, for people with `share`. A new link shows
 * its URL once (the server keeps only a hash); the list shows every link with its round, expiry and last use, and
 * revokes one.
 */
import { $, esc, shortDate, modal, copyText, toast } from './util.js';

export const SHARE_DAYS = [7, 14, 30, 90, 0];

/* one line per link: its round, when it expires, whether it still works */
export function shareRow(s, t) {
  const state = s.revoked_at ? t('share_revoked') : s.active ? (s.expires_at ? t('share_until', { date: shortDate(s.expires_at) }) : t('share_forever')) : t('share_expired');
  const used = s.last_used_at ? t('share_used', { date: shortDate(s.last_used_at, true) }) : t('share_unused');
  return `<div class="k-share ${s.active ? '' : 'off'}"><span class="id tnum">#${s.id}</span><span class="w">${esc(s.round ? t('round_n', { n: s.round }) : t('share_latest'))} · ${esc(state)}<br><span class="u">${esc(used)}</span></span>${s.active ? `<button class="k-btn" data-revoke="${s.id}">${esc(t('share_revoke'))}</button>` : ''}</div>`;
}

export function openShares({ api, slug, rounds, current, t }) {
  const m = modal(`<div class="box"><h2>${esc(t('share_links'))}</h2><p class="k-sub">${esc(t('share_sub'))}</p>
    <div class="k-sharenew"><label>${esc(t('share_round'))}<select data-sround><option value="">${esc(t('share_latest'))}</option>${[...rounds].reverse().map(r => `<option value="${r.number}">${esc(t('round_n', { n: r.number }))}${r.number === current ? ' ✓' : ''}</option>`).join('')}</select></label>
      <label>${esc(t('share_expires'))}<select data-sdays>${SHARE_DAYS.map(d => `<option value="${d}" ${d === 14 ? 'selected' : ''}>${esc(d ? t('share_days', { n: d }) : t('share_forever'))}</option>`).join('')}</select></label>
      <button class="k-btn k-primary" data-screate>${esc(t('share_create'))}</button></div>
    <div class="k-sharemade" hidden></div><div class="k-shares">${esc(t('loading'))}</div>
    <div class="row"><button class="k-btn" data-x>${esc(t('close'))}</button></div></div>`);
  const list = async () => {
    try { $('.k-shares', m).innerHTML = (await api.shares(slug)).shares.map(s => shareRow(s, t)).join('') || `<div class="k-lab">${esc(t('share_none'))}</div>`; } catch { $('.k-shares', m).textContent = t('offline'); }
  };
  m.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) { return; }
    if (b.dataset.screate !== undefined) {
      b.disabled = true;
      const round = $('[data-sround]', m).value, days = +$('[data-sdays]', m).value;
      try {
        const { share } = await api.createShare(slug, { days, ...(round ? { round: +round } : {}) });
        const made = $('.k-sharemade', m);
        made.hidden = false;
        made.innerHTML = `<div class="k-lab">${esc(t('share_once'))}</div><div class="k-shareurl"><input readonly value="${esc(share.url)}"><button class="k-btn" data-scopy>${esc(t('copy_link'))}</button></div>`;
        $('input', made).select();
        list();
      } catch { toast(t('save_failed')); }
      b.disabled = false;
    }
    if (b.dataset.scopy !== undefined) { b.textContent = await copyText($('.k-shareurl input', m).value) ? t('copied') : t('copy_manual'); }
    if (b.dataset.revoke) {
      try { await api.revokeShare(+b.dataset.revoke); list(); } catch { toast(t('save_failed')); }
    }
  });
  list();
  return m;
}
