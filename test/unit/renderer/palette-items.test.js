// What the search box finds in Pear Drops (src/renderer/palette-items.js), from a made-up farm: each drop's big row
// and its buttons as the drop stands (farmed, queued, waiting, off, a reward to claim, done), a reward bringing its
// drop, channels, every tab and filter by name, Settings' options of each kind, and what each runs. In a sandbox like
// the other renderer scripts, with the dashboard's parts (app.js) stood in.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIR = path.join(__dirname, '..', '..', '..', 'src', 'renderer');
const noop = () => {};
const did = [];
const reward = (id, name, required, more = {}) => ({ id, name, image: `pd-img://drop/${id}.svg`, required, tracked: true, claimed: false, ready: false, ...more });
const stream = (slug, more = {}) => ({ slug, username: slug[0].toUpperCase() + slug.slice(1), avatar: '', title: `${slug} plays`, viewers: 1200, startedAt: new Date(Date.now() - 3600_000).toISOString(), followed: false, blocked: false, covers: [], ...more });
const campaign = (id, name, units, rewards, more = {}) => ({ id, name, units, rewards, channels: [], url: `https://kick.com/category/${id}`, endsAt: new Date(Date.now() + 86_400_000).toISOString(), needsWatching: true, complete: false, next: rewards.find((r) => !r.claimed) ? { name: rewards.find((r) => !r.claimed).name, remaining: 30 } : null, ...more });
const category = (id, name, campaigns, more = {}) => ({ id, name, kind: 'category', category: { id, name }, image: '', channels: [], campaigns, enabled: true, complete: false, needsWatching: true, streamsLoaded: true, streamCount: 0, streams: [], ...more });

function farmState() {
  const neon = category(801, 'Neon Rush', [campaign('c-neon', 'Neon Rush Launch Week', 148, [reward('r1', 'Hype Rocket Emote', 60, { claimed: true }), reward('r2', 'Turbo Grin Emote', 180), reward('r3', 'Neon Crown Badge', 300)])], {
    streamCount: 2,
    streams: [stream('arcadia', { followed: true }), stream('pixelpear')],
  });
  const chat = category(802, 'Just Chatting', [campaign('c-chat', 'Chatterbox Week', 30, [reward('r4', 'Chat Bubble Badge', 30, { ready: true })])], { streamCount: 1, streams: [stream('lofilane')] });
  const kart = category(804, 'Pixel Kart', [campaign('c-kart', 'Pixel Kart Grand Prix', 0, [reward('r5', 'Kart Badge', 60)])]);
  const off = category(803, 'Skyforge Arena', [campaign('c-sky', 'Skyforge Season 3', 10, [reward('r6', 'Anvil Emote', 60)])], { enabled: false, streamCount: 1, streams: [stream('tidepool')] });
  return {
    current: { slug: 'arcadia', username: 'Arcadia', targetId: 801, categoryName: 'Neon Rush', campaignIds: ['c-neon'] },
    paused: false,
    nextTickAt: Date.now() + 30_000,
    forecast: { 'c-neon': { nextMinutes: 32 } },
    categories: [neon, chat, kart, off],
    past: [{ id: 'c-old', name: 'Retro Arcade Week', status: 'missed', category: 'Retro Arcade', image: '', units: 40, rewards: [reward('r9', 'Pixel Ghost Emote', 60)] }],
    upcoming: [{ id: 'c-soon', name: 'Frost Rally Weekend', category: 'Frost Rally', image: '', startsAt: new Date(Date.now() + 86_400_000).toISOString() }],
  };
}

