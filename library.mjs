// The Diurnal UI library page: sky chart, time scrubber and demo wiring.
import { WEATHER_PRESETS, diurnal } from './diurnal.mjs';
import { trajectory } from './sky.mjs';
import { SPRINGS, drag, project, rubberband, spring } from './motion.mjs';
import { tokenField } from './token-field.mjs';
import { frameImage } from './image-editor.mjs';
import { ask, confirmAction } from './dialog.mjs';
import { pasteTarget, pasteKey } from './paste.mjs';

const $ = (id) => document.getElementById(id);
const W = 600, H = 220, PAD = { l: 34, r: 12, t: 14, b: 26 };
const x = (minutes) => PAD.l + (minutes / 1440) * (W - PAD.l - PAD.r);
const y = (alt) => PAD.t + ((90 - alt) / 180) * (H - PAD.t - PAD.b);
const fmt = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const deg = (v) => `${Math.round(v)}°`;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (az) => COMPASS[Math.round(az / 45) % 8];

let playing = null;

function minutesOf(d) { return d.getHours() * 60 + d.getMinutes(); }

function drawChart({ mode, when, place, source }) {
  const pts = trajectory(mode, when, place, 10);
  const line = (list) => list.map((p, i) => `${i ? 'L' : 'M'}${x(p.minutes).toFixed(1)} ${y(p.alt).toFixed(1)}`).join('');
  // Split the path into above/below-horizon runs.
  const runs = [];
  for (const p of pts) {
    const up = p.alt >= 0;
    const last = runs[runs.length - 1];
    if (!last || last.up !== up) runs.push({ up, pts: last ? [last.pts[last.pts.length - 1], p] : [p] });
    else last.pts.push(p);
  }
  let svg = '';
  for (let h = 0; h <= 24; h += 6) svg += `<line class="grid" x1="${x(h * 60)}" x2="${x(h * 60)}" y1="${PAD.t}" y2="${H - PAD.b}"/><text class="label" x="${x(h * 60)}" y="${H - 8}" text-anchor="middle">${String(h).padStart(2, '0')}:00</text>`;
  for (const a of [90, 45, -45, -90]) svg += `<text class="label" x="${PAD.l - 6}" y="${y(a) + 3}" text-anchor="end">${a}°</text>`;
  for (const r of runs) {
    if (r.up) svg += `<path class="area" d="${line(r.pts)}L${x(r.pts[r.pts.length - 1].minutes)} ${y(0)}L${x(r.pts[0].minutes)} ${y(0)}Z"/>`;
    svg += `<path class="${r.up ? 'path' : 'path-below'}" d="${line(r.pts)}"/>`;
  }
  svg += `<line class="horizon" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(0)}" y2="${y(0)}"/><text class="label" x="${W - PAD.r}" y="${y(0) - 5}" text-anchor="end">horizon</text>`;
  const m = minutesOf(when);
  svg += `<line class="now" x1="${x(m)}" x2="${x(m)}" y1="${PAD.t}" y2="${H - PAD.b}"/>`;
  svg += `<circle class="body-ring" cx="${x(m)}" cy="${y(source.alt)}" r="11"/><circle class="body" cx="${x(m)}" cy="${y(source.alt)}" r="6"/>`;
  $('sky-chart').innerHTML = svg;
}

diurnal.subscribe((info) => {
  const { mode, when, place, source, shadow, weather, weatherMode, weatherAt } = info;
  const body = source.body === 'moon' ? 'Full moon' : 'Sun';
  $('sky-body').textContent = `${body} · ${mode === 'dark' ? 'dark mode' : 'light mode'}${playing || $('live').getAttribute('aria-pressed') === 'false' ? ' · preview' : ''}`;
  $('sky-time').textContent = fmt(when);
  $('sky-read').innerHTML = source.alt > 0
    ? `altitude ${deg(source.alt)}<br>from the ${compass(source.az)} (${deg(source.az)})<br>shadow ×${Math.hypot(shadow.dx, shadow.dy).toFixed(2)}`
    : `below the horizon<br>skylight only`;
  const choices = [['live', 'Live'], ...Object.entries(WEATHER_PRESETS).map(([k, w]) => [k, w.label])];
  const seg = $('weather');
  if (!seg.querySelector('button')) seg.insertAdjacentHTML('beforeend', choices.map(([k, label]) => `<button type="button" data-w="${k}">${label}</button>`).join(''));
  seg.querySelectorAll('button[data-w]').forEach((b) => { const on = String(b.dataset.w === weatherMode); if (b.getAttribute('aria-pressed') !== on) b.setAttribute('aria-pressed', on); });
  const pct = (v) => `${Math.round(v * 100)}%`;
  $('weather-read').innerHTML = weatherMode === 'live'
    ? (weatherAt ? `${weather.label} · cloud ${pct(weather.cloud)}<br>Open-Meteo · ${fmt(new Date(weatherAt))}` : 'fetching…')
    : `preview · diffusion ${pct(shadow.diffusion)}`;
  drawChart(info);
  if (document.activeElement !== $('scrub')) $('scrub').value = minutesOf(when);
  if (document.activeElement !== $('lat')) $('lat').value = place.lat;
  if (document.activeElement !== $('lon')) $('lon').value = Math.round(place.lon * 10) / 10;
});

