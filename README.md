# Diurnal UI

A monochrome component library lit by the sky. In **light mode the sun** casts every shadow; in **dark mode a full moon** does. Shadows follow the light source's real path across the viewer's sky, so the interface quietly turns with the day.

No build step, no dependencies, no framework — plain CSS and ES modules. Open `index.html` and it runs.

Built for and used by Pantheon, Monastic Hill Studios' internal app suite.

## Install

Copy the files you want into whatever serves your static assets, or clone the repo:

```html
<link rel="stylesheet" href="diurnal.css">
<script type="module" src="diurnal.mjs"></script>

<body class="dn">                        <!-- opt the page in to the Diurnal look -->
  <button data-dn-toggle></button>      <!-- sun / moon theme switch -->
  <button class="dn-btn dn-btn--primary">Save</button>
  <footer data-dn-powered></footer>     <!-- "Powered by Diurnal UI" -->
</body>
```

Nothing is styled until a `.dn-*` class or `body.dn` is used, so the files are safe to include anywhere.

```js
import { diurnal } from './diurnal.mjs';
diurnal.setMode('dark');            // moon
diurnal.setPlace({ lat: 28.6, lon: 77.2 });
diurnal.preview(new Date(2026, 8, 19, 7, 30));  // any time; null = follow the clock
diurnal.setWeather('overcast');   // or 'live' (default), 'clear', 'partly', 'rain', 'fog'
diurnal.subscribe(({ mode, source, shadow, weather }) => {});
```

The library page (`index.html`) is the full demo: a sky chart, a time scrubber, weather presets and every component.

### External services

Two, both optional and keyless:

