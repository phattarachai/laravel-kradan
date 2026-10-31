/* dist/deck.js: the deck runtime (deck/runtime.js). A classic script, so document.currentScript and its
   data-parent are read before anything waits. */
import { createDeck, parentOf } from './deck/runtime.js';
import { modeOf } from './deck/core.js';

const script = document.currentScript;

function boot() {
  if (!document.body?.hasAttribute('data-k-deck') || window.__kradanDeck) { return; }
  const mode = modeOf(location.search, window.parent !== window);
  const deck = createDeck({ win: window, doc: document, mode, parentOrigin: mode === 'present' ? parentOf(script, window) : null });
  window.__kradanDeck = deck;
  deck.listen();
  const n = mode === 'solo' ? +location.hash.slice(1) || 1 : +new URLSearchParams(location.search).get('n') || 1;
  deck.start(n, mode === 'thumb' ? -1 : 0);
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot); } else { boot(); }
