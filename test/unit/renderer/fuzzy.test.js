// Matching what's typed in the search box (src/renderer/fuzzy.js): each level and its order, the starts of words,
// the letters that matched, accents and other alphabets, and odd input. As Stream Multiview's, but its words' starts
// only match words next to each other.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({});
vm.runInContext(`${fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src', 'renderer', 'fuzzy.js'), 'utf8')}\nthis.fuzzy = fuzzy;`, ctx, { filename: 'fuzzy.js' });
const { fuzzy } = ctx;
const score = (q, t) => fuzzy.match(q, t)?.score ?? null;
const marks = (q, t) => [...fuzzy.match(q, t).marks];

test('each level: the whole name, its start, its words’ starts, a word’s start, inside a word, letters in order', () => {
  assert.equal(score('history', 'History'), 100);
  assert.equal(score('neon r', 'Neon Rush'), 80);
  assert.equal(score('nr', 'Neon Rush'), 70);
  assert.equal(score('neru', 'Neon Rush'), 70, 'more than one letter of a word');
  assert.equal(score('rush', 'Neon Rush'), 55);
  assert.equal(score('eon', 'Neon Rush'), 35);
  const loose = score('nnrsh', 'Neon Rush');
  assert.ok(loose >= 10 && loose <= 30, String(loose));
  assert.equal(fuzzy.match('xyz', 'Neon Rush'), null);
});

test('the starts of words next to each other only: "neon" isn’t "NEw drops ON kick"', () => {
  assert.equal(score('nrl', 'Neon Rush Launch Week'), 70);
  assert.equal(score('rlw', 'Neon Rush Launch Week'), 70, 'from any word, as long as they follow on');
  assert.ok(score('neon', 'New drops on Kick') < 35, 'letters spread out instead');
  assert.ok(score('nl', 'Neon Rush Launch Week') < 35, 'a word skipped');
});

test('the levels rank in that order, and letters closer together score more', () => {
  const t = 'Neon Rush';
  const s = ['neon rush', 'neon r', 'nr', 'rush', 'eon', 'nnrsh'].map((q) => score(q, t));
  assert.deepEqual([...s].sort((a, b) => b - a), s);
  assert.ok(score('abc', 'aXbXc') > score('abc', 'aXXXXbXXXXc'), 'fewer gaps, more points');
});

test('several words: each has to match, and the name scores a little under a match of the whole', () => {
  assert.equal(score('skip stream', 'Skip stream now'), 80, 'the start of the name');
  const turned = score('stream skip', 'Skip stream now');
  assert.ok(turned > 35 && turned < 80, String(turned));
  assert.equal(fuzzy.match('skip nothing', 'Skip stream now'), null, 'a word that isn’t there');
  assert.equal(score('  history  ', 'History'), 100, 'spaces around don’t count');
});

test('the letters that matched, as places in the name', () => {
  assert.deepEqual(marks('nr', 'Neon Rush'), [0, 5]);
  assert.deepEqual(marks('rush', 'Neon Rush'), [5, 6, 7, 8]);
  assert.deepEqual(marks('stream skip', 'Skip stream now'), [0, 1, 2, 3, 5, 6, 7, 8, 9, 10]);
});

test('capitals and accents don’t count, other alphabets match, and the marks are in the name as written', () => {
  assert.equal(score('CAFE', 'café'), 100);
  assert.equal(score('cafe', 'Café hours'), 80);
  assert.deepEqual(marks('ca', 'Ça va'), [0, 1]);
  assert.equal(score('привет', 'Привет мир'), 80);
  assert.equal(score('мир', 'Привет мир'), 55);
  assert.equal(score('😀', '😀 smile'), 80);
  assert.deepEqual(marks('s', '😀 smile'), [3], 'after a two-part character');
});

test('words start after anything that isn’t a letter or a digit, and where digits begin', () => {
  assert.equal(score('kk', 'kite-kat'), 70);
  assert.equal(score('kat', 'kite_kat'), 55);
  assert.equal(score('15', 'Repeat every 15s'), 55);
  assert.equal(score('r1', 'run15'), 70, 'the digits are a word of their own');
});

test('a name that starts with a symbol counts from its first letter, unless the symbol is typed too', () => {
  assert.equal(score('sleepy', '@sleepy'), 100);
  assert.equal(score('sle', '@sleepy'), 80);
  assert.deepEqual(marks('sle', '@sleepy'), [1, 2, 3]);
  assert.deepEqual(marks('@sle', '@sleepy'), [0, 1, 2, 3]);
});

test('odd input: nothing typed, nothing to match, and a very long query', () => {
  assert.equal(fuzzy.match('', 'History'), null);
  assert.equal(fuzzy.match('   ', 'History'), null);
  assert.equal(fuzzy.match('history', ''), null);
  assert.equal(fuzzy.match('history', null), null);
  assert.equal(fuzzy.match(null, 'History'), null);
  assert.equal(score('1', 1), 100, 'a number is its text');
  assert.equal(fuzzy.match('a'.repeat(40), 'a'.repeat(30)), null, 'longer than the name');
  assert.ok(score('abcdefghijklmnopqrstuvwxyz', 'a b c d e f g h i j k l m n o p q r s t u v w x y z') > 0, 'long, no word-start search');
});

test('an item: its title in full, its other names at 0.6, its second line at 0.3', () => {
  assert.equal(fuzzy.scoreItem('pause', { title: 'Pause' }).score, 100);
  assert.equal(fuzzy.scoreItem('stop', { title: 'Pause', words: ['stop'] }).score, 60);
  assert.equal(fuzzy.scoreItem('watching', { title: 'Pause', sub: 'watching stops' }).score, 24);
  assert.equal(fuzzy.scoreItem('watching', { title: 'Pause', sub: 'watching stops' }).level, 80, 'how well, where it matched (before its weight)');
  assert.deepEqual([...fuzzy.scoreItem('stop', { title: 'Pause', words: ['stop'] }).marks], [], 'no letters of the title to mark');
  assert.equal(fuzzy.scoreItem('zzz', { title: 'Pause', words: ['stop'], sub: 'watching stops' }), null);
});
