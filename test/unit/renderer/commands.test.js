// What the search box can find and do (src/renderer/commands.js): adding commands, when they're there or greyed,
// switches, choices and sliders, lists that change, prefixes, ranking (kind, use and how it fades), at most 7 a group,
// Quit never first, nothing found, and running them. In a sandbox like the other renderer scripts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIR = path.join(__dirname, '..', '..', '..', 'src', 'renderer');
const ctx = vm.createContext({ Date, Math, Number, String, Array, JSON, Object, Map, Set });
for (const file of ['fuzzy.js', 'commands.js']) vm.runInContext(fs.readFileSync(path.join(DIR, file), 'utf8'), ctx, { filename: file });
const commands = vm.runInContext('commands', ctx);
const titles = (rs) => [...rs].map((r) => r.item.title); // (out of the sandbox, to compare)
let n = 0;
const uid = (p) => `${p}.${++n}`;
const saved = [];
test.beforeEach(() => commands.remember({}, (m) => saved.push(JSON.parse(JSON.stringify(m)))));

test('add: an id and a title are needed; an action in Actions unless it says otherwise; the same id replaces it', () => {
  assert.throws(() => commands.add({ title: 'x' }), /an id and a title/);
  assert.throws(() => commands.add({ id: 'x' }), /an id and a title/);
  const id = uid('a');
  commands.add({ id, title: 'Zebra crossing' });
  assert.equal(commands.find(id).kind, 'action');
  assert.equal(commands.find(id).group, 'Actions');
  commands.add({ id, title: 'Zebra crossing two', group: 'Mine' });
  assert.equal(commands.find(id).title, 'Zebra crossing two');
  assert.equal(commands.all().filter((x) => x.id === id).length, 1);
  commands.remove(id);
  assert.equal(commands.find(id), null);
});

test('when: left out while false (or when it fails); disabled: greyed with its reason, and running it says why', () => {
  let on = false;
  let why = 'Resume first';
  const id = uid('w');
  const d = uid('d');
  commands.add([
    { id, title: 'Quokka thing', when: () => on },
    {
      id: d,
      title: 'Quokka other',
      disabled: () => why,
      run: () => {
        throw new Error('ran');
      },
    },
  ]);
  assert.equal(commands.find(id), null);
  assert.deepEqual(titles(commands.search('quokka')), ['Quokka other']);
  on = true;
  assert.deepEqual(titles(commands.search('quokka')).sort(), ['Quokka other', 'Quokka thing']);
  assert.equal(commands.disabledWhy(commands.find(d)), 'Resume first');
  assert.equal(commands.run(d), 'Resume first');
  why = '';
  assert.throws(() => commands.run(d), /ran/);
  const bad = uid('b');
  commands.add({
    id: bad,
    title: 'Quokka broken',
    when: () => {
      throw new Error('x');
    },
  });
  assert.equal(commands.find(bad), null, 'a when that fails: not there');
  assert.equal(
    commands.disabledWhy({
      disabled: () => {
        throw new Error('y');
      },
    }),
    '',
    'a disabled that fails: not greyed',
  );
  assert.equal(commands.run('no-such-thing'), 'Not available here');
});