const settings = { queueMode: 'manual', autoClaim: true, stallMinutes: 20, dailyClaim: 'before-reset', notify: { claimed: true } };
const ctx = vm.createContext({
  document: { querySelector: () => null, addEventListener: noop, documentElement: { addEventListener: noop, dataset: {} } },
  window: { addEventListener: noop, pd: { setSettings: (patch) => did.push(['set', patch]), quit: () => did.push(['quit']) } },
  navigator: { platform: 'MacIntel', clipboard: { writeText: async (t) => did.push(['copy', t]) } },
  requestAnimationFrame: (f) => f(),
  Date,
  Math,
  Number,
  String,
  Array,
  JSON,
  Intl,
  Object,
  Map,
  Set,
  Promise,
});
for (const file of ['icons.js', 'format.js', 'fuzzy.js', 'commands.js', 'palette-items.js']) vm.runInContext(fs.readFileSync(path.join(DIR, file), 'utf8'), ctx, { filename: file });
// The dashboard's parts the items use (app.js and the other pages), stood in.
const actionNames = ['pause', 'resume', 'skip', 'reload', 'refresh', 'watch', 'claim', 'cat-toggle', 'cat-up', 'cat-down', 'follow', 'open-kick', 'open-link', 'view', 'setting-value', 'notify-toggle', 'dev-switch', 'dev-list', 'dev-problems', 'reward-tab', 'act-open-app', 'act-filter', 'connected-toggle'];
Object.assign(ctx, {
  actions: Object.fromEntries(actionNames.map((a) => [a, (el) => did.push([a, { ...el.dataset }])])),
  state: { settings, auth: { status: 'signed-in', user: { username: 'pearfarmer' } }, connected: { peers: [{ id: 'mv', name: 'Stream Multiview', enabled: true, status: 'connected', download: 'https://example.test/mv' }] }, backups: { possible: true, every: 'day', keep: 3 } },
  ui: { playerOpen: true, view: 'dashboard', sideTab: 'queue' },
  alarm: { timer: null },
  upd: { status: { state: 'idle', installed: '0.1.24' } },
  dev: { saved: null, before: null },
  devOn: () => false,
  act: {},
  hist: { groups: [], table: 'timeline', data: null },
  palette: { mod: '⌘' },
  SETTINGS_TABS: [
    ['farming', 'target', 'Farming'],
    ['recovery', 'reload', 'Recovery & alerts'],
    ['notifications', 'bell', 'Notifications'],
    ['developer', 'code', 'Developer'],
  ],
  SETTINGS_ROWS: [
    { page: 'farming', id: 'autoClaim', title: 'Claim drops automatically', sub: 'Claim each emote or badge the moment it unlocks.', type: 'switch' },
    { page: 'farming', id: 'queueMode', title: 'Queue order', sub: 'Smart or Manual.', type: 'choice', options: [['smart', 'Smart'], ['manual', 'Manual']], value: (s) => s.queueMode, action: 'queue-mode' },
    { page: 'farming', id: 'dailyClaim', title: 'Claim Kick’s daily rewards', sub: 'When.', type: 'choice', options: [['self', 'Myself'], ['before-reset', 'Before it resets']] },
    { page: 'farming', id: 'smartRarity', title: 'Favour rarely live drops', sub: 'How much.', type: 'choice', options: [['off', 'Off']], when: (s) => s.queueMode === 'smart', why: 'Only in Smart order' },
    { page: 'recovery', id: 'stallMinutes', title: 'Recover a stalled stream after', sub: 'With no progress.', type: 'range', min: 5, max: 60, step: 1, unit: 'min', words: ['stall'] },
  ],
  NOTIFY_KINDS: [['claimed', 'A drop is claimed', 'Each emote or badge.']],
  settingValue: (d, s) => (d.value ? d.value(s) : d.type === 'switch' ? !!s[d.id] : s[d.id]),
  settingWords: (v, env) => (typeof v === 'function' ? v(env) : v),
  dailyReward: () => ({ id: 'daily', state: 'ready', extras: [{ id: 'trick', name: 'Trick or Treat', state: 'claimed' }] }),
  crateList: (dr) => [{ id: dr.id, label: 'Daily', state: dr.state }, ...dr.extras.map((e) => ({ id: e.id, label: e.name, state: e.state }))],
  currentCampaigns: () => ctx.farm().categories[0].campaigns,
  signedInPlayers: () => null,
  openSettings: (tab, opts) => did.push(['settings', tab, opts?.row ?? null]),
  openSide: (tab, opts) => did.push(['side', tab, opts ?? null]),
  openHistory: (opts) => did.push(['history', opts ?? {}]),
  openReward: (open) => did.push(['reward', open]),
  render: noop,
});
let farm = farmState();
ctx.farm = () => farm;
vm.runInContext('initPaletteItems()', ctx);
const commands = vm.runInContext('commands', ctx);
const search = (q) => [...commands.search(q)];
const find = (id) => commands.all().find((x) => x.id === id);
const labels = (it) => [...commands.value(it.buttons)].map((b) => b.label);
const plain = (v) => JSON.parse(JSON.stringify(v));
const runs = (f) => {
  did.length = 0;
  f();
  return plain(did);
};
test.beforeEach(() => (farm = farmState()));

