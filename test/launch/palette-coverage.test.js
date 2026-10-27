// Every button, tab and setting in the app is also a command of the search box (Ctrl/⌘+K): this opens each part of
// the real app in demo mode and fails on a visible [data-action] that no command runs, a tab or filter with no command
// of its own, or a Settings control with none. A command runs a button's action with runAction('<action>') in
// src/renderer/palette-items.js, or reaches its place another way; test/palette-coverage.js lists those, and the few
// left out, each with why (test/unit/renderer/palette-coverage.test.js checks the same lists against the code).
const test = require('node:test');
const assert = require('node:assert/strict');
const { launchApp, until } = require('./app');

const { INDIRECT, LEFT_OUT, TABS, runActions } = require('../palette-coverage');

const RUN = runActions();

let a;
const seen = new Map(); // action -> where it showed
const tabs = new Map(); // a tab's command id -> where it showed
const controls = new Map(); // a Settings control's command id -> where it showed
test.before(async () => {
  a = await launchApp({ size: { width: 1512, height: 944 } });
  await a.farming();
});
test.after(async () => {
  assert.deepEqual(a.errors, []);
  await a.close();
});

// What shows: each button's action and data-id, and each Settings control's setting (or notification kind).
const visible = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-action], [data-setting]')]
      .filter((e) => !e.closest('#palette-root') && e.checkVisibility())
      .map((e) => ({ action: e.dataset.action, id: e.dataset.id, key: e.dataset.key ?? e.dataset.setting, kind: e.dataset.kind, actApp: typeof act === 'undefined' ? null : act.app })),
  );
const CONTROLS = { 'setting-toggle': (e) => `set:${e.key}`, 'setting-value': (e) => `set:${e.key}`, 'queue-mode': () => 'set:queueMode', 'notify-toggle': (e) => `set:notify:${e.kind}`, 'dev-switch': () => 'set:developerTools', 'update-auto': () => 'set:update-auto', 'connected-toggle': (e) => `set:connect:${e.id}` };
async function look(where, page = a.win) {
  for (const e of await visible(page)) {
    if (e.action && !seen.has(e.action)) seen.set(e.action, where);
    if (e.action && TABS[e.action] && e.id) tabs.set(TABS[e.action](e.id, e), `${e.action} ${e.id} in ${where}`);
    const control = !e.action ? `set:${e.key}` : CONTROLS[e.action]?.(e);
    if (control && where.startsWith('Settings')) controls.set(control, `${e.action ?? 'a slider'} ${e.key ?? e.kind ?? e.id ?? ''} in ${where}`);
  }
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
  // Why isn't this farming?, from the menu.
  await click('[data-action="dev-why"]');
  await until(a.win, () => document.querySelector('.modal.why .why-checks .why-row'), 'Why isn’t this farming?');
  await look('Why isn’t this farming?');
  await a.win.keyboard.press('Escape');
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
  // Watching for the daily reward (every drop switched off), and its Change stream dialog.
  const rows = await a.app.evaluate(() => global.pdDebug.farmer.model.categories.map((c) => c.id));
  await a.demo((d) => d.daily({ minutes: 10 }));
  await a.win.evaluate((ids) => window.pd.setSettings({ disabledCategories: ids }), rows);
  await a.demo(async (d) => {
    while (d.farmer.ticking) await new Promise((r) => setTimeout(r, 50));
    await d.tick();
  });
  await until(a.win, () => document.querySelector('#hero [data-action="reward-streams"]'), 'watching for the daily reward', 15000);
  await look('the hero, watching for the daily reward');
  await click('#hero [data-action="reward-streams"]');
  await until(a.win, () => document.querySelector('.modal.reward-streams [data-action="reward-watch"]'), 'Change stream');
  await look('Change stream');
  await a.win.keyboard.press('Escape');
  await a.win.evaluate(() => window.pd.setSettings({ disabledCategories: [] }));
  await a.demo(async (d) => {
    while (d.farmer.ticking) await new Promise((r) => setTimeout(r, 50));
    await d.tick();
  });
  await a.farming();
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

test('each tab and filter is a command of its own, and each Settings control is one too', async () => {
  const ids = new Set(await a.win.evaluate(() => commands.all().map((x) => x.id)));
  const missing = [...tabs, ...controls].filter(([id]) => !ids.has(id)).map(([id, where]) => `${id} (${where})`);
  assert.ok(tabs.size > 25 && controls.size > 20, `${tabs.size} tabs and ${controls.size} controls seen`);
  assert.deepEqual(missing, [], 'give these a command of their own in palette-items.js (a place, or a Settings row in SETTINGS_ROWS)');
});
