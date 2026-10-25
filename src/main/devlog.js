// Settings › Developer: what went wrong (Errors), the last requests to Kick (Requests) and the
// player's watch events (Watch events), for finding out why farming isn't working and for Copy
// diagnostics. Plain data, so it can be tested: main.js feeds it and stores the errors.
//
// Errors keep this run's and the run before's (a crash or a restart often follows the problem), the
// last MAX of them. The same error again straight after is counted, not added. Requests and watch
// events are this run's only. Nothing leaves the computer unless it's copied, and what could be
// private (logins, keys, cookies) is taken out as it comes in, so it's never stored anywhere.
const MAX = { errors: 200, requests: 40, watch: 40 };
const TEXT_MAX = 600; // an error's text
const BODY_MAX = 20_000; // a request's answer (Kick's whole page is cut off here)
const SOURCES = ['main', 'page', 'kick', 'player'];

// Logins, keys and cookies out of anything written down: address parts and the like (token=…), headers
// (Authorization: Bearer …, Cookie: …), Kick's cookies by name, and JSON fields ("token": "…").
const SECRET = 'access_token|refresh_token|id_token|token|key|api_key|apikey|client_secret|secret|password|pass|auth|authorization|code|session|sessionid|sid|cookie|xsrf|csrf|session_token|xsrf-token|kick_session';
// JSON fields: fewer, so Kick's error codes and messages stay readable.
const SECRET_FIELDS = 'password|pass|secret|api_key|apikey|authorization|cookie|xsrf|csrf|session|sessionid|sid';
const SECRET_RE = [
  [new RegExp(`((?<![\\w-])(?:${SECRET})=)[^&#\\s"';]*`, 'gi'), '$1…'],
  [/\b(Bearer|Basic|OAuth)\s+[\w.~+/=%|-]{8,}/gi, '$1 …'],
  [/\b((?:set-)?cookie\s*[:=]\s*)[^\n]*/gi, '$1…'],
  [/\b(session_token|XSRF-TOKEN|kick_session)=[^;\s"']*/gi, '$1=…'],
  [new RegExp(`("(?:${SECRET_FIELDS}|[\\w-]*token|[\\w-]*secret)"\\s*:\\s*)"[^"]*"`, 'gi'), '$1"…"'],
];

function redact(text) {
  let s = String(text ?? '');
  for (const [re, to] of SECRET_RE) s = s.replace(re, to);
  return s;
}

const clip = (s, n) => {
  s = String(s ?? '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

// What each of Kick's addresses the app asks is, in words (kick-api.js and the stand-in's).
const REQUESTS = [
  [/\/api\/v1\/drops\/campaigns\/livestream$/, 'A stream’s drops'],
  [/\/api\/v1\/drops\/campaigns$/, 'Drop campaigns'],
  [/\/api\/v1\/drops\/progress$/, 'Drop progress'],
  [/\/api\/v1\/drops\/claim$/, 'Claim a drop'],
  [/\/api\/v1\/gamification\/challenges\/[^/]+\/claim$/, 'Claim the daily reward'],
  [/\/api\/v1\/gamification\/challenges$/, 'Daily reward'],
  [/\/api\/v1\/gamification\/collectibles$/, 'Collectibles'],
  [/\/api\/v1\/gamification\/user\/level$/, 'Level'],
  [/\/api\/v1\/gamification\/users\/[^/]+\/streak$/, 'Streak'],
  [/\/api\/v1\/rewards$/, 'Prizes won'],
  [/\/api\/v1\/livestreams$/, 'Live streams'],
  [/\/api\/v1\/events\/[^/]+\/streams$/, 'An event’s streams'],
  [/\/api\/v2\/channels\/[^/]+\/follow$/, 'Follow'],
  [/\/api\/v2\/channels\/[^/]+\/info$/, 'Channel'],
  [/\/api\/v1\/user$/, 'Your account'],
  [/\/emotes$/, 'Your emotes'],
  [/follow/i, 'Channels you follow'],
];

/** What a request to Kick is, in words ('API <path>' for one the app doesn't name). */
function describeRequest(url) {
  let path;
  try {
    path = new URL(String(url)).pathname.replace(/\/+$/, '');
  } catch {
    return 'Request';
  }
  return REQUESTS.find(([re]) => re.test(path))?.[1] ?? `API ${path.replace(/^\/api\//, '')}`;
}

/** A request whose answer wasn't OK: no answer, or not a 2xx. */
const badAnswer = (r) => !(r.status >= 200 && r.status < 300);
const FILTERS = { all: () => true, problems: badAnswer };

class DevLog {
  /** saved: the errors stored at the end of the last run (toSave()). */
  constructor({ now = Date.now, saved = [], max = MAX } = {}) {
    this.now = now;
    this.max = { ...MAX, ...max };
    this.n = 0;
    this.lists = { errors: [], requests: [], watch: [] }; // oldest first
    this.restore(saved);
  }

  /** The last run's errors (toSave()), before this run's: the database opens after the first ones can happen. */
  restore(saved) {
    const before = [];
    for (const e of Array.isArray(saved) ? saved : []) {
      if (!e || typeof e.msg !== 'string' || !e.msg) continue;
      before.push({ n: ++this.n, t: Number(e.t) || 0, src: SOURCES.includes(e.src) ? e.src : 'main', where: clip(e.where, 80), msg: clip(e.msg, TEXT_MAX), count: Math.max(1, Number(e.count) || 1), before: true });
    }
    const l = this.lists.errors;
    l.unshift(...before);
    if (l.length > this.max.errors) l.splice(0, l.length - this.max.errors);
  }

  push(list, entry) {
    const e = { n: ++this.n, ...entry };
    const l = this.lists[list];
    l.push(e);
    if (l.length > this.max[list]) l.splice(0, l.length - this.max[list]);
    return e;
  }

  /**
   * An error. src: 'main' (this side), 'page' (the app's windows), 'kick' (the hidden kick.com page),
   * 'player' (the stream's page). where: what it's about (a file and line, "crash"). null if empty.
   */
  error(src, where, msg) {
    msg = clip(redact(msg).trim(), TEXT_MAX);
    where = clip(redact(where).trim(), 80);
    if (!msg) return null;
    src = SOURCES.includes(src) ? src : 'main';
    const last = this.lists.errors.at(-1);
    if (last && !last.before && last.src === src && last.where === where && last.msg === msg) {
      last.count += 1;
      last.t = this.now();
      return last;
    }
    return this.push('errors', { t: this.now(), src, where, msg, count: 1 });
  }

  /** A request to Kick and its answer. status 0: no answer. body: the answer's text (only while Developer tools are on). */
  request({ url, method = 'GET', status = 0, ms = 0, body, error } = {}) {
    const e = {
      t: this.now(),
      what: describeRequest(url),
      method: String(method || 'GET').toUpperCase(),
      url: clip(redact(url), 240),
      status: Number(status) || 0,
      ms: Math.max(0, Math.round(Number(ms) || 0)),
    };
    if (body != null) e.body = clip(redact(body), BODY_MAX);
    if (error) e.error = clip(redact(error), 200);
    return this.push('requests', e);
  }

  /** One of the player's watch events, credited once progress goes up. */
  watch({ slug = null, channelId = null } = {}) {
    const last = this.lists.watch.at(-1);
    const t = this.now();
    return this.push('watch', { t, slug, channelId: channelId ?? null, gap: last ? t - last.t : null, credited: false });
  }

  /** Progress went up on a stream: its watch events so far were credited. */
  credited(slug) {
    for (const e of this.lists.watch) if (e.slug === slug) e.credited = true;
  }

  /** A page of one list, newest first: those older than entry `before` (the newest when null or gone) that pass `filter`. */
  page(list, { filter = 'all', before = null, limit = 10 } = {}) {
    const pass = (list === 'requests' && FILTERS[filter]) || FILTERS.all;
    const mine = (this.lists[list] ?? []).filter(pass);
    // By place, not number: the last run's errors are numbered after this run's first ones.
    const at = before === null ? -1 : mine.findIndex((e) => e.n === before);
    const older = at < 0 ? mine : mine.slice(0, at);
    return {
      entries: older.slice(-Math.max(1, limit)).reverse().map((e) => ({ ...e })),
      total: mine.length,
      newer: mine.length - older.length,
      counts: this.counts(),
      latest: this.n,
    };
  }

  counts() {
    return { errors: this.lists.errors.length, requests: this.lists.requests.length, problems: this.lists.requests.filter(badAnswer).length, watch: this.lists.watch.length };
  }

  /** Newest first. */
  list(name) {
    return this.lists[name].slice().reverse().map((e) => ({ ...e }));
  }

  clear() {
    for (const l of Object.values(this.lists)) l.length = 0;
  }

  /** What to store for the next run: this run's errors. */
  toSave() {
    return this.lists.errors.filter((e) => !e.before).map(({ t, src, where, msg, count }) => ({ t, src, where, msg, count }));
  }
}

// ------------------------------------------------------------------ Copy diagnostics

const two = (n) => String(n).padStart(2, '0');
const clock = (t) => {
  const d = new Date(t);
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
};
const pad = (s, n) => String(s).padEnd(n);
const tick = (on) => (on ? '✓' : '–');

/**
 * The report, as text for an issue. info: { app, sys, lines (the app's state: [label, text] pairs),
 * errors, requests, watch } (each list newest first). Everything goes through redact() once more.
 */
function diagnostics({ app = {}, sys = {}, lines = [], errors = [], requests = [], watch = [] } = {}) {
  const out = ['## Pear Drops diagnostics', ''];
  const line = (label, text) => text && out.push(pad(label, 13) + text);
  line('version', [`${app.version || '?'} (${app.packaged ? 'installed' : 'from source'})`, app.electron && `Electron ${app.electron}`, app.chrome && `Chrome ${app.chrome}`].filter(Boolean).join(' · '));
  line('system', [[sys.os, sys.release, sys.arch].filter(Boolean).join(' '), sys.locale].filter(Boolean).join(' · '));
  for (const [label, text] of lines) line(label, String(text ?? ''));
  out.push('', `## Errors (${errors.length}${errors.length ? ', newest first' : ''})`);
  if (!errors.length) out.push('none');
  for (const e of errors.slice(0, 50)) out.push(`${clock(e.t)} ${pad(e.src, 6)} ${e.where ? `${e.where}: ` : ''}${e.msg}${e.count > 1 ? ` (×${e.count})` : ''}${e.before ? ' [last run]' : ''}`);
  if (errors.length > 50) out.push(`… and ${errors.length - 50} older`);
  out.push('', `## Requests (${requests.length}${requests.length ? ', newest first' : ''})`);
  if (!requests.length) out.push('none');
  for (const r of requests.slice(0, 20)) out.push(`${clock(r.t)} ${pad(r.what, 24)} ${pad(r.method, 6)} ${r.status || (r.error ? 'failed' : 'no answer')} ${r.ms} ms${r.error ? ` · ${r.error}` : ''}`);
  out.push('', `## Watch events (${watch.length}${watch.length ? ', newest first' : ''})`);
  if (!watch.length) out.push('none');
  for (const w of watch.slice(0, 10)) out.push(`${clock(w.t)} ${pad(w.slug ?? '?', 20)} ${w.credited ? 'credited' : 'not credited yet'}${w.gap != null ? ` · ${Math.round(w.gap / 1000)} s after the one before` : ''}`);
  out.push('', '(Logins, cookies and keys are left out. Channel names can be in it.)');
  return redact(out.join('\n'));
}

const ago = (t, now) => (t ? `${clock(t)} (${Math.max(0, Math.round((now - t) / 1000))} s ago)` : 'never');

/**
 * Copy player state: what the docked stream is doing, as lines for a report. farm: the farmer's
 * snapshot(), settings: store.get().
 */
function playerState({ farm, settings = {}, now = Date.now() } = {}) {
  const cur = farm?.current;
  if (!cur) return `Nothing playing · ${farm?.status?.message ?? 'not farming'}`;
  const ws = farm.player ?? {};
  const v = ws.video;
  const full = ws.mode === 'full';
  const watched = (farm.categories ?? []).flatMap((c) => c.campaigns ?? []).filter((c) => c.watching);
  const rows = [
    ['address', `${full ? `https://kick.com/${cur.slug}` : `https://player.kick.com/${cur.slug}`} (${full ? 'full page' : 'light'})`],
    ['loaded', ws.loadedAt ? `at ${clock(ws.loadedAt)}` : 'not yet'],
    ['playing', farm.health?.text ?? (farm.paused ? 'paused' : 'unknown')],
    ['video', v ? `${v.paused ? 'paused' : 'playing'} · ready state ${v.readyState} · at ${Math.round(v.currentTime ?? 0)} s · moved ${ago(ws.lastAdvanceAt, now)}` : 'no report from the page yet'],
    ['sound', `window muted · player ${settings.unmutePlayer ? 'unmuted' : 'muted'}`],
    ['quality', full ? (settings.playerQuality ? `${settings.playerQuality}p` : 'auto') : 'Kick’s embed player'],
    ['chat', full ? 'on the page' : settings.showChat === false ? 'hidden' : 'shown'],
    ['handshakes', String(ws.handshakes ?? 0)],
    ['watch events', `${ws.eventsSent ?? 0} on this stream · last ${ago(ws.lastEventAt, now)}`],
    ['credit', `last ${ago(farm.lastCreditAt, now)} · ${farm.eventsSinceCredit ?? 0} event${farm.eventsSinceCredit === 1 ? '' : 's'} since${farm.conflict ? ' · another session is taking it' : ''}`],
    ...watched.map((c) => ['drop', `${c.name}: ${c.units ?? 0} of ${c.targetUnits ?? '?'} min`]),
    ['watching', `since ${cur.startedWatchingAt ? clock(cur.startedWatchingAt) : '?'}${cur.manual ? ' · picked by you' : ''} · ${cur.reloads ?? 0} reloads`],
  ];
  return redact([`${cur.username} (${cur.slug}) · ${cur.categoryName ?? ''}`, ...rows.map(([k, t]) => pad(k, 13) + t)].join('\n'));
}

/**
 * The app's state for Copy diagnostics: [label, text] pairs. Never the account's name or id.
 * farm: farmer.snapshot(), settings: store.get(), auth, backups / updates / connected / daily: their status.
 */
function reportLines({ farm, settings = {}, auth = {}, schema, backups, updates, connected, daily, developerTools = false, now = Date.now() } = {}) {
  const s = settings;
  const cur = farm?.current;
  const lines = [
    ['signed in', `Kick ${tick(auth.status === 'signed-in')}${auth.status && auth.status !== 'signed-in' ? ` (${auth.status})` : ''}`],
    ['data', [schema != null && `schema ${schema}`, backups?.last ? `last backup ${new Date(backups.last.at).toISOString().slice(0, 16).replace('T', ' ')}` : 'no backup yet', backups?.error && `backup error: ${backups.error}`].filter(Boolean).join(' · ')],
  ];
  if (farm) {
    lines.push(['farming', `${farm.status?.code ?? '?'}: ${farm.status?.message ?? ''}${farm.paused ? ' · paused' : ''} · conflict ${tick(farm.conflict)}`]);
    lines.push(['stream', cur ? `${cur.slug} · ${cur.categoryName ?? ''}${cur.manual ? ' · picked by you' : ''}` : 'none']);
    if (cur) lines.push(['player', `${farm.player?.mode ?? '?'} · ${farm.health?.text ?? '?'} · ${farm.player?.eventsSent ?? 0} watch event${farm.player?.eventsSent === 1 ? '' : 's'} · last ${ago(farm.player?.lastEventAt, now)}`]);
    for (const c of (farm.categories ?? []).flatMap((k) => k.campaigns ?? []).filter((k) => k.watching)) {
      const f = farm.forecast?.[c.id];
      lines.push(['drop', `${c.name}: ${c.units ?? 0} of ${c.targetUnits ?? '?'} min${f ? ` · ${f.rate.toFixed(2)} min/min${f.observed ? '' : ' (expected)'}${f.stalled ? ' · stalled' : ''}` : ''}`]);
    }
  }
  lines.push([
    'settings',
    [
      `queue ${s.queueMode ?? 'manual'}`,
      `smart rarity ${s.smartRarity ?? 'off'}`,
      `auto-claim ${tick(s.autoClaim)}`,
      `game drops ${tick(s.includeGameDrops)}`,
      `prefer expiring ${tick(s.prioritizeExpiring)}`,
      `stall ${s.stallMinutes ?? '?'} min`,
      `refresh ${s.refreshSeconds ?? '?'} s`,
      `campaigns ${s.campaignsMinutes ?? '?'} / streams ${s.streamsMinutes ?? '?'} / follows ${s.followedMinutes ?? '?'} min`,
      `player ${s.playerMode ?? 'light'}${s.playerMode === 'full' ? ` ${s.playerQuality ? `${s.playerQuality}p` : 'auto'}` : ''}`,
      `daily claim ${s.dailyClaim ?? '?'}`,
      `backups ${s.backupEvery ?? '?'} keep ${s.backupKeep ?? '?'}`,
    ].join(' · '),
  ]);
  if (daily) lines.push(['daily reward', `${daily.state}${Number.isFinite(daily.minutes) ? ` · ${daily.minutes} of ${daily.threshold ?? 60} min` : ''}`]);
  const peers = connected?.peers ?? [];
  lines.push(['connected', connected ? (peers.length ? peers.map((p) => `${p.name ?? p.id} ${p.status ?? '?'}${p.version ? ` ${p.version}` : ''}`).join(' · ') : 'nothing linked') + (connected.error ? ` · error: ${connected.error}` : '') : 'off']);
  if (updates) lines.push(['updates', `${updates.state ?? '?'}${updates.latest ? ` · latest ${updates.latest}` : ''}${updates.error ? ` · ${updates.error}` : ''} · auto ${tick(updates.auto)} · last check ${updates.lastCheck ? new Date(updates.lastCheck).toISOString().slice(0, 16).replace('T', ' ') : 'never'}`]);
  lines.push(['dev tools', developerTools ? 'on' : 'off']);
  return lines;
}

module.exports = { DevLog, describeRequest, diagnostics, playerState, reportLines, redact, badAnswer, MAX, SOURCES };
