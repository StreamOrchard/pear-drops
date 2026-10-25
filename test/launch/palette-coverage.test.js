// Every button and tab in the app is also a command of the search box (Ctrl/⌘+K): this opens each part of the real
// app in demo mode and fails on a visible [data-action] that no command runs. A command runs a button's action with
// runAction('<action>') in src/renderer/palette-items.js, or reaches its place another way (INDIRECT, each with how).
// The few left out are in LEFT_OUT, each with why.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchApp, until, ROOT } = require('./app');

/** Actions a command reaches without runAction, and how. */
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
/** Left out on purpose, each with why. */
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

const source = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'palette-items.js'), 'utf8');
const RUN = new Set([...source.matchAll(/runAction\('([a-z-]+)'/g)].map((m) => m[1]));

let a;
const seen = new Map(); // action -> where it showed
test.before(async () => {
  a = await launchApp({ size: { width: 1512, height: 944 } });
  await a.farming();
});
test.after(async () => {
  assert.deepEqual(a.errors, []);
  await a.close();
});

const visible = (page) => page.evaluate(() => [...document.querySelectorAll('[data-action]')].filter((e) => !e.closest('#palette-root') && e.checkVisibility()).map((e) => e.dataset.action));
async function look(where, page = a.win) {
  for (const name of await visible(page)) if (!seen.has(name)) seen.set(name, where);
}
const click = (sel) => a.win.click(sel);

test('open every part of the app, and note every button and tab that shows', async () => {
  for (const tab of ['queue', 'done', 'streams', 'activity']) {
    await click(`[data-action="side-tab"][data-id="${tab}"]`);
    if (tab === 'queue') await click('#side .cat .cat-row');
    await a.win.waitForTimeout(200);
    await look(`the dashboard’s ${tab}`);
  }
  await click('[data-action="view"][data-id="history"]');
  for (const t of ['timeline', 'sessions', 'channels']) {
    await until(a.win, () => document.querySelector('[data-action="hist-table"]'), 'History');
    await click(`[data-action="hist-table"][data-id="${t}"]`);
    await a.win.waitForTimeout(200);
    await look(`History › ${t}`);
  }
  await click('[data-action="hist-group"][data-id="problems"]').catch(() => {});
  await a.win.waitForTimeout(200);
  await look('History, filtered');
  await click('[data-action="view"][data-id="dashboard"]');
  // Every Settings page, with Developer tools on (the stream's ⋯ menu) and a linked Stream Multiview (Activity).
  await a.win.evaluate(() => window.pd.setSettings({ developerTools: true, developerToolsWarned: true }));
  await a.demo((d) => d.multiview({ signedIn: false, mode: 'auto' }));
  await click('button.icon-only[data-action="settings"]');
  for (const id of await a.win.$$eval('[data-action="settings-tab"]', (els) => els.map((e) => e.dataset.id))) {
    await click(`[data-action="settings-tab"][data-id="${id}"]`);
    await a.win.waitForTimeout(250);
    await look(`Settings › ${id}`);
  }
  await click('[data-action="settings-tab"][data-id="apps"]');
  const sw = '.app-card [data-action="connected-toggle"]';
  if (!(await a.win.evaluate(() => state.connected?.peers?.[0]?.enabled))) await click(sw);
  await until(a.win, () => document.querySelector('.app-card [data-action="act-open-app"]'), 'Activity on the card', 20000);
  await look('Settings › Connected apps, linked');
  await click('.app-card [data-action="act-open-app"]');
  await until(a.win, () => document.querySelector('[data-action="act-filter"]'), 'Activity');
  await look('Connected apps › Activity');
  await a.win.keyboard.press('Escape');
  await a.win.keyboard.press('Escape');
  await until(a.win, () => document.querySelector('[data-action="dev-menu"]'), 'the stream’s ⋯');
  await click('[data-action="dev-menu"]');
  await a.win.waitForTimeout(200);
  await look('the stream’s ⋯ menu');
  await click('[data-action="dev-menu"]');
  // The daily reward's card, What's new and the credit banner.
  await click('[data-action="reward-open"]');
  await until(a.win, () => document.querySelector('.dr-pop'), 'the reward’s card');
  await look('the daily reward');
  await a.win.keyboard.press('Escape');
  await a.win.evaluate(() => openModal('whatsnew'));
  await a.win.waitForTimeout(300);
  await look('What’s new');
  await a.win.keyboard.press('Escape');
  await a.demo((d) => d.conflict(true));
  await until(a.win, () => document.querySelector('#banner .banner'), 'the banner', 30000).catch(() => {});
  await look('the credit banner');
  await a.demo((d) => d.conflict(false));
  // The tray popover.
  await a.demo((d) => d.openTray());
  for (let i = 0; i < 30; i++) {
    const w = a.app.windows().find((x) => x.url().endsWith('tray.html'));
    if (w) {
      await w.waitForTimeout(400);
      await look('the tray popover', w);
      break;
    }
    await a.win.waitForTimeout(150);
  }
  assert.ok(seen.size > 40, `found ${seen.size} actions`);
});

test('each one is a command, or left out with why', () => {
  const missing = [...seen].filter(([name]) => !RUN.has(name) && !INDIRECT[name] && !LEFT_OUT[name]);
  assert.deepEqual(
    missing.map(([name, where]) => `${name} (in ${where})`),
    [],
    'give these a command in palette-items.js, or a line in LEFT_OUT with why',
  );
});

test('the lists stay honest: nothing both covered and left out, and every action named is one the app has', () => {
  for (const name of Object.keys(LEFT_OUT)) assert.ok(!RUN.has(name) && !INDIRECT[name], `${name} is covered and left out`);
  const app = fs.readdirSync(path.join(ROOT, 'src', 'renderer')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(ROOT, 'src', 'renderer', f), 'utf8')).join('\n');
  for (const name of [...RUN, ...Object.keys(INDIRECT), ...Object.keys(LEFT_OUT)]) assert.ok(app.includes(`data-action="${name}"`), `no button runs ${name}`);
});
