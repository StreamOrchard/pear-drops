// The search box from the main process's side (src/main/palette.js): Ctrl/⌘+K pressed in the docked stream or chat,
// and what the box remembers of what was run, kept to what it uses.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isPaletteKey, cleanMemory } = require('../../../src/main/palette');

test('⌘K on a Mac and Ctrl+K elsewhere; Ctrl+K on a Mac still reaches Kick’s page', () => {
  const key = (over) => ({ type: 'keyDown', key: 'k', control: false, meta: false, alt: false, shift: false, ...over });
  assert.equal(isPaletteKey(key({ meta: true }), 'darwin'), true);
  assert.equal(isPaletteKey(key({ meta: true, key: 'K' }), 'darwin'), true, 'with caps lock');
  assert.equal(isPaletteKey(key({ control: true }), 'darwin'), false);
  assert.equal(isPaletteKey(key({ control: true }), 'win32'), true);
  assert.equal(isPaletteKey(key({ control: true }), 'linux'), true);
  assert.equal(isPaletteKey(key({ meta: true }), 'win32'), false);
  assert.equal(isPaletteKey(key({ control: true, shift: true }), 'win32'), false, 'with Shift: something else');
  assert.equal(isPaletteKey(key({ control: true, alt: true }), 'win32'), false, 'with Alt: something else');
  assert.equal(isPaletteKey(key({ control: true, type: 'keyUp' }), 'win32'), false, 'only as it goes down');
  assert.equal(isPaletteKey(key({ control: true, key: 'j' }), 'win32'), false);
  assert.equal(isPaletteKey(null, 'win32'), false);
  assert.equal(isPaletteKey(key({ [process.platform === 'darwin' ? 'meta' : 'control']: true })), true, 'this computer’s by default');
});

test('the memory keeps ids and counts only: the last 20 run, and the 300 most recently used', () => {
  assert.deepEqual(cleanMemory(null), { recent: [], used: {} });
  assert.deepEqual(cleanMemory({ recent: 'skip', used: [] }), { recent: [], used: {} });
  const recent = ['skip', 'skip', 3, '', 'x'.repeat(201), ...Array.from({ length: 30 }, (_, i) => `r${i}`)];
  const m = cleanMemory({ recent, used: { skip: { n: 2.7, t: 5 }, bad: { n: 'x', t: 1 }, zero: { n: 0, t: 1 }, old: { n: 1, t: 1 }, huge: { n: 1e9, t: 9 } } });
  assert.equal(m.recent.length, 20);
  assert.deepEqual(m.recent.slice(0, 2), ['skip', 'r0'], 'each once, and nothing that isn’t an id');
  assert.deepEqual(m.used, { huge: { n: 1e6, t: 9 }, skip: { n: 2, t: 5 }, old: { n: 1, t: 1 } }, 'newest first, whole numbers, kept in bounds');
  const lots = Object.fromEntries(Array.from({ length: 350 }, (_, i) => [`u${i}`, { n: 1, t: i }]));
  const kept = Object.keys(cleanMemory({ used: lots }).used);
  assert.equal(kept.length, 300);
  assert.equal(kept[0], 'u349');
});
