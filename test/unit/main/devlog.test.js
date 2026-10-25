const test = require('node:test');
const assert = require('node:assert/strict');
const { DevLog, describeRequest, diagnostics, playerState, reportLines, redact, badAnswer } = require('../../../src/main/devlog');

const T = Date.UTC(2026, 9, 25, 14, 0, 0);
const clock = (start = T) => {
  let now = start;
  const fn = () => now;
  fn.add = (ms) => (now += ms);
  return fn;
};

test('logins, keys and cookies are taken out of anything written down', () => {
  assert.equal(redact('https://kick.com/x?token=abc123&page=2#code=zz'), 'https://kick.com/x?token=…&page=2#code=…');
  assert.equal(redact('Authorization: Bearer 123|abcdefghijklmnop'), 'Authorization: Bearer …');
  assert.equal(redact('Basic dXNlcjpwYXNzd29yZA=='), 'Basic …');
  assert.equal(redact('Cookie: session_token=a; XSRF-TOKEN=b'), 'Cookie: …');
  assert.equal(redact('set-cookie: kick_session=zz; Path=/'), 'set-cookie: …');
  assert.equal(redact('it had session_token=abc and XSRF-TOKEN=def; kick_session=ghi'), 'it had session_token=… and XSRF-TOKEN=…; kick_session=…');
  // JSON: tokens and secrets go, Kick's error codes and messages stay readable.
  assert.equal(redact('{"access_token":"a","refreshToken":"b","client_secret":"c","password":"d","code":"E42","message":"Nope"}'), '{"access_token":"…","refreshToken":"…","client_secret":"…","password":"…","code":"E42","message":"Nope"}');
  assert.equal(redact(null), '');
  assert.equal(redact(42), '42');
});

test('each of Kick’s addresses the app asks is said in words', () => {
  const words = {
    'https://web.kick.com/api/v1/drops/campaigns': 'Drop campaigns',
    'https://web.kick.com/api/v1/drops/campaigns/livestream?channel_id=1': 'A stream’s drops',
    'https://web.kick.com/api/v1/drops/progress': 'Drop progress',
    'https://web.kick.com/api/v1/drops/claim': 'Claim a drop',
    'https://web.kick.com/api/v1/gamification/challenges/abc/claim': 'Claim the daily reward',
    'https://web.kick.com/api/v1/gamification/challenges?x=1': 'Daily reward',
    'https://web.kick.com/api/v1/gamification/collectibles': 'Collectibles',
    'https://web.kick.com/api/v1/gamification/user/level': 'Level',
    'https://web.kick.com/api/v1/gamification/users/42/streak': 'Streak',
    'https://web.kick.com/api/v1/rewards': 'Prizes won',
    'https://web.kick.com/api/v1/livestreams?category_id=1': 'Live streams',
    'https://web.kick.com/api/v1/events/spooky/streams': 'An event’s streams',
    'https://kick.com/api/v2/channels/someone/follow': 'Follow',
    'https://kick.com/api/v2/channels/someone/info': 'Channel',
    'https://kick.com/api/v1/user': 'Your account',
    'https://kick.com/emotes': 'Your emotes',
    'https://kick.com/api/v2/channels/followed-page?cursor=0': 'Channels you follow',
  };
  for (const [url, said] of Object.entries(words)) assert.equal(describeRequest(url), said, url);
  assert.equal(describeRequest('https://web.kick.com/api/v1/something/new/'), 'API v1/something/new', 'one the app doesn’t name');
  assert.equal(describeRequest('not a url'), 'Request');
});

test('errors are kept newest first, the same one again straight after is counted, and the page is told what to show', () => {
  const now = clock();
  const log = new DevLog({ now });
  assert.equal(log.error('main', '', '   '), null, 'nothing to say');
  log.error('main', '', 'First');
  now.add(1000);
  log.error('page', 'app.js:12', 'Second');
  now.add(1000);
  const again = log.error('page', 'app.js:12', 'Second');
  assert.equal(again.count, 2);
  assert.equal(again.t, T + 2000, 'when it last happened');
  log.error('nowhere', '', 'An unknown source is the app’s own');
  log.error('kick', 'kick.com/robots.txt', 'Token token=abc failed');
  const page = log.page('errors');
  assert.deepEqual(page.entries.map((e) => e.msg), ['Token token=… failed', 'An unknown source is the app’s own', 'Second', 'First']);
  assert.equal(page.entries[1].src, 'main');
  assert.equal(page.counts.errors, 4);
  assert.ok(log.error('main', '', 'x'.repeat(2000)).msg.length <= 600, 'long text is cut off');
});

