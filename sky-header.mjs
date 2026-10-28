// Diurnal UI — the sky overhead, drawn.
//
// Everything this needs is already known. `sky.mjs` works out where the sun or
// moon is for the viewer's place and time, and `diurnal.mjs` keeps live
// conditions from Open-Meteo. Until now all of that only shaped shadows, so a
// fully overcast sky expressed itself as the absence of one. This draws it.
//
// It is an engraving, not a photograph: ink linework at low alpha, the way a
// book sets a diagram. That is the only honest way to put a sun on pale paper —
// a bright disc on near-white reads as a hole, while a ring with rays reads as
// the sun at any hour, in either theme, without ever reaching for a hue.
//
//   <div class="dn-sky" data-dn-sky></div>
//
// Or `skyHeader(el)` for one you mount yourself. Either way it subscribes to
// diurnal, so it follows the theme, the time scrubber and the weather presets
// with no state of its own.

import { diurnal } from './diurnal.mjs';

const TAU = Math.PI * 2;

// Snow rather than rain for the WMO codes that mean frozen: 71-77 is snowfall
// and grains, 85-86 snow showers. Everything else wet falls as a streak.
const frozen = (code) => (code >= 71 && code <= 77) || code === 85 || code === 86;

// A fixed shuffle, so the cloud banks and the rain do not re-deal themselves on
// every frame. Seeded by index alone: the same band is always the same band.
function noise(i, salt = 0) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function skyHeader(el) {
  if (el.dataset.dnSkyOn === '1') return;
  el.dataset.dnSkyOn = '1';

  const canvas = document.createElement('canvas');
  canvas.className = 'dn-sky__canvas';
  // Decorative: the information is ambient and repeated nowhere, so there is
  // nothing for a screen reader to miss and nothing worth announcing.
  canvas.setAttribute('aria-hidden', 'true');
  el.prepend(canvas);

  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  let w = 0;
  let h = 0;
  let info = null;
  let frame = null;
  let visible = true;
  let drops = [];

  const ink = () => getComputedStyle(el).getPropertyValue('--dn-ink').trim() || '#141414';
  const paper = () => getComputedStyle(el).getPropertyValue('--dn-bg').trim() || '#efefed';

  function resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const rect = el.getBoundingClientRect();
    w = Math.max(1, Math.round(rect.width));
    h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Enough drops to look like weather at this width, dealt once.
    drops = Array.from({ length: Math.ceil(w / 6) }, (_, i) => ({
      x: noise(i) * w,
      y: noise(i, 1) * h,
      len: 6 + noise(i, 2) * 10,
      speed: 0.55 + noise(i, 3) * 0.7,
    }));
    draw(performance.now());
  }

  /* ---- the layers, back to front ---------------------------------- */

  // Skylight. Overhead it gathers toward the light and thins away from it; with
  // the light down, or the sky closed in, it flattens to an even wash — which
  // is what an overcast day actually looks like.
  function drawSkylight(source, weather) {
    const closed = Math.min(1, weather.cloud * 0.7 + weather.fog * 0.5);
    ctx.fillStyle = withAlpha(ink(), 0.05 + 0.06 * closed);
    ctx.fillRect(0, 0, w, h);

    if (source.alt <= 0 || closed > 0.9) return;
    const { x, y } = discAt(source);
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(w * 0.35, h * 2));
    g.addColorStop(0, withAlpha(ink(), 0.1 * (1 - closed)));
    g.addColorStop(1, withAlpha(ink(), 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Where the light sits on the band. Azimuth runs left to right across the
  // day — sunrise near a quarter in, noon at the middle — and altitude lifts
  // it off the lower edge.
  function discAt(source) {
    // The top third is left alone: a band tall enough to be worth looking at
    // is tall enough that a high sun lands under whatever sits across the top
    // of the window — a masthead here, the Dynamic Island on a phone. The
    // light still rises and sets, within the part of the band that is visible.
    const ceiling = h * 0.34;
    const floorY = h - 12;
    const lift = Math.min(60, source.alt) / 60;
    return {
      x: ((source.az % 360) / 360) * w,
      y: floorY - lift * Math.max(0, floorY - ceiling),
      r: Math.max(9, Math.min(22, h * 0.14)),
    };
  }

  // The disc. Sun is a ring with rays, moon a disc with a shaded limb — the
  // difference is the drawing, not the colour, because there is only one.
  function drawDisc(source, weather) {
    if (source.alt <= 0) return; // below the horizon there is only skylight
    const { x, y, r } = discAt(source);
    // Cloud dims the disc rather than hiding it; fog hides it.
    const a = 0.62 * (1 - weather.cloud * 0.92) * (1 - weather.fog * 0.85);
    if (a <= 0.03) return;

    ctx.save();
    // A halo first, so the disc sits in light rather than on top of the page.
    const halo = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 3);
    halo.addColorStop(0, withAlpha(ink(), a * 0.22));
    halo.addColorStop(1, withAlpha(ink(), 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 3, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = withAlpha(ink(), a);
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';

    if (source.body === 'moon') {
      // Solid, because moonlight is reflected: a filled form, not a radiant one.
      ctx.fillStyle = withAlpha(ink(), a * 0.72);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.74, 0, TAU);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.58, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const t = (i / 12) * TAU;
        const inner = r * (i % 2 ? 0.8 : 0.86);
        const outer = r * (i % 2 ? 1.12 : 1.3);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(t) * inner, y + Math.sin(t) * inner);
        ctx.lineTo(x + Math.cos(t) * outer, y + Math.sin(t) * outer);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Cloud: banks of overlapping lobes, the nearer ones drifting faster. Count
  // and weight both rise with cover, so "partly" is a couple of thin banks and
  // "overcast" closes the band over.
  function drawCloud(weather, t) {
    const cover = weather.cloud;
    if (cover <= 0.02) return;
    const banks = Math.round(1 + cover * 3);
    for (let b = 0; b < banks; b++) {
      const depth = (b + 1) / banks; // 1 = nearest
      const drift = (t * 0.004 * depth) % (w + 240);
      const yBase = h * (0.18 + 0.5 * (1 - depth));
      ctx.save();
      // Blurred, because a cloud has no edge. Nearer banks are a little
      // sharper, which is most of what makes them read as nearer.
      ctx.filter = `blur(${(14 - depth * 7).toFixed(1)}px)`;
      ctx.fillStyle = withAlpha(ink(), 0.06 + 0.12 * cover * depth);
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const seed = b * 7 + i;
        const x = ((noise(seed) * (w + 240) + drift) % (w + 240)) - 120;
        const y = yBase + noise(seed, 1) * h * 0.1;
        const rx = (18 + noise(seed, 2) * 42) * (0.6 + depth * 0.7);
        const ry = rx * (0.34 + noise(seed, 3) * 0.16);
        ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
      }
      ctx.fill();
      ctx.restore();
    }
  }

  // Precipitation: strokes that fall, or flakes that waver. Density follows
  // `precip`, which is already 0..1 from the WMO code and the millimetres.
  function drawPrecip(weather, t) {
    if (weather.precip <= 0.02) return;
    const snow = frozen(weather.code ?? 0);
    const count = Math.round(drops.length * weather.precip);
    ctx.strokeStyle = withAlpha(ink(), 0.3 * weather.precip + 0.08);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1;

    for (let i = 0; i < count; i++) {
      const d = drops[i];
      if (snow) {
        const x = d.x + Math.sin((t * 0.0012 + i) * 1.3) * 6;
        const y = (d.y + t * 0.016 * d.speed) % (h + 12);
        ctx.beginPath();
        ctx.arc(x, y, 1.1, 0, TAU);
        ctx.fill();
      } else {
        const y = (d.y + t * 0.09 * d.speed) % (h + 20);
        ctx.beginPath();
        ctx.moveTo(d.x, y);
        ctx.lineTo(d.x - 2.5, y + d.len);
        ctx.stroke();
      }
    }
  }

  // Fog: the page's own colour laid back over everything, so the sky loses its
  // contrast rather than gaining a grey. Nothing is drawn on top of fog.
  function drawFog(weather) {
    if (weather.fog <= 0.02) return;
    ctx.fillStyle = withAlpha(paper(), Math.min(0.82, weather.fog * 0.8));
    ctx.fillRect(0, 0, w, h);
  }

  function draw(t) {
    if (!info || !w) return;
    const { source, weather } = info;
    ctx.clearRect(0, 0, w, h);
    drawSkylight(source, weather);
    drawDisc(source, weather);
    drawCloud(weather, t);
    drawPrecip(weather, t);
    drawFog(weather);
  }

  function loop(t) {
    draw(t);
    frame = requestAnimationFrame(loop);
  }

  // Still weather, a hidden tab, or a reader who asked for less motion: draw
  // the frame and stop. A slower animation is not what "reduce" asked for.
  function retime() {
    const moving =
      visible &&
      !document.hidden &&
      !reduced.matches &&
      info &&
      (info.weather.precip > 0.02 || info.weather.cloud > 0.02);
    if (moving && frame === null) frame = requestAnimationFrame(loop);
    if (!moving && frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
      draw(performance.now());
    }
  }

  const ro = new ResizeObserver(resize);
  ro.observe(el);

  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    retime();
  });
  io.observe(el);

  document.addEventListener('visibilitychange', retime);
  reduced.addEventListener('change', retime);

  diurnal.subscribe((next) => {
    info = next;
    el.dataset.dnSkyLabel = next.weather.label || '';
    draw(performance.now());
    retime();
  });

  resize();
}

// Canvas wants a colour it can alpha-blend; the tokens are hex or a colour
// function depending on the theme, so hand the work to color-mix and let the
// browser resolve whatever it was.
function withAlpha(color, alpha) {
  return `color-mix(in srgb, ${color} ${(alpha * 100).toFixed(1)}%, transparent)`;
}

// Auto-mount, the way the toggle and the tooltips do.
if (typeof document !== 'undefined') {
  const mount = () => document.querySelectorAll('[data-dn-sky]').forEach(skyHeader);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
}
