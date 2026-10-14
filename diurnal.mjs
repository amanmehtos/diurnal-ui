// Diurnal UI runtime. Include diurnal.css and this module on any page:
//
//   <link rel="stylesheet" href="diurnal.css">
//   <script type="module" src="diurnal.mjs"></script>
//
// Weather softens the light: clouds, fog and rain diffuse shadows the way they do
// outdoors. Live conditions come from Open-Meteo (free, no key) for the page's
// place, refreshed every 15 minutes; coordinates are rounded to 0.1°.
//
// It sets the theme (light = sun, dark = full moon) on <html data-dn-theme>, keeps the
// shadow variables on :root in step with the light source's real position, and fills
// any [data-dn-powered] element with the "Powered by Diurnal UI" mark. Pages that
// opt in to the full look add class="dn" to <body>.

import { enhanceAll, sheet } from './fluid.mjs';
import { autoLink, linkBoxes } from './links.mjs';
import { CLEAR, WEATHER_PRESETS, defaultPlace, lightSource, shadowFor, weatherFromOpenMeteo } from './sky.mjs';

const KEY = 'diurnal';
const read = (k, d) => { try { return localStorage.getItem(`${KEY}.${k}`) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(`${KEY}.${k}`, v); } catch {} };

const root = document.documentElement;
const listeners = new Set();

