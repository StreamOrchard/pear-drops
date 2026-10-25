/* global render, icon, esc, $, ui, state, setHTML, openModal */
// Settings › Developer: the Developer tools switch, Copy diagnostics, and what src/main/devlog.js
// keeps (Errors, Requests to Kick, the player's Watch events), newest first, a page at a time, as many
// as fit, as the Activity view shows them. A click opens a row with Copy. With the switch on, the
// stream's header gets a ⋯ menu: Copy player state, Why isn't this farming?, and Inspect for the
// stream and Kick's page. Why isn't this farming? also opens from the status in the title bar.

const DEV_ROW_H = 50; // px: a row, its border included (styles.css .act-row)
const DEV_LISTS = [
  ['errors', 'Errors'],
  ['requests', 'Requests'],
  ['watch', 'Watch events'],
];
const DEV_SOURCES = { main: 'App', page: 'Window', kick: 'Kick page', player: 'Stream' };

const dev = {
  list: 'errors',
  filter: 'all', // Requests: 'all' or 'problems' (no answer, or not a 2xx)
  before: null, // the page: entries older than this one (null: the newest)
  pages: [], // the `before` of each newer page, for Newer
  limit: 8,
  data: null,
  open: null, // the entry shown in full
  copied: null, // what was just copied: an entry's n, 'report' or 'player'
  warn: false, // turning it on the first time: what Inspect can see, before it's on
  saved: null, // { name } of the diagnostics just saved to Downloads, or { error: true }
  menu: false, // the stream header's ⋯ menu
  why: null, // Why isn't this farming?: the farmer's checks (farmer.explain()), while it's open
  whyId: null, // the drop it's about (null: the one being watched, else the first in the queue)
  loading: false,
  queued: false,
};

const devTime = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const devBad = (r) => !(r.status >= 200 && r.status < 300);
const devOn = () => state?.settings?.developerTools === true;

async function loadDeveloper() {
  if (dev.loading) {
    dev.queued = true;
    return;
  }
  dev.loading = true;
  try {
    dev.data = await window.pd.developer.page(dev.list, { filter: dev.filter, before: dev.before, limit: dev.limit });
  } catch {
    dev.data = { entries: [], total: 0, newer: 0, counts: { errors: 0, requests: 0, problems: 0, watch: 0 }, latest: 0 };
  } finally {
    dev.loading = false;
    if (dev.queued) {
      dev.queued = false;
      loadDeveloper();
    } else render();
  }
}

/** After drawing: as many rows as the list has room for (it never scrolls). */
function fitDeveloper() {
  const el = $('.dev-list');
  if (!el) return;
  const room = el.clientHeight - ($('.dev-list .act-detail')?.offsetHeight ?? 0);
  const rows = Math.max(2, Math.floor(room / DEV_ROW_H));
  if (rows !== dev.limit || !dev.data) {
    pageToOpenRow(dev, rows);
    dev.limit = rows;
    loadDeveloper();
  }
}

/** Why a request has no answer's text: the switch is off, or was when it was made. */
const devNoAnswer = () => (dev.data?.answers ? 'Asked before Developer tools were on, so its answer wasn’t kept.' : 'The answer’s text is only kept while Developer tools are on.');

/** An answer laid out to read: JSON indented, anything else as it came. */
const devTidy = (text) => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
};

/** One entry as text, for Copy. */
function devEntryText(list, e) {
  if (list === 'errors') return `${new Date(e.t).toLocaleString()} · ${DEV_SOURCES[e.src] ?? e.src}${e.where ? ` · ${e.where}` : ''}${e.count > 1 ? ` · ×${e.count}` : ''}${e.before ? ' · last run' : ''}\n${e.msg}`;
  if (list === 'watch') return `${new Date(e.t).toLocaleString()} · ${e.slug ?? '?'} · ${e.credited ? 'credited' : 'not credited yet'}${e.gap != null ? ` · ${Math.round(e.gap / 1000)} s after the one before` : ''}`;
  return [
    `${e.method} ${e.url}`,
    `→ ${e.status || (e.error ? `failed: ${e.error}` : 'no answer')} · ${e.ms} ms · ${new Date(e.t).toLocaleString()} · ${e.what}`,
    e.body != null ? `\nAnswer:\n${devTidy(e.body)}` : `\n(${devNoAnswer()})`,
  ].join('\n');
}