function previewAt(minutes) {
  const d = new Date();
  d.setHours(0, minutes, 0, 0);
  $('live').setAttribute('aria-pressed', 'false');
  $('live').classList.remove('dn-btn--primary');
  diurnal.preview(d);
}

function goLive() {
  stopPlay();
  $('live').setAttribute('aria-pressed', 'true');
  $('live').classList.add('dn-btn--primary');
  diurnal.preview(null);
}

function stopPlay() {
  if (!playing) return;
  cancelAnimationFrame(playing);
  playing = null;
  $('play').textContent = 'Play a day';
}

$('scrub').addEventListener('input', (e) => { stopPlay(); previewAt(+e.target.value); });
$('live').addEventListener('click', goLive);
$('play').addEventListener('click', () => {
  if (playing) return stopPlay();
  $('play').textContent = 'Pause';
  let m = +$('scrub').value;
  let last = performance.now();
  const tick = (now) => {
    m = (m + ((now - last) / 12000) * 1440) % 1440; // a whole day in 12 seconds
    last = now;
    previewAt(Math.floor(m));
    playing = requestAnimationFrame(tick);
  };
  playing = requestAnimationFrame(tick);
});
for (const id of ['lat', 'lon']) {
  $(id).addEventListener('change', () => {
    const lat = Math.max(-66, Math.min(66, +$('lat').value || 0));
    const lon = Math.max(-180, Math.min(180, +$('lon').value || 0));
    diurnal.setPlace({ lat, lon });
  });
}
$('live').setAttribute('aria-pressed', 'true');
$('weather').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-w]');
  if (b) diurnal.setWeather(b.dataset.w);
});
$('locate').addEventListener('click', () => {
  if (!navigator.geolocation) return;
  $('locate').disabled = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => { $('locate').disabled = false; diurnal.setPlace({ lat: Math.round(pos.coords.latitude * 10) / 10, lon: Math.round(pos.coords.longitude * 10) / 10 }); },
    () => { $('locate').disabled = false; },
    { maximumAge: 3600000, timeout: 10000 },
  );
});

// Demo interactions for the segmented control and tabs.
document.querySelectorAll('[data-seg]').forEach((g) => g.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
}));
document.querySelectorAll('[data-tabs]').forEach((g) => g.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
}));

// Motion switch: Fluid (apple-design) vs Classic (plain CSS), to compare side by side.
const motionSeg = $('motion');
const syncMotion = () => motionSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.motion === diurnal.motion)));
motionSeg.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-motion]');
  if (!b) return;
  diurnal.setMotion(b.dataset.motion);
  syncMotion();
});
syncMotion();

// Scroll edge on the translucent bar.
const bar = $('bar');
const onScroll = () => bar.classList.toggle('is-scrolled', scrollY > 4);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Draggable sky (fluid only): grab anywhere on the chart and drag the light through
// the day 1:1; let go and it carries the flick's momentum to where it was heading,
// rubber-banding at midnight on either side.
const chart = $('sky-chart');
const minutesPerPx = () => 1440 / ((chart.clientWidth || 600) * (W - PAD.l - PAD.r) / W);
const sky = spring(0, (v) => previewAt(Math.round(Math.max(0, Math.min(1439, v)))), SPRINGS.momentum);
let grabbed = 0;
drag(chart, {
  axis: 'x',
  threshold: 3,
  onStart: () => { sky.stop(); stopPlay(); grabbed = +$('scrub').value; },
  onMove: ({ dx }) => {
    if (diurnal.motion === 'classic') return;
    let m = grabbed + dx * minutesPerPx();
    if (m < 0) m = rubberband(m, 1440);
    if (m > 1439) m = 1439 + rubberband(m - 1439, 1440);
    sky.set(m);
  },
  onEnd: ({ vx }) => {
    if (diurnal.motion === 'classic') return;
    const v = vx * minutesPerPx(); // minutes per second
    const landing = Math.max(0, Math.min(1439, sky.value + project(v)));
    sky.to(landing, { velocity: v, params: SPRINGS.momentum });
  },
});


