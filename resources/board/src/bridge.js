/*
 * The board's side of the frame protocol (see agent.js for the message list). The board only listens to
 * frames it created, and only when the message comes from an opaque origin ("null", the sandbox) or the
 * round's content origin (option C). It never reads a frame's DOM.
 */

export function allowedOrigins(baseUrl, appOrigin) {
  const set = new Set(['null']);
  try {
    const o = new URL(baseUrl, appOrigin).origin;
    if (o !== appOrigin) { set.add(o); }
  } catch { /* a bad base_url only leaves "null" */ }
  return set;
}

export function createBridge({ win, timeout = 4000 }) {
  /* contentWindow → { frame, origins, on } */
  const frames = new Map();
  const pending = new Map();
  let seq = 0;

  function find(source) {
    for (const [w, f] of frames) { if (w === source) { return f; } }
    return null;
  }

  function accepts(e) {
    const f = find(e.source);
    if (!f || !f.origins.has(e.origin)) { return null; }
    const d = e.data;
    if (!d || typeof d !== 'object' || d.kradan !== 1 || typeof d.type !== 'string') { return null; }
    return f;
  }

  function onMessage(e) {
    const f = accepts(e);
    if (!f) { return false; }
    const d = e.data;
    if (d.re !== undefined) {
      const p = pending.get(d.re);
      if (p && p.win === e.source) { pending.delete(d.re); clearTimeout(p.timer); p.resolve(d); }
      return true;
    }
    f.on?.(d.type, d, f);
    return true;
  }

  /* register a frame's window before it loads: messages from anything else are dropped */
  function add(contentWindow, { origins, on, ...rest }) {
    const f = { win: contentWindow, origins, on, ...rest };
    frames.set(contentWindow, f);
    return f;
  }
  function remove(contentWindow) {
    frames.delete(contentWindow);
    for (const [id, p] of pending) { if (p.win === contentWindow) { clearTimeout(p.timer); pending.delete(id); p.resolve(null); } }
  }
  function clear() { [...frames.keys()].forEach(remove); }

  /* a request; resolves with the reply, or null when the frame doesn't answer in time */
  function ask(contentWindow, type, data = {}) {
    const id = ++seq;
    return new Promise(resolve => {
      const timer = setTimeout(() => { pending.delete(id); resolve(null); }, timeout);
      pending.set(id, { win: contentWindow, resolve, timer });
      /* the frame's origin is opaque, so "*" is the only target that reaches it; nothing secret is sent */
      try { contentWindow.postMessage({ kradan: 1, type, id, ...data }, '*'); } catch { clearTimeout(timer); pending.delete(id); resolve(null); }
    });
  }
  function tell(contentWindow, type, data = {}) {
    try { contentWindow.postMessage({ kradan: 1, type, ...data }, '*'); } catch { /* frame gone */ }
  }

  win.addEventListener('message', onMessage);
  return { add, remove, clear, ask, tell, onMessage, accepts, frames };
}