test('run: Enter runs it, a switch flips, a choice and a slider are set, ⇧Enter its second choice, a number one of its buttons', () => {
  const did = [];
  let sw = false;
  let pick = 'a';
  let mins = 20;
  const ids = { run: uid('r'), sw: uid('t'), ch: uid('c'), rg: uid('g'), bt: uid('b'), only: uid('o') };
  commands.add([
    { id: ids.run, title: 'Run me', run: () => did.push('run'), alt: () => did.push('alt') },
    { id: ids.sw, title: 'Flip me', toggle: { get: () => sw, set: (v) => (sw = v) } },
    { id: ids.ch, title: 'Pick me', choice: { options: [['a'], ['b']], get: () => pick, set: (v) => (pick = v) }, alt: () => did.push('page') },
    { id: ids.rg, title: 'Slide me', range: { min: 5, max: 60, unit: 'min', get: () => mins, set: (v) => (mins = v) }, alt: () => did.push('slider page') },
    { id: ids.bt, title: 'Buttons', buttons: [{ label: 'One', run: () => did.push('one') }, { label: 'Two', run: () => did.push('two') }] },
    { id: ids.only, title: 'Only a page', alt: () => did.push('only alt') },
  ]);
  assert.equal(commands.run(ids.run), '');
  assert.equal(commands.run(ids.run, 'alt'), '');
  commands.run(ids.sw);
  assert.equal(sw, true);
  commands.run(ids.ch, 'run', 'b');
  assert.equal(pick, 'b');
  commands.run(ids.ch);
  commands.run(ids.rg, 'run', 15);
  assert.equal(mins, 15);
  commands.run(ids.rg);
  commands.run(ids.bt, 1);
  assert.equal(commands.run(ids.bt, 5), 'Not available here');
  commands.run(ids.only);
  assert.deepEqual(did, ['run', 'alt', 'page', 'slider page', 'two', 'only alt']);
  assert.equal(commands.recent()[0], ids.only, 'the last one run comes first in Recent');
  assert.ok(saved.length >= 7, 'each run is saved');
});

test('a number typed with a slider’s words sets it, kept to its limits', () => {
  const id = uid('stall');
  commands.add({ id, kind: 'setting', title: 'Recover a stalled stream after', words: ['stall'], range: { min: 5, max: 60, unit: 'min', get: () => 20, set: () => {} } });
  const at = (q) => commands.search(q).find((r) => r.item.id === id);
  assert.equal(at('stall 15').arg, 15);
  assert.equal(at('stall 500').arg, 60);
  assert.equal(at('stall 1').arg, 5);
  assert.equal(at('stall').arg, undefined, 'no number: nothing to set');
});

test('provide: lists that change are asked for on every key, and found again by id', () => {
  let list = [{ id: 'p:1', title: 'Wombat cart', kind: 'drop' }];
  commands.provide('wombats', (q) => (q === 'none' ? [] : list));
  assert.deepEqual(titles(commands.search('wombat')), ['Wombat cart']);
  assert.equal(commands.find('p:1').kind, 'drop');
  list = [{ id: 'p:2', title: 'Wombat wheel' }];
  assert.deepEqual(titles(commands.search('wombat')), ['Wombat wheel']);
  assert.equal(commands.find('p:1').title, 'Wombat cart', 'the last one seen, for Recent');
  commands.provide('broken', () => {
    throw new Error('x');
  });
  assert.deepEqual(titles(commands.search('wombat')), ['Wombat wheel'], 'a provider that fails gives nothing');
  commands.provide('wombats', () => []);
});

test('prefixes pick the kinds: > actions and places, @ channels, % drops and rewards, # settings and pages', () => {
  commands.add([
    { id: uid('k'), kind: 'action', title: 'Kiwi act' },
    { id: uid('k'), kind: 'place', title: 'Kiwi place' },
    { id: uid('k'), kind: 'channel', title: 'Kiwi chan' },
    { id: uid('k'), kind: 'drop', title: 'Kiwi drop' },
    { id: uid('k'), kind: 'reward', title: 'Kiwi reward' },
    { id: uid('k'), kind: 'setting', title: 'Kiwi set' },
    { id: uid('k'), kind: 'page', title: 'Kiwi page' },
  ]);
  const of = (q) => titles(commands.search(q)).filter((t) => t.startsWith('Kiwi')).sort();
  assert.deepEqual(of('>kiwi'), ['Kiwi act', 'Kiwi place']);
  assert.deepEqual(of('@kiwi'), ['Kiwi chan']);
  assert.deepEqual(of('% kiwi'), ['Kiwi drop', 'Kiwi reward']);
  assert.deepEqual(of('#kiwi'), ['Kiwi page', 'Kiwi set']);
  assert.deepEqual({ ...commands.parse('  >skip') }, { scope: '>', q: 'skip' });
  assert.deepEqual({ ...commands.parse('skip') }, { scope: '', q: 'skip' });
  assert.ok(commands.search('>').some((r) => r.item.title === 'Kiwi act'), 'a prefix on its own lists everything of its kind');
  assert.equal(commands.search('').length, 0, 'nothing typed, no prefix: nothing (the box shows its own lists)');
});

