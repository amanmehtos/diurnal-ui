// Diurnal's image editor: frame a picture before it is kept.
//
// A picture dropped into a slot used to be cropped from its middle, because that is
// what object-fit does and nothing was ever asked. This asks: the picture sits in a
// frame of the shape the slot wants, and it can be dragged, zoomed and nudged until
// the right part of it is inside. What comes back is that rectangle, drawn at the size
// the caller asked for — so what is stored is what was framed.
//
// It never lets the frame run off the picture: the smallest zoom is the one that just
// covers it, and panning stops at the edges. Nothing here knows what the picture is of,
// so Athena uses it for a mechanic's header and a character's turnaround alike.
//
//   const blob = await frameImage(file, { aspect: 21 / 9, edge: 2560 });
//   if (blob) upload(blob);           // null when it was cancelled
//
// `source` is a File, a Blob or a same-origin URL. Cross-origin pictures taint the
// canvas and cannot be exported, which is why Athena passes its own /api URLs.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  node.append(...kids.flat().filter((k) => k != null && k !== false));
  return node;
};

async function bitmapOf(source) {
  if (typeof source === 'string') {
    const res = await fetch(source, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('That picture could not be read.');
    return createImageBitmap(await res.blob());
  }
  return createImageBitmap(source);
}

export async function frameImage(source, {
  aspect = 16 / 9,
  edge = 2560,
  title = 'Frame the picture',
  hint = 'Drag to move it, scroll or use the slider to zoom.',
  confirm = 'Use this framing',
  type,
  quality = 0.9,
} = {}) {
  const bitmap = await bitmapOf(source);
  // Everything is kept in picture pixels: `scale` is picture → frame, and (x, y) is the
  // point of the picture under the middle of the frame.
  const FRAME_W = 960;
  const frameH = Math.round(FRAME_W / aspect);
  const cover = Math.max(FRAME_W / bitmap.width, frameH / bitmap.height);
  let scale = cover;
  let x = bitmap.width / 2;
  let y = bitmap.height / 2;

  const canvas = el('canvas', { class: 'dn-crop__canvas', width: FRAME_W, height: frameH, 'aria-label': 'The framed picture' });
  const ctx = canvas.getContext('2d');
  const zoom = el('input', { class: 'dn-crop__zoom', type: 'range', min: 100, max: 400, value: 100, 'aria-label': 'Zoom' });
  const read = el('span', { class: 'dn-crop__read' });

  const hold = () => {
    // The frame may never leave the picture, so the middle has to stay a half-frame in.
    const halfW = FRAME_W / 2 / scale;
    const halfH = frameH / 2 / scale;
    x = clamp(x, halfW, bitmap.width - halfW);
    y = clamp(y, halfH, bitmap.height - halfH);
  };
  const paint = () => {
    scale = Math.max(scale, cover);
    hold();
    const w = FRAME_W / scale;
    const h = frameH / scale;
    ctx.clearRect(0, 0, FRAME_W, frameH);
    ctx.drawImage(bitmap, x - w / 2, y - h / 2, w, h, 0, 0, FRAME_W, frameH);
    zoom.value = String(Math.round((scale / cover) * 100));
    read.textContent = `${Math.round((scale / cover) * 100)}% · ${bitmap.width}×${bitmap.height}`;
  };

  // Dragging moves the picture under the frame, so the cursor keeps hold of the same spot.
  let dragging = null;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = { px: e.clientX, py: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-held');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const shown = FRAME_W / canvas.getBoundingClientRect().width;
    x -= (e.clientX - dragging.px) * shown / scale;
    y -= (e.clientY - dragging.py) * shown / scale;
    dragging = { px: e.clientX, py: e.clientY };
    paint();
  });
  const letGo = () => { dragging = null; canvas.classList.remove('is-held'); };
  canvas.addEventListener('pointerup', letGo);
  canvas.addEventListener('pointercancel', letGo);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    scale = clamp(scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08), cover, cover * 4);
    paint();
  }, { passive: false });
  zoom.addEventListener('input', () => { scale = cover * (Number(zoom.value) / 100); paint(); });
  canvas.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 40 : 12;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) { e.preventDefault(); x += moves[e.key][0] / scale; y += moves[e.key][1] / scale; paint(); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); scale = clamp(scale * 1.1, cover, cover * 4); paint(); }
    else if (e.key === '-') { e.preventDefault(); scale = clamp(scale / 1.1, cover, cover * 4); paint(); }
  });
  canvas.tabIndex = 0;

  paint();

  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      removeEventListener('keydown', onKey);
      sheet.remove();
      bitmap.close();
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); finish(null); } };

    const use = el('button', { class: 'dn-btn dn-btn--sm dn-btn--primary', type: 'button', onclick: async () => {
      // Drawn again at the size the caller wants, from the same rectangle.
      const out = document.createElement('canvas');
      const wide = aspect >= 1;
      out.width = Math.round(wide ? Math.min(edge, FRAME_W / scale) : Math.min(edge, frameH / scale) * aspect);
      out.height = Math.round(out.width / aspect);
      const w = FRAME_W / scale;
      const h = frameH / scale;
      out.getContext('2d').drawImage(bitmap, x - w / 2, y - h / 2, w, h, 0, 0, out.width, out.height);
      const kind = type || (source && source.type === 'image/png' ? 'image/png' : 'image/jpeg');
      const blob = await new Promise((r) => out.toBlob(r, kind, quality));
      finish(blob || null);
    } }, confirm);

    const sheet = el('div', { class: 'dn-crop', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('div', { class: 'dn-crop__scrim', onclick: () => finish(null) }),
      el('div', { class: 'dn-crop__panel' },
        el('div', { class: 'dn-crop__head' },
          el('div', {}, el('h2', { class: 'dn-crop__title' }, title), el('p', { class: 'dn-crop__hint' }, hint)),
          read),
        el('div', { class: 'dn-crop__stage' }, canvas),
        el('div', { class: 'dn-crop__foot' },
          el('button', { class: 'dn-btn dn-btn--sm', type: 'button', onclick: () => { scale = cover; x = bitmap.width / 2; y = bitmap.height / 2; paint(); } }, 'Centre'),
          zoom,
          el('button', { class: 'dn-btn dn-btn--sm', type: 'button', onclick: () => finish(null) }, 'Cancel'),
          use)));

    document.body.append(sheet);
    addEventListener('keydown', onKey);
    canvas.focus();
  });
}
