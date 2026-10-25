/* global fuzzy */
// Everything the search box (Ctrl/⌘+K, palette.js) can find and do: the same registry as Stream Multiview's, so the
// two apps' boxes rank and run things the same way. palette-items.js registers Pear Drops' own:
//   commands.add({ id: 'skip', kind: 'action', group: 'Farming', title: 'Skip stream', sub: 'Watch the next channel',
//     words: ['next'], icon: 'skip',
//     when: () => !!farm()?.current,                           // left out while false
//     disabled: () => paused && 'Resume first',                // shown greyed, with the reason
//     run: () => actions.skip() })
//   commands.provide('drops', (q) => [...])                    // lists that change, asked for on every key
// Instead of run, an item can have toggle { get, set } (a switch: Enter flips it), choice { options: [[value, label]],
// get, set } (← → pick, Enter sets it) or range { min, max, unit, get, set } (a number typed with its words sets it).
// It can also have: alt (⇧Enter's second choice), more () => [items] (Tab: everything for it), buttons [{ label, icon,
// run, more }] (the big row's actions), hero (drawn big when it's named), image / round / live / viewers / chip (how it's
// drawn), boost (added to its score), keep (in the empty box), fallback (only when nothing else is found), last (never
// the first result: Quit), text (more words to find it by, as its second line counts).
// What you run is remembered (palette memory, in the app's database): the empty box's Recent, and used items rank
// higher (frecency). forget(id) and forgetAll() let it go; remembering(false) stops both, keeping what's remembered.
// An item with noRecent (Clear recent itself) isn't remembered. Nothing here touches the page.

/** Kinds of item, how a prefix picks them, and which come first when they score the same. */
const CMD_SCOPES = {
  '>': { name: 'Actions', kinds: ['action', 'place'] },
  '@': { name: 'Channels', kinds: ['channel'] },
  '%': { name: 'Drops', kinds: ['drop', 'reward'] },
  '#': { name: 'Settings', kinds: ['setting', 'page'] },
};
const CMD_RANK = { drop: 6, channel: 6, action: 5, reward: 4, setting: 3, page: 3, place: 2 };
const CMD_PER_GROUP = 7;
const CMD_MAX = 40;
const CMD_RECENT = 20;
const CMD_USED = 300;
const CMD_DAY = 86_400_000;

const cmdItems = new Map(); // id -> item (added)
const cmdProviders = new Map(); // name -> fn(q)
const cmdSeen = new Map(); // id -> the last item a provider gave with that id (so Recent can find it again)
let cmdMem = { recent: [], used: {} };
let cmdSave = () => {};
let cmdKeep = true; // remembering what's run (Settings › Search box › Recent)
let cmdGroups = []; // the order groups are listed in with nothing typed (a prefix on its own): the rest after, A–Z

const cmdOn = (it) => {
  try {
    return !it.when || !!it.when();
  } catch {
    return false;
  }
};
const cmdWhy = (it) => {
  try {
    return (it.disabled && it.disabled()) || '';
  } catch {
    return '';
  }
};
const cmdVal = (v, ...a) => (typeof v === 'function' ? v(...a) : v);
/** A second line's words, from its text or its parts ('text', { b: 'bold', t: ' after' }; the rest isn't searched). */
const cmdText = (sub) =>
  []
    .concat(sub || [])
    .map((x) => (typeof x === 'string' ? x : x && x.b ? x.b + (x.t || '') : ''))
    .filter(Boolean)
    .join(' · ');

function addCommands(list) {
  for (const it of [].concat(list)) {
    if (!it || !it.id || !it.title) throw new Error('A command needs an id and a title');
    cmdItems.set(it.id, { kind: 'action', group: 'Actions', ...it });
  }
}
const removeCommand = (id) => cmdItems.delete(id);
function provideCommands(name, fn) {
  cmdProviders.set(name, fn);
}
/** Everything there is right now for what's typed (providers decide for themselves what fits). */
function allCommands(q = '') {
  const out = [...cmdItems.values()].filter(cmdOn);
  for (const fn of cmdProviders.values()) {
    let got = [];
    try {
      got = fn(q) || [];
    } catch {}
    for (const it of got) {
      if (!it || !it.id) continue;
      const x = { kind: 'action', group: 'Actions', ...it };
      cmdSeen.set(x.id, x);
      if (cmdOn(x)) out.push(x);
    }
  }
  return out;
}
function findCommand(id) {
  const it = cmdItems.get(id);
  if (it) return cmdOn(it) ? it : null;
  return allCommands('').find((x) => x.id === id) || (cmdSeen.has(id) && cmdOn(cmdSeen.get(id)) ? cmdSeen.get(id) : null);
}
/** An item by its id, to draw it, even while it can't run (Settings › Search box lists Recent). */
const describeCommand = (id) => cmdItems.get(id) || allCommands('').find((x) => x.id === id) || cmdSeen.get(id) || null;

