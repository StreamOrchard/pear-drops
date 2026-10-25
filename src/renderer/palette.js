/* global commands, icon, img, esc, setHTML, fmtCount */
// The search box: Ctrl/⌘+K anywhere (in the docked stream or chat too: main.js sends it), type a few letters, Enter.
// It finds and runs anything palette-items.js registered with commands.add / commands.provide: drops, rewards,
// channels, actions, every tab and filter, and Settings' options. A drop or channel named in full (or by the start of
// its name, 3 letters or more) comes first, drawn big with its own row of buttons. As Stream Multiview's box:
//   ↑ ↓ (Ctrl+N / P) move · ← → the big row's buttons, a choice's options, or Tab's other column · Enter runs ·
//   ⇧Enter the second choice · Tab everything for the row, ⇧Tab back · Ctrl/⌘+1–9 the big row's 2nd to 10th buttons ·
//   Esc steps back (Tab's list, the words, then the box).
// Prefixes: > actions · @ channels · % drops · # Settings.
// How a row is drawn comes from its item: icon or image (round for a channel), sub (text, or parts: 'text',
// { b: 'bold', t: ' after' }), live and viewers, pills, chip, keys, toggle / choice / range, and on the big row heroSub,
// heroExtra (its reward track) and buttons ({ label, icon, run, more, on, done }). done: what the flash says after.

const PAL_MAC = navigator.platform.startsWith('Mac');
const PAL_MOD = PAL_MAC ? '⌘' : 'Ctrl';
const PAL_NOUN = { '>': 'action', '@': 'channel', '%': 'drop', '#': 'setting' };
const pal = {
  root: null,
  q: null,
  scope: '', // '>', '@', '%', '#' or ''
  rows: [], // what's listed: { item, marks, hero, arg }
  sel: 0, // the selected row
  btn: 0, // the selected button on the big row
  opt: null, // the option picked on a choice's row (← →)
  stack: [], // Tab: [{ item, text, sel }], the rows the list was showing before
  back: null, // where the keyboard was before the box opened
  why: '', // why the last thing couldn't run (shown in the footer)
};
const palIsOpen = () => !!pal.root && !pal.root.hidden;
const palKbd = (k) => `<kbd>${esc(k)}</kbd>`;
const palEl = (sel) => pal.root.querySelector(sel);

function openPalette(text = '') {
  if (!pal.root) return;
  if (!palIsOpen()) pal.back = document.activeElement;
  pal.root.hidden = false;
  pal.stack = [];
  pal.why = '';
  pal.sel = 0;
  palSetScope('');
  pal.q.value = text;
  palPrefix();
  palRender();
  pal.q.focus();
  pal.q.select();
  window.dispatchEvent(new Event('palette'));
}
function closePalette(restore) {
  if (!palIsOpen()) return;
  pal.root.hidden = true;
  pal.q.setAttribute('aria-expanded', 'false');
  pal.stack = [];
  if (restore && pal.back?.isConnected && pal.back.focus) pal.back.focus();
  else if (pal.root.contains(document.activeElement)) document.activeElement.blur();
  pal.back = null;
  window.dispatchEvent(new Event('palette'));
}
const togglePalette = () => (palIsOpen() ? closePalette(true) : openPalette());

function palSetScope(s) {
  pal.scope = s;
  const chip = palEl('.pal-scope');
  chip.hidden = !s;
  chip.firstElementChild.textContent = s ? commands.SCOPES[s].name : '';
  palPlaceholder();
}
const palPlaceholder = () => {
  pal.q.placeholder = pal.stack.length ? 'Filter actions…' : pal.scope ? `Search ${commands.SCOPES[pal.scope].name.toLowerCase()}…` : 'Search drops, channels, actions and settings…';
};
/** A prefix typed first becomes the chip. */
function palPrefix() {
  if (pal.scope || pal.stack.length) return;
  const p = commands.parse(pal.q.value);
  if (p.scope) {
    palSetScope(p.scope);
    pal.q.value = pal.q.value.replace(/^\s*./, '').replace(/^\s+/, '');
  }
}