function devRow(e) {
  const isOpen = dev.open === e.n;
  const time = `<span class="act-time">${devTime(e.t)}</span>`;
  let head;
  let full;
  if (dev.list === 'errors') {
    head = `<button class="act-row dev-row k-error ${isOpen ? 'open' : ''} ${e.before ? 'dev-before' : ''}" data-action="dev-toggle-row" data-n="${e.n}">
      ${time}<span class="act-dir">${icon('alert')}</span>
      <span class="act-body"><span class="act-title"><span class="act-kind">${esc(DEV_SOURCES[e.src] ?? e.src)}</span>${e.where ? `<span class="act-method dev-where">${esc(e.where)}</span>` : ''}</span>
        <span class="act-text">${esc(e.msg)}</span></span>
      <span class="act-meta">${e.count > 1 ? `<span>×${e.count}</span>` : ''}${e.before ? '<span>last run</span>' : ''}</span></button>`;
    full = `<p class="dev-full">${esc(e.msg)}</p>`;
  } else if (dev.list === 'requests') {
    const bad = devBad(e);
    head = `<button class="act-row dev-row ${bad ? 'k-error' : 'out'} ${isOpen ? 'open' : ''}" data-action="dev-toggle-row" data-n="${e.n}">
      ${time}<span class="act-dir">${icon(bad ? 'alert' : 'arrowRight')}</span>
      <span class="act-body"><span class="act-title"><span class="act-method cap-drops">${esc(e.what)}</span><span class="act-kind">${esc(e.method)}</span></span>
        <span class="act-text">${esc(e.url)}</span></span>
      <span class="act-meta"><span class="dev-status ${bad ? 'bad' : 'ok'}">${e.status || (e.error ? 'failed' : 'no answer')}</span><span>${e.ms} ms</span></span></button>`;
    full = e.body != null ? `<pre class="dev-full dev-answer">${esc(devTidy(e.body).slice(0, 1200))}</pre>` : `<p class="dev-full dev-quiet">${esc(e.error ? `No answer: ${e.error}` : devNoAnswer())}</p>`;
  } else {
    head = `<button class="act-row dev-row ${e.credited ? 'out' : 'dev-waiting'} ${isOpen ? 'open' : ''}" data-action="dev-toggle-row" data-n="${e.n}">
      ${time}<span class="act-dir">${icon('bolt')}</span>
      <span class="act-body"><span class="act-title"><span class="act-method cap-players">${esc(e.slug ?? 'Unknown stream')}</span></span>
        <span class="act-text">${e.credited ? 'Credited: progress went up after it' : 'Not credited yet: progress hasn’t gone up since'}</span></span>
      <span class="act-meta">${e.gap != null ? `<span>${Math.round(e.gap / 1000)} s after</span>` : '<span>first</span>'}</span></button>`;
    full = `<p class="dev-full">${esc(devEntryText('watch', e))}${e.channelId != null ? ` · channel ${esc(String(e.channelId))}` : ''}</p>`;
  }
  if (!isOpen) return head;
  const copied = dev.copied === e.n;
  return `${head}<div class="act-detail dev-detail">${full}<div class="act-detail-foot"><span></span>
    <button class="btn sm ghost" data-action="dev-copy-row" data-n="${e.n}">${icon(copied ? 'check' : 'copy')} ${copied ? 'Copied' : dev.list === 'requests' ? 'Copy request and answer' : 'Copy'}</button></div></div>`;
}