// ---- what you ran: Recent, and how often (frecency)

/** The memory as the app saved it (window.pd.palette), checked; save(m) keeps it. */
function rememberCommands(m, save) {
  cmdMem = {
    recent: Array.isArray(m?.recent) ? m.recent.filter((x) => typeof x === 'string') : [],
    used: m?.used && typeof m.used === 'object' ? m.used : {},
  };
  if (save) cmdSave = save;
}
function cmdRan(id, now = Date.now()) {
  if (!id || !cmdKeep) return;
  const m = cmdMem;
  m.recent = [id, ...m.recent.filter((x) => x !== id)].slice(0, CMD_RECENT);
  const u = m.used[id] || { n: 0, t: 0 };
  m.used[id] = { n: (+u.n || 0) + 1, t: now };
  m.used = Object.fromEntries(
    Object.entries(m.used)
      .sort((a, b) => b[1].t - a[1].t)
      .slice(0, CMD_USED),
  );
  cmdSave(m);
}
/** Lets one entry go: out of Recent, and how often it was run. */
function cmdForget(id) {
  if (!cmdMem.recent.includes(id) && !cmdMem.used[id]) return;
  cmdMem.recent = cmdMem.recent.filter((x) => x !== id);
  delete cmdMem.used[id];
  cmdSave(cmdMem);
}
/** Lets everything go: Recent and how often each was run. */
function cmdForgetAll() {
  cmdMem = { recent: [], used: {} };
  cmdSave(cmdMem);
}
/** On (the default): what's run is remembered and ranks higher. Off: neither, and what's remembered is kept. */
function cmdRemembering(on) {
  if (on !== undefined) cmdKeep = !!on;
  return cmdKeep;
}
/** 12 × log2(1 + times run), halved for every 7 days since it was last run. */
function cmdFrecency(id, now = Date.now()) {
  if (!cmdKeep) return 0;
  const u = cmdMem.used[id];
  if (!u || !u.n) return 0;
  return 12 * Math.log2(1 + u.n) * Math.pow(0.5, Math.max(0, now - (+u.t || 0)) / (7 * CMD_DAY));
}
const cmdRecent = () => cmdMem.recent;

// ---- searching

/** What's typed, split into its prefix (>, @, % or #) and the words: { scope, q }. */
function parseQuery(text) {
  const t = String(text || '').replace(/^\s+/, '');
  return CMD_SCOPES[t[0]] ? { scope: t[0], q: t.slice(1).trim() } : { scope: '', q: t.trim() };
}

/** A number at the end of what's typed ("stall 15"): the words without it, and the number. */
function splitNumber(q) {
  const m = /^(.*\S)\s+(\d+(?:\.\d+)?)$/.exec(q);
  return m ? { words: m[1], n: Number(m[2]) } : null;
}

/**
 * -> [{ item, score, match, level, marks, arg }], best first: at most 7 a group and 40 in all (with a prefix: all of
 * that kind). With nothing typed: everything a scope lists, or (keep) the items for the empty box. only: search these
 * items instead (Tab's list for a row). Items marked fallback are left out: they're for when nothing else is found.
 * arg: a number typed for a range item, kept to its limits.
 */
