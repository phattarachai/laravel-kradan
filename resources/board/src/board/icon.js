/* Kradan's own mark (owner's pick D, design round 2, 2026-10-27): the tab icon and the top-left corner. */
export const MARK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="7" fill="#2f6f62"/><rect x="7" y="8" width="18" height="13" rx="2" fill="#f4f1ea"/><path d="M11 21l-1.5 4M21 21l1.5 4" stroke="#f4f1ea" stroke-width="1.8" stroke-linecap="round"/><path d="M10.5 12.5h7M10.5 16h4.5" stroke="#2f6f62" stroke-width="1.6" stroke-linecap="round"/><path d="M20.6 17.4l-1.2-4.6 4.6 1.2-1.6 1.1 1.4 1.4-0.8 0.8-1.4-1.4z" fill="#e8590c"/></svg>';

import { esc } from './util.js';

/* the top-left corner, as in Figma: Kradan's mark without a name, then the app it serves as the workspace */
export function corner(boot) {
  const brand = boot.brand || {};
  const logo = brand.logo ? `<img class="k-logo" src="${esc(brand.logo)}" alt="">` : brand.name ? `<span class="k-logo">${esc(brand.name.slice(0, 2))}</span>` : '';
  return `<a class="k-brand" href="${esc(boot.routes?.index || '/kradan')}"><span class="k-mark">${MARK}</span>${brand.name ? `<span class="k-ws">${logo}<span class="k-bname">${esc(brand.name)}</span></span>` : ''}</a>`;
}

export function setFavicon() {
  const link = document.querySelector('link[rel="icon"]') || Object.assign(document.createElement('link'), { rel: 'icon' });
  link.type = 'image/svg+xml';
  link.href = `data:image/svg+xml,${encodeURIComponent(MARK)}`;
  document.head.appendChild(link);
}
