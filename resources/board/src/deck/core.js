/*
 * The deck runtime's arithmetic, apart from the DOM so it can be tested: the stage scale, build steps, where
 * a slide goes next, and the geometry of a diagram link. Coordinates are the slide's own (1920×1080).
 */
export const W = 1920;
export const H = 1080;

/* the slide fits the viewport whole, letterboxed */
export function fitScale(vw, vh) {
  return vw > 0 && vh > 0 ? Math.min(vw / W, vh / H) : 1;
}

/*
 * Each [data-k-build] gets a step: its number, or one after the step before it. Equal numbers show together.
 * Returns the step per element and the sorted distinct steps.
 */
export function buildSteps(values) {
  let last = 0;
  const per = values.map(v => {
    const n = parseInt(v, 10);
    last = n > 0 ? n : last + 1;
    return last;
  });
  return { per, steps: [...new Set(per)].sort((a, b) => a - b) };
}

/* is a build of step `step` shown once `build` steps of `steps` are revealed? */
export const shownAt = (step, build, steps) => build > 0 && step <= steps[Math.min(build, steps.length) - 1];

/*
 * Where a move lands. `builds[i]` is how many build steps slide i+1 has. Forward reveals the next build, then
 * opens the next slide with none shown; back hides the last build, then opens the previous slide fully built.
 * Past either end it stays put.
 */
export function step(at, dir, builds) {
  const total = builds.length;
  const max = n => builds[n - 1] || 0;
  if (dir > 0) {
    if (at.build < max(at.n)) { return { n: at.n, build: at.build + 1 }; }
    return at.n < total ? { n: at.n + 1, build: 0 } : at;
  }
  if (at.build > 0) { return { n: at.n, build: at.build - 1 }; }
  return at.n > 1 ? { n: at.n - 1, build: max(at.n - 1) } : at;
}

/* a goto's target, clamped; a build of -1 (or past the end) shows every build */
export function clampAt(n, build, builds) {
  const total = Math.max(1, builds.length);
  const at = Math.min(total, Math.max(1, Math.round(+n) || 1));
  const max = builds[at - 1] || 0;
  const b = +build < 0 || +build > max ? max : Math.max(0, Math.round(+build) || 0);
  return { n: at, build: b };
}

/* `data-k-link="from to"` with its options */
export function linkSpec(el) {
  const [from, to] = String(el.getAttribute('data-k-link') || '').trim().split(/\s+/);
  const dir = el.getAttribute('data-k-dir');
  return {
    from, to,
    style: ['dashed', 'dotted'].includes(el.getAttribute('data-k-style')) ? el.getAttribute('data-k-style') : 'solid',
    start: dir === 'both',
    end: dir !== 'none',
    route: el.getAttribute('data-k-route') === 'elbow' ? 'elbow' : 'straight',
  };
}

const center = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/* where the ray from a box's centre towards (tx, ty) leaves the box, `gap` further out */
export function edgePoint(r, tx, ty, gap = 0) {
  const c = center(r), dx = tx - c.x, dy = ty - c.y;
  if (!dx && !dy) { return c; }
  const t = Math.min(dx ? (r.w / 2) / Math.abs(dx) : Infinity, dy ? (r.h / 2) / Math.abs(dy) : Infinity);
  const len = Math.hypot(dx, dy);
  return { x: c.x + dx * t + (dx / len) * gap, y: c.y + dy * t + (dy / len) * gap };
}

const r1 = v => Math.round(v * 10) / 10;

/*
 * The connector between two boxes ({x, y, w, h}): an SVG path and the point its label sits on. Straight runs
 * centre to centre, cut at both borders; elbow leaves from the facing sides and turns twice.
 */
export function connector(a, b, { route = 'straight', gap = 6 } = {}) {
  const ca = center(a), cb = center(b);
  if (route === 'elbow') {
    const across = Math.abs(cb.x - ca.x) >= Math.abs(cb.y - ca.y);
    if (across) {
      const sgn = Math.sign(cb.x - ca.x) || 1;
      const s = { x: ca.x + sgn * (a.w / 2 + gap), y: ca.y }, e = { x: cb.x - sgn * (b.w / 2 + gap), y: cb.y };
      const mx = (s.x + e.x) / 2;
      return { d: `M${r1(s.x)} ${r1(s.y)}H${r1(mx)}V${r1(e.y)}H${r1(e.x)}`, label: { x: r1(mx), y: r1((s.y + e.y) / 2) } };
    }
    const sgn = Math.sign(cb.y - ca.y) || 1;
    const s = { x: ca.x, y: ca.y + sgn * (a.h / 2 + gap) }, e = { x: cb.x, y: cb.y - sgn * (b.h / 2 + gap) };
    const my = (s.y + e.y) / 2;
    return { d: `M${r1(s.x)} ${r1(s.y)}V${r1(my)}H${r1(e.x)}V${r1(e.y)}`, label: { x: r1((s.x + e.x) / 2), y: r1(my) } };
  }
  const s = edgePoint(a, cb.x, cb.y, gap), e = edgePoint(b, ca.x, ca.y, gap);
  return { d: `M${r1(s.x)} ${r1(s.y)}L${r1(e.x)} ${r1(e.y)}`, label: { x: r1((s.x + e.x) / 2), y: r1((s.y + e.y) / 2) } };
}

/* a view-transition-name from a data-k-id */
export const morphName = id => `k-${String(id).replace(/[^\w-]/g, '_')}`;

/* which runtime a page gets: one slide at a time on its own (solo), driven by the board (present), a still
   thumbnail (thumb), or every slide stacked for the board to crop (review) */
export function modeOf(search, framed) {
  const k = new URLSearchParams(search).get('k');
  if (!framed) { return 'solo'; }
  return k === 'present' || k === 'thumb' ? k : 'review';
}
