// Diurnal's paste target: a picture pasted (Ctrl+V, or ⌘V) onto anything that takes
// uploads, instead of being saved to a file first and dragged back in.
//
//   pasteTarget(gallery, (files) => upload(files));
//   pasteTarget(slot, (files) => frame(files[0]), { single: true });
//
// Which one gets it: the one under the pointer (it says "Ctrl+V to paste" while it is
// pointed at); failing that, the one holding the focus; failing that, the only one on
// the page. With several and none chosen it guesses nothing: every one of them lights
// up for a moment to say "point at me". A paste with no picture in it (text into a
// field) is left alone, so a target can sit around inputs.
//
// It knows nothing about uploading. A picture copied from a browser or a screenshot
// arrives named "image.png"; it is handed over with no name at all (".png"), so nothing
// makes a caption out of it. A copied file keeps its own name.

const targets = new WeakMap();
let listening = false;
let pointerAt = null;
let armed = null;
let choosing = null;

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
export const pasteKey = isMac ? '⌘V' : 'Ctrl+V';

// The registered target an element sits in, innermost first.
function targetOf(node) {
  for (let n = node; n; n = n.parentElement) { const t = targets.get(n); if (t && n.isConnected) return t; }
  return null;
}
const allTargets = () => [...document.querySelectorAll('[data-dn-paste]')].map((el) => targets.get(el)).filter(Boolean);
const underPointer = () => (pointerAt ? targetOf(document.elementFromPoint(pointerAt.x, pointerAt.y)) : null);

function armUnder() {
  const el = underPointer()?.el || null;
  if (el === armed) return;
  armed?.classList.remove('dn-paste--armed');
  armed = el;
  armed?.classList.add('dn-paste--armed');
}

// Nowhere chosen: show every place it could go.
function askWhere(all) {
  clearTimeout(choosing);
  all.forEach((t) => t.el.classList.add('dn-paste--choose'));
  choosing = setTimeout(() => all.forEach((t) => t.el.classList.remove('dn-paste--choose')), 2400);
}

function onPaste(e) {
  const pasted = [...(e.clipboardData?.files || [])];
  if (!pasted.length) return;
  const all = allTargets();
  const target = underPointer() || targetOf(document.activeElement) || (all.length === 1 ? all[0] : null);
  if (!target) {
    if (all.length) { e.preventDefault(); askWhere(all); }
    return;
  }
  const files = pasted.filter((f) => target.accept.test(f.type));
  if (!files.length) return;
  e.preventDefault();
  const named = files.map((f) => (/^image\.(png|jpe?g|gif|webp)$/i.test(f.name) ? new File([f], `.${f.type.split('/')[1] || 'png'}`, { type: f.type }) : f));
  target.el.classList.add('dn-paste--took');
  setTimeout(() => target.el.classList.remove('dn-paste--took'), 600);
  target.onFiles(target.single ? named.slice(0, 1) : named);
}

function listen() {
  listening = true;
  document.addEventListener('paste', onPaste);
  let queued = false;
  document.addEventListener('pointermove', (e) => {
    pointerAt = { x: e.clientX, y: e.clientY };
    if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; armUnder(); }); }
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointerAt = null; armUnder(); });
}

// Makes `el` take pasted pictures: onFiles(files) gets them as a list. `single` passes
// only the first; `accept` is the types it takes (images by default); `hint` is what it
// says while pointed at. Returns `el`.
export function pasteTarget(el, onFiles, { single = false, accept = /^image\//, hint = `${pasteKey} to paste` } = {}) {
  targets.set(el, { el, onFiles, single, accept });
  el.dataset.dnPaste = hint;
  if (!listening) listen();
  return el;
}