test('a drop’s big row: its buttons follow what it’s doing', () => {
  assert.deepEqual(labels(find('drop:801')), ['Show in queue', 'Skip stream', 'Switch it off', 'In History', 'More…'], 'being farmed');
  assert.deepEqual(labels(find('drop:802')), ['Claim', 'Farm it now', 'Farm it first', 'Switch it off', 'In History', 'More…'], 'a reward to claim, live channels to watch');
  assert.deepEqual(labels(find('drop:804')), ['Show in queue', 'Farm it first', 'Switch it off', 'Drop page on kick.com', 'More…'], 'waiting: nothing live');
  assert.deepEqual(labels(find('drop:803')), ['Switch it on', 'Show in queue', 'In History', 'More…'], 'switched off');
  assert.deepEqual(labels(find('past:c-old')), ['Show in Done', 'In History'], 'done (no page of its own on Kick any more)');
  const neon = find('drop:801');
  assert.equal(neon.title, 'Neon Rush Launch Week', 'one drop in a category: the drop’s own name');
  assert.ok(neon.words.includes('Neon Rush'), 'the category finds it too');
  assert.equal(plain(neon.pills)[0].text, 'Farming');
  assert.match(neon.heroExtra, /pal-track/);
  assert.ok(neon.boost > find('drop:804').boost, 'the one being farmed ranks first');
});

test('its buttons run what the dashboard’s do', () => {
  const b = (id, label) => commands.value(find(id).buttons).find((x) => x.label === label);
  assert.deepEqual(runs(() => b('drop:802', 'Farm it now').run()), [['watch', { slug: 'lofilane', cat: '802' }]]);
  assert.deepEqual(runs(() => b('drop:802', 'Claim').run()), [['claim', { campaign: 'c-chat', reward: 'r4' }]]);
  assert.deepEqual(runs(() => b('drop:804', 'Switch it off').run()), [['cat-toggle', { id: '804' }]]);
  assert.deepEqual(runs(() => b('drop:801', 'In History').run()), [['history', { campaign: 'c-neon' }]]);
  assert.deepEqual(runs(() => b('drop:804', 'Show in queue').run()), [['side', 'queue', { category: 804 }]]);
  const first = runs(() => b('drop:804', 'Farm it first').run());
  assert.deepEqual(first[0][1].categoryOrder.slice(0, 2), [804, 801], 'to the top of the queue');
});

test('Tab: everything for a drop, in two columns, with Move up and down greyed in Smart order', () => {
  const more = [...find('drop:801').more()];
  assert.deepEqual(
    more.filter((x) => !x.col).map((x) => x.title),
    ['Show in queue', 'Farm it first', 'Move up', 'Move down', 'Watch another channel…', 'Skip stream'],
  );
  assert.deepEqual(
    more.filter((x) => x.col).map((x) => x.title),
    ['Farm this drop', 'Progress chart', 'In History', 'Drop page on kick.com', 'Copy link', 'Hype Rocket Emote', 'Turbo Grin Emote', 'Neon Crown Badge'],
  );
  assert.equal(more.find((x) => x.title === 'Move up').disabled(), '');
  settings.queueMode = 'smart';
  assert.equal([...find('drop:801').more()].find((x) => x.title === 'Move up').disabled(), 'Smart order sorts this');
  settings.queueMode = 'manual';
  const channels = more.find((x) => x.title === 'Watch another channel…').more();
  assert.deepEqual([...channels].map((c) => c.title), ['Arcadia', 'Pixelpear'], 'a list of its own: its live channels');
});

