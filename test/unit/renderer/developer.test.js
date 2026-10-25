// Settings › Developer's rows, copies and switch (src/renderer/developer.js), in a sandbox like the other renderer scripts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIR = path.join(__dirname, '..', '..', '..', 'src', 'renderer');
const noop = () => {};
const settings = [];
const sets = () => JSON.parse(JSON.stringify(settings)); // out of the sandbox, to compare
const ctx = vm.createContext({
  document: { querySelector: () => null, addEventListener: noop, documentElement: { addEventListener: noop, dataset: {} } },
  window: { addEventListener: noop, pd: { developer: { onChanged: noop }, setSettings: (patch) => settings.push(patch) } },
  navigator: { platform: 'MacIntel' },
  Date,
  Math,
  Number,
  String,
  Array,
  JSON,
  Intl,
  Object,
  Map,
});
for (const file of ['icons.js', 'charts.js', 'format.js', 'developer.js']) vm.runInContext(fs.readFileSync(path.join(DIR, file), 'utf8'), ctx, { filename: file });
const run = (code, vars = {}) => {
  Object.assign(ctx, vars);
  return vm.runInContext(code, ctx);
};
const T = new Date(2026, 9, 25, 14, 0, 0).getTime();
const row = (title, sub, control) => `<div class="setting"><b>${title}</b><span>${sub}</span>${control}</div>`;
const renders = [];
Object.assign(ctx, { render: () => renders.push(1), ui: { modal: null }, state: { settings: {} }, $: () => null });

test('each entry copies as text: an error, a request with its answer laid out, a watch event', () => {
  const error = run('devEntryText("errors", e)', { e: { t: T, src: 'kick', where: 'kick.com/robots.txt', msg: 'The page stopped: crashed', count: 3, before: true } });
  assert.match(error, / · Kick page · kick\.com\/robots\.txt · ×3 · last run\nThe page stopped: crashed$/);
  assert.match(run('devEntryText("errors", e)', { e: { t: T, src: 'main', where: '', msg: 'Plain', count: 1 } }), / · App\nPlain$/);
  const asked = { t: T, what: 'Drop progress', method: 'GET', url: 'https://web.kick.com/api/v1/drops/progress', status: 200, ms: 81, body: '{"data":[1]}' };
  assert.match(run('devEntryText("requests", e)', { e: asked }), /^GET https:\/\/web\.kick\.com\/api\/v1\/drops\/progress\n→ 200 · 81 ms · .* · Drop progress\n\nAnswer:\n\{\n {2}"data": \[\n {4}1\n {2}\]\n\}$/);
  assert.match(run('devEntryText("requests", e)', { e: { ...asked, body: 'not json' } }), /Answer:\nnot json$/);
  run('dev.data = null');
  assert.match(run('devEntryText("requests", e)', { e: { ...asked, status: 0, error: 'offline', body: undefined } }), /→ failed: offline · .*\n\n\(The answer’s text is only kept while Developer tools are on\.\)$/);
  run('dev.data = { answers: true }');
  assert.match(run('devEntryText("requests", e)', { e: { ...asked, status: 0, body: undefined } }), /→ no answer · [\s\S]*\(Asked before Developer tools were on, so its answer wasn’t kept\.\)$/);
  assert.match(run('devEntryText("watch", e)', { e: { t: T, slug: 'arcadia', credited: true, gap: 121_400 } }), / · arcadia · credited · 121 s after the one before$/);
  assert.match(run('devEntryText("watch", e)', { e: { t: T, slug: null, credited: false, gap: null } }), / · \? · not credited yet$/);
});

