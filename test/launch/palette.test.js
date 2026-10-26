// The search box (Ctrl/⌘+K) in the real app, against the stand-in Kick: opening and closing it, the empty box, a
// drop named in full and its buttons, Tab's list, the prefixes, a switch, a choice and a slider set from it, Skip
// stream, a tab by name, nothing found, what it remembers (in the database), the title bar's button, Ctrl/⌘+K
// from inside the docked stream and the tray popover, and Settings › Search box: Recent's rows removed and cleared
// (in the box and in Settings), Recent off, and the box off.
const test = require('node:test');
const assert = require('node:assert/strict');
const { launchApp, until, readDb } = require('./app');

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
let a;
test.before(async () => {
  a = await launchApp({ size: { width: 1512, height: 944 } });
  await a.farming();
});
test.after(async () => {
  assert.deepEqual(a.errors, []);
  await a.close();
});

const open = () => a.win.evaluate(() => palette.isOpen());
const rows = () => a.win.evaluate(() => palette.rows());
const typeIn = async (text) => {
  await a.win.fill('#pal-q', '');
  await a.win.type('#pal-q', text);
  await a.win.waitForTimeout(80);
};
async function openBox() {
  if (!(await open())) await a.win.keyboard.press(`${MOD}+k`);
  await until(a.win, () => palette.isOpen(), 'the box open');
}
async function closeBox() {
  for (let i = 0; i < 4 && (await open()); i++) await a.win.keyboard.press('Escape');
  assert.equal(await open(), false);
}

test('Ctrl/⌘+K opens it with the words box focused, and again closes it; the stream is covered while it’s open', async () => {
  await a.win.keyboard.press(`${MOD}+k`);
  await until(a.win, () => palette.isOpen() && document.activeElement?.id === 'pal-q', 'open, with the keyboard in it');
  assert.equal(await a.win.evaluate(() => document.querySelector('#player-views').classList.contains('covered')), true);
  assert.equal(await a.win.getAttribute('#pal-q', 'role'), 'combobox');
  await a.win.keyboard.press(`${MOD}+k`);
  assert.equal(await open(), false);
  assert.equal(await a.win.evaluate(() => document.querySelector('#player-views').classList.contains('covered')), false);
});

test('the empty box: what’s farming now and its controls, with the prefixes in the footer', async () => {
  await openBox();
  const r = await rows();
  assert.deepEqual(
    r.filter((x) => x.group === 'Now').map((x) => x.id),
    ['pause', 'refresh', 'reload', 'skip'],
  );
  assert.match(await a.win.textContent('.pal-g'), /Now.*Arcadia · Neon Rush/);
  assert.match(await a.win.textContent('.pal-foot'), /actions.*channels.*drops.*settings/);
  await closeBox();
});

test('a drop named in full comes first, drawn big, with its buttons: ← → and Tab / ⇧Tab move along them, More… lists everything', async () => {
  await openBox();
  await typeIn('neon rush launch week');
  const r = await rows();
  assert.deepEqual(r[0], { id: 'drop:801', title: 'Neon Rush Launch Week', group: 'Drops', hero: true, kind: 'drop' });
  assert.equal(await a.win.locator('.pal-hero .pal-track .mk').count(), 3, 'its reward track');
  const buttons = await a.win.$$eval('.pal-hero .pal-btn', (els) => els.map((b) => b.textContent.replace(/(↵|⌘\d|Ctrl\d|Tab)$/, '').trim()));
  assert.deepEqual(buttons, ['Show in queue', 'Skip stream', 'Switch it off', 'In History', 'More…']);
  const on = () => a.win.textContent('.pal-hero .pal-btn.on');
  await a.win.keyboard.press('ArrowRight');
  assert.match(await on(), /Skip stream/);
  await a.win.keyboard.press('ArrowLeft');
  await a.win.keyboard.press('Tab');
  assert.match(await on(), /Skip stream/, 'Tab: the next button');
  await a.win.keyboard.press('Shift+Tab');
  assert.match(await on(), /Show in queue/, '⇧Tab: the one before');
  await a.win.keyboard.press('Shift+Tab');
  assert.match(await on(), /More…/, 'from the first, back round to the last');
  await a.win.keyboard.press('Enter');
  await until(a.win, () => document.querySelector('.pal').classList.contains('pal-tabbed'), 'everything for it');
  assert.match(await a.win.textContent('.pal-head'), /Neon Rush Launch Week/);
  const titles = (await rows()).map((x) => x.title);
  for (const t of ['Show in queue', 'Farm it first', 'Move up', 'Farm this drop', 'In History', 'Turbo Grin Emote']) assert.ok(titles.includes(t), t);
  assert.equal(await a.win.locator('.pal-list.split .pal-col').count(), 2, 'in two columns');
  const column = () => a.win.evaluate(() => [...document.querySelectorAll('.pal-col')].findIndex((c) => c.querySelector('.pal-row.on')));
  assert.equal(await column(), 0);
  await a.win.keyboard.press('Tab');
  assert.equal(await column(), 1, 'Tab: the right column');
  await a.win.keyboard.press('Shift+Tab');
  assert.equal(await column(), 0, '⇧Tab: back to the left');
  await a.win.keyboard.press('Escape');
  assert.equal(await a.win.evaluate(() => document.querySelector('.pal').classList.contains('pal-tabbed')), false, 'Esc: back to the results');
  assert.equal(await a.win.inputValue('#pal-q'), 'neon rush launch week');
  // Enter runs the first button: the Queue, open on the drop.
  await a.win.keyboard.press('Enter');
  assert.equal(await open(), false);
  await until(a.win, () => ui.sideTab === 'queue' && ui.expanded.has(801), 'the Queue, open on Neon Rush');
});

