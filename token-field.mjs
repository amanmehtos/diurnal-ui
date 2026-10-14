// Diurnal's token field: a text box that offers something as soon as a trigger
// character is typed, and writes what is chosen in its place.
//
// It knows nothing about what it is offering — Athena hangs it on a mechanic's rules to
// offer the controls Heph binds, Fates on an objective's hint for the same list — so
// anything with names worth remembering can use it.
//
//   tokenField(textarea, {
//     items: [{ name: 'IA_Interact', note: 'E' }, …],
//     insert: (item) => `{${item.name}}`,
//   });
//
// The list is made the first time it is needed, not when the field is handed over: a
// field is often built before it is put on the page.

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

export function tokenField(field, {
  trigger = '{',
  items = [],
  word = /[A-Za-z0-9_]*/,
  match = (item, typed) => item.name.toLowerCase().includes(typed.toLowerCase()),
  insert = (item) => `${trigger}${item.name}}`,
  note = (item) => item.note || '',
  most = 8,
  onInsert,
} = {}) {
  if (!field || !items.length || field.dataset.tokenField) return;
  field.dataset.tokenField = 'on';
  const typedAfter = new RegExp(`\\${trigger}(${word.source})$`);
  let box = null;
  let shown = [];
  let at = -1;

  const mount = () => {
    if (box || !field.parentElement) return box;
    box = el('ul', { class: 'dn-tokens', role: 'listbox', hidden: true });
    if (getComputedStyle(field.parentElement).position === 'static') field.parentElement.style.position = 'relative';
    field.parentElement.append(box);
    return box;
  };
  const close = () => { if (box) box.hidden = true; shown = []; at = -1; };
  const paint = () => {
    if (!mount()) return;
    box.replaceChildren(...shown.map((item, i) => el('li', {
      role: 'option',
      'aria-selected': String(i === at),
      class: i === at ? 'is-on' : '',
      onmousedown: (e) => { e.preventDefault(); take(i); },
    }, el('code', {}, item.name), el('span', {}, note(item)))));
    box.hidden = !shown.length;
  };
  // What has been typed since the nearest trigger, if the caret is still inside it.
  const typing = () => {
    const upto = field.value.slice(0, field.selectionStart);
    const m = upto.match(typedAfter);
    return m ? { from: field.selectionStart - m[0].length, typed: m[1] } : null;
  };
  const take = (i) => {
    const here = typing();
    if (!here || !shown[i]) return close();
    const text = insert(shown[i]);
    const before = field.value.slice(0, here.from);
    const after = field.value.slice(field.selectionStart);
    field.value = before + text + after;
    const caret = before.length + text.length;
    close();
    field.focus();
    field.setSelectionRange(caret, caret);
    // Whatever watches the field — a rules list, a character counter — hears about it.
    field.dispatchEvent(new Event('input'));
    if (onInsert) onInsert(shown[i]);
  };

  field.addEventListener('input', () => {
    const here = typing();
    if (!here) return close();
    shown = items.filter((item) => match(item, here.typed)).slice(0, most);
    at = shown.length ? 0 : -1;
    paint();
  });
  field.addEventListener('keydown', (e) => {
    if (!box || box.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      at = (at + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length;
      paint();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      take(at);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });
  // A click on the list is a mousedown first, which is where it is taken; this only has
  // to outlast the click.
  field.addEventListener('blur', () => setTimeout(close, 120));
}
