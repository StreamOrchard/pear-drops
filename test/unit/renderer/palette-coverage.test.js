// Every button, tab and setting in the app is in the search box (Ctrl/⌘+K), read from the code: a new data-action in
// any page, a new setting in store.js, or a new tab action fails here until it's a command in palette-items.js (or a
// line in test/palette-coverage.js with why it isn't). test/launch/palette-coverage.test.js checks the same on screen,
// down to each tab's id.
const test = require('node:test');
const assert = require('node:assert/strict');
const { INDIRECT, LEFT_OUT, TABS, OTHER_SETTINGS, runActions, pageActions, settingRows } = require('../../palette-coverage');
const { DEFAULTS } = require('../../../src/main/store');

const RUN = runActions();

test('every button’s action in the app’s pages is run by a command, or left out with why', () => {
  const missing = [...pageActions()].filter(([name]) => !RUN.has(name) && !INDIRECT[name] && !LEFT_OUT[name]).map(([name, files]) => `${name} (${[...new Set(files)].join(', ')})`);
  assert.deepEqual(missing, [], 'give these a command in src/renderer/palette-items.js (runAction), or a line in test/palette-coverage.js with why');
});

test('every setting is a row of SETTINGS_ROWS (so its page and the box both have it), or covered another way', () => {
  const rows = settingRows();
  assert.ok(rows.size >= 20, `found ${rows.size} rows`);
  const missing = Object.keys(DEFAULTS).filter((k) => !rows.has(k) && !OTHER_SETTINGS[k]);
  assert.deepEqual(missing, [], 'add these to SETTINGS_ROWS in src/renderer/app.js, or a line in OTHER_SETTINGS (test/palette-coverage.js)');
});

test('the lists stay honest: nothing covered and left out at once, and nothing named that the app no longer has', () => {
  const actions = pageActions();
  for (const name of Object.keys(LEFT_OUT)) assert.ok(!RUN.has(name) && !INDIRECT[name], `${name} is covered and left out`);
  for (const name of [...Object.keys(INDIRECT), ...Object.keys(LEFT_OUT)]) assert.ok(actions.has(name), `no button runs ${name} any more: take it out of test/palette-coverage.js`);
  for (const name of Object.keys(TABS)) assert.ok(actions.has(name), `no tab runs ${name} any more`);
  for (const key of Object.keys(OTHER_SETTINGS)) assert.ok(key in DEFAULTS, `${key} isn’t a setting any more`);
  for (const key of settingRows()) assert.ok(key in DEFAULTS, `SETTINGS_ROWS has ${key}, which store.js doesn’t`);
});
