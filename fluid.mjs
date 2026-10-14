// Diurnal UI — fluid component behaviours (apple-design skill). Loaded by diurnal.mjs.
//
// Motion has two settings, stored per browser and set on <html data-dn-motion>:
//   fluid   springs, 1:1 drags, momentum and rubber-banding (default)
//   classic plain CSS transitions, kept so the difference can be compared
// Enhancements are always installed; in classic mode CSS hides them and the handlers stand down.

import { SPRINGS, drag, project, rubberband, spring } from './motion.mjs';

const root = document.documentElement;
export const isFluid = () => root.dataset.dnMotion !== 'classic';

// ---------------------------------------------------------------- Switch
// The knob is a real element driven by a spring. Tap to flip, or drag it: it
// tracks the finger 1:1, resists past either end, and on release a flick decides
// where it lands (momentum projection), with the finger's velocity handed off.
export function enhanceSwitch(label) {
  const input = label.querySelector('input');
  if (!input || label.dataset.dnFluid) return;
  label.dataset.dnFluid = '1';
  const track = document.createElement('span');
  track.className = 'dn-switch__track';
  input.replaceWith(track);
  track.append(input);
  const knob = document.createElement('span');
  knob.className = 'dn-switch__knob';
  knob.setAttribute('aria-hidden', 'true');
  track.append(knob);

  const travel = () => track.clientWidth - knob.offsetWidth - 4;
  const pos = spring(input.checked ? 1 : 0, (v) => {
    knob.style.transform = `translateX(${(v * travel()).toFixed(2)}px)`;
    track.style.setProperty('--dn-switch-fill', Math.min(1, Math.max(0, v)).toFixed(3));
  }, SPRINGS.default);
  pos.set(input.checked ? 1 : 0);

  input.addEventListener('change', () => pos.to(input.checked ? 1 : 0));

  let startV = 0;
  drag(track, {
    axis: 'x',
    threshold: 4,
    onStart: () => { startV = pos.value; pos.stop(); },
    onMove: ({ dx }) => {
      if (!isFluid()) return;
      const raw = startV + dx / travel();
      // Rubber-band past either end.
      const over = raw < 0 ? raw : raw > 1 ? raw - 1 : 0;
      pos.set(over ? (raw < 0 ? 0 : 1) + rubberband(over, 1, 0.55) * 0.35 : raw);
    },
    onEnd: ({ vx }) => {
      if (!isFluid()) return;
      const v = vx / travel();
      const landing = pos.value + project(v, 0.99);
      const on = landing > 0.5;
      pos.to(on ? 1 : 0, { velocity: v, params: SPRINGS.momentum });
      if (on !== input.checked) {
        input.checked = on;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    },
  });
}

// ---------------------------------------------------------------- Segmented control
// A single lifted indicator glides between options on a spring (x and width as
// independent springs), picking up from wherever it is if you tap mid-flight.
export function enhanceSeg(seg) {
  if (seg.dataset.dnFluid) return;
  seg.dataset.dnFluid = '1';
  const ind = document.createElement('span');
  ind.className = 'dn-seg__indicator';
  ind.setAttribute('aria-hidden', 'true');
  seg.prepend(ind);
  let w = 0;
  let ty = 0;
  let tx = 0;
  const paint = () => { ind.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px)`; };
  const x = spring(0, (v) => { tx = v; paint(); }, SPRINGS.move);
  // Options can wrap onto several rows, so the indicator follows y and height too.
  const y = spring(0, (v) => { ty = v; paint(); }, SPRINGS.move);
  const height = spring(0, (v) => { ind.style.height = `${v.toFixed(2)}px`; }, SPRINGS.move);
  const width = spring(0, (v) => { w = v; ind.style.width = `${v.toFixed(2)}px`; }, SPRINGS.move);

  const selected = () => seg.querySelector('button[aria-pressed="true"], button[aria-selected="true"]');
  let placed = false;
  const place = () => {
    const b = selected();
    if (!b) { ind.style.opacity = '0'; return; }
    ind.style.opacity = '1';
    const left = b.offsetLeft;
    const top = b.offsetTop;
    const bw = b.offsetWidth;
    const bh = b.offsetHeight;
    if (!placed || !isFluid()) { x.set(left); y.set(top); width.set(bw); height.set(bh); placed = true; return; }
    x.to(left);
    y.to(top);
    width.to(bw);
    height.to(bh);
  };
  new MutationObserver(place).observe(seg, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected'] });
  new ResizeObserver(() => { placed = false; place(); }).observe(seg);
  requestAnimationFrame(place);
  return { place, get width() { return w; } };
}

// ---------------------------------------------------------------- Sheet
// A bottom sheet on a translucent material. Opens and closes along the same path,
// follows the finger 1:1 on its handle, rubber-bands when pulled past open, and a
// downward flick dismisses it (projected landing past half its height).
export function sheet(el) {
  if (el._dnSheet) return el._dnSheet;
  const panel = el.querySelector('.dn-sheet__panel');
  const scrim = el.querySelector('.dn-sheet__scrim');
  const h = () => panel.offsetHeight;
  let open = false;
  let opener = null;
  const y = spring(1, (v) => {
    // v: 0 = open, 1 = closed (as a fraction of the panel's height)
    panel.style.transform = `translateY(${(v * 100).toFixed(3)}%)`;
    scrim.style.opacity = String(Math.max(0, Math.min(1, 1 - v)));
    if (v >= 0.999 && !open) el.hidden = true;
  }, SPRINGS.sheet);

  const api = {
    open(from) {
      opener = from || document.activeElement;
      el.hidden = false;
      open = true;
      el.classList.toggle('is-classic', !isFluid());
      if (isFluid()) {
        if (y.value >= 0.999) y.set(1);
        y.to(0, { params: SPRINGS.sheet });
      } else {
        y.set(0);
      }
      panel.focus({ preventScroll: true });
    },
    close() {
      open = false;
      if (isFluid()) y.to(1, { params: SPRINGS.default });
      else y.set(1);
      opener?.focus?.({ preventScroll: true });
    },
    get isOpen() { return open; },
  };

  let start = 0;
  drag(panel.querySelector('.dn-sheet__handle') || panel, {
    axis: 'y',
    threshold: 6,
    onStart: () => { start = y.value; y.stop(); },
    onMove: ({ dy }) => {
      if (!isFluid()) return;
      const raw = start + dy / h();
      y.set(raw < 0 ? rubberband(raw, 1, 0.55) * 0.5 : raw); // resist when pulled above fully open
    },
    onEnd: ({ vy }) => {
      if (!isFluid()) return;
      const v = vy / h();
      const landing = y.value + project(v, 0.99);
      if (landing > 0.5) { open = false; y.to(1, { velocity: v, params: SPRINGS.sheet }); opener?.focus?.({ preventScroll: true }); }
      else y.to(0, { velocity: v, params: SPRINGS.sheet });
    },
  });
  scrim.addEventListener('click', api.close);
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') api.close(); });
  el.querySelectorAll('[data-dn-sheet-close]').forEach((b) => b.addEventListener('click', api.close));
  el._dnSheet = api;
  return api;
}

export function enhanceAll(scope = document) {
  scope.querySelectorAll('.dn-switch').forEach(enhanceSwitch);
  scope.querySelectorAll('.dn-seg').forEach(enhanceSeg);
  scope.querySelectorAll('.dn-sheet').forEach(sheet);
  scope.querySelectorAll('[data-dn-sheet-open]').forEach((btn) => {
    if (btn.dataset.dnFluid) return;
    btn.dataset.dnFluid = '1';
    btn.addEventListener('click', () => sheet(document.getElementById(btn.dataset.dnSheetOpen)).open(btn));
  });
}