test('a drop named in full is a big row; a reward’s name brings its drop, with the reward lit', () => {
  const r = search('neon rush launch week');
  assert.equal(r[0].item.id, 'drop:801');
  assert.equal(r[0].item.hero, true);
  const badge = search('neon crown badge').find((x) => x.item.id === 'reward:r3');
  const drop = badge.item.heroOf();
  assert.equal(drop.id, 'drop:801');
  assert.match(drop.heroExtra, /class="mk\s+lit"/);
  const ready = find('reward:r4');
  assert.equal(plain(ready.chip).text, 'Ready');
  assert.equal(ready.keep, true, 'a reward to claim is in the empty box’s Needs you');
  assert.deepEqual(runs(() => ready.run()), [['claim', { campaign: 'c-chat', reward: 'r4' }]]);
});

test('a done drop still running lists each reward once, from the current drop, and an ended one from Done', () => {
  const chat = farm.categories[1].campaigns[0];
  chat.complete = true;
  chat.rewards[0] = { ...chat.rewards[0], ready: false, claimed: true };
  farm.past.push({ id: 'c-chat', name: chat.name, status: 'completed', category: 'Just Chatting', image: '', units: 30, rewards: chat.rewards });
  const rows = commands.all().filter((x) => x.group === 'Rewards' && x.title === 'Chat Bubble Badge');
  assert.deepEqual(plain(rows.map((x) => x.id)), ['reward:r4']);
  assert.equal(plain(rows[0].chip).text, 'Claimed');
  assert.ok(find('reward:past:c-old:r9'), 'the ended drop’s reward');
});

test('channels: the one being watched, and the others live for a drop, each with its buttons', () => {
  const cur = find('ch:arcadia');
  assert.equal(cur.group, 'Watching');
  assert.deepEqual(labels(cur), ['Reload the stream', 'Skip stream', 'Following', 'On kick.com', 'More…']);
  const other = find('ch:pixelpear');
  assert.deepEqual(labels(other), ['Watch for drops', 'Follow', 'On kick.com', 'In History', 'More…']);
  assert.deepEqual(runs(() => commands.value(other.buttons)[1].run()), [['follow', { slug: 'pixelpear', on: '1' }]]);
  assert.deepEqual(runs(() => other.run()), [['watch', { slug: 'pixelpear', cat: '801' }]]);
  farm.categories[0].streams[1].blocked = true;
  assert.equal(find('ch:pixelpear').disabled(), 'Pear Drops skips this channel');
});

test('every tab and filter by name', () => {
  const titles = commands
    .all()
    .filter((x) => x.kind === 'place' || x.kind === 'page')
    .map((x) => x.title);
  for (const t of ['Dashboard', 'History', 'Queue', 'Done', 'Done: Completed', 'Done: Missed', 'Streams', 'Activity', 'Streams: Neon Rush', 'Streams: Just Chatting', 'History: Last 24 hours', 'History: All time', 'History: Watch sessions', 'History: Problems events', 'Settings › Farming', 'Settings › Developer', 'Activity: Sent', 'Developer: Requests', 'Developer: Requests, errors only', 'Daily reward: Trick or Treat', 'Coming soon: Frost Rally Weekend'])
    assert.ok(titles.includes(t), t);
  assert.ok(!titles.includes('Streams: Skyforge Arena'), 'no sub-tab for a drop switched off');
  assert.deepEqual(runs(() => find('place:done-missed').run()), [['side', 'done', { filter: 'missed' }]]);
  assert.deepEqual(runs(() => find('place:hist-range:24h').run()), [['history', { range: '24h' }]]);
  assert.deepEqual(runs(() => find('place:dev:problems').run()), [['settings', 'developer', null], ['dev-list', { id: 'requests' }], ['dev-problems', {}]]);
  assert.deepEqual(runs(() => find('place:act:mv:out').run()), [['settings', 'apps', null], ['act-open-app', { id: 'mv' }], ['act-filter', { id: 'out' }]]);
  const problems = find('place:hist-group:problems');
  assert.equal(problems.toggle.get(), false);
  assert.deepEqual(runs(() => problems.toggle.set(true)), [['history', { table: 'timeline', groups: ['problems'] }]]);
});

