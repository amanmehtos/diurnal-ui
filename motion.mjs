// Diurnal UI — fluid motion, after Apple's "Designing Fluid Interfaces" (see the
// apple-design skill). Springs are described the way Apple does: a damping ratio
// (1 = critically damped, no bounce; < 1 overshoots) and a response in seconds
// (how quickly it gets there; there is no fixed duration).
//
// Every spring starts from the current on-screen value and velocity, so anything
// can be grabbed and redirected mid-flight without a jump.

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const SPRINGS = {
  default: { damping: 1, response: 0.35 }, // UI default: no overshoot
  move: { damping: 1, response: 0.4 }, // repositioning
  momentum: { damping: 0.8, response: 0.4 }, // only after a flick or throw
  sheet: { damping: 0.8, response: 0.3 }, // drawers and sheets
};

// A one-dimensional spring. `set` jumps, `to` animates from wherever it is now,
// keeping its current velocity (so reversals blend instead of hitting a wall).
export function spring(initial, onUpdate, params = SPRINGS.default) {
  let value = initial;
  let velocity = 0;
  let target = initial;
  let cfg = params;
  let frame = null;
  let last = 0;
  let resolveDone = null;

  const step = (now) => {
    const dt = Math.min(0.032, (now - last) / 1000 || 0.016);
    last = now;
    // Apple's parameterisation: stiffness from response, damping from the ratio (unit mass).
    const k = (2 * Math.PI / cfg.response) ** 2;
    const c = 4 * Math.PI * cfg.damping / cfg.response;
    // Semi-implicit Euler in small substeps for stability.
    const n = 4;
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const force = -k * (value - target) - c * velocity;
      velocity += force * h;
      value += velocity * h;
    }
    const settled = Math.abs(velocity) < 0.01 && Math.abs(value - target) < 0.01;
    if (settled) {
      value = target;
      velocity = 0;
    }
    onUpdate(value, velocity);
    if (settled) {
      frame = null;
      resolveDone?.();
      resolveDone = null;
    } else {
      frame = requestAnimationFrame(step);
    }
  };

  return {
    get value() { return value; },
    get velocity() { return velocity; },
    get target() { return target; },
    // Animate to `next`. `opts.velocity` hands off a gesture's release velocity (units/s).
    to(next, opts = {}) {
      target = next;
      if (opts.params) cfg = opts.params;
      if (opts.velocity != null) velocity = opts.velocity;
      if (reduceMotion()) return this.set(next);
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(step);
      }
      return new Promise((r) => { resolveDone = r; });
    },
    // Jump with no animation (used while a finger drags 1:1).
    set(next, v = 0) {
      if (frame) cancelAnimationFrame(frame);
      frame = null;
      value = target = next;
      velocity = v;
      onUpdate(value, velocity);
      resolveDone?.();
      resolveDone = null;
      return Promise.resolve();
    },
    stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = null;
    },
  };
}

// Where a flick would come to rest, using Apple's exponential-decay projection.
// velocity in units/s; deceleration 0.998 ≈ scroll feel, 0.99 snappier.
export function project(velocity, deceleration = 0.998) {
  return ((velocity / 1000) * deceleration) / (1 - deceleration);
}

// Progressive resistance past a boundary: the further out, the less it follows.
export function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

// 1:1 pointer drag with pointer capture, a ~10px intent threshold, and a short
// position history for release velocity (px/s). Handlers receive deltas from the
// grab point, so whatever was grabbed stays under the finger.
export function drag(el, { axis = 'x', threshold = 10, onStart, onMove, onEnd, onTap } = {}) {
  let id = null;
  let origin = null;
  let active = false;
  let history = [];
  let suppressClick = false;
  // A drag ends with a pointerup that the browser may turn into a click; swallow it.
  el.addEventListener('click', (e) => {
    if (!suppressClick) return;
    suppressClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    id = e.pointerId;
    origin = { x: e.clientX, y: e.clientY, t: performance.now() };
    history = [{ x: e.clientX, y: e.clientY, t: origin.t }];
    active = false;
    onStart?.(e);
  });

  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const now = performance.now();
    history.push({ x: e.clientX, y: e.clientY, t: now });
    while (history.length > 2 && now - history[0].t > 100) history.shift();
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    if (!active) {
      const along = axis === 'x' ? Math.abs(dx) : axis === 'y' ? Math.abs(dy) : Math.hypot(dx, dy);
      if (along < threshold) return;
      active = true;
      // Capture only once it's clearly a drag, so plain taps still click normally.
      el.setPointerCapture(id);
      suppressClick = true;
    }
    onMove?.({ dx, dy, e });
  });

  const finish = (e, cancelled) => {
    if (e.pointerId !== id) return;
    id = null;
    const first = history[0];
    const lastPt = history[history.length - 1];
    const dt = Math.max(1, lastPt.t - first.t) / 1000;
    const vx = (lastPt.x - first.x) / dt;
    const vy = (lastPt.y - first.y) / dt;
    if (active) setTimeout(() => { suppressClick = false; }, 0);
    if (active) onEnd?.({ dx: e.clientX - origin.x, dy: e.clientY - origin.y, vx, vy, cancelled, e });
    else if (!cancelled) onTap?.(e);
    active = false;
  };
  el.addEventListener('pointerup', (e) => finish(e, false));
  el.addEventListener('pointercancel', (e) => finish(e, true));
}