test('only the last few are kept, a page at a time', () => {
  const log = new DevLog({ now: clock(), max: { errors: 5 } });
  for (let i = 0; i < 9; i++) log.error('main', '', `E${i}`);
  const first = log.page('errors', { limit: 3 });
  assert.deepEqual(first.entries.map((e) => e.msg), ['E8', 'E7', 'E6']);
  assert.equal(first.total, 5);
  const next = log.page('errors', { limit: 3, before: first.entries.at(-1).n });
  assert.deepEqual(next.entries.map((e) => e.msg), ['E5', 'E4']);
  assert.equal(next.newer, 3);
  assert.equal(log.page('errors', { limit: 3, before: 99999 }).entries[0].msg, 'E8', 'an entry that’s gone: the newest');
  assert.equal(log.page('nonsense').total, 0);
});

test('this run’s errors are saved for the next, which shows them as the last run’s, before its own', () => {
  const now = clock();
  const first = new DevLog({ now });
  first.error('main', 'crash', 'It broke');
  first.error('main', 'crash', 'It broke');
  const saved = first.toSave();
  assert.deepEqual(saved, [{ t: T, src: 'main', where: 'crash', msg: 'It broke', count: 2 }]);
  // The next run: an error before the database opens, then the saved ones put back.
  const next = new DevLog({ now });
  next.error('main', '', 'Early');
  next.restore([...saved, null, { msg: '' }, { msg: 'Old', src: 'weird', count: 'x' }]);
  next.error('main', 'crash', 'It broke'); // not counted with the last run's
  const page = next.page('errors');
  assert.deepEqual(page.entries.map((e) => [e.msg, !!e.before]), [['It broke', false], ['Early', false], ['Old', true], ['It broke', true]]);
  assert.equal(page.entries[2].src, 'main');
  assert.equal(page.entries[2].count, 1);
  const older = next.page('errors', { limit: 2, before: page.entries[1].n });
  assert.deepEqual(older.entries.map((e) => e.msg), ['Old', 'It broke'], 'pages go by place, not number');
  assert.deepEqual(next.toSave().map((e) => e.msg), ['Early', 'It broke'], 'only this run’s are saved again');
  assert.equal(new DevLog({ saved: 'junk' }).page('errors').total, 0);
});

test('requests: what was asked, the answer, and Errors only', () => {
  const log = new DevLog({ now: clock() });
  log.request({ url: 'https://web.kick.com/api/v1/drops/progress?token=zz', status: 200, ms: 81.6, body: '{"data":[],"session_token":"abc"}' });
  log.request({ url: 'https://web.kick.com/api/v1/drops/claim', method: 'post', status: 400, ms: 12 });
  log.request({ url: 'https://kick.com/api/v1/user', status: 0, error: 'TypeError: Failed to fetch' });
  log.request({ url: 'https://kick.com/emotes', method: null, status: 'x', ms: -5, body: null });
  const all = log.page('requests');
  assert.equal(all.total, 4);
  const [emotes, user, claim, progress] = all.entries;
  assert.deepEqual([emotes.method, emotes.status, emotes.ms, 'body' in emotes], ['GET', 0, 0, false]);
  assert.deepEqual([user.what, user.status, user.error], ['Your account', 0, 'TypeError: Failed to fetch']);
  assert.deepEqual([claim.what, claim.method, claim.status], ['Claim a drop', 'POST', 400]);
  assert.equal(progress.url, 'https://web.kick.com/api/v1/drops/progress?token=…');
  assert.equal(progress.body, '{"data":[],"session_token":"…"}');
  assert.equal(progress.ms, 82);
  const bad = log.page('requests', { filter: 'problems' });
  assert.deepEqual(bad.entries.map((e) => e.what), ['Your emotes', 'Your account', 'Claim a drop']);
  assert.equal(bad.counts.problems, 3);
  assert.equal(log.page('errors', { filter: 'problems' }).total, 0, 'Errors only is for Requests');
  assert.ok(badAnswer({ status: 0 }) && badAnswer({ status: 302 }) && !badAnswer({ status: 204 }));
  assert.ok(log.request({ url: 'https://kick.com/emotes', status: 200, body: 'x'.repeat(30_000) }).body.length <= 20_000, 'a long answer is cut off');
  log.forgetAnswers();
  assert.ok(log.list('requests').every((e) => !('body' in e)), 'Developer tools off: the answers kept so far go');
  assert.equal(log.page('requests').total, 5, 'the requests stay');
});

