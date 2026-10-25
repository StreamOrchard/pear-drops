// Settings › Developer: the Developer tools switch and its warning, the error log (kept for the next
// run), Kick's requests and the player's watch events, Copy diagnostics, Save to Downloads, Copy
// player state and Inspect, in the real app against the stand-in Kick, at its smallest window.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchApp, until, readDb } = require('./app');

const SMALLEST = { width: 1120, height: 700 };

let a;
test.before(async () => {
  a = await launchApp({ size: SMALLEST });
  await a.farming();
});
test.after(async () => {
  await a.close();
});

const openDeveloper = async () => {
  await a.win.click('button.icon-only[data-action="settings"]');
  await a.win.click('[data-action="settings-tab"][data-id="developer"]');
  await until(a.win, () => document.querySelector('.pane-developer .dev-list'), 'Settings › Developer');
};
const tab = async (id) => {
  await a.win.click(`[data-action="dev-list"][data-id="${id}"]`);
  await until(a.win, (want) => document.querySelector(`[data-action="dev-list"][data-id="${want}"].active`), `the ${id} tab`, 15000, id);
};
const listText = () => a.win.evaluate(() => document.querySelector('.dev-list')?.textContent ?? '');
const clipboard = () => a.app.evaluate(({ clipboard: c }) => c.readText());

test('errors from the app, its window and Kick’s pages are listed, the same one again counted, and none is a system pop-up', async () => {
  await a.app.evaluate(() => {
    console.error('Main went wrong: token=secret123');
    console.error('Main went wrong: token=secret123');
  });
  await a.win.evaluate(() => setTimeout(() => Promise.reject(new Error('The page went wrong'))));
  // A Kick page that stopped (the stream's page, as the watcher's <webview> would say).
  await a.app.evaluate(({ webContents }) => {
    const page = webContents.getAllWebContents().find((wc) => wc.getType() === 'webview');
    page?.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 133 });
  });
  await openDeveloper();
  await until(a.win, () => /Main went wrong/.test(document.querySelector('.dev-list')?.textContent) && /The page went wrong/.test(document.querySelector('.dev-list')?.textContent), 'the errors listed');
  const text = await listText();
  assert.match(text, /Main went wrong: token=…/, 'the token is taken out');
  assert.doesNotMatch(text, /secret123/);
  assert.match(text, /×2/, 'counted, not repeated');
  assert.match(text, /Window.*promise.*The page went wrong/s);
  assert.match(text, /Stream.*The page stopped: crashed \(exit 133\)/s);
  a.errors.length = 0; // the page error was on purpose
});