test('the rows: an error from the last run is dimmed, a bad answer is red, an uncredited watch event is amber; an open row has Copy', () => {
  run('dev.list = "errors"; dev.open = null');
  const err = run('devRow(e)', { e: { n: 1, t: T, src: 'page', where: '', msg: '<b>x</b>', count: 2, before: true } });
  assert.match(err, /dev-before/);
  assert.match(err, /&lt;b&gt;x&lt;\/b&gt;/, 'the text is text');
  assert.doesNotMatch(err, /dev-where/, 'no place, no empty label');
  assert.match(err, /×2/);
  run('dev.list = "requests"; dev.open = 2; dev.data = { answers: false }');
  const bad = run('devRow(e)', { e: { n: 2, t: T, what: 'Claim a drop', method: 'POST', url: 'u', status: 503, ms: 9 } });
  assert.match(bad, /k-error/);
  assert.match(bad, /dev-status bad">503/);
  assert.match(bad, /only kept while Developer tools are on/);
  assert.match(bad, /Copy request and answer/);
  const failed = run('devRow(e)', { e: { n: 2, t: T, what: 'Your account', method: 'GET', url: 'u', status: 0, ms: 0, error: 'offline' } });
  assert.match(failed, />failed</);
  assert.match(failed, /No answer: offline/);
  assert.match(run('devRow(e)', { e: { n: 2, t: T, what: 'X', method: 'GET', url: 'u', status: 200, ms: 1, body: '{"a":1}' } }), /<pre class="dev-full dev-answer">\{\n {2}&quot;a&quot;: 1\n\}<\/pre>/);
  assert.match(run('devRow(e)', { e: { n: 3, t: T, what: 'X', method: 'GET', url: 'u', status: 0, ms: 1 } }), /no answer/);
  run('dev.list = "watch"; dev.open = 4; dev.copied = 4');
  const watch = run('devRow(e)', { e: { n: 4, t: T, slug: 'arcadia', channelId: 9, credited: false, gap: 120_000 } });
  assert.match(watch, /dev-waiting/);
  assert.match(watch, /120 s after/);
  assert.match(watch, /channel 9/);
  assert.match(watch, /Copied/);
  assert.match(run('devRow(e)', { e: { n: 5, t: T, slug: null, credited: true, gap: null } }), /Unknown stream[\s\S]*first/);
  run('dev.copied = null; dev.open = null');
});

test('the pane: the switch, the first-time warning, the report and the list’s tabs and pager', () => {
  run('dev.list = "requests"; dev.filter = "problems"; dev.before = 5; dev.warn = true; dev.saved = { name: "pear-drops-diagnostics.txt" }');
  run('dev.data = { entries: [], total: 12, newer: 3, counts: { errors: 1, requests: 12, problems: 2, watch: 0 } }');
  let pane = run('developerPane(row)', { row });
  assert.match(pane, /class="switch on" data-action="dev-switch"/, 'on while it asks');
  assert.match(pane, /Inspect can read your Kick login/);
  assert.match(pane, /Saved pear-drops-diagnostics\.txt to Downloads/);
  assert.match(pane, /data-action="dev-problems"[^>]*>.*Errors only<span class="act-count">2<\/span>/s);
  assert.match(pane, /No errors<\/b><span>Every answer from Kick was OK\./);
  assert.match(pane, /data-action="dev-newest" data-tip="Newest"/);
  run('dev.warn = false; dev.saved = { error: true }; dev.list = "watch"; dev.before = null; dev.data = null');
  pane = run('developerPane(row)', { row });
  assert.match(pane, /class="switch " data-action="dev-switch"/);
  assert.match(pane, /Couldn’t save them to Downloads/);
  assert.doesNotMatch(pane, /dev-problems/);
  run('dev.saved = null; dev.data = { entries: [], total: 0, newer: 0, counts: {} }');
  assert.match(run('developerPane(row)', { row }), /No watch events yet/);
  run('dev.list = "errors"');
  assert.match(run('developerPane(row)', { row }), /No errors<\/b><span>They show here/);
  run('dev.list = "requests"; dev.filter = "all"');
  assert.match(run('developerPane(row)', { row }), /Nothing asked yet/);
});

test('the switch: off at once; on asks first, the first time only; the ⋯ only while it’s on', () => {
  settings.length = 0;
  ctx.state = { settings: { developerTools: false, developerToolsWarned: false } };
  run('developerActions["dev-switch"]()');
  assert.equal(run('dev.warn'), true, 'asks first');
  assert.deepEqual(sets(), []);
  run('developerActions["dev-switch"]()');
  assert.equal(run('dev.warn'), false, 'the switch again cancels');
  run('developerActions["dev-switch"](); developerActions["dev-warn-cancel"]()');
  assert.equal(run('dev.warn'), false);
  assert.deepEqual(sets(), []);
  run('developerActions["dev-switch"](); developerActions["dev-warn-ok"]()');
  assert.deepEqual(sets(), [{ developerTools: true, developerToolsWarned: true }]);
  ctx.state = { settings: { developerTools: false, developerToolsWarned: true } };
  run('developerActions["dev-switch"]()');
  assert.deepEqual(sets().at(-1), { developerTools: true }, 'told once is enough');
  assert.equal(run('devMenuButton()'), '');
  ctx.state = { settings: { developerTools: true }, developer: { kickPage: true } };
  run('developerActions["dev-switch"]()');
  assert.deepEqual(sets().at(-1), { developerTools: false });
  assert.match(run('devMenuButton()'), /data-action="dev-menu"/);
  const menu = run('devMenu()');
  assert.match(menu, /Copy player state/);
  assert.match(menu, /data-id="player"/);
  assert.match(menu, /data-id="kick"/);
  ctx.state = { settings: { developerTools: true }, developer: { kickPage: false } };
  assert.doesNotMatch(run('devMenu()'), /data-id="kick"/, 'demo mode has no hidden Kick page');
});

test('opening a row low on the page moves the page so it stays the last row, rather than a smaller page leaving it out', async () => {
  const asked = [];
  ctx.window.pd.developer.page = async (list, opts) => (asked.push(JSON.parse(JSON.stringify(opts))), { entries: [], total: 0, newer: 0, counts: {} });
  // 300 px of list with a 100 px row open: room for 4 rows of 50.
  const els = { '.dev-list': { clientHeight: 300 }, '.dev-list .act-detail': { offsetHeight: 100 } };
  ctx.document.querySelector = (sel) => els[sel] ?? null;
  const fit = async (open) => {
    run('Object.assign(dev, { list: "requests", filter: "all", before: null, pages: [], limit: 6, open, loading: false, queued: false, data: { entries: [14, 13, 12, 11, 10, 9].map((n) => ({ n })) } })', { open });
    run('fitDeveloper()');
    const at = JSON.parse(run('JSON.stringify({ before: dev.before, pages: dev.pages, limit: dev.limit })'));
    await new Promise((r) => setImmediate(r));
    return at;
  };
  assert.deepEqual(await fit(10), { before: 14, pages: [null], limit: 4 }, 'the 5th row: the page starts one later, so it’s the 4th');
  assert.deepEqual(asked.at(-1), { filter: 'all', before: 14, limit: 4 });
  assert.deepEqual(await fit(9), { before: 13, pages: [null], limit: 4 }, 'the 6th');
  assert.deepEqual(await fit(11), { before: null, pages: [], limit: 4 }, 'the 4th still fits: the page stays');
  assert.deepEqual(await fit(null), { before: null, pages: [], limit: 4 }, 'nothing open');
  ctx.document.querySelector = () => null;
});

test('developer.js declares nothing another page script already has (one would quietly replace the other)', () => {
  const names = (file) => new Set([...fs.readFileSync(path.join(DIR, file), 'utf8').matchAll(/^(?:async\s+)?(?:function\s+|(?:const|let|var)\s+)([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
  const mine = names('developer.js');
  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.js') && f !== 'developer.js' && !f.startsWith('tray'))) {
    const clash = [...names(file)].filter((n) => mine.has(n));
    assert.deepEqual(clash, [], `${file} also declares ${clash.join(', ')}`);
  }
});

test('Why isn’t this farming?: the checks with their marks and notes, the verdict, ‹ › through the drops, and Copy', async () => {
  const why = {
    at: T,
    drops: [{ id: 'a', name: 'Neon Rush Launch Week' }, { id: 'b', name: 'Cozy <Hours>' }],
    drop: { id: 'a', name: 'Neon Rush Launch Week', category: 'Neon Rush' },
    stream: { slug: 'arcadia', username: 'Arcadia' },
    checks: [
      { step: 'state', ok: true, text: 'Running and signed in', note: 'Last checked with Kick 5s ago' },
      { step: 'reward', ok: false, text: 'Hype Emote is waiting to be claimed' },
      { step: 'credit', ok: null, text: 'Not watching it yet' },
    ],
    verdict: { farming: false, text: 'Hype Emote is waiting to be claimed' },
  };
  run('dev.why = w; dev.copied = null', { w: why });
  const html = run('whyModal()');
  assert.match(html, /role="dialog"/);
  assert.match(html, /Neon Rush Launch Week<\/b><span>Neon Rush · watching Arcadia/);
  assert.match(html, /why-y"><span class="why-m"><svg[\s\S]*Running and signed in<small>Last checked with Kick 5s ago<\/small>/);
  assert.match(html, /why-x"[\s\S]*waiting to be claimed/);
  assert.match(html, /why-n"><span class="why-m">–/);
  assert.match(html, /why-verdict "><b>Not farming:<\/b> Hype Emote/);
  assert.match(html, /1 of 2/);
  assert.match(html, /data-dir="-1"[^>]*disabled/, 'nothing before the first');
  assert.doesNotMatch(html, /data-dir="1"[^>]*disabled/);

  assert.equal(
    run('whyText(dev.why)'),
    [`Why isn't this farming? · ${new Date(T).toLocaleString()}`, 'Neon Rush Launch Week · Neon Rush', '✓ Running and signed in (Last checked with Kick 5s ago)', '✗ Hype Emote is waiting to be claimed', '– Not watching it yet', 'Not farming: Hype Emote is waiting to be claimed'].join('\n'),
  );

  // Farming, one drop: no stepping; nothing yet: a spinner, and Copy waits.
  run('dev.why = w', { w: { ...why, drops: [why.drops[0]], verdict: { farming: true, text: 'It’s farming' } } });
  assert.match(run('whyModal()'), /why-verdict ok"><b>Farming:/);
  assert.doesNotMatch(run('whyModal()'), /dev-why-step/);
  run('dev.why = null');
  assert.match(run('whyModal()'), /spinner[\s\S]*data-action="dev-why-copy" disabled/);

  // Opening asks for the drop being watched; › asks for the next one, and stays put past the end.
  const asked = [];
  ctx.window.pd.developer.why = async (id) => (asked.push(id), why);
  ctx.openModal = (name) => (ctx.ui.modal = name);
  run('dev.menu = true; developerActions["dev-why"]()');
  await new Promise((r) => setImmediate(r));
  assert.equal(run('dev.menu'), false);
  assert.equal(run('ui.modal'), 'why');
  assert.equal(run('dev.why.drop.id'), 'a');
  run('developerActions["dev-why-step"]({ dataset: { dir: "1" } })');
  await new Promise((r) => setImmediate(r));
  run('developerActions["dev-why-step"]({ dataset: { dir: "-1" } })');
  assert.deepEqual(asked, [null, 'b']);
  // Closed before it answered: the answer is dropped.
  run('ui.modal = null; dev.why = null; loadWhy()');
  await new Promise((r) => setImmediate(r));
  assert.equal(run('dev.why'), null);
  run('ui.modal = null');
});