test('watch events: how long after the one before, credited once progress goes up on their stream', () => {
  const now = clock();
  const log = new DevLog({ now });
  log.watch({ slug: 'arcadia', channelId: 9 });
  now.add(120_000);
  log.watch({ slug: 'arcadia' });
  now.add(5_000);
  log.watch({});
  log.credited('arcadia');
  const [unknown, second, first] = log.page('watch').entries;
  assert.deepEqual([first.gap, first.credited, first.channelId], [null, true, 9]);
  assert.deepEqual([second.gap, second.credited, second.channelId], [120_000, true, null]);
  assert.deepEqual([unknown.slug, unknown.credited], [null, false]);
  log.clear();
  assert.deepEqual(log.counts(), { errors: 0, requests: 0, problems: 0, watch: 0 });
});

const farm = {
  status: { code: 'farming', message: 'Watching Arcadia' },
  paused: false,
  conflict: true,
  lastCreditAt: T - 90_000,
  eventsSinceCredit: 1,
  current: { slug: 'arcadia', username: 'Arcadia', categoryName: 'Neon Rush', startedWatchingAt: T - 3_600_000, reloads: 2, manual: true },
  player: { mode: 'light', loadedAt: T - 60_000, handshakes: 1, eventsSent: 3, lastEventAt: T - 10_000, lastAdvanceAt: T - 1000, video: { paused: false, readyState: 4, currentTime: 59.6 } },
  health: { state: 'playing', text: 'Playing' },
  categories: [{ campaigns: [{ id: 'c1', name: 'Launch Week', units: 148, targetUnits: 300, watching: true }, { id: 'c2', name: 'Other', units: 1, targetUnits: 2, watching: false }] }],
  forecast: { c1: { rate: 1, observed: false, stalled: true } },
};

test('Copy player state: what the stream is doing, line by line', () => {
  const text = playerState({ farm, settings: { unmutePlayer: true, showChat: false }, now: T });
  assert.match(text, /^Arcadia \(arcadia\) · Neon Rush$/m);
  assert.match(text, /^address +https:\/\/player\.kick\.com\/arcadia \(light\)$/m);
  assert.match(text, /^video +playing · ready state 4 · at 60 s · moved .* \(1 s ago\)$/m);
  assert.match(text, /^sound +window muted · player unmuted$/m);
  assert.match(text, /^quality +Kick’s embed player$/m);
  assert.match(text, /^chat +hidden$/m);
  assert.match(text, /^watch events +3 on this stream · last .* \(10 s ago\)$/m);
  assert.match(text, /^credit +last .* \(90 s ago\) · 1 event since · another session is taking it$/m);
  assert.match(text, /^drop +Launch Week: 148 of 300 min$/m);
  assert.doesNotMatch(text, /Other/, 'only the drops being watched');
  assert.match(text, /^watching +since .* · picked by you · 2 reloads$/m);
  // The full page, before the page has said anything.
  const full = playerState({ farm: { ...farm, current: { ...farm.current, manual: false }, player: { mode: 'full' }, health: null, paused: true, categories: null }, settings: { playerQuality: 360 }, now: T });
  assert.match(full, /^address +https:\/\/kick\.com\/arcadia \(full page\)$/m);
  assert.match(full, /^loaded +not yet$/m);
  assert.match(full, /^playing +paused$/m);
  assert.match(full, /^video +no report from the page yet$/m);
  assert.match(full, /^quality +360p$/m);
  assert.match(full, /^chat +on the page$/m);
  assert.match(full, /^watch events +0 on this stream · last never$/m);
  assert.match(playerState({ farm: { ...farm, current: { ...farm.current }, player: { mode: 'full' }, health: null }, settings: {}, now: T }), /^quality +auto$/m);
  assert.equal(playerState({ farm: { status: { message: 'Every drop is done' } } }), 'Nothing playing · Every drop is done');
  assert.equal(playerState(), 'Nothing playing · not farming');
});