function searchCommands(text, { scope = '', only = null, keep = false, now = Date.now() } = {}) {
  const p = scope || only ? { scope, q: String(text || '').trim() } : parseQuery(text);
  const kinds = p.scope ? CMD_SCOPES[p.scope].kinds : null;
  const num = p.q ? splitNumber(p.q) : null;
  const scored = [];
  for (const it of only ? only.filter(cmdOn) : allCommands(p.q)) {
    if ((kinds && !kinds.includes(it.kind)) || (it.fallback && !only)) continue;
    let s;
    let arg;
    if (p.q) {
      const words = cmdVal(it.words) || [];
      const sub = [cmdText(cmdVal(it.sub)), it.text].filter(Boolean).join(' · ');
      // A slider's words and a number: "stall 15" sets it to 15.
      if (it.range && num) {
        s = fuzzy.scoreItem(num.words, { title: it.title, words, sub });
        if (s) arg = Math.min(it.range.max, Math.max(it.range.min, num.n));
      }
      s ||= fuzzy.scoreItem(p.q, { title: it.title, words, sub });
      if (!s) continue;
    } else if (only || p.scope || (keep && it.keep)) s = { score: 0, marks: [] };
    else continue;
    const score = s.score + (p.scope || only ? 0 : CMD_RANK[it.kind] || 0) + (+cmdVal(it.boost) || 0) + (only ? 0 : cmdFrecency(it.id, now));
    scored.push({ item: it, score, match: s.score, level: s.level ?? s.score, marks: s.marks, arg });
  }
  // Ties: the shorter title first; with nothing typed (a prefix on its own), by group, then A–Z. Quit is never first.
  const tie = p.q
    ? (a, b) => a.item.title.length - b.item.title.length || a.item.title.localeCompare(b.item.title)
    : (a, b) => groupAt(a.item.group) - groupAt(b.item.group) || String(a.item.group).localeCompare(String(b.item.group)) || a.item.title.localeCompare(b.item.title, undefined, { numeric: true });
  if (!only || p.q) scored.sort((a, b) => !!a.item.last - !!b.item.last || b.score - a.score || tie(a, b));
  // When something matches well, letters scattered through other names (or second lines) don't count.
  const best = Math.max(0, ...scored.map((r) => r.match));
  const per = new Map();
  const out = [];
  for (const r of scored) {
    if (p.q && best >= 55 && r.level < 35) continue;
    const g = r.item.group;
    const n = per.get(g) || 0;
    if (!only && !p.scope && n >= CMD_PER_GROUP) continue;
    per.set(g, n + 1);
    out.push(r);
    if (!only && !p.scope && out.length >= CMD_MAX) break;
  }
  return out;
}
const groupAt = (g) => {
  const i = cmdGroups.indexOf(g);
  return i < 0 ? cmdGroups.length : i;
};
/** The order groups are listed in with only a prefix typed. */
function orderGroups(groups) {
  cmdGroups = [...groups];
}
/** When nothing is found: what's still worth offering for the words (Search History for "xyz"…), in their order. */
const cmdFallbacks = (text) =>
  allCommands(String(text || '').trim())
    .filter((it) => it.fallback)
    .sort((a, b) => (a.order || 9) - (b.order || 9));
/** The results in groups, each group where its best result is: [{ group, rows: [...] }]. */
function cmdGrouped(results) {
  const gs = [];
  for (const r of results) {
    let g = gs.find((x) => x.group === r.item.group);
    if (!g) gs.push((g = { group: r.item.group, rows: [] }));
    g.rows.push(r);
  }
  return gs;
}

// ---- running

/** how: 'run' (Enter), 'alt' (⇧Enter) or a button's index; arg: a choice's value or a slider's number. -> '' when it ran, else why it didn't. */
function runCommand(itemOrId, how = 'run', arg) {
  const it = typeof itemOrId === 'string' ? findCommand(itemOrId) : itemOrId;
  if (!it) return 'Not available here';
  const why = cmdWhy(it);
  if (why) return why;
  if (typeof how === 'number') {
    const b = (cmdVal(it.buttons) || [])[how];
    if (!b) return 'Not available here';
    if (!it.noRecent) cmdRan(it.id);
    b.run();
    return '';
  }
  if (!it.noRecent) cmdRan(it.id);
  if (how === 'alt' && it.alt) it.alt();
  else if (it.toggle) it.toggle.set(!it.toggle.get());
  else if (it.choice && arg !== undefined) it.choice.set(arg);
  else if (it.range && arg !== undefined) it.range.set(arg);
  else if (it.run) it.run();
  else if (it.alt) it.alt();
  return '';
}

const commands = {
  add: addCommands,
  remove: removeCommand,
  provide: provideCommands,
  all: allCommands,
  find: findCommand,
  remember: rememberCommands,
  ran: cmdRan,
  recent: cmdRecent,
  forget: cmdForget,
  forgetAll: cmdForgetAll,
  remembering: cmdRemembering,
  describe: describeCommand,
  frecency: cmdFrecency,
  search: searchCommands,
  fallbacks: cmdFallbacks,
  grouped: cmdGrouped,
  order: orderGroups,
  run: runCommand,
  parse: parseQuery,
  disabledWhy: cmdWhy,
  value: cmdVal,
  text: cmdText,
  SCOPES: CMD_SCOPES,
};
