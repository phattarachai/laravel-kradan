/* dist/agent.js: a classic script, so document.currentScript (and its data-parent) is still set here. */
import { boot } from './agent.js';

boot(window, document.currentScript);