// ---- what's listed

/** The big row: the best drop or channel the words name in full, or by the start of its name (3 letters or more). A reward's name brings its drop. */
function palHeroOf(found, text) {
  const c = found.find((r) => r.item.hero || r.item.heroOf);
  if (!c || !(c.match >= 100 || (text.length >= 3 && c.match >= 80))) return null;
  if (!c.item.heroOf) return { ...c, hero: true };
  const drop = c.item.heroOf();
  return drop ? { item: drop, marks: [], match: c.match, hero: true } : null;
}
function palCollect() {
  const text = pal.q.value.trim();
  if (pal.stack.length) {
    const it = pal.stack[pal.stack.length - 1].item;
    const all = (it.more && it.more()) || [];
    if (!text) return all.map((item) => ({ item, marks: [] }));
    return commands.search(text, { only: all });
  }
  if (!text && !pal.scope) return palEmptyRows();
  let found = commands.search(text, { scope: pal.scope });
  if (!found.length) return commands.fallbacks(text).map((item) => ({ item, marks: [] }));
  const hero = palHeroOf(found, text);
  // Each group together, where its best row is (the big row first, and not again below it).
  found = commands.grouped(found.filter((r) => r.item.id !== hero?.item.id)).flatMap((g) => g.rows);
  return hero ? [hero, ...found] : found;
}
/** The empty box: what needs you, what's farming now and its controls, then what you ran lately. */
function palEmptyRows() {
  const order = ['Needs you', 'Now'];
  const at = (r) => order.indexOf(r.item.group) + 1 || order.length + 1;
  // (an item can say which of the empty box's groups it's in, and the note on it: Now's is what's farming)
  const out = commands
    .search('', { keep: true })
    .map((r) => (r.item.keepGroup ? { ...r, item: { ...r.item, group: r.item.keepGroup, groupNote: commands.value(r.item.keepNote) ?? '' } } : r))
    .sort((a, b) => at(a) - at(b));
  let recent = 0;
  for (const id of commands.recent()) {
    if (recent >= 5) break;
    const it = commands.find(id);
    if (!it || commands.disabledWhy(it) || it.fallback || out.some((o) => o.item.id === id)) continue;
    out.push({ item: { ...it, group: 'Recent', groupNote: '' }, marks: [] });
    recent++;
  }
  return out;
}

// ---- drawing

