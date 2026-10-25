// What the search box (Ctrl/⌘+K) has to cover, for the tests that check it does: every button (a data-action), every
// tab and filter (each of its data-ids), and every setting. A new one fails test/unit/renderer/palette-coverage.test.js
// (read from the code, even in a part the launch test doesn't open) and test/launch/palette-coverage.test.js (on
// screen), until it's a command in src/renderer/palette-items.js, or a line here with why it isn't.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RENDERER = path.join(ROOT, 'src', 'renderer');

/** Actions a command reaches without runAction('<action>'), and how. */
const INDIRECT = {
  palette: 'the box’s own button',
  settings: 'Settings › each page (openSettings)',
  'settings-tab': 'Settings › each page (openSettings)',
  'setting-toggle': 'each Settings switch (window.pd.setSettings)',
  'queue-mode': 'Queue order, a Settings choice that runs its own action (SETTINGS_ROWS action)',
  'side-tab': 'Queue, Done, Streams, Activity (openSide)',
  'past-filter': 'Done: All, Completed, Missed (openSide)',
  'select-cat': 'Streams: each drop (openSide)',
  expand: 'a drop’s Show in queue (openSide opens its row)',
  'hist-range': 'History: each range (openHistory)',
  'hist-table': 'History: each table (openHistory)',
  'hist-group': 'History: each event group, a switch (openHistory)',
  'hist-campaign': 'a drop’s In History (openHistory)',
  'coming-pick': 'Coming soon: each drop (ui.comingIdx)',
  'reward-claim': 'Claim the daily reward (its card’s Claim, clicked)',
  'reward-replay': 'Replay the last reward (its card’s Replay, clicked)',
  'update-chip': 'Install the update, Restart to update and Settings › Updates',
  show: 'the tray popover’s Open Pear Drops: the box is in that window',
  quit: 'Quit Pear Drops (window.pd.quit, from the dashboard)',
};

/** Buttons left out on purpose, each with why. */
const LEFT_OUT = {
  'close-modal': 'closes a dialog: Esc does that',
  'close-whatsnew': 'closes What’s new (its Nice button): Esc does that',
  'reward-close': 'closes the reward’s card: Esc does that',
  'reward-back': 'the tray’s back arrow, inside its own window',
  'reward-done': 'ends the reveal that’s playing',
  'act-close': 'Activity’s back arrow: Esc does that',
  'act-toggle': 'opens one message: a row of a list, and its Copy is a command',
  'dev-toggle-row': 'opens one entry: a row of a list, and its Copy is a command',
  'dev-menu': 'opens the stream’s ⋯ menu: each of its items is a command',
  'dev-warn-ok': 'Developer tools’ warning has to be read on its page first',
  'dev-warn-cancel': 'Developer tools’ warning has to be read on its page first',
};

/**
 * Tabs and filters: each of their data-ids is a command of its own, by name. command(id, page) is the id of the
 * command that opens it (page: what's open, for the ones that depend on it), or null for one that's per row.
 */
const TABS = {
  'side-tab': (id) => `place:${id}`,
  'past-filter': (id) => (id === 'all' ? 'place:done' : `place:done-${id}`),
  'select-cat': (id) => `place:streams:${id}`,
  'hist-range': (id) => `place:hist-range:${id}`,
  'hist-table': (id) => `place:hist-table:${id}`,
  'hist-group': (id) => `place:hist-group:${id}`,
  'settings-tab': (id) => `page:${id}`,
  'act-filter': (id, page) => `place:act:${page.actApp}:${id}`,
  'dev-list': (id) => `place:dev:${id}`,
  'reward-tab': (id) => `place:crate:${id}`,
  view: (id) => `place:${id}`,
};

/** Settings (store.js DEFAULTS) that aren't a row of SETTINGS_ROWS: the command that covers each, or why there's none. */
const OTHER_SETTINGS = {
  backupEvery: 'set:backupEvery',
  backupKeep: 'set:backupKeep',
  developerTools: 'set:developerTools',
  notify: 'set:notify:<kind>, one per kind of NOTIFY_KINDS',
  connectedApps: 'set:connect:<app>, one per app',
  playerOpen: 'Hide the stream / Show the stream',
  categoryOrder: 'a drop’s Farm it first, Move up and Move down',
  disabledCategories: 'a drop’s Switch it off / on, and Farm this drop',
  developerToolsWarned: 'not a choice: whether the Developer tools warning was read',
  knownRows: 'not a choice: the queue’s rows seen so far',
  window: 'not a choice: the window’s place, remembered',
};

/** runAction('<action>') in palette-items.js: the actions its commands run. */
function runActions() {
  const src = fs.readFileSync(path.join(RENDERER, 'palette-items.js'), 'utf8');
  return new Set([...src.matchAll(/runAction\('([a-z-]+)'/g)].map((m) => m[1]));
}

/** Every literal data-action="<action>" in the app's pages, with the files it's in. */
function pageActions() {
  const out = new Map();
  for (const f of fs.readdirSync(RENDERER).filter((x) => x.endsWith('.js') && x !== 'palette.js' && x !== 'palette-items.js')) {
    for (const m of fs.readFileSync(path.join(RENDERER, f), 'utf8').matchAll(/data-action="([a-z-]+)"/g)) out.set(m[1], [...(out.get(m[1]) ?? []), f]);
  }
  return out;
}

/** The ids of SETTINGS_ROWS in app.js. */
function settingRows() {
  const src = fs.readFileSync(path.join(RENDERER, 'app.js'), 'utf8');
  const start = src.indexOf('const SETTINGS_ROWS = [');
  const end = src.indexOf('\n];\n', start);
  if (start < 0 || end < 0) throw new Error('SETTINGS_ROWS not found in app.js');
  return new Set([...src.slice(start, end).matchAll(/^ {4}id: '([A-Za-z]+)'|\{ page: '[a-z]+', id: '([A-Za-z]+)'/gm)].map((m) => m[1] ?? m[2]));
}

module.exports = { INDIRECT, LEFT_OUT, TABS, OTHER_SETTINGS, runActions, pageActions, settingRows };
