// Diurnal UI — celestial engine.
//
// Light mode is lit by the sun, dark mode by a full moon. A full moon sits opposite
// the sun in the sky, so it rises at sunset, crosses the meridian at midnight and
// sets at sunrise; we model it as the sun's position twelve hours on, at the
// opposite declination. Positions use the standard low-precision solar formulas
// (good to a degree or two, which is plenty for a shadow).
//
// The screen is treated as the ground seen from above with north at the top, so a
// light source in the east casts shadows to the left and a low source casts long ones.

const RAD = Math.PI / 180;

export function dayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86400000);
}

// Solar declination in degrees for a day of the year.
export function declination(day) {
  return -23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10));
}

// Altitude and azimuth (degrees; azimuth from north, clockwise) of a body with
// declination `decl` at hour angle `hourAngle` seen from latitude `lat`.
export function horizontal(lat, decl, hourAngle) {
  const φ = lat * RAD, δ = decl * RAD, H = hourAngle * RAD;
  const alt = Math.asin(Math.sin(φ) * Math.sin(δ) + Math.cos(φ) * Math.cos(δ) * Math.cos(H));
  const azFromSouth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(φ) - Math.tan(δ) * Math.cos(φ));
  return { alt: alt / RAD, az: ((azFromSouth / RAD + 180) % 360 + 360) % 360 };
}

// Position of the light source for `mode` ('light' = sun, 'dark' = full moon).
export function lightSource(mode, date, { lat, lon }) {
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const solarTime = utcHours + lon / 15;
  let hourAngle = 15 * (solarTime - 12);
  let decl = declination(dayOfYear(date));
  if (mode === 'dark') {
    hourAngle += 180;
    decl = -decl;
  }
  return { body: mode === 'dark' ? 'moon' : 'sun', ...horizontal(lat, decl, hourAngle) };
}

// Weather, as the parts that matter to a shadow (each 0..1). Clear sky is the default.
export const CLEAR = { key: 'clear', label: 'Clear', cloud: 0, fog: 0, precip: 0 };
export const WEATHER_PRESETS = {
  clear: CLEAR,
  partly: { key: 'partly', label: 'Partly cloudy', cloud: 0.45, fog: 0, precip: 0 },
  overcast: { key: 'overcast', label: 'Overcast', cloud: 1, fog: 0, precip: 0 },
  rain: { key: 'rain', label: 'Rain', cloud: 1, fog: 0.2, precip: 0.7 },
  fog: { key: 'fog', label: 'Fog', cloud: 0.6, fog: 1, precip: 0 },
};

// Maps an Open-Meteo "current" block (WMO weather code, cloud %, precipitation mm,
// visibility m) to the shadow-relevant parts above.
export function weatherFromOpenMeteo(c) {
  const code = c.weather_code ?? 0;
  const cloud = Math.min(1, Math.max(0, (c.cloud_cover ?? 0) / 100));
  const fog = code === 45 || code === 48 ? 1 : c.visibility != null ? Math.max(0, Math.min(1, (10000 - c.visibility) / 9000)) : 0;
  const wet = (code >= 51 && code <= 67) || (code >= 71 && code <= 77) || code >= 80;
  const precip = wet ? Math.min(1, 0.4 + (c.precipitation ?? 0) / 4) : 0;
  const label = WMO[code] || (cloud > 0.85 ? 'Overcast' : cloud > 0.3 ? 'Partly cloudy' : 'Clear');
  return { key: 'live', label, cloud, fog, precip, code };
}
const WMO = { 0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Showers', 81: 'Showers', 82: 'Violent showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm, hail', 99: 'Thunderstorm, hail' };

// How diffuse the light is under this weather: 0 = hard direct light, 1 = no direct light.
export function diffusion(w = CLEAR) {
  return Math.min(1, w.cloud * 0.8 + w.fog * 0.7 + w.precip * 0.25);
}

// Turns a light-source position (and the weather) into shadow parameters.
//   dx, dy  shadow direction × length (multiply by an element's elevation in px)
//   nx, ny  unit direction of the shadow (used for the lit rim on the opposite edge)
//   blur    blur multiplier (moonlight is diffuse, sunlight crisp; clouds soften both)
//   alpha   shadow strength
//   rim     strength of the lit rim, 0..1
export function shadowFor(source, weather = CLEAR) {
  const up = source.alt > 0;
  const az = source.az * RAD;
  const moon = source.body === 'moon';
  // Direct light: a unit vector pointing away from the light, in screen space (x right = east, y down = south).
  let nx = -Math.sin(az);
  let ny = Math.cos(az);
  let length = Math.min(3.2, 0.25 + 1 / Math.tan(Math.max(source.alt, 4) * RAD)); // cot(alt), capped near the horizon
  let alpha = (moon ? 0.95 : 0.42) * Math.min(1, 0.55 + Math.sin(Math.max(source.alt, 0) * RAD));
  let blur = (moon ? 1.3 : 0.45) + length * 0.25;
  // Below the horizon there is no direct light at all, only skylight.
  const d = up ? diffusion(weather) : 1;
  // Diffuse light comes from the whole sky: shadows gather straight under things, short, soft and faint.
  const skyLen = 0.45;
  const mx = nx * length * (1 - d);
  const my = ny * length * (1 - d) + skyLen * d;
  const len = Math.hypot(mx, my) || 1;
  nx = mx / len;
  ny = my / len;
  length = Math.hypot(mx, my);
  alpha = alpha * (1 - d) + (moon ? 0.5 : 0.16) * d;
  blur = blur * (1 - d) + (moon ? 3 : 2.4) * d;
  return { up, nx, ny, dx: nx * length, dy: ny * length, blur, alpha, rim: up ? 1 - d * 0.75 : 0.25, diffusion: d };
}

// Samples the light source through a whole local day, for trajectory charts.
export function trajectory(mode, date, place, stepMinutes = 10) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const points = [];
  for (let m = 0; m <= 1440; m += stepMinutes) {
    const t = new Date(start.getTime() + m * 60000);
    points.push({ minutes: m, ...lightSource(mode, t, place) });
  }
  return points;
}

// A best guess at where the viewer is without asking for location: longitude from
// the browser's time zone, and a mid-northern latitude.
export function defaultPlace(date = new Date()) {
  return { lat: 20, lon: -date.getTimezoneOffset() / 4 };
}
