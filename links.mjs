// Diurnal's links: web addresses in text are links. Two halves.
//
// Shown text: any http(s):// or www. address in the page's text becomes a link that
// opens in a new tab, including text that arrives later (a comment posted, a card
// redrawn). Left alone: text already in a link, buttons, code, editable areas, form
// fields, and anything under [data-dn-nolink]. The runtime starts it on pages with
// body.dn; any other element opts in with autoLink(el).
//
// Text boxes: in an input, a textarea or an editable area, Ctrl+click (⌘+click on a
// Mac) on an address opens it, as in a code editor. A box with an address in it says so
// in its tooltip.
//
//   import { linkify } from './links.mjs';
//   el.append(linkify('Ref: https://example.com/pack.'));   // text and <a>s

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const HINT_RE = /https?:\/\/|www\./i;
const SKIP = 'a, button, code, pre, kbd, samp, script, style, noscript, textarea, select, option, svg, math, [contenteditable], [data-dn-nolink]';
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

// An address as written, without the full stop or bracket that ends the sentence round it.
function trimEnd(url) {
  let u = url;
  for (;;) {
    const last = u.slice(-1);
    if (/[.,;:!?'"*_~]/.test(last)) { u = u.slice(0, -1); continue; }
    if (last === ')' && (u.match(/\(/g) || []).length < (u.match(/\)/g) || []).length) { u = u.slice(0, -1); continue; }
    if (last === ']' && !u.includes('[')) { u = u.slice(0, -1); continue; }
    return u;
  }
}
const hrefOf = (url) => (/^www\./i.test(url) ? `https://${url}` : url);

// Each address in `text`, with where it starts and ends.
export function findLinks(text) {
  const out = [];
  for (const m of String(text).matchAll(URL_RE)) {
    const url = trimEnd(m[0]);
    if (url.length > 4 && !/^www\.?$/i.test(url)) out.push({ url, href: hrefOf(url), start: m.index, end: m.index + url.length });
  }
  return out;
}

// `text` as a fragment: plain text, with its addresses as links.
export function linkify(text) {
  const frag = document.createDocumentFragment();
  let at = 0;
  for (const l of findLinks(text)) {
    if (l.start > at) frag.append(text.slice(at, l.start));
    const a = document.createElement('a');
    a.className = 'dn-autolink';
    a.href = l.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = l.url;
    frag.append(a);
    at = l.end;
  }
  if (at < text.length) frag.append(text.slice(at));
  return frag;
}

// ------------------------------------------------------------------ shown text
function linkText(node) {
  const text = node.nodeValue;
  if (!text || !HINT_RE.test(text) || !node.parentElement || node.parentElement.closest(SKIP)) return;
  if (!findLinks(text).length) return;
  node.replaceWith(linkify(text));
}

function walk(root) {
  if (root.nodeType === 3) { linkText(root); return; }
  if (root.nodeType !== 1 || root.closest?.(SKIP)) return;
  const found = [];
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (HINT_RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  for (let n = it.nextNode(); n; n = it.nextNode()) found.push(n);
  found.forEach(linkText);
}

const watched = new WeakSet();
// Links the addresses under `root` now, and in whatever is put there later.
export function autoLink(root = document.body) {
  if (!root || watched.has(root)) return;
  watched.add(root);
  walk(root);
  let pending = new Set();
  let queued = false;
  const flush = () => {
    queued = false;
    const nodes = pending;
    pending = new Set();
    nodes.forEach((n) => { if (n.isConnected) walk(n); });
  };
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') pending.add(r.target);
      else r.addedNodes.forEach((n) => pending.add(n));
    }
    if (!queued && pending.size) { queued = true; queueMicrotask(flush); }
  }).observe(root, { childList: true, subtree: true, characterData: true });
}

// ------------------------------------------------------------------ text boxes
// The address at `offset` in `text`, if there is one.
const linkAt = (text, offset) => findLinks(text).find((l) => offset >= l.start && offset <= l.end) || null;

function linkInBox(e) {
  const t = e.target;
  if (t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && /^(text|search|url|)$/.test(t.type))) {
    return linkAt(t.value, t.selectionStart ?? -1);
  }
  if (t.closest?.('[contenteditable]')) {
    const s = getSelection();
    if (!s?.anchorNode || s.anchorNode.nodeType !== 3) return null;
    return linkAt(s.anchorNode.nodeValue, s.anchorOffset);
  }
  return null;
}

let boxesOn = false;
export function linkBoxes() {
  if (boxesOn) return;
  boxesOn = true;
  // The click has put the caret on the spot by mouseup; that says which address.
  document.addEventListener('mouseup', (e) => {
    if (e.button !== 0 || !(isMac ? e.metaKey : e.ctrlKey)) return;
    const l = linkInBox(e);
    if (l) open(l.href, '_blank', 'noopener,noreferrer');
  });
  // A box with an address in it says how to open it.
  const hint = `${isMac ? '⌘' : 'Ctrl'}+click a link to open it`;
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement)) return;
    const mark = () => {
      const has = HINT_RE.test(t.value);
      if (has && !t.title) { t.title = hint; t.dataset.dnLinkHint = ''; } else if (!has && t.dataset.dnLinkHint !== undefined) { t.removeAttribute('title'); delete t.dataset.dnLinkHint; }
    };
    mark();
    t.addEventListener('input', mark);
    t.addEventListener('focusout', () => t.removeEventListener('input', mark), { once: true });
  });
}