// ---- The two components that need a demo rather than a swatch.

// A token field, offering the Input Actions a game like KYC binds.
tokenField($('f-token'), {
  items: [
    { name: 'IA_Interact', note: 'E' },
    { name: 'IA_Crouch', note: 'C' },
    { name: 'IA_Sprint', note: 'Left Shift (hold)' },
    { name: 'IA_Throw', note: 'G' },
    { name: 'IA_Jump', note: 'Space' },
    { name: 'IA_Consume', note: 'F' },
  ],
});

// The image editor, in each of the shapes an app might frame things to.
const SHAPES = [['21 / 9', 'Header', 21 / 9], ['3 / 4', 'Portrait', 3 / 4], ['1 / 1', 'Square', 1], ['4 / 3', 'Shot', 4 / 3]];
let shape = SHAPES[0];
const shapes = $('demo-crop-shape');
if (shapes) {
  const paint = () => shapes.replaceChildren(...SHAPES.map((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(s === shape));
    b.textContent = s[1];
    b.onclick = () => { shape = s; paint(); };
    return b;
  }));
  paint();
}
$('demo-crop')?.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.hidden = true;
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.remove();
    if (!file) return;
    const blob = await frameImage(file, { aspect: shape[2], edge: 1600, title: `Frame the picture · ${shape[0]}` });
    if (!blob) return;
    const out = $('demo-crop-out');
    out.src = URL.createObjectURL(blob);
    out.hidden = false;
    out.style.aspectRatio = shape[0];
  });
  document.body.append(input);
  input.click();
});

// The dialogs, with the two things they do that the browser's own cannot: refuse an
// answer while it is wrong, and list what the answer is about to change.
const said = (text) => { const out = $('demo-ask-out'); if (out) out.textContent = text; };
$('demo-ask')?.addEventListener('click', async () => {
  const to = await ask({
    title: 'Rename IA_Interact',
    note: 'This rewrites every piece of writing that names it, as well as its 3 bindings:',
    list: ['Mechanic: Opening a door', 'Hint: Find the back door', 'Hint: The loading bay'],
    label: 'New name',
    value: 'IA_Interact',
    confirm: 'Rename everywhere',
    warn: 'An Input Action is Unreal\u2019s name for it. Renaming here changes this project only.',
    check: (v) => (/^IA_[A-Za-z0-9_]{1,60}$/.test(v) ? null : 'An Input Action looks like IA_Interact.'),
  });
  said(to ? `Renamed to ${to}.` : 'Left as it was.');
});
$('demo-confirm')?.addEventListener('click', async () => {
  const yes = await confirmAction({
    title: 'Take IA_Interact out of the mapping?',
    note: 'This unbinds it from all 3 buttons, on every platform. The artwork stays in the pack; only the binding goes.',
    warn: 'Three pieces of writing will still say {IA_Interact} and will show nothing until something is bound to it again.',
    confirm: 'Unbind everywhere',
    danger: true,
  });
  said(yes ? 'Unbound everywhere.' : 'Left bound.');
});

// Two paste targets, so pasting with the pointer elsewhere shows the choice.
if ($('demo-paste-key')) $('demo-paste-key').textContent = pasteKey;
for (const id of ['demo-paste-a', 'demo-paste-b']) {
  const slot = $(id);
  if (!slot) continue;
  slot.tabIndex = 0;
  pasteTarget(slot, ([file]) => {
    slot.style.backgroundImage = `url(${URL.createObjectURL(file)})`;
    slot.classList.add('is-full');
  }, { single: true });
}

// The links demo's hint names the key this platform uses.
if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '') && $('f-links-hint')) $('f-links-hint').textContent = '⌘+click the address to open it.';