/** The Developer tab. row(title, sub, control) is Settings' own. */
function developerPane(row) {
  const d = dev.data;
  const on = devOn();
  const sw = `<button class="switch ${on || dev.warn ? 'on' : ''}" data-action="dev-switch"></button>`;
  const warn = dev.warn
    ? `<div class="dev-warn">${icon('alert')}<div><b>Inspect can read your Kick login</b><span>It opens Chrome’s developer tools for the stream or Kick’s page, which can see that page’s data. Use it yourself, and don’t share what it shows.</span></div>
        <button class="btn sm ghost" data-action="dev-warn-cancel">Cancel</button><button class="btn sm primary" data-action="dev-warn-ok">Turn on</button></div>`
    : '';
  const saved = dev.saved?.error
    ? '<span class="dev-saved bad">Couldn’t save them to Downloads.</span>'
    : dev.saved
      ? `<span class="dev-saved">Saved ${esc(dev.saved.name)} to Downloads · <button class="link-btn" data-action="dev-show-file">Show in folder</button></span>`
      : '';
  const report = `<button class="btn sm primary" data-action="dev-copy-report">${icon(dev.copied === 'report' ? 'check' : 'copy')} ${dev.copied === 'report' ? 'Copied' : 'Copy diagnostics'}</button>
    <button class="btn sm" data-action="dev-save">${icon('download')} Save to Downloads</button>`;
  const counts = d?.counts ?? { errors: 0, requests: 0, problems: 0, watch: 0 };
  const tabs = `<div class="tabs act-filters">${DEV_LISTS.map(
    ([id, label]) => `<button class="tab ${dev.list === id ? 'active' : ''}" data-action="dev-list" data-id="${id}">${label}<span class="dev-n">${counts[id] || ''}</span></button>`,
  ).join('')}</div>`;
  const only =
    dev.list === 'requests'
      ? `<button class="tab-chip ${dev.filter === 'problems' ? 'active' : ''}" data-action="dev-problems">${icon('alert')} Errors only${counts.problems ? `<span class="act-count">${counts.problems}</span>` : ''}</button>`
      : '';
  const first = d ? d.newer + 1 : 0;
  const last = d ? d.newer + d.entries.length : 0;
  const pager = d?.total
    ? `<div class="act-pager">
        ${dev.before !== null ? `<button class="btn sm icon-only ghost act-newest" data-action="dev-newest" data-tip="Newest">${icon('up')}</button>` : ''}
        <span class="act-range">${first}–${last} of ${d.total}</span>
        <button class="btn sm icon-only" data-action="dev-newer" data-tip="Newer" ${dev.before === null ? 'disabled' : ''}>${icon('chevronLeft')}</button>
        <button class="btn sm icon-only" data-action="dev-older" data-tip="Older" ${last >= d.total ? 'disabled' : ''}>${icon('chevronRight')}</button>
      </div>`
    : '';
  const empty = {
    errors: ['check', 'No errors', 'They show here as they happen, from the app, its windows, Kick’s page and the stream.'],
    requests: dev.filter === 'problems' ? ['check', 'No errors', 'Every answer from Kick was OK.'] : ['pulse', 'Nothing asked yet', 'Each request to Kick shows here as it’s answered.'],
    watch: ['bolt', 'No watch events yet', 'Kick’s player sends one about every 2 minutes while a stream plays.'],
  }[dev.list];
  const rows = d?.entries.length ? d.entries.map(devRow).join('') : d ? `<div class="act-empty"><span class="act-empty-icon">${icon(empty[0])}</span><b>${empty[1]}</b><span>${empty[2]}</span></div>` : '';
  return `${row('Developer tools', 'Adds Copy player state and Inspect to the stream’s ⋯ menu, and keeps the text of Kick’s answers in Requests.', sw)}
    ${warn}
    ${row('Report a problem', saved || 'Your version and system, what’s farming, settings, and the lists below. Your login, cookies and keys are left out.', `<div class="dev-buttons">${report}</div>`)}
    <div class="act-bar">${tabs}<div class="dev-bar-end">${only}${pager}</div></div>
    <div class="act-list dev-list">${rows}</div>
    <div class="dev-foot"><span>Kept on this computer: the last 200 errors, from this run and the one before, and this run’s last 40 requests and watch events. Nothing is sent anywhere.</span>
      <button class="btn sm ghost" data-action="dev-clear">Clear</button></div>`;
}

/** The ⋯ on the stream's header, while Developer tools are on. */
function devMenuButton() {
  if (!devOn()) return '';
  return `<button class="btn sm icon-only ghost dev-more ${dev.menu ? 'active' : ''}" data-action="dev-menu" data-tip="Developer">${icon('more')}</button>`;
}

/**
 * The menu itself, under its button: in a layer of the page's own, over the stream (the stream is
 * covered while it's open, as it is under a dialog). Called after each render.
 */
function placeDevMenu() {
  let host = document.getElementById('dev-menu-host');
  if (!host) {
    host = Object.assign(document.createElement('div'), { id: 'dev-menu-host' });
    document.body.appendChild(host);
  }
  const button = $('.dev-more');
  if (!dev.menu || !devOn() || !button) {
    if (dev.menu && (!devOn() || !button)) dev.menu = false;
    host.innerHTML = '';
    return;
  }
  const r = button.getBoundingClientRect();
  host.style.top = `${Math.round(r.bottom + 6)}px`;
  host.style.right = `${Math.round(innerWidth - r.right)}px`;
  if (!host.firstChild) host.innerHTML = devMenu();
  else setHTML(host, devMenu());
}