test('ranking: kind breaks ties, boost and use add to it, shorter titles first, at most 7 a group and 40 in all', () => {
  const drop = uid('rk');
  const set = uid('rk');
  commands.add([
    { id: set, kind: 'setting', title: 'Ibis fly' },
    { id: drop, kind: 'drop', title: 'Ibis fly' },
  ]);
  assert.equal(commands.search('ibis fly')[0].item.id, drop, 'a drop ranks over a setting');
  commands.add({ id: set, kind: 'setting', title: 'Ibis fly', boost: 20 });
  assert.equal(commands.search('ibis fly')[0].item.id, set, 'a boost lifts it');
  commands.add([
    { id: uid('s'), kind: 'action', title: 'Lark one two' },
    { id: uid('s'), kind: 'action', title: 'Lark one' },
  ]);
  assert.deepEqual(titles(commands.search('lark')), ['Lark one', 'Lark one two']);
  for (let i = 0; i < 12; i++) commands.add({ id: uid('many'), group: 'Many', title: `Moth ${i}` });
  assert.equal(commands.search('moth').length, 7);
  assert.equal(commands.search('>moth').length, 12, 'with a prefix, all of them');
  const used = uid('used');
  commands.add([
    { id: used, title: 'Newt aa' },
    { id: uid('n'), title: 'Newt a' },
  ]);
  commands.ran(used);
  commands.ran(used);
  assert.equal(commands.search('newt')[0].item.id, used, 'what you use ranks higher');
});

test('frecency: more runs score more, and it halves for each 7 days since', () => {
  const now = Date.now();
  commands.remember({ used: { x: { n: 3, t: now } } });
  const fresh = commands.frecency('x', now);
  assert.equal(fresh, 12 * Math.log2(4));
  assert.ok(Math.abs(commands.frecency('x', now + 7 * 86_400_000) - fresh / 2) < 1e-9);
  assert.equal(commands.frecency('never', now), 0);
  commands.remember({ recent: ['a', 3, 'b'], used: 'nope' });
  assert.deepEqual([...commands.recent()], ['a', 'b'], 'only ids are kept');
});

test('forget lets one entry go (Recent and its count), forgetAll everything, each saved', () => {
  const now = Date.now();
  commands.remember({ recent: ['a', 'b', 'c'], used: { a: { n: 2, t: now }, b: { n: 1, t: now } } }, (m) => saved.push(JSON.parse(JSON.stringify(m))));
  saved.length = 0;
  commands.forget('b');
  assert.deepEqual([...commands.recent()], ['a', 'c']);
  assert.equal(commands.frecency('b', now), 0, 'and how often it was run');
  assert.deepEqual(saved.at(-1), { recent: ['a', 'c'], used: { a: { n: 2, t: now } } });
  commands.forget('nope');
  assert.equal(saved.length, 1, 'nothing to forget: nothing saved');
  commands.forgetAll();
  assert.deepEqual(saved.at(-1), { recent: [], used: {} });
  assert.equal(commands.recent().length, 0);
});