const state = {
  mode: read('mode', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  place: JSON.parse(read('place', 'null')) || defaultPlace(),
  override: null, // a Date to preview instead of now
  weatherMode: read('weather', 'live'), // 'live' or a WEATHER_PRESETS key
  live: JSON.parse(read('live', 'null')), // last fetched { at, place, weather }
  motion: read('motion', 'fluid'), // 'fluid' (springs, apple-design skill) or 'classic' (CSS transitions)
};
root.dataset.dnMotion = state.motion;

const weatherNow = () => (state.weatherMode === 'live' ? state.live?.weather || CLEAR : WEATHER_PRESETS[state.weatherMode] || CLEAR);

async function fetchWeather(force = false) {
  const { lat, lon } = state.place;
  const cached = state.live;
  const fresh = cached && Date.now() - cached.at < 15 * 60000 && Math.abs(cached.place.lat - lat) < 0.2 && Math.abs(cached.place.lon - lon) < 0.2;
  if (fresh && !force) return;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(1)}&longitude=${lon.toFixed(1)}&current=cloud_cover,weather_code,precipitation,visibility`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.statusText);
    const json = await res.json();
    state.live = { at: Date.now(), place: { lat, lon }, weather: weatherFromOpenMeteo(json.current) };
    write('live', JSON.stringify(state.live));
  } catch {
    // Offline or blocked: keep whatever we had (clear sky if nothing).
  }
  apply();
}

function apply() {
  const when = state.override || new Date();
  const source = lightSource(state.mode, when, state.place);
  const weather = weatherNow();
  const s = shadowFor(source, weather);
  root.dataset.dnTheme = state.mode;
  const set = (k, v) => root.style.setProperty(`--dn-${k}`, v);
  set('dx', s.dx.toFixed(3));
  set('dy', s.dy.toFixed(3));
  set('nx', s.nx.toFixed(3));
  set('ny', s.ny.toFixed(3));
  set('blur', s.blur.toFixed(3));
  set('alpha', s.alpha.toFixed(3));
  set('rim-k', s.rim.toFixed(3));
  const info = { motion: state.motion, mode: state.mode, when, place: state.place, source, shadow: s, weather, weatherMode: state.weatherMode, weatherAt: state.live?.at };
  for (const fn of listeners) fn(info);
  return info;
}

export { WEATHER_PRESETS };

let themeTimer;

export const diurnal = {
  get motion() { return state.motion; },
  setMotion(m) {
    state.motion = m === 'classic' ? 'classic' : 'fluid';
    write('motion', state.motion);
    root.dataset.dnMotion = state.motion;
    return apply();
  },
  sheet,
  get mode() { return state.mode; },
  get place() { return state.place; },
  setMode(mode) {
    // Ease the brightness change instead of snapping between light and dark.
    root.classList.add('dn-theming');
    clearTimeout(themeTimer);
    themeTimer = setTimeout(() => root.classList.remove('dn-theming'), 450);
    state.mode = mode === 'dark' ? 'dark' : 'light';
    write('mode', state.mode);
    return apply();
  },
  toggle() { return this.setMode(state.mode === 'dark' ? 'light' : 'dark'); },
  setPlace(place) {
    state.place = { lat: +place.lat, lon: +place.lon };
    write('place', JSON.stringify(state.place));
    fetchWeather(true);
    return apply();
  },
  // Preview another time of day (Date), or pass null to follow the clock again.
  preview(date) {
    state.override = date;
    return apply();
  },
  // 'live' follows the real weather; or pass a WEATHER_PRESETS key to preview one.
  setWeather(mode) {
    state.weatherMode = mode === 'live' || WEATHER_PRESETS[mode] ? mode : 'live';
    write('weather', state.weatherMode);
    if (state.weatherMode === 'live') fetchWeather();
    return apply();
  },
  subscribe(fn) {
    listeners.add(fn);
    fn(apply());
    return () => listeners.delete(fn);
  },
  refresh: apply,
};

// Sun and moon marks, drawn to follow the current mode.
export const ICONS = {
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor"/><g stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7"/></g></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="currentColor"/><circle cx="9.3" cy="9.6" r="1.5" fill="var(--dn-surface)" opacity=".35"/><circle cx="14.6" cy="14.2" r="2.1" fill="var(--dn-surface)" opacity=".3"/><circle cx="14.8" cy="8.4" r=".9" fill="var(--dn-surface)" opacity=".35"/></svg>',
};

// Where the "Powered by Diurnal UI" mark points. Override per page with
//   <footer data-dn-powered data-href="https://example.com/diurnal/"></footer>
export const HOME = 'https://github.com/amanmehtos/diurnal-ui';

function mountPowered(el) {
  el.classList.add('dn-powered');
  const href = el.dataset.href || HOME;
  el.innerHTML = `<a href="${href}" title="Diurnal UI component library"><span class="dn-powered__mark"></span>Powered by <b>Diurnal UI</b></a>`;
  const mark = el.querySelector('.dn-powered__mark');
  diurnal.subscribe(({ source }) => { mark.innerHTML = ICONS[source.body]; });
}

// Theme toggles: any [data-dn-toggle] button flips between sun and moon.
function mountToggle(btn) {
  btn.classList.add('dn-btn', 'dn-btn--icon');
  btn.type = 'button';
  btn.addEventListener('click', () => diurnal.toggle());
  diurnal.subscribe(({ mode }) => {
    btn.innerHTML = ICONS[mode === 'dark' ? 'moon' : 'sun'];
    btn.setAttribute('aria-label', mode === 'dark' ? 'Switch to light mode (sun)' : 'Switch to dark mode (moon)');
    btn.title = mode === 'dark' ? 'Moonlit — switch to sunlight' : 'Sunlit — switch to moonlight';
  });
}

apply();
setInterval(() => { if (!state.override) apply(); }, 60000);
fetchWeather();
setInterval(fetchWeather, 15 * 60000);
document.querySelectorAll('[data-dn-powered]').forEach(mountPowered);
document.querySelectorAll('[data-dn-toggle]').forEach(mountToggle);
// Scroll edge: [data-dn-scroll-edge] headers get .is-scrolled once content passes under them.
const edges = document.querySelectorAll('[data-dn-scroll-edge]');
if (edges.length) {
  const onScroll = () => edges.forEach((el) => el.classList.toggle('is-scrolled', scrollY > 4));
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
enhanceAll();
// Addresses in the page's text are links, and Ctrl/⌘+click opens one in a text box.
if (document.body?.classList.contains('dn')) { autoLink(document.body); linkBoxes(); }