test('Requests: each call to Kick with its status, Errors only, and a click copies it', async () => {
  await a.demo((d) => d.api.failNext('progress', 503));
  await a.demo((d) => d.api.failNext('livestreams', 0));
  await a.demo((d) => d.farmer.tick({ force: true }));
  await tab('requests');
  await until(a.win, () => /503/.test(document.querySelector('.dev-list')?.textContent), 'the failed request');
  await a.win.click('[data-action="dev-problems"]');
  await until(a.win, () => document.querySelector('[data-action="dev-problems"].active') && (() => {
    const rows = [...document.querySelectorAll('.dev-list .dev-row')];
    return rows.length >= 2 && rows.every((r) => r.classList.contains('k-error'));
  })(), 'Errors only, with the two that failed');
  const rows = await a.win.$$eval('.dev-list .dev-row', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ')));
  assert.ok(rows.length >= 2);
  assert.ok(rows.every((r) => /503|failed|no answer/.test(r)), rows.join('\n'));
  assert.ok(rows.some((r) => /Drop progress.*503/.test(r)));
  assert.ok(rows.some((r) => /Live streams.*failed/.test(r)));
  await a.win.click('.dev-list .dev-row');
  await until(a.win, () => document.querySelector('.dev-list .act-detail'), 'the row open');
  assert.match(await listText(), /No answer: TypeError: Failed to fetch/);
  await a.win.click('[data-action="dev-copy-row"]');
  await until(a.win, () => /Copied/.test(document.querySelector('[data-action="dev-copy-row"]')?.textContent), 'copied');
  assert.match(await clipboard(), /^GET https:\/\/web\.kick\.com\/api\/v1\/livestreams\?category_id=\d+\n→ failed: TypeError: Failed to fetch/);
  await a.win.click('[data-action="dev-problems"]');
});

test('Watch events: each one from the player, credited once progress goes up', async () => {
  await a.demo((d) => d.credit());
  await tab('watch');
  await until(a.win, () => /Credited/.test(document.querySelector('.dev-list')?.textContent), 'a credited watch event');
  assert.match(await listText(), /arcadia/i);
});

test('Developer tools: the first time it says what Inspect can see; Cancel leaves it off, Turn on saves it and History says so', async () => {
  const settings = () => JSON.parse(fs.readFileSync(path.join(a.data, 'settings.json'), 'utf8'));
  assert.equal(await a.win.locator('[data-action="dev-menu"]').count(), 0, 'no ⋯ on the stream while it’s off');
  assert.equal(await a.app.evaluate(({ ipcMain }) => ((global.pdInspected = []), ipcMain.listenerCount('player:devtools'))), 0, 'the old ungated Inspect is gone');
  await a.win.click('[data-action="dev-switch"]');
  await until(a.win, () => /Inspect can read your Kick login/.test(document.querySelector('.dev-warn')?.textContent), 'the warning');
  await a.win.click('[data-action="dev-warn-cancel"]');
  await until(a.win, () => !document.querySelector('.dev-warn') && !document.querySelector('[data-action="dev-switch"].on'), 'still off');
  await a.win.click('[data-action="dev-switch"]');
  await a.win.click('[data-action="dev-warn-ok"]');
  await until(a.win, () => document.querySelector('[data-action="dev-switch"].on') && !document.querySelector('.dev-warn'), 'on');
  await until(a.win, () => true, 'saved', 500);
  assert.equal(settings().developerTools, true);
  assert.equal(settings().developerToolsWarned, true);
  const events = readDb(a.data, (db) => db.events().map((r) => r.e)).filter((e) => e.type === 'developer-tools');
  assert.deepEqual(events.map((e) => e.on), [true]);
  // On: the answers' text is kept.
  await a.demo((d) => d.farmer.tick({ force: true }));
  await tab('requests');
  await until(a.win, () => document.querySelector('.dev-list .dev-row'), 'requests');
  await a.win.click('.dev-list .dev-row');
  await until(a.win, () => document.querySelector('.dev-list .dev-answer'), 'an answer’s text');
});

test('Settings › Developer fits the smallest window without scrolling, with a row open', async () => {
  const [content, box] = await a.win.evaluate(() => {
    const p = document.querySelector('.settings-pane');
    return [p.scrollHeight, p.clientHeight];
  });
  assert.ok(content <= box + 1, `Settings › Developer needs ${content - box}px of scrolling`);
});

test('Copy diagnostics and Save to Downloads: the app, its state and the lists, never the login or the account', async () => {
  await a.win.click('[data-action="dev-copy-report"]');
  await until(a.win, () => /Copied/.test(document.querySelector('[data-action="dev-copy-report"]')?.textContent), 'copied');
  const report = await clipboard();
  assert.match(report, /^## Pear Drops diagnostics$/m);
  assert.match(report, /^version +\d+\.\d+\.\d+ \(from source\) · Electron /m);
  assert.match(report, /^signed in +Kick ✓$/m);
  assert.match(report, /^farming +\w+: /m);
  assert.match(report, /^stream +arcadia · /m);
  assert.match(report, /^dev tools +on$/m);
  assert.match(report, /^## Errors \(\d+, newest first\)$/m);
  assert.match(report, /Drop progress +GET +503/);
  assert.match(report, /^## Watch events/m);
  assert.doesNotMatch(report, /pearfarmer|4242/, 'never the account');
  assert.doesNotMatch(report, /secret123/);
  await a.win.click('[data-action="dev-save"]');
  await until(a.win, () => /Saved pear-drops-diagnostics-\d{8}-\d{6}\.txt to Downloads/.test(document.querySelector('.pane-developer')?.textContent), 'saved');
  const dir = path.join(a.data, 'Downloads');
  const [file] = fs.readdirSync(dir);
  assert.match(fs.readFileSync(path.join(dir, file), 'utf8'), /^## Pear Drops diagnostics/);
  await a.win.click('[data-action="dev-show-file"]');
  assert.deepEqual(await a.app.evaluate(() => global.pdOpened), [path.join(dir, file)], 'Show in folder, in the data folder’s own Downloads');
});

test('the stream’s ⋯: Copy player state and Inspect, only while it’s on', async () => {
  await a.win.keyboard.press('Escape');
  await until(a.win, () => document.querySelector('[data-action="dev-menu"]'), 'the ⋯ on the stream');
  await a.win.click('[data-action="dev-menu"]');
  await until(a.win, () => document.querySelector('.dev-menu'), 'the menu');
  assert.equal(await a.win.locator('.dev-menu [data-id="kick"]').count(), 0, 'demo mode has no hidden Kick page to inspect');
  await a.win.click('[data-action="dev-player-state"]');
  await until(a.win, () => /Copied/.test(document.querySelector('.dev-menu')?.textContent), 'copied');
  const state = await clipboard();
  assert.match(state, /^Arcadia \(arcadia\) · /);
  assert.match(state, /^address +https:\/\/player\.kick\.com\/arcadia \(light\)$/m);
  assert.match(state, /^watch events +\d+ on this stream/m);
  await a.win.click('[data-action="dev-inspect"][data-id="player"]');
  await until(a.win, () => !document.querySelector('.dev-menu'), 'the menu closes');
  assert.deepEqual(await a.app.evaluate(() => global.pdInspected), ['player']);
  // Off: no ⋯, and Inspect refuses even if asked.
  await a.app.evaluate(() => global.pdDebug.store.set({ developerTools: false }));
  assert.equal(await a.win.evaluate(() => window.pd.developer.inspect('player')), false);
  assert.deepEqual(await a.app.evaluate(() => global.pdInspected), ['player']);
});

test('the errors are kept for the next run, marked as the last run’s; Clear empties the lists', async () => {
  const saved = await a.app.evaluate(() => global.pdDebug.store.get());
  await a.app.close();
  const errors = readDb(a.data, (db) => db.get('devErrors', {}).errors ?? []);
  assert.ok(errors.some((e) => /Main went wrong: token=…/.test(e.msg) && e.count === 2), 'saved, redacted');
  const next = await launchApp({ size: SMALLEST, settings: saved, files: { 'pear-drops.db': fs.readFileSync(path.join(a.data, 'pear-drops.db')) } });
  try {
    await next.farming();
    const old = a;
    a = next;
    fs.rmSync(old.data, { recursive: true, force: true });
    await openDeveloper();
    await until(a.win, () => /last run/.test(document.querySelector('.dev-list')?.textContent), 'last run’s errors');
    assert.match(await listText(), /Main went wrong/);
    await a.win.click('[data-action="dev-clear"]');
    await until(a.win, () => /No errors/.test(document.querySelector('.dev-list')?.textContent), 'cleared');
    assert.deepEqual(a.errors, []);
  } catch (err) {
    a = next;
    throw err;
  }
});
