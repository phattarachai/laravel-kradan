/*
 * KradanStore: the board JSON API, with the session cookie + CSRF like any Laravel web route.
 * A store is the board's only way out (3-shared-core.md): every method returns the shapes in 2-board-payload.md,
 * and `caps` says what this store offers. The workbench's LocalStore is the other one.
 */
export const KRADAN_CAPS = { multiUser: true, presence: true, decide: true, send: false, pages: false, uploads: true, share: true };

export function KradanStore(boot) {
  const base = String(boot.routes?.api || '/kradan/api').replace(/\/$/, '');
  async function call(method, path, body, { text = false } = {}) {
    const res = await fetch(`${base}/${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: text ? 'text/markdown, text/plain' : 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'X-CSRF-TOKEN': boot.csrf || '' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = new Error(`${res.status}`);
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) { return null; }
    return text ? res.text() : res.json();
  }
  const seg = s => encodeURIComponent(s);
  return {
    caps: KRADAN_CAPS,
    boards: panel => call('GET', `boards${panel ? `?panel=${seg(panel)}` : ''}`),
    board: (slug, round) => call('GET', `boards/${seg(slug)}${round ? `?round=${round}` : ''}`),
    pick: (slug, round, step, body) => call('PUT', `boards/${seg(slug)}/rounds/${round}/picks/${seg(step)}`, body),
    comment: (slug, round, body) => call('POST', `boards/${seg(slug)}/rounds/${round}/comments`, body),
    editComment: (id, body) => call('PATCH', `comments/${id}`, { body }),
    deleteComment: id => call('DELETE', `comments/${id}`),
    heartbeat: (slug, round, printsSeen) => call('POST', `boards/${seg(slug)}/heartbeat`, { round, ...(printsSeen ? { prints_seen: printsSeen } : {}) }),
    decide: slug => call('POST', `boards/${seg(slug)}/decide`, {}),
    createItem: (slug, body) => call('POST', `boards/${seg(slug)}/items`, body),
    patchItem: (id, body) => call('PATCH', `items/${id}`, body),
    deleteItem: id => call('DELETE', `items/${id}`),
    /* an image or a file: multipart, with upload progress (fetch can't report it) */
    uploadItem: (slug, fields, file, onProgress) => new Promise((resolve, reject) => {
      const form = new FormData();
      Object.entries(fields).forEach(([k, v]) => form.append(k, v ?? ''));
      form.append('file', file, file.name);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${base}/boards/${seg(slug)}/items`);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      xhr.setRequestHeader('X-CSRF-TOKEN', boot.csrf || '');
      xhr.upload.onprogress = e => { if (e.lengthComputable) { onProgress?.(e.loaded / e.total * 100); } };
      xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) { try { resolve(JSON.parse(xhr.responseText)); } catch (err) { reject(err); } } else { reject(Object.assign(new Error(String(xhr.status)), { status: xhr.status })); } };
      xhr.onerror = () => reject(new Error('network'));
      xhr.send(form);
    }),
    /* a deck's public links (manage only); a new one carries its url, the only time the token is shown */
    shares: slug => call('GET', `boards/${seg(slug)}/shares`),
    createShare: (slug, body) => call('POST', `boards/${seg(slug)}/shares`, body),
    revokeShare: id => call('DELETE', `shares/${id}`),
    exportMd: slug => call('GET', `boards/${seg(slug)}/export.md`, undefined, { text: true }),
  };
}