/** The title, with the letters that matched in green. */
function palMarked(title, marks) {
  const set = new Set(marks || []);
  let out = '';
  let run = '';
  let on = false;
  const flush = () => {
    if (run) out += on ? `<mark>${esc(run)}</mark>` : esc(run);
    run = '';
  };
  // (marks are places in the text's units, as fuzzy.js counts them: an emoji is two)
  let at = 0;
  for (const c of String(title)) {
    const m = set.has(at);
    if (m !== on) {
      flush();
      on = m;
    }
    run += c;
    at += c.length;
  }
  flush();
  return out;
}
/** A line from its parts, "a · b · c": text, or { b: bold, t: after }. */
function palParts(parts) {
  return []
    .concat(parts || [])
    .filter((p) => p !== null && p !== undefined && p !== '' && p !== false)
    .map((p) => (typeof p === 'object' ? `<b>${esc(p.b)}</b>${esc(p.t || '')}` : esc(p)))
    .join('<i class="pal-dot">·</i>');
}
const palKeys = (keys) => `<span class="pal-keys">${String(keys).split(' ').map(palKbd).join('')}</span>`;
const palPill = (p) => `<span class="pal-pill ${esc(p.tone || '')}">${p.dot ? '<span class="live-dot green"></span>' : ''}${esc(p.text)}</span>`;
function palTile(it, cls = '') {
  if (it.image) return `<span class="pal-pic ${it.round ? 'round' : ''} ${cls}">${img(it.image)}${it.live ? '<i class="pal-pic-live"></i>' : ''}</span>`;
  return `<span class="pal-ico ${cls}">${icon(it.icon || 'sparkle')}</span>`;
}
function palRight(r, sel) {
  const it = r.item;
  if (it.toggle) {
    let on = false;
    try {
      on = !!it.toggle.get();
    } catch {}
    return `<span class="switch pal-sw ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="${on ? 'On' : 'Off'}"></span>`;
  }
  if (it.choice) {
    const cur = it.choice.get();
    return `<span class="pal-seg">${it.choice.options
      .map(([v, label], k) => `<i class="${String(cur) === String(v) ? 'on' : ''} ${sel && pal.opt === k ? 'pick' : ''}" data-pal-opt="${k}">${esc(label)}</i>`)
      .join('')}</span>`;
  }
  if (it.range) return r.arg !== undefined ? `<span class="pal-go on">${palKbd('↵')} Set to ${esc(r.arg)} ${esc(it.range.unit)}</span>` : `<span class="pal-now">${esc(it.range.get())} ${esc(it.range.unit)}</span>`;
  if (it.viewers != null) return `<span class="pal-views num">${fmtCount(it.viewers)}</span>`;
  const chip = commands.value(it.chip);
  if (chip) return palPill(typeof chip === 'string' ? { text: chip } : chip);
  if (it.keys) return palKeys(it.keys);
  return `<span class="pal-go ${sel ? 'on' : ''}">${palKbd('↵')} ${esc(it.verb || 'Open')}</span>`;
}
function palRowHTML(r, i) {
  const it = r.item;
  const off = commands.disabledWhy(it);
  const hero = !!r.hero;
  const sel = i === pal.sel;
  const sub = palParts(commands.value(hero && it.heroSub ? it.heroSub : it.sub));
  const live = it.live ? '<span class="pal-live">LIVE</span>' : '';
  const pills = (commands.value(it.pills) || []).map(palPill).join('');
  const attrs = `id="pal-row-${i}" class="pal-row ${hero ? 'pal-hero' : ''} ${off ? 'off' : ''} ${sel ? 'on' : ''}" role="option" aria-selected="${sel}" ${off ? `aria-disabled="true" data-tip="${esc(off)}"` : ''} data-pal-row="${i}" data-id="${esc(it.id)}"`;
  if (!hero) {
    return `<div ${attrs}>${palTile(it)}<span class="pal-txt"><span class="pal-line"><span class="pal-t">${palMarked(it.title, r.marks)}</span>${pills}</span>${
      sub || live ? `<span class="pal-sub">${live}${sub}</span>` : ''
    }</span><span class="pal-right">${off ? `<span class="pal-why-row">${esc(off)}</span>` : palRight(r, sel)}</span></div>`;
  }
  const buttons = (commands.value(it.buttons) || [])
    .map((b, k) => {
      const key = b.more ? palKbd('Tab') : k === 0 ? palKbd('↵') : k <= 9 ? palKbd(`${PAL_MOD}${k}`) : '';
      return `<button type="button" tabindex="-1" class="pal-btn ${k === 0 ? 'first' : ''} ${b.on ? 'act' : ''} ${sel && k === pal.btn ? 'on' : ''}" data-pal-btn="${k}">${b.icon ? icon(b.icon) : ''}${esc(b.label)}${key}</button>`;
    })
    .join('');
  return `<div ${attrs}>${palTile(it, 'big')}<span class="pal-txt"><span class="pal-line"><span class="pal-t">${palMarked(it.title, r.marks)}</span>${live}${pills}</span>${
    sub ? `<span class="pal-sub">${sub}</span>` : ''
  }${commands.value(it.heroExtra) || ''}${buttons ? `<span class="pal-btns" role="group" aria-label="Actions for ${esc(it.title)}">${buttons}</span>` : ''}</span></div>`;
}
/** Tab's list: what it's for, in the words box's place. */
function palHeadHTML(it) {
  return `<button type="button" class="pal-back" tabindex="-1" aria-label="Back" data-tip="Back (⇧Tab)">${icon('arrowLeft')}</button>${palTile(it, 'sm')}<b class="pal-ht">${esc(it.title)}</b>${it.live ? '<span class="pal-live">LIVE</span>' : ''}${(
    commands.value(it.pills) || []
  )
    .map(palPill)
    .join('')}<i class="pal-hsep"></i>`;
}

