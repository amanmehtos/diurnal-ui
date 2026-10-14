// Diurnal's dialogs: asking for something, and asking whether to go ahead.
//
// The browser's own prompt() and confirm() are the one place an app stops looking like
// itself — Chrome's grey bar at the top of the window, in Chrome's font, saying the
// page's hostname. They also cannot say much: no validation, no list of what is about
// to be rewritten, no way to mark an answer as the dangerous one. So these.
//
//   const to = await ask({ title: 'Rename IA_Interact', label: 'New name',
//                          value: 'IA_Interact', check: (v) => v.startsWith('IA_') ? null : 'Starts with IA_.' });
//   if (to) rename(to);                       // null when it was cancelled
//
//   if (await confirmAction({ title: 'Delete this?', danger: true })) remove();
//
// Both resolve rather than throw when dismissed: Escape, the Cancel button and a click
// on the scrim all mean no. Focus goes to the input (or to the safe button, when the
// answer is dangerous) and returns where it came from afterwards.

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

// The shell both share: a scrim, a panel, and whatever the caller puts in it.
function sheet({ title, note, warn, list, body, buttons, focus }) {
  const was = document.activeElement;
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      removeEventListener('keydown', onKey, true);
      panel.remove();
      if (was && was.isConnected && typeof was.focus === 'function') was.focus();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); }
    };

    const panel = el('div', { class: 'dn-ask', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('div', { class: 'dn-ask__scrim', onclick: () => finish(null) }),
      el('div', { class: 'dn-ask__panel dn-lit' },
        el('h2', { class: 'dn-ask__title' }, title),
        note && el('p', { class: 'dn-ask__note' }, note),
        list && list.length && el('ul', { class: 'dn-ask__list' }, list.slice(0, 8).map((line) => el('li', {}, line)),
          list.length > 8 && el('li', { class: 'dn-ask__more' }, `and ${list.length - 8} more`)),
        body ? body(finish) : null,
        warn && el('p', { class: 'dn-ask__warn' }, warn),
        el('div', { class: 'dn-ask__foot' }, buttons(finish))));

    document.body.append(panel);
    addEventListener('keydown', onKey, true);
    const first = focus ? panel.querySelector(focus) : null;
    (first || panel.querySelector('.dn-ask__foot button:last-child')).focus();
    if (first && first.select) first.select();
  });
}

// Asks for several things at once. `fields` is a list of
//   { name, label, type: 'text' | 'select', value, options, check, hint }
// where `options` may be a function of the answers so far, so one field can narrow
// another — a platform picked here, only that platform's buttons offered there.
// Resolves with { name: value, … }, or null. A field complains the moment it is wrong,
// and while anything complains the answer cannot be given.
export function askForm({
  title = 'Add',
  note = '',
  warn = '',
  list = null,
  fields = [],
  confirm = 'Add',
  cancel = 'Cancel',
} = {}) {
  const answers = Object.fromEntries(fields.map((f) => [f.name, f.value ?? '']));
  const nodes = new Map();
  let go = null;

  const optionsFor = (f) => {
    const opts = typeof f.options === 'function' ? f.options(answers) : f.options || [];
    return opts.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  };

  const judge = () => {
    let ok = true;
    for (const f of fields) {
      const said = f.check ? f.check(String(answers[f.name] ?? '').trim(), answers) : null;
      const { bad, input } = nodes.get(f.name);
      bad.textContent = said || '';
      input.setAttribute('aria-invalid', said ? 'true' : 'false');
      if (said) ok = false;
    }
    if (go) go.disabled = !ok;
    return ok;
  };

  // A select whose options depend on another answer is rebuilt when that answer moves,
  // keeping its value when the new list still has it.
  const repaintSelects = () => {
    for (const f of fields) {
      if (f.type !== 'select' || typeof f.options !== 'function') continue;
      const { input } = nodes.get(f.name);
      const opts = optionsFor(f);
      const keep = opts.some((o) => o.value === answers[f.name]) ? answers[f.name] : (opts[0] ? opts[0].value : '');
      answers[f.name] = keep;
      input.replaceChildren(...opts.map((o) => el('option', { value: o.value, selected: o.value === keep }, o.label)));
      input.value = keep;
    }
  };

  return sheet({
    title,
    note,
    warn,
    list,
    focus: '.dn-ask__field :is(input, select)',
    body: (finish) => el('div', { class: 'dn-ask__fields' }, fields.map((f) => {
      const id = `dn-ask-${f.name}`;
      const bad = el('p', { class: 'dn-ask__bad', role: 'status' });
      const input = f.type === 'select'
        ? el('select', { class: 'dn-select', id }, optionsFor(f).map((o) => el('option', { value: o.value, selected: o.value === answers[f.name] }, o.label)))
        : el('input', { class: 'dn-input', type: 'text', id, value: answers[f.name], placeholder: f.placeholder || '', autocomplete: 'off', spellcheck: 'false' });
      input.addEventListener(f.type === 'select' ? 'change' : 'input', () => {
        answers[f.name] = input.value;
        repaintSelects();
        judge();
      });
      if (f.type !== 'select') {
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (judge()) finish({ ...answers }); } });
      }
      nodes.set(f.name, { input, bad });
      return el('div', { class: 'dn-ask__field' },
        el('label', { class: 'dn-label', for: id }, f.label),
        input,
        f.hint && el('span', { class: 'dn-hint' }, f.hint),
        bad);
    })),
    buttons: (finish) => {
      go = el('button', { class: 'dn-btn dn-btn--sm dn-btn--primary', type: 'button', onclick: () => { if (judge()) finish({ ...answers }); } }, confirm);
      setTimeout(() => { repaintSelects(); judge(); });
      return [el('button', { class: 'dn-btn dn-btn--sm', type: 'button', onclick: () => finish(null) }, cancel), go];
    },
  }).then((v) => (v && typeof v === 'object' ? v : null));
}

// Asks for a line of text: one field, and the answer itself rather than a form's
// object. `check` is given what has been typed and returns a complaint or nothing;
// while it complains, the answer cannot be given, and neither can an empty one.
export function ask({
  title = 'Rename',
  note = '',
  warn = '',
  list = null,
  label = 'Name',
  value = '',
  placeholder = '',
  confirm = 'Save',
  cancel = 'Cancel',
  check = null,
} = {}) {
  return askForm({
    title,
    note,
    warn,
    list,
    confirm,
    cancel,
    fields: [{
      name: 'value',
      label,
      value,
      placeholder,
      // A space is a complaint with nothing to say: an empty answer is refused, quietly.
      check: (v) => (v ? (check ? check(v) : null) : ' '),
    }],
  }).then((answers) => (answers ? String(answers.value).trim() : null));
}

// Asks whether to go ahead. Resolves true or false. `danger` marks the answer as the
// destructive one and leaves the focus on Cancel, so Enter does not do it by accident.
export function confirmAction({
  title = 'Are you sure?',
  note = '',
  warn = '',
  list = null,
  confirm = 'Yes',
  cancel = 'Cancel',
  danger = false,
} = {}) {
  return sheet({
    title,
    note,
    warn,
    list,
    focus: danger ? '.dn-ask__foot button:first-child' : null,
    buttons: (finish) => [
      el('button', { class: 'dn-btn dn-btn--sm', type: 'button', onclick: () => finish(false) }, cancel),
      el('button', { class: `dn-btn dn-btn--sm ${danger ? 'dn-btn--danger' : 'dn-btn--primary'}`, type: 'button', onclick: () => finish(true) }, confirm),
    ],
  }).then((v) => v === true);
}