- **Google Fonts** — Libre Baskerville and IBM Plex Mono, loaded by `diurnal.css`. Self-host them if you'd rather not call out.
- **[Open-Meteo](https://open-meteo.com)** — live weather, free and no API key. Only called when weather is `live` (the default); `diurnal.setWeather('clear')` turns it off.

## Type

Set like a novel, in **Libre Baskerville** for everything except code, which uses IBM Plex Mono. Headings are regular weight, with italic sub-heads; labels and running heads are small capitals; prose is justified and hyphenated. Book helpers: `.dn-prose` (justified, indented paragraphs), `.dn-dropcap`, `.dn-chapter` (italic chapter line), `hr.dn-fleuron` (❦ section break).

## How the light works

**Weather** shapes the light too. Live conditions (cloud cover, WMO weather code, precipitation, visibility) come from Open-Meteo for the page's place, rounded to 0.1°, refreshed every 15 minutes and cached in the browser. Cloud, fog and rain raise the *diffusion* of the light: shadows turn soft, short and faint and gather straight beneath things; a fully overcast sky is nearly shadowless. The library page can preview Clear, Partly cloudy, Overcast, Rain and Fog, and has a "Use my location" button (browser permission, only when clicked) so live weather matches the viewer's real sky.

`sky.mjs` works out where the light is:

- **Sun** — standard low-precision solar position (declination by day of year, hour angle from local solar time) for the viewer's latitude and longitude.
- **Full moon** — sits opposite the sun: the sun's position twelve hours on, at the opposite declination. It rises at sunset, peaks at midnight and sets at dawn.
- **Place** — longitude is guessed from the browser's time zone and latitude defaults to 20°N; both can be set on the library page (stored per browser). No location permission is requested.

The screen is treated as the ground seen from above, north at the top. Shadows fall away from the light (sun in the east → shadows to the left); their length is cot(altitude), capped near the horizon; moonlight is softer and cooler, with a faint lit rim on the edge facing the light. Below the horizon only soft skylight remains, straight down.

`diurnal.mjs` writes the result to `:root` every minute:

| Variable | Meaning |
|---|---|
| `--dn-dx`, `--dn-dy` | Shadow offset per px of elevation |
| `--dn-nx`, `--dn-ny` | Unit shadow direction (rim on the opposite edge) |
| `--dn-blur` | Blur per px of elevation |
| `--dn-alpha` | Shadow strength |
| `--dn-rim-k` | Strength of the lit rim (dimmed by cloud) |

Components set `--dn-elev` (px) and share one shadow recipe.

## The sky, drawn

Everything above shapes shadows. `sky-header.mjs` draws it instead:

```html
<div class="dn-sky" data-dn-sky></div>
```

An engraving, not a photograph — ink linework at low alpha, the way a book sets
a diagram. That is the only honest way to put a sun on pale paper: a bright disc
on near-white reads as a hole, while a ring with rays reads as the sun in either
theme without reaching for a hue. The **sun is radiant** (a ring and rays) and
the **moon is solid** (a filled disc), because moonlight is reflected; the
difference is the drawing, never the colour.

Cloud drifts in blurred banks whose weight follows cover, rain falls as strokes
and snow as flakes — chosen by the WMO code, so sleet is not drawn as rain —
and fog lays the page's own colour back over everything, so the sky loses its
contrast rather than gaining a grey. Below the horizon the disc is simply
absent.

The band **fades on three edges** so it has no edge anywhere, inset or
full-bleed. Anything placed inside it sits on the sky and keeps its own pointer
events, so a title or a status line can live there.

It subscribes to `diurnal`, so it follows the theme, the time scrubber and the
weather presets with no state of its own. It draws **only when there is
something to animate**: a clear sky is a still frame, and so is a hidden tab, a
band scrolled out of view, or a reader who asked for reduced motion — which
gets a correct still frame rather than a slower animation.

## Motion

Diurnal follows the principles in Apple's *Designing Fluid Interfaces*, by way of Emil Kowalski's MIT-licensed work on the subject:

- **Springs, not durations** (`motion.mjs`): damping ratio + response. Default `1.0 / 0.35s` (no bounce); `0.8` only after a flick (momentum, sheets). Springs start from the current on-screen value and velocity, so anything can be grabbed and reversed mid-flight.
- **1:1 drags** with pointer capture, a ~10px intent threshold, and release velocity handed to the spring.
- **Momentum projection** `(v/1000)·d/(1−d)` decides where a flick lands; **rubber-banding** resists past edges.
- **Compositor-only interaction**: press squeezes (`scale(.97)`) on pointer-down; hover rises toward the light and fades in a second shadow layer — `box-shadow` is only repainted when the sky moves.
- **Materials**: `.dn-material` (translucent + backdrop blur, lit top edge), `--thick` for large surfaces.
- **Accessibility**: `prefers-reduced-motion` (springs jump, no transforms), `prefers-reduced-transparency` (solid materials), `prefers-contrast: more` (solid, stronger borders). Type and control sizes are in `rem`, so the UI follows the browser's text size. Tracking tightens with size.

Fluid components: switch (drag or flick the knob), segmented control (spring-driven indicator), sheet (`.dn-sheet`, drag-to-dismiss), and the library page's draggable sky.

`html[data-dn-motion]` is `fluid` by default; `classic` restores plain CSS transitions, and the library page has a **Motion** switch to compare. `diurnal.setMotion('classic' | 'fluid')`.

## Components

| Component | Class |
|---|---|
| Button (primary, default, outline, ghost; sm/lg/icon; groups) | `.dn-btn` |
| Card (flat, default, float), well | `.dn-card`, `.dn-well` |
| Row — a card as control · body · aside, for lists that carry actions | `.dn-row` (+ `__body`, `__aside`) |
| Nav — rows with counts, for sidebars | `.dn-nav` (+ `__item`, `__label`, `__count`) |
| Divider, and the same rule with a word in it | `.dn-divider`, `.dn-divider--labelled` |
| Input, select, textarea, label, hint | `.dn-input`, `.dn-select`, `.dn-textarea`, `.dn-field` |
| Checkbox, radio, switch | `.dn-check`, `.dn-radio`, `.dn-switch` |
| Segmented control, tabs | `.dn-seg`, `.dn-tabs` |
| Badge (solid, outline, danger), key, progress, tooltip | `.dn-badge`, `.dn-kbd`, `.dn-progress`, `[data-dn-tip]` |
| Sheet, material | `.dn-sheet` (+ `[data-dn-sheet-open]`, `[data-dn-sheet-close]`), `.dn-material` |
| Sky — a band showing the weather overhead, fading into the page | `.dn-sky` (+ `--tall`, `--short`, `[data-dn-sky]`) |
| Theme toggle, powered-by mark | `[data-dn-toggle]`, `[data-dn-powered]` |
| Screen-reader-only text | `.dn-sr-only` |
| Token field — offers something as a trigger character is typed | `token-field.mjs`, `.dn-tokens` |
| Image editor — a picture framed before it is kept | `image-editor.mjs`, `.dn-crop` |
| Dialogs — asking for a line of text, or whether to go ahead | `dialog.mjs`, `.dn-ask` |
| Paste target — a picture pasted (Ctrl+V / ⌘V) where it goes | `paste.mjs`, `[data-dn-paste]` |
| Links — addresses in text become links; Ctrl/⌘+click opens one in a text box | `links.mjs`, `a.dn-autolink` |

Most of Diurnal is CSS; those last five are behaviour, so they live in modules of their own.

**`ask()` and `confirmAction()`** replace the browser's `prompt()` and `confirm()`, which are the one place an app stops looking like itself: Chrome's grey bar, Chrome's font, the page's hostname. They also say more — `list` names what the answer is about to change, `check` refuses an answer while it is wrong, and `danger: true` marks the destructive one and leaves the focus on Cancel so Enter cannot do it by accident. Escape, Cancel and the scrim all resolve to no rather than throwing, and focus returns where it came from.

**`tokenField(field, { items, insert })`** knows nothing about what it offers — hang it on a form field and give it a list. Arrows move, Enter or a click takes one, Escape closes. The list is made the first time it is needed, so a field built before it is on the page still works.

**`frameImage(source, { aspect, edge })`** frames a picture in the shape the slot wants: drag to move it, scroll or the slider to zoom, arrows to nudge. The frame can never run off the picture — the smallest zoom is the one that just covers it — and what comes back is that rectangle at the size asked for, so what is stored is what was framed rather than whatever a centre crop happened to catch. It resolves to `null` when it is cancelled. `source` is a File, a Blob or a same-origin URL.

```js
const blob = await frameImage(file, { aspect: 21 / 9, edge: 2560 });
if (blob) upload(blob);
```

**`pasteTarget(el, onFiles, { single, accept, hint })`** lets a picture be pasted onto `el` instead of saved to a file and dragged in. The target under the pointer takes it (it says "Ctrl+V to paste", or ⌘V on a Mac, while pointed at); failing that, the one holding the focus; failing that, the only one on the page. With several and none chosen, every one lights up for a moment rather than one being guessed. Pastes with no picture in them pass straight through, so text still pastes into fields. A clipboard picture's made-up name (`image.png`) is dropped, so nothing captions it. `pasteKey` is the shortcut as this platform writes it, for hints.

```js
pasteTarget(gallery, (files) => upload(files));
```

**Links** are on by themselves on any `body.dn` page: every `http(s)://` or `www.` address in the page's text becomes a link (`a.dn-autolink`, new tab), including text added later, while links, buttons, code, form fields, editable areas and anything under `[data-dn-nolink]` are left alone. A sentence's closing full stop or bracket isn't taken as part of the address. In an input, a textarea or an editable area, **Ctrl+click** (⌘+click on a Mac) on an address opens it. `linkify(text)` gives the same as a fragment, for building; `autoLink(el)` turns it on under another element.

```js
el.append(linkify('Pack: https://example.com/kyc.zip.'));
```

## Files

| Path | What |
|---|---|
| `sky.mjs` | Sun and full-moon positions → shadow parameters |
| `sky-header.mjs` | `skyHeader()`: that same sky, drawn as a header band |
| `diurnal.mjs` | Runtime: theme, light variables, toggle, powered-by mark |
| `diurnal.css` | Tokens and components |
| `motion.mjs` | Springs, momentum projection, rubber-banding, 1:1 drag |
| `fluid.mjs` | Fluid switch, segmented control and sheet behaviours |
| `dialog.mjs` | `ask()` and `confirmAction()`, in place of the browser's own |
| `paste.mjs` | `pasteTarget()`: pictures pasted onto whatever takes uploads |
| `links.mjs` | `autoLink()`, `linkify()`, `linkBoxes()`: web addresses as links |
| `token-field.mjs` | `tokenField()`: offers something as a trigger character is typed |
| `image-editor.mjs` | `frameImage()`: a picture framed before it is kept |
| `index.html`, `library.mjs`, `library.css` | The library page (sky chart, time scrubber, component gallery) |

## Credits

- **Motion** — principles from Apple's *Designing Fluid Interfaces*, distilled by [Emil Kowalski](https://emilkowal.ski) (MIT).
- **Libre Baskerville** — Impallari Type, [SIL Open Font License 1.1](https://openfontlicense.org).
- **IBM Plex Mono** — IBM, [SIL Open Font License 1.1](https://openfontlicense.org).
- **Weather** — [Open-Meteo](https://open-meteo.com), CC BY 4.0.

## License

[MIT](LICENSE).