function palRender() {
  if (!palIsOpen()) return;
  pal.rows = palCollect();
  if (pal.sel >= pal.rows.length) pal.sel = Math.max(0, pal.rows.length - 1);
  palPickOpt();
  palDraw();
}
/** A choice's row starts with its current option picked. */
function palPickOpt() {
  const it = pal.rows[pal.sel]?.item;
  if (!it?.choice) return (pal.opt = null);
  const cur = String(it.choice.get());
  pal.opt = Math.max(0, it.choice.options.findIndex(([v]) => String(v) === cur));
}
function palDraw() {
  const top = pal.stack[pal.stack.length - 1];
  const text = pal.q.value.trim();
  const box = palEl('.pal');
  box.classList.toggle('pal-tabbed', !!top);
  palEl('.pal-head').hidden = !top;
  palEl('.pal-mag').hidden = !!top;
  palEl('.pal-esc').hidden = !top;
  palEl('.pal-k').hidden = !!top || !!text || !!pal.scope;
  setHTML(palEl('.pal-head'), top ? palHeadHTML(top.item) : '');
  palPlaceholder();
  const none = !top && !!text && pal.rows.every((r) => r.item.fallback);
  // Groups, each in a block of its own. Tab's list: in two columns, the groups whose items say col: 1 on the right.
  const split = !!top && pal.rows.some((r) => r.item.col);
  const cols = [[], []];
  const flat = [];
  let block = null;
  pal.rows.forEach((r, i) => {
    if (r.hero) {
      flat.push({ html: palRowHTML(r, i) });
      block = null;
      return;
    }
    if (!block || r.item.group !== block.group) {
      const n = pal.rows.filter((x) => !x.hero && x.item.group === r.item.group).length;
      const note = r.item.groupNote ?? (n > 1 && !top && !pal.scope ? String(n) : '');
      block = { group: r.item.group, head: none ? '' : `<div class="pal-g" role="presentation"><span>${esc(r.item.group)}</span>${note ? `<em>${esc(note)}</em>` : ''}</div>`, rows: [] };
      (split ? cols[r.item.col ? 1 : 0] : flat).push(block);
    }
    block.rows.push(palRowHTML(r, i));
  });
  const blockHTML = (b) => (b.html !== undefined ? b.html : `<div class="pal-grp" role="presentation">${b.head}${b.rows.join('')}</div>`);
  const empty = none ? `<div class="pal-none"><b>Nothing called “${esc(text)}”</b><span>Not a drop, reward, channel, action or setting Pear Drops knows.</span></div>` : '';
  const list = palEl('.pal-list');
  list.classList.toggle('split', split);
  setHTML(list, split ? `<div class="pal-col">${cols[0].map(blockHTML).join('')}</div><div class="pal-col">${cols[1].map(blockHTML).join('')}</div>` : empty + flat.map(blockHTML).join(''));
  const noun = PAL_NOUN[pal.scope] || 'result';
  const n = pal.rows.filter((r) => !r.item.fallback).length;
  palEl('.pal-count').textContent = top ? '' : none ? 'No results' : text || pal.scope ? `${n} ${noun}${n === 1 ? '' : 's'}` : '';
  palEl('.pal-sr').textContent = text ? (none ? 'No results' : `${n} result${n === 1 ? '' : 's'}`) : '';
  pal.q.setAttribute('aria-expanded', String(pal.rows.length > 0));
  const cur = palEl(`#pal-row-${pal.sel}`);
  if (cur) {
    pal.q.setAttribute('aria-activedescendant', cur.id);
    cur.scrollIntoView({ block: 'nearest' });
  } else pal.q.removeAttribute('aria-activedescendant');
  palFoot();
}
function palFoot() {
  const r = pal.rows[pal.sel];
  const it = r?.item;
  const k = (keys, what) => `<span class="pal-fk">${[].concat(keys).map(palKbd).join('')} ${esc(what)}</span>`;
  const left = `<span class="pal-keyhelp">${k(['↑', '↓'], 'move')}${k('↵', 'run')}${k('Tab', 'more')}${k('Esc', 'close')}</span>`;
  let right;
  if (pal.why) right = `<span class="pal-why">${esc(pal.why)}</span>`;
  else if (pal.stack.length) right = k('Esc', 'back to results');
  else if (r?.hero && it.buttons) right = k(['←', '→'], 'pick an action');
  else if (it?.toggle) right = `<span class="pal-fks">${k('↵', 'flips a switch')}${it.alt ? k(['⇧', '↵'], 'opens its page') : ''}</span>`;
  else if (it?.choice) right = `<span class="pal-fks">${k(['←', '→'], 'pick')}${k('↵', 'sets it')}${it.alt ? k(['⇧', '↵'], 'opens its page') : ''}</span>`;
  else if (it?.range) right = `<span class="pal-fks">${r.arg !== undefined ? k('↵', `sets it to ${r.arg}`) : `<span class="pal-fk">type a number to set it</span>`}${k(['⇧', '↵'], 'opens its page')}</span>`;
  else right = `<span class="pal-fks pal-pre">${Object.entries(commands.SCOPES)
    .map(([p, s]) => k(p, s.name.toLowerCase()))
    .join('')}</span>`;
  setHTML(palEl('.pal-foot'), left + right);
}

