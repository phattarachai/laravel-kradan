/* Kradan's own mark (design round 2, option A until the owner picks): the tab icon and the top-left corner. */
export const MARK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="7" fill="#1d2127"/><rect x="7" y="9" width="11" height="11" rx="1.5" fill="#ffd166" transform="rotate(-6 12.5 14.5)"/><rect x="15" y="13" width="10" height="10" rx="1.5" fill="#f4f1ea"/><circle cx="20" cy="13.2" r="2.1" fill="#e8590c"/></svg>';

export function setFavicon() {
  const link = document.querySelector('link[rel="icon"]') || Object.assign(document.createElement('link'), { rel: 'icon' });
  link.type = 'image/svg+xml';
  link.href = `data:image/svg+xml,${encodeURIComponent(MARK)}`;
  document.head.appendChild(link);
}