test('Esc steps back: the words, then the box; a prefix becomes a chip, and Backspace takes it off', async () => {
  await openBox();
  await typeIn('#');
  assert.equal(await a.win.isVisible('.pal-scope'), true);
  assert.equal((await a.win.textContent('.pal-scope')).trim(), 'Settings');
  assert.equal(await a.win.inputValue('#pal-q'), '');
  assert.ok((await rows()).every((x) => x.kind === 'setting' || x.kind === 'page'));
  await a.win.keyboard.press('Backspace');
  assert.equal(await a.win.isVisible('.pal-scope'), false);
  await typeIn('neon');
  await a.win.keyboard.press('Escape');
  assert.equal(await a.win.inputValue('#pal-q'), '');
  assert.equal(await open(), true);
  await a.win.keyboard.press('Escape');
  assert.equal(await open(), false);
});

test('a switch flips where it is; a choice is picked with ← →; a slider is set by a number with its words', async () => {
  await openBox();
  await typeIn('#claim drops automatically');
  assert.equal((await rows())[0].id, 'set:autoClaim');
  const before = await a.win.evaluate(() => state.settings.autoClaim);
  await a.win.keyboard.press('Enter');
  await until(a.win, (b) => state.settings.autoClaim === !b, 'Claim drops automatically flipped', 5000, before);
  assert.equal(await open(), true, 'the box stays open');
  await a.win.keyboard.press('Enter');
  await until(a.win, (b) => state.settings.autoClaim === b, 'and back', 5000, before);

  await typeIn('claim kick’s daily rewards');
  assert.equal((await rows())[0].id, 'set:dailyClaim');
  await a.win.keyboard.press('ArrowLeft');
  assert.match(await a.win.textContent('.pal-row.on .pal-seg i.pick'), /Myself/);
  await a.win.keyboard.press('Enter');
  await until(a.win, () => state.settings.dailyClaim === 'self', 'Myself set');

  await typeIn('stall 15');
  assert.equal((await rows())[0].id, 'set:stallMinutes');
  assert.match(await a.win.textContent('.pal-row.on .pal-right'), /Set to 15 min/);
  await a.win.keyboard.press('Enter');
  await until(a.win, () => state.settings.stallMinutes === 15, 'the stall time at 15');
  assert.equal(await open(), false);
  // ⇧Enter opens its page with the row lit.
  await openBox();
  await typeIn('#claim drops automatically');
  await a.win.keyboard.press('Shift+Enter');
  await until(a.win, () => document.querySelector('.settings-modal [data-row="autoClaim"].lit'), 'Settings › Farming with the row lit');
  await a.win.keyboard.press('Escape');
});

test('Skip stream from the box switches the stream, and says so', async () => {
  const was = await a.win.evaluate(() => farm().current.slug);
  await openBox();
  await typeIn('>skip stream');
  assert.equal((await rows())[0].id, 'skip');
  await a.win.keyboard.press('Enter');
  await until(a.win, () => document.querySelector('.pal-flash')?.textContent.includes('Skipping'), 'the flash');
  await until(a.win, (s) => farm().current && farm().current.slug !== s, 'another stream', 20000, was);
});