function devMenu() {
  const kick = state?.developer?.kickPage;
  return `<div class="dev-menu" role="menu">
    <div class="dev-menu-head">Developer</div>
    <button role="menuitem" data-action="dev-player-state">${icon(dev.copied === 'player' ? 'check' : 'copy')}<span>${dev.copied === 'player' ? 'Copied' : 'Copy player state'}</span></button>
    <button role="menuitem" data-action="dev-why">${icon('target')}<span>Why isn’t this farming?</span></button>
    <button role="menuitem" data-action="dev-inspect" data-id="player">${icon('eyeScan')}<span>Inspect stream</span></button>
    ${kick ? `<button role="menuitem" data-action="dev-inspect" data-id="kick">${icon('eyeScan')}<span>Inspect Kick page</span></button>` : ''}
  </div>`;
}

// ------------------------------------------------------------------ Why isn't this farming?

const WHY_MARK = { true: ['y', 'check'], false: ['x', 'x'], null: ['n', null] };

async function loadWhy() {
  const why = await window.pd.developer.why(dev.whyId).catch(() => null);
  if (ui.modal !== 'why') return;
  dev.why = why;
  render();
}

/** The checks as text, for Copy. */
function whyText(w) {
  const mark = (ok) => (ok === true ? '✓' : ok === false ? '✗' : '–');
  return [
    `Why isn't this farming? · ${new Date(w.at).toLocaleString()}`,
    w.drop ? `${w.drop.name}${w.drop.category ? ` · ${w.drop.category}` : ''}` : 'No drop',
    ...w.checks.map((k) => `${mark(k.ok)} ${k.text}${k.note ? ` (${k.note})` : ''}`),
    `${w.verdict.farming ? 'Farming' : 'Not farming'}: ${w.verdict.text}`,
  ].join('\n');
}

/** The dialog: the farmer's checks for one drop, in order, and the first that failed. ‹ › step through the queue's drops. */
function whyModal() {
  const w = dev.why;
  const at = w?.drop ? w.drops.findIndex((d) => d.id === w.drop.id) : -1;
  const step = (dir, ic, tip, off) => `<button class="btn sm icon-only ghost" data-action="dev-why-step" data-dir="${dir}" data-tip="${tip}" ${off ? 'disabled' : ''}>${icon(ic)}</button>`;
  const about = w
    ? `<div class="why-about"><div class="why-drop"><b>${esc(w.drop?.name ?? 'No drop to farm')}</b><span>${esc(w.drop?.category ?? 'Nothing in the queue')}${w.stream ? ` · watching ${esc(w.stream.username)}` : ''}</span></div>
        ${w.drops.length > 1 ? `<span class="why-count num">${at + 1} of ${w.drops.length}</span>${step(-1, 'chevronLeft', 'The drop before it in the queue', at <= 0)}${step(1, 'chevronRight', 'The next drop in the queue', at === -1 || at >= w.drops.length - 1)}` : ''}</div>`
    : '';
  const checks = w
    ? `<div class="why-checks">${w.checks
        .map((k) => {
          const [tone, ic] = WHY_MARK[k.ok];
          return `<div class="why-row why-${tone}"><span class="why-m">${ic ? icon(ic) : '–'}</span><span class="why-t">${esc(k.text)}${k.note ? `<small>${esc(k.note)}</small>` : ''}</span></div>`;
        })
        .join('')}</div>
      <div class="why-verdict ${w.verdict.farming ? 'ok' : ''}"><b>${w.verdict.farming ? 'Farming' : 'Not farming'}:</b> ${esc(w.verdict.text)}</div>`
    : '<div class="why-checks"><div class="spinner"></div></div>';
  const copied = dev.copied === 'why';
  return `<div class="modal-backdrop" data-action="close-modal">
    <div class="modal why" data-stop role="dialog" aria-modal="true" aria-labelledby="why-title">
      <div class="modal-head"><h3 id="why-title">Why isn’t this farming?</h3><button class="btn sm icon-only ghost" data-action="close-modal" data-tip="Close (Esc)">${icon('x')}</button></div>
      <div class="modal-section">${about}${checks}</div>
      <div class="modal-foot"><span class="why-foot">The farmer’s checks, in the order it makes them</span><span class="spacer"></span>
        <button class="btn sm" data-action="dev-why-copy" ${w ? '' : 'disabled'}>${icon(copied ? 'check' : 'copy')} ${copied ? 'Copied' : 'Copy'}</button>
        <button class="btn sm primary" data-action="close-modal">Close</button></div>
    </div>
  </div>`;
}

