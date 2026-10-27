/*
 * Notion-style avatars. Who is on a board comes from two places:
 *   - the heartbeat (every mode): POST …/heartbeat every 30 s answers `viewers` with last_seen_at
 *   - the Reverb presence channel (presence.mode = reverb): who is connected right now
 * Active = seen in the last 2 min or on the channel. Faded = the last 15 min. Older drops off the row.
 */
import { esc, shortDate } from './util.js';
import { t } from './i18n.js';

export const ACTIVE_MS = 2 * 60 * 1000;
export const RECENT_MS = 15 * 60 * 1000;

/* first letters: "สมชาย ใจดี" → "สใ", "Somchai Jaidee" → "SJ"; Thai vowels that sit before a consonant are skipped */
export function initials(name) {
  const words = String(name || '?').trim().split(/\s+/).filter(Boolean);
  const first = w => [...w.replace(/^[เแโใไ]/, '')][0] || '';
  return (words.length > 1 ? first(words[0]) + first(words[1]) : first(words[0] || '?')).toUpperCase();
}

export function avatar(user, { cls = '', tip = '' } = {}) {
  const img = user?.avatar ? `<img src="${esc(user.avatar)}" alt="" referrerpolicy="no-referrer">` : esc(initials(user?.name));
  return `<span class="k-av ${cls}" data-tip="${esc(tip || user?.name || '')}">${img}</span>`;
}

/* viewers → the avatar row: active first, then faded, others dropped; never the signed-in user */
export function rowOf(viewers, { me, online = new Set(), now = Date.now() } = {}) {
  return (viewers || [])
    .filter(v => v?.user && String(v.user.id) !== String(me))
    .map(v => {
      const age = now - Date.parse(v.last_seen_at || 0);
      const here = online.has(String(v.user.id));
      return { ...v, state: here || age < ACTIVE_MS ? 'active' : age < RECENT_MS ? 'recent' : 'gone' };
    })
    .filter(v => v.state !== 'gone')
    .sort((a, b) => (a.state === b.state ? Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at) : a.state === 'active' ? -1 : 1));
}

export function avatarRow(viewers, opts = {}) {
  const row = rowOf(viewers, opts);
  const max = opts.max || 5;
  const shown = row.slice(0, max);
  const more = row.length - shown.length;
  return shown.map(v => avatar(v.user, {
    cls: v.state === 'recent' ? 'away' : '',
    tip: `${v.user.name} ${v.state === 'active' && opts.online?.has(String(v.user.id)) ? t('here_now') : t('last_seen', { date: shortDate(v.last_seen_at, true) })}`,
  })).join('') + (more > 0 ? `<span class="k-more tnum" data-tip="${esc(row.slice(max).map(v => v.user.name).join(', '))}">+${more}</span>` : '');
}

/*
 * Keeps the viewers list fresh. `onChange(viewers, online)` runs after every heartbeat and channel event.
 * `seen()` returns the prints to report with the next beat (and clears them).
 */
export function startPresence({ boot, api, slug, round, onChange, seen }) {
  const state = { viewers: [], online: new Set(), echo: null, timer: null };
  const changed = () => onChange?.(state.viewers, state.online);

  async function beat() {
    if (document.visibilityState === 'hidden') { return; }
    const prints = seen?.() || null;
    try {
      const r = await api.heartbeat(slug, round, prints && Object.keys(prints).length ? prints : null);
      if (Array.isArray(r?.viewers)) { state.viewers = r.viewers; changed(); }
    } catch { /* next beat */ }
  }

  async function joinReverb() {
    const p = boot.presence || {};
    if (p.mode !== 'reverb' || !p.reverb?.key || !p.channel) { return; }
    try {
      const [{ default: Echo }, { default: Pusher }] = await Promise.all([import('laravel-echo'), import('pusher-js')]);
      const tls = (p.reverb.scheme || 'https') === 'https';
      state.echo = new Echo({
        broadcaster: 'reverb', key: p.reverb.key, Pusher,
        wsHost: p.reverb.host, wsPort: p.reverb.port || 80, wssPort: p.reverb.port || 443, forceTLS: tls,
        enabledTransports: ['ws', 'wss'], authEndpoint: p.authEndpoint || '/broadcasting/auth',
        auth: { headers: { 'X-CSRF-TOKEN': boot.csrf || '' } },
      });
      /* a presence channel name without the "presence-" prefix: Echo adds it */
      state.echo.join(String(p.channel).replace(/^presence-/, ''))
        .here(users => { state.online = new Set(users.map(u => String(u.id))); merge(users); changed(); })
        .joining(u => { state.online.add(String(u.id)); merge([u]); changed(); })
        .leaving(u => { state.online.delete(String(u.id)); merge([u]); changed(); });
    } catch { /* polling still works */ }
  }
  /* someone on the channel who isn't in viewers yet shows up now */
  function merge(users) {
    const now = new Date().toISOString();
    users.forEach(u => {
      const v = state.viewers.find(x => String(x.user.id) === String(u.id));
      if (v) { v.last_seen_at = now; } else { state.viewers.unshift({ user: { id: u.id, name: u.name, avatar: u.avatar ?? null }, last_seen_at: now, active: true }); }
    });
  }

  function start(initial) {
    state.viewers = initial || [];
    changed();
    beat();
    state.timer = setInterval(beat, (+boot.presence?.heartbeat || 30) * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { beat(); } });
    joinReverb();
    /* faded and dropped avatars change with time alone */
    setInterval(changed, 30 * 1000);
  }

  return { start, beat, state };
}