test('every tab and filter by name: Done on Missed, History on a range, Settings › Developer on Requests', async () => {
  await openBox();
  await typeIn('done: missed');
  await a.win.keyboard.press('Enter');
  await until(a.win, () => ui.sideTab === 'done' && ui.pastFilter === 'missed', 'Done, on Missed');
  await openBox();
  await typeIn('history: last 24 hours');
  await a.win.keyboard.press('Enter');
  await until(a.win, () => ui.view === 'history' && hist.range === '24h', 'History, the last 24 hours');
  await openBox();
  await typeIn('developer: requests');
  await a.win.keyboard.press('Enter');
  await until(a.win, () => ui.modal === 'settings' && ui.settingsTab === 'developer' && dev.list === 'requests', 'Settings › Developer on Requests');
  await a.win.keyboard.press('Escape');
  await openBox();
  await typeIn('dashboard');
  await a.win.keyboard.press('Enter');
  await until(a.win, () => ui.view === 'dashboard', 'the dashboard again');
});

test('nothing found still offers what to do next', async () => {
  await openBox();
  await typeIn('xqzv');
  assert.match(await a.win.textContent('.pal-none'), /Nothing called “xqzv”/);
  assert.deepEqual(
    (await rows()).map((x) => x.title),
    ['Search History for “xqzv”', 'Search kick.com for “xqzv”'],
  );
  assert.equal((await a.win.textContent('.pal-count')).trim(), 'No results');
  await closeBox();
});

test('what was run is remembered in the database, and listed in the empty box as Recent', async () => {
  const saved = readDb(a.data, (db) => db.get('palette', {}));
  assert.ok(saved.recent.includes('skip'), JSON.stringify(saved.recent));
  assert.ok(saved.used.skip.n >= 1);
  await openBox();
  assert.ok((await rows()).some((x) => x.group === 'Recent'), 'a Recent group');
  await closeBox();
});

test('the title bar’s button opens it, with its keys shown (just the icon when the title bar is tight)', async () => {
  assert.match(await a.win.textContent('.tb-search kbd'), /⌘K|Ctrl K/);
  // The title bar drags the window, so a button in it that doesn't opt out never gets a real click (Playwright's clicks skip that).
  const dragging = await a.win.evaluate(() => [...document.querySelectorAll('.titlebar button')].filter((b) => getComputedStyle(b).webkitAppRegion !== 'no-drag').map((b) => b.className));
  assert.deepEqual(dragging, [], 'title bar buttons that drag the window');
  await a.win.click('.tb-search');
  await until(a.win, () => palette.isOpen(), 'open from the button');
  await closeBox();
  await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => /index\.html$/.test(w.webContents.getURL())).setBounds({ width: 1200, height: 800 }));
  await until(a.win, () => document.querySelector('.tb-search.tight'), 'the tight button');
  await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => /index\.html$/.test(w.webContents.getURL())).setBounds({ width: 1512, height: 944 }));
});

test('Ctrl/⌘+K inside the docked stream opens it too (the web view keeps its other keys)', async () => {
  await until(a.win, () => document.querySelector('#player-views webview'), 'the docked stream');
  const sent = await a.app.evaluate(({ webContents }, mac) => {
    const view = webContents.getAllWebContents().find((w) => w.getType() === 'webview');
    if (!view) return false;
    view.sendInputEvent({ type: 'keyDown', keyCode: 'K', modifiers: [mac ? 'meta' : 'control'] });
    return true;
  }, process.platform === 'darwin');
  assert.equal(sent, true);
  await until(a.win, () => palette.isOpen(), 'open from the stream', 5000);
  await closeBox();
});

test('Ctrl/⌘+K in the tray popover brings the main window forward, with the box open', async () => {
  await a.demo((d) => d.openTray());
  let pop = null;
  for (let i = 0; i < 40 && !pop; i++) {
    pop = a.app.windows().find((x) => x.url().endsWith('tray.html')) ?? null;
    if (!pop) await a.win.waitForTimeout(150);
  }
  assert.ok(pop, 'the tray popover');
  await pop.waitForLoadState('domcontentloaded');
  await pop.keyboard.press(`${MOD}+k`);
  await until(a.win, () => palette.isOpen(), 'open in the main window', 5000);
  await closeBox();
});

// ---- Settings › Search box, and Recent in the box

