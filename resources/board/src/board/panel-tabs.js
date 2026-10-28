/*
 * The panel's two icon tabs (owner, 2026-10-28): ความเห็น (comments, notes, uploads, drawings with a note) and
 * ภาพวาด (plain drawings). The open one is kept per viewer; ความเห็น until they pick.
 */
export const PANEL_TABS = ['comments', 'drawings'];
export const tabOf = v => (PANEL_TABS.includes(v) ? v : PANEL_TABS[0]);

/* each tab's count: the comment threads plus the notes people added, and the plain drawings */
export const panelCounts = ({ threads = [], notes = [], drawings = [] }) => ({ comments: threads.length + notes.length, drawings: drawings.length });

/* arrow keys move between the tabs (wrapping), Home and End go to the ends; anything else is not ours */
export function tabKey(key, cur) {
  const i = PANEL_TABS.indexOf(tabOf(cur)), n = PANEL_TABS.length;
  if (key === 'ArrowRight' || key === 'ArrowDown') { return PANEL_TABS[(i + 1) % n]; }
  if (key === 'ArrowLeft' || key === 'ArrowUp') { return PANEL_TABS[(i - 1 + n) % n]; }
  if (key === 'Home') { return PANEL_TABS[0]; }
  if (key === 'End') { return PANEL_TABS[n - 1]; }
  return null;
}
