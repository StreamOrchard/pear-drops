// Starting up with a slow system keychain (Connected apps' pairing keys, asked through Electron's
// async safeStorage): the page's first questions are answered, not refused for coming too early.
const test = require('node:test');
const assert = require('node:assert/strict');
const { launchApp, until } = require('./app');

let a;
test.before(async () => {
  a = await launchApp({ env: { PD_TEST_SLOW_KEYCHAIN: '3000' } });
});
test.after(() => a?.app.close());

test("with a slow keychain, What's new loads the first time it's asked", async () => {
  await until(a.win, () => upd.changelog !== null, 'the release notes', 20000);
  assert.equal(await a.win.evaluate(() => upd.changelogTries), 1, 'answered at the first try: nothing waits between opening the window and answering it');
  await a.win.click('button.icon-only[data-action="settings"]');
  await a.win.click('[data-action="settings-tab"][data-id="updates"]');
  await until(a.win, () => document.querySelector('.upd-timeline > li'), 'the changelog timeline');
  assert.deepEqual(a.errors, []);
});