const savedRecent = () => readDb(a.data, (db) => db.get('palette', {})).recent ?? [];
/** Waits for what's saved in the database to pass ok(recent). */
async function saved(ok, what) {
  for (let i = 0; i < 40; i++) {
    if (ok(savedRecent())) return;
    await a.win.waitForTimeout(100);
  }
  assert.fail(`Timed out waiting for ${what}: ${JSON.stringify(savedRecent())}`);
}
/** Runs a few things, so Recent has rows. */
async function fillRecent() {
  for (const q of ['history', 'done: missed', 'dashboard']) {
    await openBox();
    await typeIn(q);
    await a.win.keyboard.press('Enter');
    await a.win.waitForTimeout(120);
  }
  await closeBox();
}
/** The empty box, on its first Recent row. */
async function onFirstRecent() {
  await openBox();
  const i = (await rows()).findIndex((r) => r.recent);
  assert.ok(i >= 0, 'a Recent row');
  for (let k = 0; k < i; k++) await a.win.keyboard.press('ArrowDown');
  assert.match(await a.win.textContent('.pal-foot'), /remove from Recent/);
  return (await rows())[i].id;
}

test('Recent: Del and Ctrl/⌘+⌫ remove the row it’s on, and its ×; plain ⌫ removes nothing', async () => {
  await fillRecent();
  let id = await onFirstRecent();
  await a.win.keyboard.press('Backspace');
  assert.ok((await rows()).some((r) => r.recent && r.id === id), 'plain ⌫ only edits the words');
  await a.win.keyboard.press('Delete');
  assert.ok(!(await rows()).some((r) => r.id === id && r.recent), 'Del removed it');
  await saved((r) => !r.includes(id), 'it forgotten in the database');
  id = (await rows()).find((r) => r.recent)?.id;
  await a.win.keyboard.press(`${MOD}+Backspace`);
  assert.ok(!(await rows()).some((r) => r.id === id && r.recent), 'Ctrl/⌘+⌫ removed the next');
  id = (await rows()).find((r) => r.recent)?.id;
  await a.win.hover(`.pal-row[data-id="${id}"]`);
  await a.win.click(`.pal-row[data-id="${id}"] [data-pal-x]`);
  assert.ok(!(await rows()).some((r) => r.id === id && r.recent), 'its × removed it');
  assert.equal(await open(), true, 'the box stays open');
  await closeBox();
});

test('Clear all asks first, in Recent’s heading: Esc keeps them, Enter clears them', async () => {
  await fillRecent();
  await openBox();
  await a.win.click('[data-pal-clear]');
  assert.match(await a.win.textContent('.pal-g .pal-ask'), /Forget all \d+\?/);
  assert.match(await a.win.textContent('.pal-foot'), /clear all.*keep them/);
  await a.win.keyboard.press('Escape');
  assert.equal(await open(), true, 'Esc answers the question, the box stays');
  assert.ok((await rows()).some((r) => r.recent), 'kept');
  await a.win.click('[data-pal-clear]');
  await a.win.keyboard.press('Enter');
  assert.ok(!(await rows()).some((r) => r.recent), 'cleared');
  await saved((r) => r.length === 0, 'Recent cleared in the database');
  await closeBox();
});

test('Clear recent is a command: it asks in the box, and isn’t remembered itself', async () => {
  await fillRecent();
  await openBox();
  await typeIn('clear recent');
  assert.equal((await rows())[0].id, 'recent-clear');
  await a.win.keyboard.press('Enter');
  assert.equal(await open(), true);
  assert.equal(await a.win.inputValue('#pal-q'), '', 'the empty box, with Recent');
  assert.ok(await a.win.$('.pal-g .pal-ask'), 'asking');
  await a.win.keyboard.press('Enter');
  assert.ok(!(await rows()).some((r) => r.recent));
  await saved((r) => r.length === 0, 'Recent cleared, without Clear recent in it');
  await closeBox();
});