test('remembering(false): nothing new is remembered and nothing ranks higher; what was remembered comes back', () => {
  const now = Date.now();
  commands.remember({ recent: ['a'], used: { a: { n: 3, t: now } } });
  const id = uid('r');
  commands.add({ id, title: 'Remembered thing', run: () => {} });
  assert.equal(commands.remembering(false), false);
  commands.run(id);
  assert.deepEqual([...commands.recent()], ['a']);
  assert.equal(commands.frecency('a', now), 0);
  assert.equal(commands.remembering(true), true);
  assert.equal(commands.frecency('a', now), 12 * Math.log2(4));
  assert.equal(commands.remembering(), true, 'asked without a value, says what it is');
});

test('an item with noRecent runs without being remembered, by Enter or a button', () => {
  let ran = 0;
  const id = uid('nr');
  commands.add({ id, title: 'Clear the thing', noRecent: true, run: () => ran++, buttons: [{ label: 'Go', run: () => ran++ }] });
  commands.run(id);
  commands.run(id, 0);
  assert.equal(ran, 2);
  assert.ok(!commands.recent().includes(id));
});

test('describe finds an item to draw even while it can’t run, and a provider’s once it has given it', () => {
  let on = false;
  const id = uid('ds');
  commands.add({ id, title: 'Sometimes here', when: () => on });
  assert.equal(commands.find(id), null);
  assert.equal(commands.describe(id).title, 'Sometimes here');
  commands.provide(uid('p'), () => [{ id: 'given:1', title: 'Given once' }]);
  commands.all();
  assert.equal(commands.describe('given:1').title, 'Given once');
  assert.equal(commands.describe('never:here'), null);
});

test('Quit is never the first result, and letters scattered elsewhere drop out when something matches well', () => {
  commands.add([
    { id: uid('q'), title: 'Quail pear drops', last: true },
    { id: uid('q'), title: 'Quail thing two' },
  ]);
  assert.equal(commands.search('quail')[0].item.title, 'Quail thing two');
  commands.add({ id: uid('z'), title: 'Zap tracker' });
  commands.add({ id: uid('z'), title: 'Zxaxp' });
  assert.deepEqual(titles(commands.search('zap')), ['Zap tracker']);
});

test('nothing found: the fallbacks for the words, in their order; grouped keeps each group where its best is', () => {
  commands.provide('fall', (q) => [
    { id: 'f:2', title: `Second for ${q}`, fallback: true, order: 2 },
    { id: 'f:1', title: `First for ${q}`, fallback: true, order: 1 },
  ]);
  assert.deepEqual([...commands.fallbacks('xqzv')].map((x) => x.title), ['First for xqzv', 'Second for xqzv']);
  assert.ok(!titles(commands.search('first for')).length, 'fallbacks aren’t search results');
  commands.provide('fall', () => []);
  const gs = [...commands.grouped([
    { item: { group: 'A', title: '1' } },
    { item: { group: 'B', title: '2' } },
    { item: { group: 'A', title: '3' } },
  ])];
  assert.deepEqual(
    gs.map((g) => [g.group, g.rows.length]),
    [
      ['A', 2],
      ['B', 1],
    ],
  );
});

test('a second line’s words count: text, or its parts', () => {
  assert.equal(commands.text(['a', { b: 'bold', t: ' after' }, null, 3]), 'a · bold after');
  commands.add({ id: uid('sub'), title: 'Plain', sub: ['Settings › Farming', { b: 'Marmot', t: '' }] });
  assert.ok(titles(commands.search('marmot')).includes('Plain'));
});

test('with only a prefix typed, groups come in the order given, the others after them A–Z', () => {
  commands.add([
    { id: uid('g'), kind: 'action', group: 'Zed group', title: 'Gnu a' },
    { id: uid('g'), kind: 'action', group: 'Alpha group', title: 'Gnu b' },
    { id: uid('g'), kind: 'action', group: 'Mid group', title: 'Gnu c' },
  ]);
  commands.order(['Zed group']);
  const groups = [...commands.search('>')].map((r) => r.item.group).filter((g) => g.endsWith(' group'));
  assert.deepEqual([...new Set(groups)], ['Zed group', 'Alpha group', 'Mid group']);
  commands.order([]);
});