test('Settings’ options: switches, choices and sliders, greyed while they don’t apply, ⇧Enter opening the row', () => {
  const auto = find('set:autoClaim');
  assert.equal(auto.toggle.get(), true);
  assert.deepEqual(runs(() => auto.toggle.set(false)), [['set', { autoClaim: false }]]);
  assert.deepEqual(runs(() => auto.alt()), [['settings', 'farming', 'autoClaim']]);
  assert.equal(auto.icon, 'target', 'its page’s icon');
  const order = find('set:queueMode');
  assert.equal(order.choice.get(), 'manual');
  assert.deepEqual(runs(() => order.choice.set('smart')), [], 'Queue order runs its own action (queue-mode, not stood in here)');
  assert.deepEqual(runs(() => find('set:dailyClaim').choice.set('self')), [['set', { dailyClaim: 'self' }]]);
  assert.equal(find('set:smartRarity').disabled(), 'Only in Smart order');
  const stall = search('#stall 15').find((r) => r.item.id === 'set:stallMinutes');
  assert.equal(stall.arg, 15);
  assert.deepEqual(runs(() => commands.run(stall.item, 'run', stall.arg)), [['set', { stallMinutes: 15 }]]);
  assert.deepEqual(runs(() => find('set:notify:claimed').toggle.set(false)), [['notify-toggle', { kind: 'claimed' }]]);
  assert.equal(find('set:backupEvery').choice.get(), 'day');
  assert.deepEqual(runs(() => find('set:backupKeep').choice.set('7')), [['setting-value', { key: 'backupKeep', id: '7' }]]);
  assert.deepEqual(runs(() => find('set:connect:mv').toggle.set(false)), [['connected-toggle', { id: 'mv' }]]);
  // Developer tools: turned on the first time, its warning shows first, on its page.
  assert.deepEqual(runs(() => find('set:developerTools').toggle.set(true)), [['settings', 'developer', null], ['dev-switch', {}]]);
});

test('actions: there while they apply, in Now and Needs you when the box opens', () => {
  assert.ok(find('pause') && !find('resume'));
  farm.paused = true;
  assert.ok(find('resume') && !find('pause'));
  farm.paused = false;
  assert.equal(find('stop-alarm'), undefined, 'Stop the alarm only while it rings');
  ctx.alarm.timer = 1;
  assert.equal(find('stop-alarm').keepGroup, 'Needs you');
  ctx.alarm.timer = null;
  assert.equal(find('reward-claim').keepGroup, 'Needs you', 'the daily reward, ready');
  assert.equal(find('skip').keepNote(), 'Arcadia · Neon Rush');
  assert.equal(find('inspect-player'), undefined, 'Inspect only with Developer tools on');
  assert.deepEqual(runs(() => find('quit').run()), [['quit']]);
  assert.equal(find('quit').last, true);
});

test('words typed are looked for in History too, and on kick.com when nothing else is found', () => {
  const r = search('zzqx');
  assert.ok(!r.some((x) => x.item.id === 'search:history:none'));
  const fall = [...commands.fallbacks('zzqx')];
  assert.deepEqual(fall.map((x) => x.title), ['Search History for “zzqx”', 'Search kick.com for “zzqx”']);
  assert.deepEqual(runs(() => fall[0].run()), [['history', { table: 'timeline', text: 'zzqx' }]]);
  assert.deepEqual(runs(() => fall[1].run()), [['open-link', { url: 'https://kick.com/search?query=zzqx' }]]);
});