/** What happened, at the top of the window for a moment, with how to come back. */
function palFlash(text) {
  document.querySelector('.pal-flash')?.remove();
  const el = document.createElement('div');
  el.className = 'pal-flash';
  el.innerHTML = `<span class="live-dot green"></span><span>${esc(text)}</span>${palKbd(`${PAL_MOD}K`)}<span class="muted">again</span>`;
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3000);
}

// ---- doing it

function palRun(i, how) {
  const r = pal.rows[i];
  if (!r) return;
  const it = r.item;
  if (how === 'run' && r.hero && it.buttons) how = pal.btn;
  const button = typeof how === 'number' ? (commands.value(it.buttons) || [])[how] : null;
  if (button?.more || how === 'more') {
    if (it.more) palPush(it);
    return;
  }
  if (how === 'alt' && !it.alt) {
    if (it.more) return palPush(it);
    how = 'run';
  }
  const arg = it.choice && how === 'run' ? it.choice.options[pal.opt ?? 0]?.[0] : r.arg;
  pal.why = commands.run(it, how, arg);
  if (pal.why) return palFoot();
  // A switch flips (and a choice is set) where it is.
  if ((it.toggle || it.choice) && how === 'run') return palRender();
  closePalette(false);
  const done = commands.value(button ? button.done : how === 'run' ? it.done : null);
  if (done) palFlash(done);
}
function palPush(it) {
  pal.stack.push({ item: it, text: pal.q.value, sel: pal.sel });
  pal.q.value = '';
  pal.sel = 0;
  pal.btn = 0;
  pal.why = '';
  palRender();
}
function palPop() {
  const top = pal.stack.pop();
  if (!top) return false;
  pal.q.value = top.text;
  pal.sel = top.sel;
  pal.btn = 0;
  pal.why = '';
  palRender();
  pal.q.focus();
  return true;
}
function palSelect(i) {
  if (i === pal.sel) return;
  pal.sel = i;
  pal.btn = 0;
  pal.why = '';
  palPickOpt();
  palDraw();
}
function palMove(d) {
  if (pal.rows.length) palSelect((pal.sel + d + pal.rows.length) % pal.rows.length);
}
/** Tab's two columns: ← → to the row beside this one in the other column. */
function palAcross(d) {
  const els = [...pal.root.querySelectorAll('.pal-row')];
  const cur = els.find((el) => Number(el.dataset.palRow) === pal.sel);
  if (!cur) return false;
  const c = cur.getBoundingClientRect();
  let best = -1;
  let dist = Infinity;
  for (const el of els) {
    const b = el.getBoundingClientRect();
    if (d > 0 ? b.left <= c.right - 2 : b.right >= c.left + 2) continue;
    const dy = Math.abs(b.top - c.top);
    if (dy < dist) {
      dist = dy;
      best = Number(el.dataset.palRow);
    }
  }
  if (best < 0) return false;
  palSelect(best);
  return true;
}
function palKey(e) {
  const k = e.key;
  const mod = PAL_MAC ? e.metaKey : e.ctrlKey;
  const r = pal.rows[pal.sel];
  const across = k === 'ArrowLeft' || k === 'ArrowRight';
  const dir = k === 'ArrowRight' ? 1 : -1;
  if (k === 'ArrowDown' || (e.ctrlKey && !e.metaKey && k.toLowerCase() === 'n')) palMove(1);
  else if (k === 'ArrowUp' || (e.ctrlKey && !e.metaKey && k.toLowerCase() === 'p')) palMove(-1);
  else if (across && r?.hero && r.item.buttons) {
    const n = commands.value(r.item.buttons).length;
    pal.btn = (pal.btn + dir + n) % n;
    pal.why = '';
    palDraw();
  } else if (across && r?.item.choice) {
    const n = r.item.choice.options.length;
    pal.opt = ((pal.opt ?? 0) + dir + n) % n;
    palDraw();
  } else if (across && palEl('.pal-list').classList.contains('split') && !pal.q.value) palAcross(dir);
  else if (k === 'Enter') palRun(pal.sel, e.shiftKey ? 'alt' : 'run');
  else if (k === 'Tab') {
    if (e.shiftKey) palPop();
    else if (r) palRun(pal.sel, 'more');
  } else if (mod && /^[1-9]$/.test(k)) {
    const n = Number(k);
    if (r?.hero && r.item.buttons) {
      if (commands.value(r.item.buttons)[n]) {
        pal.btn = n;
        palRun(pal.sel, n);
      }
    } else {
      // A row that shows these keys (Tab's list: the big row's buttons), else the nth row.
      const at = pal.rows.findIndex((x) => x.item.keys === `${PAL_MOD} ${n}`);
      const i = at >= 0 ? at : n - 1;
      if (pal.rows[i]) {
        pal.sel = i;
        palRun(i, 'run');
      }
    }
  } else if (k === 'Escape') {
    e.stopPropagation();
    if (pal.stack.length) palPop();
    else if (pal.q.value || pal.scope) {
      pal.q.value = '';
      palSetScope('');
      pal.sel = 0;
      palRender();
    } else closePalette(true);
  } else if (k === 'Backspace' && !pal.q.value && (pal.scope || pal.stack.length)) {
    if (pal.stack.length) palPop();
    else {
      palSetScope('');
      palRender();
    }
  } else return;
  e.preventDefault();
  e.stopPropagation();
}