test('Settings › Search box lists Recent as the box draws it: × and Clear all (Keep, then Clear all), and Manage opens it', async () => {
  await fillRecent();
  await openBox();
  await a.win.click('[data-pal-manage]');
  await until(a.win, () => document.querySelector('.settings-tab.active[data-id="search"]'), 'Settings › Search box');
  assert.equal(await open(), false);
  const ids = await a.win.evaluate(() => [...commands.recent()]);
  assert.deepEqual(await a.win.$$eval('.sb-row', (els) => els.map((e) => e.dataset.id)), ids);
  await a.win.click(`.sb-row[data-id="${ids[0]}"] [data-action="recent-forget"]`);
  await until(a.win, (x) => !document.querySelector(`.sb-row[data-id="${x}"]`), 'its row gone', 3000, ids[0]);
  await saved((r) => !r.includes(ids[0]), 'it forgotten in the database');
  await a.win.click('[data-action="recent-clear"]');
  assert.match(await a.win.textContent('.sb-ask'), /Forget all \d+/);
  await a.win.click('[data-action="recent-keep"]');
  assert.equal(await a.win.$$eval('.sb-row', (els) => els.length), ids.length - 1, 'Keep keeps them');
  await a.win.click('[data-action="recent-clear"]');
  await a.win.click('[data-action="recent-clear-yes"]');
  await until(a.win, () => document.querySelector('.sb-empty'), 'Nothing yet');
  await saved((r) => r.length === 0, 'Recent cleared in the database');
  assert.equal(await a.win.$eval('[data-action="recent-clear"]', (b) => b.disabled), true, 'nothing left to clear');
  await a.win.keyboard.press('Escape');
});

test('Settings › Search box: a long Recent scrolls in its own box, so the page doesn’t', async () => {
  await a.win.evaluate(() => commands.remember({ recent: commands.all('').slice(0, 20).map((x) => x.id), used: {} }));
  await a.win.evaluate(() => openSettings('search'));
  await until(a.win, () => document.querySelectorAll('.sb-row').length === 20, 'twenty rows');
  const [page, box, list, inner] = await a.win.evaluate(() => {
    const p = document.querySelector('.settings-pane');
    const l = document.querySelector('.sb-list');
    return [p.scrollHeight, p.clientHeight, l.scrollHeight, l.clientHeight];
  });
  assert.ok(page <= box + 1, `the page needs ${page - box}px of scrolling`);
  assert.ok(list > inner, 'the list scrolls');
  await a.win.evaluate(() => commands.forgetAll());
  await a.win.keyboard.press('Escape');
});

test('Recent off: no Recent rows and nothing new remembered; on again, they come back', async () => {
  await fillRecent();
  const before = savedRecent();
  await a.win.evaluate(() => openSettings('search'));
  await a.win.click('[data-row="searchRecent"] .switch');
  await until(a.win, () => state.settings.searchRecent === false, 'Recent off');
  await a.win.keyboard.press('Escape');
  await openBox();
  assert.ok(!(await rows()).some((r) => r.recent), 'no Recent rows');
  await typeIn('history');
  await a.win.keyboard.press('Enter');
  await a.win.waitForTimeout(200);
  assert.deepEqual(savedRecent(), before, 'nothing new remembered');
  await a.win.evaluate(() => window.pd.setSettings({ searchRecent: true }));
  await until(a.win, () => state.settings.searchRecent === true, 'Recent on');
  await openBox();
  await typeIn('');
  assert.ok((await rows()).some((r) => r.recent), 'they come back');
  await closeBox();
});

test('the search box off: no Search button, and Ctrl/⌘+K (here or in the stream) says where to turn it on', async () => {
  await a.win.evaluate(() => openSettings('search'));
  await a.win.click('[data-row="searchBox"] .switch');
  await until(a.win, () => state.settings.searchBox === false && !document.querySelector('.tb-search'), 'no Search button');
  assert.ok(await a.win.$('.sb.off'), 'the rest of the page greys out');
  await a.win.keyboard.press('Escape');
  await a.win.keyboard.press(`${MOD}+k`);
  await until(a.win, () => [...document.querySelectorAll('.toast')].some((t) => /search box is off/i.test(t.textContent)), 'the toast');
  assert.equal(await open(), false);
  await a.win.keyboard.press(`${MOD}+k`);
  assert.equal(await a.win.$$eval('.toast', (els) => els.filter((t) => /search box is off/i.test(t.textContent)).length), 1, 'once, however often');
  await a.app.evaluate(({ webContents }, mac) => {
    webContents
      .getAllWebContents()
      .find((w) => w.getType() === 'webview')
      ?.sendInputEvent({ type: 'keyDown', keyCode: 'K', modifiers: [mac ? 'meta' : 'control'] });
  }, process.platform === 'darwin');
  await a.win.waitForTimeout(400);
  assert.equal(await open(), false, 'not from the stream either');
  await a.win.evaluate(() => window.pd.setSettings({ searchBox: true }));
  await until(a.win, () => document.querySelector('.tb-search'), 'the Search button back');
  await openBox();
  await closeBox();
});