async function devCopy(text, what) {
  await navigator.clipboard.writeText(text).catch(() => {});
  dev.copied = what;
  render();
  setTimeout(() => {
    if (dev.copied === what) dev.copied = null;
    render();
  }, 1500);
}

function devReload() {
  Object.assign(dev, { before: null, pages: [], open: null });
  loadDeveloper();
}

const developerActions = {
  'dev-switch': () => {
    if (devOn()) return window.pd.setSettings({ developerTools: false });
    if (dev.warn) {
      dev.warn = false;
      return render();
    }
    // The first time: what Inspect can see, before it's on.
    if (!state.settings.developerToolsWarned) {
      dev.warn = true;
      return render();
    }
    window.pd.setSettings({ developerTools: true });
  },
  'dev-warn-ok': () => {
    dev.warn = false;
    window.pd.setSettings({ developerTools: true, developerToolsWarned: true });
  },
  'dev-warn-cancel': () => {
    dev.warn = false;
    render();
  },
  'dev-list': (el) => {
    dev.list = el.dataset.id;
    dev.filter = 'all';
    devReload();
  },
  'dev-problems': () => {
    dev.filter = dev.filter === 'problems' ? 'all' : 'problems';
    devReload();
  },
  'dev-older': () => {
    const last = dev.data?.entries.at(-1);
    if (!last) return;
    dev.pages.push(dev.before);
    dev.before = last.n;
    dev.open = null;
    loadDeveloper();
  },
  'dev-newer': () => {
    dev.before = dev.pages.pop() ?? null;
    dev.open = null;
    loadDeveloper();
  },
  'dev-newest': () => devReload(),
  'dev-toggle-row': (el) => {
    const n = Number(el.dataset.n);
    dev.open = dev.open === n ? null : n;
    render();
    fitDeveloper();
  },
  'dev-copy-row': (el) => {
    const e = dev.data?.entries.find((x) => x.n === Number(el.dataset.n));
    if (e) devCopy(devEntryText(dev.list, e), e.n);
  },
  'dev-copy-report': async () => devCopy(await window.pd.developer.report(), 'report'),
  'dev-save': async () => {
    dev.saved = await window.pd.developer.save().catch(() => ({ error: true }));
    render();
  },
  'dev-show-file': () => window.pd.developer.showFile(),
  'dev-clear': async () => {
    await window.pd.developer.clear();
    devReload();
  },
  'dev-menu': () => {
    dev.menu = !dev.menu;
    render();
  },
  'dev-player-state': async () => devCopy(await window.pd.developer.playerState(), 'player'),
  'dev-why': () => {
    dev.menu = false;
    dev.why = null;
    dev.whyId = null;
    openModal('why');
    loadWhy();
  },
  'dev-why-step': (el) => {
    const w = dev.why;
    const at = w?.drops.findIndex((d) => d.id === w.drop?.id) ?? -1;
    const next = w?.drops[at + Number(el.dataset.dir)];
    if (!next) return;
    dev.whyId = next.id;
    loadWhy();
  },
  'dev-why-copy': () => dev.why && devCopy(whyText(dev.why), 'why'),
  'dev-inspect': async (el) => {
    dev.menu = false;
    render();
    await window.pd.developer.inspect(el.dataset.id);
  },
};

// Something new: the open list follows it (on its newest page; older pages stay put).
window.pd.developer.onChanged(() => {
  if (ui.modal === 'settings' && ui.settingsTab === 'developer' && state) loadDeveloper();
});
// The ⋯ menu closes on a click anywhere else, or Escape.
document.addEventListener('click', (event) => {
  if (dev.menu && !event.target.closest('.dev-menu, .dev-more')) {
    dev.menu = false;
    render();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && dev.menu) {
    dev.menu = false;
    render();
  }
});