/** Is this Ctrl/⌘+K (⌘ on a Mac, Ctrl elsewhere)? */
const palIsKey = (e) => (PAL_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.altKey && !e.shiftKey && e.key?.toLowerCase() === 'k';

function initPalette() {
  const root = document.createElement('div');
  root.id = 'palette-root';
  root.className = 'pal-bg';
  root.hidden = true;
  root.innerHTML = `<div class="pal" role="dialog" aria-modal="true" aria-label="Search and actions">
    <div class="pal-in"><span class="pal-mag">${icon('search')}</span><span class="pal-head" hidden></span>
      <span class="pal-scope" hidden><span></span><button type="button" class="pal-scope-x" aria-label="Search everything" data-tip="Search everything">${icon('x')}</button></span>
      <input id="pal-q" type="text" spellcheck="false" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="pal-list" aria-autocomplete="list" aria-label="Search drops, channels, actions and settings" />
      <span class="pal-count"></span><span class="pal-k">${palKbd(PAL_MOD)}${palKbd('K')}</span><span class="pal-esc" hidden>${palKbd('Esc')} back</span></div>
    <div id="pal-list" class="pal-list" role="listbox" aria-label="Results"></div>
    <div class="pal-foot"></div>
    <div class="pal-sr" aria-live="polite"></div>
  </div>`;
  document.body.append(root);
  pal.root = root;
  pal.q = root.querySelector('#pal-q');
  root.addEventListener('pointerdown', (e) => {
    if (e.target === root) closePalette(true);
  });
  pal.q.addEventListener('input', () => {
    pal.why = '';
    pal.sel = 0;
    pal.btn = 0;
    palPrefix();
    palRender();
  });
  pal.q.addEventListener('keydown', palKey);
  root.addEventListener('keydown', (e) => {
    if (e.target !== pal.q && (e.key === 'Escape' || e.key === 'Tab')) {
      pal.q.focus();
      palKey(e);
    }
  });
  // The keyboard stays in the words box: a click on the rows or headings leaves it there.
  root.addEventListener('mousedown', (e) => {
    if (!e.target.closest('input')) e.preventDefault();
  });
  root.addEventListener('focusout', (e) => {
    if (palIsOpen() && !root.contains(e.relatedTarget)) setTimeout(() => palIsOpen() && !root.contains(document.activeElement) && pal.q.focus());
  });
  root.addEventListener('pointermove', (e) => {
    const row = e.target.closest?.('[data-pal-row]');
    if (row) palSelect(Number(row.dataset.palRow));
  });
  root.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.closest('.pal-scope-x')) {
      palSetScope('');
      palRender();
      return pal.q.focus();
    }
    if (e.target.closest('.pal-back')) return palPop();
    const row = e.target.closest('[data-pal-row]');
    if (!row) return;
    const i = Number(row.dataset.palRow);
    pal.sel = i;
    const b = e.target.closest('[data-pal-btn]');
    const o = e.target.closest('[data-pal-opt]');
    if (b) {
      pal.btn = Number(b.dataset.palBtn);
      return palRun(i, pal.btn);
    }
    if (o) pal.opt = Number(o.dataset.palOpt);
    palRun(i, e.shiftKey ? 'alt' : 'run');
  });
  // Ctrl/⌘+K anywhere on the page, ahead of everything else. In the docked stream or chat, the web view keeps its
  // keys: main.js sends it (onPaletteOpen), as does the tray popover's.
  document.addEventListener(
    'keydown',
    (e) => {
      if (!palIsKey(e)) return;
      e.preventDefault();
      e.stopPropagation();
      togglePalette();
    },
    true,
  );
  window.pd.onPaletteOpen?.(() => (palIsOpen() ? pal.q.focus() : openPalette()));
}

/** For app.js (an open box keeps up with what it lists) and the tests. */
const palette = {
  open: openPalette,
  close: closePalette,
  toggle: togglePalette,
  isOpen: palIsOpen,
  refresh: () => palIsOpen() && !pal.stack.length && palRender(),
  rows: () => pal.rows.map((r) => ({ id: r.item.id, title: r.item.title, group: r.item.group, hero: !!r.hero, kind: r.item.kind })),
  isKey: palIsKey,
  mod: PAL_MOD,
};
window.palette = palette;