test('Copy diagnostics: the app, the system, its state and the three lists, without the account or its login', () => {
  const lines = reportLines({
    farm,
    settings: { queueMode: 'smart', smartRarity: 'some', autoClaim: true, playerMode: 'full', playerQuality: 720, dailyClaim: 'now', backupEvery: 'day', backupKeep: 3, stallMinutes: 20, refreshSeconds: 60 },
    auth: { status: 'signed-in', user: { username: 'pearfarmer', id: 4242 } },
    schema: 1,
    backups: { last: { at: T }, error: 'disk full' },
    updates: { state: 'error', latest: '0.2.0', error: 'offline', auto: true, lastCheck: T },
    connected: { peers: [{ id: 'mv', name: 'Stream Multiview', status: 'connected', version: '0.4.0' }], error: 'busy' },
    daily: { state: 'earning', minutes: 37, threshold: 60 },
    developerTools: true,
    now: T,
  });
  const by = Object.fromEntries(lines.map(([k, v]) => [k, v]));
  assert.equal(by['signed in'], 'Kick ✓');
  assert.equal(by.data, 'schema 1 · last backup 2026-10-25 14:00 · backup error: disk full');
  assert.equal(by.farming, 'farming: Watching Arcadia · conflict ✓');
  assert.equal(by.stream, 'arcadia · Neon Rush · picked by you');
  assert.match(by.player, /^light · Playing · 3 watch events · last .* \(10 s ago\)$/);
  assert.equal(by.drop, 'Launch Week: 148 of 300 min · 1.00 min/min (expected) · stalled');
  assert.match(by.settings, /queue smart · smart rarity some · auto-claim ✓ · game drops – .* player full 720p · daily claim now · backups day keep 3/);
  assert.equal(by['daily reward'], 'earning · 37 of 60 min');
  assert.equal(by.connected, 'Stream Multiview connected 0.4.0 · error: busy');
  assert.equal(by.updates, 'error · latest 0.2.0 · offline · auto ✓ · last check 2026-10-25 14:00');
  assert.equal(by['dev tools'], 'on');
  assert.doesNotMatch(JSON.stringify(lines), /pearfarmer|4242/, 'never the account');
  // Signed out, nothing else known.
  const out = Object.fromEntries(reportLines({ auth: { status: 'signed-out' }, connected: { peers: [] } }).map(([k, v]) => [k, v]));
  assert.equal(out['signed in'], 'Kick – (signed-out)');
  assert.equal(out.data, 'no backup yet');
  assert.equal(out.connected, 'nothing linked');
  assert.equal(out['dev tools'], 'off');
  assert.ok(!('farming' in out) && !('updates' in out));
  assert.match(Object.fromEntries(reportLines({ farm: { ...farm, current: null, paused: true } }))['stream'], /^none$/);
  assert.equal(Object.fromEntries(reportLines({ updates: { auto: false } })).updates, '? · auto – · last check never');
  assert.equal(Object.fromEntries(reportLines({})).connected, 'off');

  const now = clock();
  const log = new DevLog({ now });
  for (let i = 0; i < 52; i++) log.error('main', i % 2 ? 'here' : '', `Error ${i}`);
  log.error('main', 'here', 'Error 51');
  log.request({ url: 'https://web.kick.com/api/v1/drops/progress', status: 503, ms: 40 });
  log.request({ url: 'https://kick.com/api/v1/user', error: 'offline' });
  log.request({ url: 'https://kick.com/emotes' });
  log.watch({ slug: 'arcadia' });
  now.add(121_000);
  log.watch({ slug: 'arcadia' });
  log.restore([{ t: T, src: 'kick', where: '', msg: 'From before', count: 1 }]);
  const text = diagnostics({
    app: { version: '0.1.24', packaged: true, electron: '44.9.3', chrome: '150' },
    sys: { os: 'macOS', release: '27.0', arch: 'arm64', locale: 'en-GB' },
    lines: [['signed in', 'Kick ✓'], ['empty', ''], ['note', 'Bearer abcdefghijklmnop']],
    errors: log.list('errors'),
    requests: log.list('requests'),
    watch: log.list('watch'),
  });
  assert.match(text, /^## Pear Drops diagnostics$/m);
  assert.match(text, /^version +0\.1\.24 \(installed\) · Electron 44\.9\.3 · Chrome 150$/m);
  assert.match(text, /^system +macOS 27\.0 arm64 · en-GB$/m);
  assert.match(text, /^note +Bearer …$/m, 'redacted once more');
  assert.doesNotMatch(text, /^empty/m);
  assert.match(text, /^## Errors \(53, newest first\)$/m);
  assert.match(text, / main +here: Error 51 \(×2\)$/m);
  assert.match(text, /^… and 3 older$/m);
  assert.match(text, /^## Requests \(3, newest first\)$/m);
  assert.match(text, /Drop progress +GET +503 40 ms$/m);
  assert.match(text, /Your account +GET +failed 0 ms · offline$/m);
  assert.match(text, /Your emotes +GET +no answer 0 ms$/m);
  assert.match(text, /^## Watch events \(2, newest first\)$/m);
  assert.match(text, /arcadia +not credited yet · 121 s after the one before$/m);
  assert.match(text, /\(Logins, cookies and keys are left out\. Channel names can be in it\.\)$/);
  const empty = diagnostics();
  assert.match(empty, /^version +\? \(from source\)$/m);
  assert.equal((empty.match(/^none$/gm) ?? []).length, 3);
  assert.match(diagnostics({ errors: [{ t: T, src: 'kick', where: '', msg: 'From before', count: 1, before: true }] }), /kick +From before \[last run\]$/m);
});
