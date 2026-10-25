/* global commands, palette, actions, state, ui, farm, dailyReward, currentCampaigns, categoryEta, trackedRewards, channelNames, alarm, upd, dev, devOn, act, hist, SETTINGS_TABS, SETTINGS_ROWS, NOTIFY_KINDS, settingValue, settingWords, openSettings, openSide, openHistory, openModal, openReward, render, crateList, icon, img, esc, fmtMin, fmtDur, fmtEnds, fmtCount, signedInPlayers */
// What the search box (Ctrl/⌘+K, palette.js) finds in Pear Drops: every drop, reward and channel, every action, every
// tab and filter by name, and Settings' options. A button with a data-action gets a command here that runs the same
// action (runAction), so the button and the box can't do different things; test/launch/palette.test.js fails on a
// button without one (the few left out are listed there, each with why).

const IS_MAC = navigator.platform.startsWith('Mac');
const TRAY = IS_MAC ? 'menu bar' : 'tray';
/** Runs a button's action as its click does, with the button's data-* values. */
const runAction = (name, data = {}) => actions[name]?.({ dataset: data, closest: () => null });
/** After the page has drawn what an action opened: the button in it, clicked. */
const clickSoon = (sel) => requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector(sel)?.click()));
const pageName = (id) => SETTINGS_TABS.find(([t]) => t === id)?.[2] ?? id;
const minutes = (r, units) => `${Math.min(units, r.required)} of ${r.required} min`;

// ---- drops: each queue row, and each drop in Done

/** A queue row's lead drop: being watched, else the next to watch. */
const leadOf = (cat) => cat.campaigns.find((c) => c.watching) ?? cat.campaigns.find((c) => c.needsWatching) ?? cat.campaigns[0];

/** What a queue row is doing, as the queue's chip says it. */
function dropStatus(cat, f) {
  if (!cat.enabled) return { text: 'Off', tone: '' };
  if (cat.complete) return { text: 'Done', tone: 'green' };
  if (f.current?.targetId === cat.id) return { text: 'Farming', tone: 'green', dot: true };
  if (!cat.needsWatching) return { text: 'Claimable', tone: 'amber' };
  if (cat.urgent) return { text: 'Ends soon', tone: 'red' };
  if (cat.streamsLoaded && !cat.streamCount) return { text: 'Waiting', tone: 'amber' };
  return { text: 'Next', tone: '' };
}

/** A drop's reward track, as the queue draws it: the minutes so far, each reward where it unlocks (lit: the one named). */
function trackHTML(units, rewards, lit) {
  const tracked = rewards.filter((r) => r.tracked);
  if (!tracked.length) return '';
  const max = Math.max(1, ...tracked.map((r) => r.required));
  return `<span class="pal-track"><span class="bar"></span><span class="fill" style="width:${((Math.min(units, max) / max) * 100).toFixed(1)}%"></span>${tracked
    .map((r) => `<span class="mk ${r.claimed ? 'claimed' : ''} ${r.id === lit ? 'lit' : ''}" style="left:${((r.required / max) * 100).toFixed(1)}%">${img(r.image)}</span>`)
    .join('')}</span>`;
}

function dropItem(cat, { lit = null } = {}) {
  const f = farm();
  const lead = leadOf(cat);
  const camps = cat.campaigns.filter((c) => !c.complete);
  const title = cat.campaigns.length === 1 ? lead.name : cat.name;
  const st = dropStatus(cat, f);
  const farming = f.current?.targetId === cat.id;
  const max = Math.max(1, ...(lead?.rewards ?? []).filter((r) => r.tracked).map((r) => r.required));
  const fc = lead ? f.forecast[lead.id] : null;
  const ready = cat.campaigns.flatMap((c) => c.rewards.filter((r) => r.ready && r.tracked && !r.claimed).map((r) => ({ c, r })));
  const where = cat.kind === 'category' ? cat.category?.name ?? cat.name : `${channelNames(cat.channels)} · ${cat.category?.name ?? ''}`;
  const id = `drop:${cat.id}`;
  const show = () => openSide('queue', { category: cat.id });
  const history = () => openHistory({ campaign: lead?.id ?? null });
  const page = lead?.url ? () => runAction('open-link', { url: lead.url }) : null;
  const live = (cat.streams ?? []).filter((s) => !s.blocked);
  const watch = live[0] ? () => runAction('watch', { slug: live[0].slug, cat: String(cat.id) }) : null;
  const toTop = () => {
    const order = (f.categories ?? []).filter((c) => !c.complete).map((c) => c.id);
    window.pd.setSettings({ categoryOrder: [cat.id, ...order.filter((x) => x !== cat.id), ...(state.settings.categoryOrder ?? []).filter((x) => !order.includes(x))] });
  };
  const smart = state.settings.queueMode === 'smart';
  const claim = ready[0] ? { label: 'Claim', icon: 'gift', run: () => runAction('claim', { campaign: ready[0].c.id, reward: ready[0].r.id }), done: `Claiming ${ready[0].r.name}` } : null;
  const more = { label: 'More…', icon: 'chevronRight', more: true };
  let buttons;
  if (!cat.enabled) buttons = [{ label: 'Switch it on', icon: 'check', run: () => runAction('cat-toggle', { id: String(cat.id) }), done: `Farming ${title} again` }, { label: 'Show in queue', icon: 'list', run: show }, { label: 'In History', icon: 'clock', run: history }, more];
  else if (farming) buttons = [{ label: 'Show in queue', icon: 'list', run: show }, { label: 'Skip stream', icon: 'skip', run: () => runAction('skip'), done: 'Skipping to the next stream' }, { label: 'Switch it off', icon: 'off', run: () => runAction('cat-toggle', { id: String(cat.id) }), done: `${title} switched off` }, { label: 'In History', icon: 'clock', run: history }, more];
  else if (watch) buttons = [{ label: 'Farm it now', icon: 'play', run: watch, done: `Watching ${live[0].username} for ${title}` }, { label: 'Farm it first', icon: 'top', run: toTop, done: `${title} moved to the top of the queue` }, { label: 'Switch it off', icon: 'off', run: () => runAction('cat-toggle', { id: String(cat.id) }), done: `${title} switched off` }, { label: 'In History', icon: 'clock', run: history }, more];
  else buttons = [{ label: 'Show in queue', icon: 'list', run: show }, { label: 'Farm it first', icon: 'top', run: toTop, done: `${title} moved to the top of the queue` }, { label: 'Switch it off', icon: 'off', run: () => runAction('cat-toggle', { id: String(cat.id) }), done: `${title} switched off` }, page ? { label: 'Drop page on kick.com', icon: 'external', run: page } : { label: 'In History', icon: 'clock', run: history }, more];
  if (claim) buttons.unshift(claim);
  const next = lead?.next;
  return {
    id,
    kind: 'drop',
    group: 'Drops',
    title,
    words: [cat.name, cat.category?.name, ...camps.map((c) => c.name), ...cat.channels.map((c) => c.username)].filter((w) => w && w !== title),
    image: cat.kind === 'category' ? cat.image : (cat.channels[0]?.avatar ?? cat.image),
    round: cat.kind !== 'category',
    pills: [st],
    sub: [where, lead ? minutes({ required: max }, lead.units) : '', st.text === 'Farming' ? '' : st.text],
    heroSub: [
      where,
      lead ? { b: String(lead.units), t: ` / ${max} min` } : '',
      next ? `next ${next.name} in ${fmtMin(farming ? fc?.nextMinutes : next.remaining)}` : '',
      lead?.endsAt ? fmtEnds(lead.endsAt) : '',
      farming ? { b: f.current.username, t: '' } : cat.streamCount ? `${cat.streamCount} live` : '',
    ],
    heroExtra: lead ? trackHTML(lead.units, lead.rewards, lit) : '',
    hero: true,
    buttons,
    boost: (farming ? 15 : 0) + (ready.length ? 10 : 0) + 5,
    run: show,
    alt: history,
    more: () => [
      { id: `${id}:show`, group: 'Farm', title: 'Show in queue', sub: 'Opens the Queue on it', icon: 'list', run: show },
      watch && !farming ? { id: `${id}:now`, group: 'Farm', title: 'Farm it now', sub: `Watch ${live[0].username}`, icon: 'play', run: watch, done: `Watching ${live[0].username} for ${title}` } : null,
      { id: `${id}:top`, group: 'Farm', title: 'Farm it first', sub: 'Moves it to the top of the queue', icon: 'top', run: toTop, done: `${title} moved to the top of the queue` },
      {
        id: `${id}:up`,
        group: 'Farm',
        title: 'Move up',
        sub: 'One place, in Manual order',
        icon: 'up',
        disabled: () => (smart ? 'Smart order sorts this' : ''),
        run: () => runAction('cat-up', { id: String(cat.id) }),
      },
      {
        id: `${id}:down`,
        group: 'Farm',
        title: 'Move down',
        sub: 'One place, in Manual order',
        icon: 'down',
        disabled: () => (smart ? 'Smart order sorts this' : ''),
        run: () => runAction('cat-down', { id: String(cat.id) }),
      },
      live.length ? { id: `${id}:channels`, group: 'Farm', title: 'Watch another channel…', sub: `${live.length} live for it`, icon: 'play', more: () => live.map((s) => channelItem(s, cat)), run: () => openSide('streams', { category: cat.id }) } : null,
      farming ? { id: `${id}:skip`, group: 'Farm', title: 'Skip stream', sub: `${f.current.username} → the next one`, icon: 'skip', keys: `${palette.mod} 1`, run: () => runAction('skip'), done: 'Skipping to the next stream' } : null,
      { id: `${id}:on`, group: 'This drop', col: 1, title: 'Farm this drop', sub: 'Switch it off to skip it', icon: 'off', toggle: { get: () => cat.enabled, set: () => runAction('cat-toggle', { id: String(cat.id) }) } },
      currentCampaigns().some((c) => c.id === lead?.id) ? { id: `${id}:chart`, group: 'This drop', col: 1, title: 'Progress chart', sub: 'Its forecast on the dashboard', icon: 'pulse', run: () => (openSide(ui.sideTab), runAction('chart-campaign', { id: lead.id })) } : null,
      { id: `${id}:history`, group: 'This drop', col: 1, title: 'In History', sub: 'Its credits, sessions and channels', icon: 'clock', run: history },
      page ? { id: `${id}:page`, group: 'This drop', col: 1, title: 'Drop page on kick.com', sub: 'In your browser', icon: 'external', run: page } : null,
      lead?.url ? { id: `${id}:copy`, group: 'This drop', col: 1, title: 'Copy link', sub: lead.url.replace(/^https?:\/\//, ''), icon: 'copy', run: () => navigator.clipboard.writeText(lead.url).catch(() => {}), done: 'Link copied' } : null,
      ...camps.flatMap((c) =>
        c.rewards
          .filter((r) => r.tracked)
          .map((r) => ({
            id: `${id}:reward:${r.id}`,
            group: 'Rewards',
            col: 1,
            title: r.name,
            sub: r.claimed ? 'Claimed' : r.ready ? 'Ready to claim' : minutes(r, c.units),
            image: r.image,
            verb: r.ready && !r.claimed ? 'Claim' : 'Show',
            run: r.ready && !r.claimed ? () => runAction('claim', { campaign: c.id, reward: r.id }) : show,
          })),
      ),
    ].filter(Boolean),
  };
}

function pastItem(p) {
  const done = p.status === 'completed';
  const id = `past:${p.id}`;
  const show = () => openSide('done', { filter: 'all' });
  const history = () => openHistory({ campaign: p.id });
  const page = p.url ? () => runAction('open-link', { url: p.url }) : null;
  const tracked = (p.rewards ?? []).filter((r) => r.tracked);
  return {
    id,
    kind: 'drop',
    group: 'Done',
    title: p.name,
    words: [p.category].filter(Boolean),
    image: p.image,
    pills: [done ? { text: 'Completed', tone: 'green' } : { text: 'Missed', tone: 'red' }],
    sub: [p.category, `${tracked.filter((r) => r.claimed).length} of ${tracked.length} claimed`],
    heroSub: [p.category, `${tracked.filter((r) => r.claimed).length} of ${tracked.length} rewards claimed`, p.units ? `${p.units} min credited` : ''],
    heroExtra: trackHTML(p.units ?? 0, p.rewards ?? []),
    hero: true,
    buttons: [{ label: 'Show in Done', icon: 'trophy', run: show }, { label: 'In History', icon: 'clock', run: history }, page ? { label: 'Drop page on kick.com', icon: 'external', run: page } : null].filter(Boolean),
    run: show,
    alt: history,
  };
}

// ---- rewards: each one's drop comes first when it's named

function rewardItems(f) {
  const out = [];
  for (const cat of f.categories) {
    for (const c of cat.campaigns) {
      for (const r of c.rewards.filter((x) => x.tracked)) {
        const ready = r.ready && !r.claimed;
        out.push({
          id: `reward:${r.id}`,
          kind: 'reward',
          group: 'Rewards',
          title: r.name,
          image: r.image,
          sub: [c.name, minutes(r, c.units), r.claimed ? 'claimed' : ready ? 'ready to claim' : ''],
          chip: r.claimed ? { text: 'Claimed', tone: 'green' } : ready ? { text: 'Ready', tone: 'gold' } : null,
          heroOf: () => dropItem(cat, { lit: r.id }),
          boost: ready ? 10 : 0,
          verb: ready ? 'Claim' : 'Show',
          run: ready ? () => runAction('claim', { campaign: c.id, reward: r.id }) : () => openSide('queue', { category: cat.id }),
          done: ready ? `Claiming ${r.name}` : null,
          keep: ready,
          keepGroup: 'Needs you',
        });
      }
    }
  }
  for (const p of f.past ?? []) {
    for (const r of (p.rewards ?? []).filter((x) => x.tracked)) {
      out.push({ id: `reward:past:${p.id}:${r.id}`, kind: 'reward', group: 'Rewards', title: r.name, image: r.image, sub: [p.name, r.claimed ? 'claimed' : 'missed'], heroOf: () => pastItem(p), run: () => openSide('done') });
    }
  }
  return out;
}

// ---- channels: live for a drop, and the one being watched

function channelItem(s, cat) {
  const f = farm();
  const cur = f.current?.slug === s.slug;
  const id = `ch:${s.slug}`;
  const follow = { label: s.followed ? 'Following' : 'Follow', icon: 'heart', on: s.followed, run: () => runAction('follow', { slug: s.slug, on: s.followed ? '' : '1' }), done: s.followed ? `Unfollowing ${s.username}` : `Following ${s.username}` };
  const kick = { label: 'On kick.com', icon: 'external', run: () => runAction('open-kick', { slug: s.slug }) };
  const history = { label: 'In History', icon: 'clock', run: () => openHistory({ table: 'channels', text: s.username }) };
  const watch = () => runAction('watch', { slug: s.slug, cat: String(cat.id) });
  const buttons = cur
    ? [{ label: 'Reload the stream', icon: 'reload', run: () => runAction('reload'), done: `Reloading ${s.username}` }, { label: 'Skip stream', icon: 'skip', run: () => runAction('skip'), done: 'Skipping to the next stream' }, follow, kick, { label: 'More…', icon: 'chevronRight', more: true }]
    : [{ label: 'Watch for drops', icon: 'play', run: watch, done: `Watching ${s.username} for ${cat.name}` }, follow, kick, history, { label: 'More…', icon: 'chevronRight', more: true }];
  const lead = leadOf(cat);
  return {
    id,
    kind: 'channel',
    group: cur ? 'Watching' : 'Channels',
    title: s.username,
    words: [s.slug, s.title, cat.name].filter(Boolean),
    image: s.avatar,
    round: true,
    live: true,
    viewers: s.viewers,
    sub: [s.title, cat.name],
    pills: [cur ? { text: 'Watching', tone: 'green', dot: true } : s.followed ? { text: 'Following' } : { text: 'Not followed' }],
    heroSub: [{ b: s.title, t: '' }, cat.name, `${fmtCount(s.viewers)} watching`, s.startedAt ? `live ${fmtDur(Date.now() - new Date(s.startedAt).getTime())}` : '', lead ? `counts for ${lead.name}` : ''],
    hero: true,
    buttons,
    boost: (cur ? 15 : 0) + 8 + (s.followed ? 5 : 0),
    disabled: () => (s.blocked && !cur ? 'Pear Drops skips this channel' : ''),
    run: cur ? () => runAction('reload') : watch,
    verb: cur ? 'Reload' : 'Watch',
    alt: () => runAction('open-kick', { slug: s.slug }),
    more: () =>
      [
        cur ? null : { id: `${id}:watch`, group: 'Watch', title: 'Watch for drops', sub: `For ${cat.name}`, icon: 'play', run: watch, done: `Watching ${s.username} for ${cat.name}` },
        cur ? { id: `${id}:reload`, group: 'Watch', title: 'Reload the stream', icon: 'reload', run: () => runAction('reload') } : null,
        cur ? { id: `${id}:skip`, group: 'Watch', title: 'Skip stream', icon: 'skip', run: () => runAction('skip') } : null,
        { id: `${id}:streams`, group: 'Watch', title: `Streams: ${cat.name}`, sub: 'Every channel live for it', icon: 'eye', run: () => openSide('streams', { category: cat.id }) },
        { id: `${id}:follow`, group: 'Channel', col: 1, title: 'Following', sub: 'Channels you follow are watched first', icon: 'heart', toggle: { get: () => s.followed, set: () => runAction('follow', { slug: s.slug, on: s.followed ? '' : '1' }) } },
        { id: `${id}:kick`, group: 'Channel', col: 1, title: 'On kick.com', sub: 'In your browser', icon: 'external', run: () => runAction('open-kick', { slug: s.slug }) },
        { id: `${id}:history`, group: 'Channel', col: 1, title: 'In History', sub: 'Its watch sessions', icon: 'clock', run: history.run },
        { id: `${id}:copy`, group: 'Channel', col: 1, title: 'Copy link', sub: `kick.com/${s.slug}`, icon: 'copy', run: () => navigator.clipboard.writeText(`https://kick.com/${s.slug}`).catch(() => {}), done: 'Link copied' },
        cur && devOn() ? { id: `${id}:inspect`, group: 'Channel', col: 1, title: 'Inspect stream', icon: 'eyeScan', run: () => runAction('dev-inspect', { id: 'player' }) } : null,
      ].filter(Boolean),
  };
}

function channelItems(f) {
  const seen = new Map();
  for (const cat of f.categories) for (const s of cat.streams ?? []) if (!seen.has(s.slug) || f.current?.slug === s.slug) seen.set(s.slug, channelItem(s, cat));
  // The one being watched, even when its category's list doesn't have it (picked by you).
  const cur = f.current;
  if (cur && !seen.has(cur.slug)) {
    const cat = f.categories.find((c) => c.id === cur.targetId);
    if (cat) seen.set(cur.slug, channelItem({ ...cur, covers: [] }, cat));
  }
  // Watched before, from History (once it's been opened).
  for (const c of hist.data?.channels ?? []) {
    if (!c.channel || [...seen.values()].some((x) => x.title.toLowerCase() === String(c.channel).toLowerCase())) continue;
    seen.set(`h:${c.channel}`, {
      id: `ch:h:${c.channel}`,
      kind: 'channel',
      group: 'Watched before',
      title: c.channel,
      image: c.avatar,
      round: true,
      sub: [`${c.sessions} session${c.sessions === 1 ? '' : 's'}`, `${c.credited} min credited`],
      run: () => openHistory({ table: 'channels', text: c.channel }),
      verb: 'In History',
    });
  }
  return [...seen.values()];
}

// ---- places: every tab, sub-tab and filter by name

function placeItems(f) {
  const out = [];
  const place = (id, title, sub, ic, run, more = {}) => out.push({ id: `place:${id}`, kind: 'place', group: 'Places', title, sub, icon: ic, run, ...more });
  place('dashboard', 'Dashboard', 'What’s farming now', 'pulse', () => runAction('view', { id: 'dashboard' }));
  place('history', 'History', 'Everything recorded on this computer', 'list', () => openHistory());
  const past = f?.past ?? [];
  if (f) {
    place('queue', 'Queue', `${f.categories.filter((c) => !c.complete).length} drops to collect`, 'list', () => openSide('queue'));
    place('done', 'Done', `${past.length} finished and missed`, 'trophy', () => openSide('done', { filter: 'all' }));
    place('done-completed', 'Done: Completed', `${past.filter((p) => p.status === 'completed').length} finished`, 'trophy', () => openSide('done', { filter: 'completed' }), { words: ['finished'] });
    place('done-missed', 'Done: Missed', `Drops that ended with rewards left · ${past.filter((p) => p.status === 'missed').length}`, 'trophy', () => openSide('done', { filter: 'missed' }));
    place('streams', 'Streams', 'Channels live for each drop', 'eye', () => openSide('streams'));
    place('activity', 'Activity', 'What the app did, newest first', 'pulse', () => openSide('activity'), { words: ['log'] });
    for (const cat of f.categories.filter((c) => c.needsWatching && c.enabled)) {
      const followed = (cat.streams ?? []).filter((s) => s.followed).length;
      out.push({
        id: `place:streams:${cat.id}`,
        kind: 'place',
        group: 'Streams tab',
        groupNote: 'a sub-tab per drop',
        title: `Streams: ${cat.name}`,
        image: cat.image,
        sub: followed ? `${followed} you follow · ${cat.streamCount - followed} more` : cat.streamCount ? `${cat.streamCount === 1 ? 'one channel' : `${cat.streamCount} channels`}, none you follow` : 'nothing live',
        chip: { text: `${cat.streamCount} live` },
        run: () => openSide('streams', { category: cat.id }),
      });
    }
    for (const [i, c] of (f.upcoming ?? []).entries()) {
      out.push({
        id: `place:coming:${c.id}`,
        kind: 'place',
        group: 'Coming soon',
        title: `Coming soon: ${c.name}`,
        image: c.image,
        sub: [c.category, `starts in ${fmtDur(new Date(c.startsAt).getTime() - Date.now())}`],
        run: () => {
          openSide('queue');
          ui.comingIdx = i;
          ui.comingAt = Date.now();
          render();
        },
      });
    }
  }
  for (const [id, label] of [
    ['24h', 'Last 24 hours'],
    ['7d', '7 days'],
    ['30d', '30 days'],
    ['all', 'All time'],
  ])
    place(`hist-range:${id}`, `History: ${label}`, 'Its time range', 'clock', () => openHistory({ range: id }));
  for (const [id, label, ic] of [
    ['timeline', 'Timeline', 'list'],
    ['sessions', 'Watch sessions', 'play'],
    ['channels', 'Channels', 'users'],
  ])
    place(`hist-table:${id}`, `History: ${label}`, 'Its table', ic, () => openHistory({ table: id }));
  for (const [g, label, ic] of [
    ['progress', 'Progress', 'bolt'],
    ['rewards', 'Rewards', 'gift'],
    ['watching', 'Watching', 'play'],
    ['problems', 'Problems', 'alert'],
    ['app', 'App', 'pulse'],
  ])
    out.push({
      id: `place:hist-group:${g}`,
      kind: 'place',
      group: 'Places',
      title: `History: ${label} events`,
      sub: ['History › Timeline', { problems: 'stalls, reloads, crashes and lost credit', progress: 'credits', rewards: 'unlocks and claims', watching: 'switches and streams', app: 'the app itself' }[g]],
      icon: ic,
      toggle: {
        get: () => ui.view === 'history' && hist.table === 'timeline' && hist.groups.includes(g),
        set: (on) => openHistory({ table: 'timeline', groups: on ? [...new Set([...hist.groups, g])] : hist.groups.filter((x) => x !== g) }),
      },
    });
  for (const [id, , label] of SETTINGS_TABS) out.push({ id: `page:${id}`, kind: 'page', group: 'Settings pages', title: `Settings › ${label}`, sub: 'Settings', icon: 'settings', words: [label], run: () => openSettings(id) });
  // Connected apps › Activity, per app, on each filter.
  for (const p of (state?.connected?.peers ?? []).filter((x) => x.enabled)) {
    for (const [fid, label] of [
      ['all', 'All'],
      ['out', 'Sent'],
      ['in', 'Received'],
      ['problems', 'Problems'],
    ])
      out.push({
        id: `place:act:${p.id}:${fid}`,
        kind: 'place',
        group: 'Places',
        title: fid === 'all' ? `Activity with ${p.name}` : `Activity: ${label}`,
        sub: `Settings › Connected apps › ${p.name}`,
        icon: 'link',
        run: () => {
          openSettings('apps');
          runAction('act-open-app', { id: p.id });
          if (fid !== 'all') runAction('act-filter', { id: fid });
        },
      });
  }
  for (const [lid, label] of [
    ['errors', 'Errors'],
    ['requests', 'Requests'],
    ['watch', 'Watch events'],
  ])
    place(`dev:${lid}`, `Developer: ${label}`, 'Settings › Developer', 'code', () => {
      openSettings('developer');
      runAction('dev-list', { id: lid });
    });
  place(
    'dev:problems',
    'Developer: Requests, errors only',
    'Settings › Developer',
    'code',
    () => {
      openSettings('developer');
      runAction('dev-list', { id: 'requests' });
      runAction('dev-problems');
    },
    { words: ['problems', 'failed requests'] },
  );
  const dr = dailyReward();
  if (dr && dr.state !== 'unavailable' && dr.state !== 'loading') {
    const crates = crateList(dr);
    if (crates.length > 1)
      for (const c of crates)
        out.push({
          id: `place:crate:${c.id}`,
          kind: 'place',
          group: 'Daily reward',
          title: `Daily reward: ${c.label}`,
          sub: c.state === 'ready' ? 'ready to claim' : c.state,
          icon: 'chest',
          run: () => {
            openReward(true);
            runAction('reward-tab', { id: c.id });
          },
        });
  }
  return out;
}

// ---- Settings' options

function settingItems() {
  const s = state.settings;
  const env = { mac: IS_MAC, tray: TRAY };
  const out = SETTINGS_ROWS.map((d) => {
    const item = {
      id: `set:${d.id}`,
      kind: 'setting',
      group: 'Settings',
      title: settingWords(d.title, env),
      sub: [`Settings › ${pageName(d.page)}`, settingWords(d.sub, env)],
      words: d.words ?? [],
      icon: SETTINGS_TABS.find(([t]) => t === d.page)?.[1] ?? 'settings',
      disabled: () => (d.when && !d.when(state.settings) ? d.why : ''),
      alt: () => openSettings(d.page, { row: d.inRow ?? d.id }),
    };
    if (d.type === 'switch') item.toggle = { get: () => settingValue(d, state.settings), set: (on) => window.pd.setSettings({ [d.id]: on }) };
    else if (d.type === 'choice') item.choice = { options: d.options, get: () => settingValue(d, state.settings), set: (v) => (d.action ? runAction(d.action, { id: v }) : window.pd.setSettings({ [d.id]: v })) };
    else item.range = { min: d.min, max: d.max, unit: d.unit, get: () => s[d.id], set: (n) => window.pd.setSettings({ [d.id]: Math.round(n / d.step) * d.step }) };
    return item;
  });
  for (const [kind, title, sub] of NOTIFY_KINDS)
    out.push({
      id: `set:notify:${kind}`,
      kind: 'setting',
      group: 'Settings',
      title,
      sub: ['Settings › Notifications', sub],
      words: ['notify', 'notification'],
      icon: 'bell',
      toggle: { get: () => !!state.settings.notify?.[kind], set: () => runAction('notify-toggle', { kind }) },
      alt: () => openSettings('notifications'),
    });
  const b = state.backups;
  if (b) {
    out.push({
      id: 'set:backupEvery',
      kind: 'setting',
      group: 'Settings',
      title: 'Back up my data',
      sub: ['Settings › Privacy & data', 'a copy of your history and drop archive'],
      words: ['backup', 'backups'],
      icon: 'database',
      choice: {
        options: [
          ['day', 'Daily'],
          ['week', 'Weekly'],
          ['off', 'Off'],
        ],
        get: () => state.backups?.every,
        set: (v) => runAction('setting-value', { key: 'backupEvery', id: v }),
      },
      alt: () => openSettings('privacy'),
    });
    out.push({
      id: 'set:backupKeep',
      kind: 'setting',
      group: 'Settings',
      title: 'Copies to keep',
      sub: ['Settings › Privacy & data', 'backups'],
      words: ['backups'],
      icon: 'database',
      disabled: () => (state.backups?.every === 'off' ? 'Only while backups are on' : ''),
      choice: {
        options: [
          ['3', '3'],
          ['7', '7'],
          ['14', '14'],
        ],
        get: () => String(state.backups?.keep),
        set: (v) => runAction('setting-value', { key: 'backupKeep', id: v }),
      },
      alt: () => openSettings('privacy'),
    });
  }
  out.push({
    id: 'set:developerTools',
    kind: 'setting',
    group: 'Settings',
    title: 'Developer tools',
    sub: ['Settings › Developer', 'adds Inspect and Copy player state'],
    words: ['inspect', 'devtools'],
    icon: 'code',
    toggle: {
      get: () => devOn(),
      // Turning them on shows what Inspect can see first: there, on the page.
      set: (on) => {
        if (on && !state.settings.developerToolsWarned) openSettings('developer');
        runAction('dev-switch');
      },
    },
    alt: () => openSettings('developer'),
  });
  if (upd.status && !upd.status.devCopy)
    out.push({
      id: 'set:update-auto',
      kind: 'setting',
      group: 'Settings',
      title: 'Update automatically',
      sub: ['Settings › Updates', 'downloads each new version as it’s out'],
      words: ['updates'],
      icon: 'sparkle',
      toggle: { get: () => !!upd.status?.auto, set: () => runAction('update-auto') },
      alt: () => openSettings('updates'),
    });
  for (const p of state?.connected?.peers ?? [])
    out.push({
      id: `set:connect:${p.id}`,
      kind: 'setting',
      group: 'Settings',
      title: `Connect with ${p.name}`,
      sub: ['Settings › Connected apps', 'both apps need this switched on'],
      words: ['link', 'grapevine'],
      icon: 'link',
      toggle: { get: () => !!state.connected?.peers?.find((x) => x.id === p.id)?.enabled, set: () => runAction('connected-toggle', { id: p.id }) },
      alt: () => openSettings('apps'),
    });
  return out;
}

// ---- actions

function initPaletteItems() {
  const f = () => farm();
  const settingsOn = (tab) => ui.modal === 'settings' && ui.settingsTab === tab;
  const nowNote = () => (f()?.current ? `${f().current.username} · ${f().current.categoryName}` : '');
  commands.add([
    // Farming
    { id: 'pause', group: 'Farming', title: 'Pause farming', sub: 'Stops watching until you resume', words: ['stop'], icon: 'pause', when: () => !!f() && !f().paused, run: () => runAction('pause'), done: 'Paused farming', keep: true, keepGroup: 'Now', keepNote: nowNote },
    { id: 'resume', group: 'Farming', title: 'Resume farming', sub: 'Starts watching again', words: ['start', 'play'], icon: 'play', when: () => !!f()?.paused, run: () => runAction('resume'), done: 'Farming again', keep: true, keepGroup: 'Now' },
    {
      id: 'skip',
      group: 'Farming',
      title: 'Skip stream',
      sub: () => `${f().current.username} → the next channel`,
      words: ['next', 'switch', 'another stream'],
      icon: 'skip',
      when: () => !!f()?.current,
      run: () => runAction('skip'),
      done: 'Skipping to the next stream',
      keep: true,
      keepGroup: 'Now',
      keepNote: nowNote,
    },
    { id: 'reload', group: 'Farming', title: 'Reload the stream', sub: () => f().current.username, words: ['refresh player'], icon: 'reload', when: () => !!f()?.current, run: () => runAction('reload'), done: 'Reloading the stream', keep: true, keepGroup: 'Now', keepNote: nowNote },
    {
      id: 'refresh',
      group: 'Farming',
      title: 'Refresh from Kick',
      sub: () => (f()?.nextTickAt ? `Next refresh in ${Math.max(0, Math.ceil((f().nextTickAt - Date.now()) / 1000))}s` : 'Progress, streams and campaigns'),
      words: ['check now', 'update'],
      icon: 'refresh',
      when: () => !!f(),
      run: () => runAction('refresh'),
      done: 'Checking with Kick',
      keep: true,
      keepGroup: 'Now',
      keepNote: nowNote,
    },
    { id: 'stop-alarm', group: 'Farming', title: 'Stop the alarm', sub: 'Another Kick stream is taking your credit', words: ['silence', 'sound'], icon: 'volumeOff', when: () => !!alarm.timer, run: () => runAction('stop-alarm'), keep: true, keepGroup: 'Needs you' },
    {
      id: 'conflict-apps',
      group: 'Farming',
      title: 'Connected apps',
      sub: () => `${signedInPlayers(state.connected)?.name ?? 'A linked app'} has Kick players signed in`,
      icon: 'link',
      when: () => !!f()?.conflict && !!signedInPlayers(state.connected),
      run: () => runAction('open-connected-apps'),
      keep: true,
      keepGroup: 'Needs you',
    },
    { id: 'test-sound', group: 'Farming', title: 'Test the alarm', sub: 'The sound for credit going elsewhere', words: ['sound', 'chime'], icon: 'bell', run: () => runAction('test-sound') },
    // The stream panel
    { id: 'hide-stream', group: 'Stream panel', title: 'Hide the stream', sub: 'Folds it away beside the dashboard', words: ['collapse', 'player'], icon: 'panel', when: () => ui.playerOpen, run: () => runAction('toggle-player') },
    { id: 'show-stream', group: 'Stream panel', title: 'Show the stream', sub: 'Opens it beside the dashboard', words: ['expand', 'player'], icon: 'panel', when: () => !ui.playerOpen, run: () => runAction('toggle-player') },
    { id: 'copy-player', group: 'Stream panel', title: 'Copy player state', sub: 'The stream’s player, for a report', icon: 'copy', when: () => devOn() && !!f()?.current, run: () => runAction('dev-player-state'), done: 'Copied the player state' },
    { id: 'inspect-player', group: 'Stream panel', title: 'Inspect stream', sub: 'Chrome’s developer tools for the docked stream', icon: 'eyeScan', when: () => devOn() && !!f()?.current, run: () => runAction('dev-inspect', { id: 'player' }) },
    { id: 'inspect-kick', group: 'Stream panel', title: 'Inspect Kick page', sub: 'The hidden kick.com page the app asks Kick through', icon: 'eyeScan', when: () => devOn() && !!state?.developer?.kickPage, run: () => runAction('dev-inspect', { id: 'kick' }) },
    // Kick's daily reward
    {
      id: 'reward-claim',
      group: 'Daily reward',
      title: 'Claim the daily reward',
      sub: 'Watched an hour today',
      words: ['crate', 'chest'],
      icon: 'chest',
      chip: { text: 'Ready', tone: 'gold' },
      when: () => dailyReward()?.state === 'ready',
      run: () => {
        openReward(true);
        clickSoon('.dr-pop .dr-claim.ready');
      },
      keep: true,
      keepGroup: 'Needs you',
    },
    { id: 'reward-open', group: 'Daily reward', title: 'Open the daily reward', sub: 'Kick’s daily crate', words: ['crate', 'chest'], icon: 'chest', when: () => !!dailyReward(), run: () => runAction('reward-open') },
    {
      id: 'reward-replay',
      group: 'Daily reward',
      title: 'Replay the last reward',
      sub: 'The reveal of what it gave',
      words: ['crate', 'chest'],
      icon: 'play',
      when: () => dailyReward()?.state === 'claimed',
      run: () => {
        openReward(true);
        clickSoon('.dr-pop [data-action="reward-replay"]');
      },
    },
    { id: 'reward-kick', group: 'Daily reward', title: 'Daily reward on kick.com', sub: 'In your browser', icon: 'external', run: () => runAction('reward-kick') },
    { id: 'reward-collection', group: 'Daily reward', title: 'Your collection on kick.com', sub: 'Every card you own', icon: 'trophy', run: () => runAction('reward-collection') },
    { id: 'reward-prizes', group: 'Daily reward', title: 'Your prizes on kick.com', sub: 'Every reward you’ve won', icon: 'gift', run: () => runAction('reward-prizes') },
    // Updates
    { id: 'update-check', group: 'Updates', title: 'Check for updates', sub: () => (upd.status?.installed ? `You have ${upd.status.installed}` : 'From GitHub'), icon: 'sparkle', run: () => (openSettings('updates'), runAction('update-check')) },
    { id: 'update-install', group: 'Updates', title: 'Install the update', sub: () => `Version ${upd.status?.latest ?? ''}`, icon: 'down', when: () => upd.status?.state === 'available', run: () => (openSettings('updates'), runAction('update-install')) },
    {
      id: 'update-restart',
      group: 'Updates',
      title: 'Restart to update',
      sub: () => `Version ${upd.status?.latest ?? ''} is ready`,
      icon: 'gift',
      when: () => upd.status?.state === 'ready' && !upd.status?.needsInstall,
      run: () => runAction('update-restart'),
      keep: true,
      keepGroup: 'Needs you',
    },
    { id: 'update-page', group: 'Updates', title: 'Release page', sub: 'The newest version on GitHub', icon: 'external', when: () => !!upd.status?.latest, run: () => runAction('update-page') },
    { id: 'update-privacy', group: 'Updates', title: 'Open System Settings', sub: 'macOS is blocking the update', icon: 'settings', when: () => !!upd.status?.blocked, run: () => runAction('update-privacy') },
    { id: 'update-dmg', group: 'Updates', title: 'Use the disk image instead', sub: 'macOS is blocking the update', icon: 'download', when: () => !!upd.status?.blocked, run: () => runAction('update-dmg') },
    {
      id: 'update-home-repo',
      group: 'Updates',
      title: 'Use Pear Drops’ own repository',
      sub: () => upd.status?.homeRepo ?? '',
      icon: 'link',
      when: () => !!upd.status?.repo && !!upd.status?.homeRepo && upd.status.repo.toLowerCase() !== upd.status.homeRepo.toLowerCase(),
      run: () => runAction('update-home-repo'),
    },
    {
      id: 'update-repo',
      group: 'Updates',
      title: 'Update from another repository…',
      sub: 'Settings › Updates',
      icon: 'link',
      run: () => {
        openSettings('updates');
        requestAnimationFrame(() => document.querySelector('.upd-repo input')?.focus());
      },
    },
    { id: 'whatsnew', group: 'Updates', title: 'What’s new', sub: 'Every version’s changes', words: ['changelog', 'see every version'], icon: 'sparkle', run: () => runAction('whatsnew-all') },
    // Your data
    { id: 'backup-now', group: 'Your data', title: 'Back up now', sub: 'Your history and drop archive', words: ['backup'], icon: 'database', when: () => !!state?.backups?.possible, disabled: () => (state.backups.running ? 'Backing up already' : ''), run: () => runAction('backup-now'), done: 'Backing up' },
    { id: 'backup-show', group: 'Your data', title: 'Show the backups folder', sub: 'In your file manager', words: ['backup'], icon: 'folder', when: () => !!state?.backups, run: () => runAction('backup-show') },
    // Notifications
    { id: 'notify-test', group: 'Notifications', title: 'Send a test notification', sub: 'Checks your computer shows them', icon: 'bell', run: () => (openSettings('notifications'), runAction('notify-test')) },
    {
      id: 'notify-system',
      group: 'Notifications',
      title: 'Open system notification settings',
      sub: IS_MAC ? 'System Settings › Notifications' : 'Settings › System › Notifications',
      icon: 'settings',
      when: () => IS_MAC || navigator.platform.startsWith('Win'),
      run: () => runAction('notify-system'),
    },
    // Developer
    { id: 'dev-copy-report', group: 'Developer', title: 'Copy diagnostics', sub: 'For a problem report: your login, cookies and keys are left out', words: ['report', 'bug'], icon: 'copy', run: () => runAction('dev-copy-report'), done: 'Copied diagnostics' },
    { id: 'dev-save', group: 'Developer', title: 'Save diagnostics to Downloads', sub: 'For a problem report', words: ['report'], icon: 'download', run: () => (openSettings('developer'), runAction('dev-save')) },
    { id: 'dev-show-file', group: 'Developer', title: 'Show the saved diagnostics', sub: 'In your Downloads folder', icon: 'folder', when: () => !!dev.saved && !dev.saved.error, run: () => runAction('dev-show-file') },
    { id: 'dev-clear', group: 'Developer', title: 'Clear the Developer lists', sub: 'Errors, requests and watch events kept on this computer', icon: 'x', run: () => (openSettings('developer'), runAction('dev-clear')) },
    { id: 'dev-newer', group: 'Developer', title: 'Newer entries', sub: 'Settings › Developer', icon: 'chevronLeft', when: () => settingsOn('developer') && dev.before !== null, run: () => runAction('dev-newer') },
    { id: 'dev-older', group: 'Developer', title: 'Older entries', sub: 'Settings › Developer', icon: 'chevronRight', when: () => settingsOn('developer') && !!dev.data?.entries.length, run: () => runAction('dev-older') },
    { id: 'dev-newest', group: 'Developer', title: 'Newest entries', sub: 'Settings › Developer', icon: 'up', when: () => settingsOn('developer') && dev.before !== null, run: () => runAction('dev-newest') },
    { id: 'dev-copy-row', group: 'Developer', title: 'Copy this entry', sub: 'The one open in Settings › Developer', icon: 'copy', when: () => settingsOn('developer') && dev.open !== null && dev.open !== undefined, run: () => runAction('dev-copy-row', { n: String(dev.open) }), done: 'Copied' },
    // Connected apps › Activity, while it's open
    { id: 'act-newer', group: 'Activity', title: 'Newer messages', sub: () => `Activity with ${state.connected?.peers?.find((p) => p.id === act.app)?.name ?? ''}`, icon: 'chevronLeft', when: () => settingsOn('apps') && !!act.app && act.before !== null, run: () => runAction('act-newer') },
    { id: 'act-older', group: 'Activity', title: 'Older messages', sub: 'Connected apps › Activity', icon: 'chevronRight', when: () => settingsOn('apps') && !!act.app && !!act.data?.entries.length, run: () => runAction('act-older') },
    { id: 'act-newest', group: 'Activity', title: 'Newest messages', sub: 'Connected apps › Activity', icon: 'up', when: () => settingsOn('apps') && !!act.app && act.before !== null, run: () => runAction('act-newest') },
    { id: 'act-copy', group: 'Activity', title: 'Copy this message', sub: 'The one open in Activity', icon: 'copy', when: () => settingsOn('apps') && !!act.app && act.open !== null && act.open !== undefined, run: () => runAction('act-copy', { n: String(act.open) }), done: 'Copied' },
    // History, while it's showing
    { id: 'hist-clear', group: 'History', title: 'Clear History’s filters', sub: 'Every drop, event and word', icon: 'x', when: () => ui.view === 'history' && (!!hist.campaignId || hist.groups.length > 0 || !!hist.text), run: () => runAction('hist-clear') },
    { id: 'hist-clear-search', group: 'History', title: 'Clear History’s search', sub: () => `“${hist.text}”`, icon: 'x', when: () => ui.view === 'history' && !!hist.text, run: () => runAction('hist-clear-search') },
    // Your Kick account, and the app
    { id: 'login', group: 'Account', title: 'Sign in with Kick', sub: 'In the Kick window', icon: 'play', when: () => state?.auth?.status !== 'signed-in', run: () => runAction('login'), keep: true, keepGroup: 'Needs you' },
    { id: 'logout', group: 'Account', title: 'Sign out of Kick', sub: () => state.auth.user?.username ?? '', words: ['log out'], icon: 'logout', when: () => state?.auth?.status === 'signed-in', run: () => runAction('logout') },
    { id: 'quit', group: 'Account', title: 'Quit Pear Drops', sub: 'Stops farming', words: ['exit', 'close'], icon: 'power', last: true, run: () => window.pd.quit() },
  ]);
  // With only a prefix typed, what's used most comes first, and the account and Quit last.
  commands.order(['Farming', 'Drops', 'Watching', 'Channels', 'Rewards', 'Stream panel', 'Daily reward', 'Places', 'Streams tab', 'Coming soon', 'Settings', 'Settings pages', 'Notifications', 'Updates', 'Your data', 'Connected apps', 'Developer', 'Activity', 'History', 'Done', 'Account']);
  commands.provide('drops', () => {
    const fa = farm();
    if (!fa) return [];
    return [...fa.categories.filter((c) => !c.complete).map((c) => dropItem(c)), ...(fa.past ?? []).map(pastItem)];
  });
  commands.provide('rewards', () => (farm() ? rewardItems(farm()) : []));
  commands.provide('channels', () => (farm() ? channelItems(farm()) : []));
  commands.provide('places', () => placeItems(farm()));
  commands.provide('settings', () => (state ? settingItems() : []));
  commands.provide('apps', () =>
    (state?.connected?.peers ?? []).flatMap((p) => {
      const out = [];
      const add = (id, title, sub, ic, run, when = true) => when && out.push({ id: `app:${p.id}:${id}`, group: 'Connected apps', title, sub, icon: ic, run });
      add('allow', `Allow ${p.name} to pair`, 'Only if you just switched on Connect there', 'check', () => runAction('connected-allow', { id: p.id }), p.status === 'confirm');
      add('test', `Test the link with ${p.name}`, 'Settings › Connected apps', 'pulse', () => (openSettings('apps'), runAction('connected-test', { id: p.id })), p.enabled);
      add('pair', `Pair again with ${p.name}`, 'Start the pairing afresh', 'link', () => runAction('connected-pair-again', { id: p.id }), p.status === 'pair-again' && p.keyHeldBy === 'us');
      add('disconnect', `Disconnect ${p.name}`, 'Unlinks the two apps', 'x', () => runAction('connected-disconnect', { id: p.id }), p.status === 'connected');
      add('download', `${p.name} download page`, 'In your browser', 'download', () => runAction('open-link', { url: p.download }), !!p.download);
      return out;
    }),
  );
  // What's typed, looked for elsewhere: in History (also among the results), and on kick.com when nothing's found.
  commands.provide('search', (q) => {
    const t = String(q || '').replace(/^[>@%#]\s*/, '').trim();
    if (t.length < 2) return [];
    const history = () => openHistory({ table: 'timeline', text: t });
    return [
      { id: 'search:history', kind: 'place', group: 'History', title: `Search History for “${t}”`, sub: 'Every event recorded on this computer', icon: 'clock', run: history, last: true, elsewhere: true },
      { id: 'search:history:none', kind: 'place', group: 'History', title: `Search History for “${t}”`, sub: 'Every event recorded on this computer', icon: 'clock', run: history, fallback: true, order: 1 },
      { id: 'search:kick', kind: 'place', group: 'Kick', title: `Search kick.com for “${t}”`, sub: 'In your browser', icon: 'external', run: () => runAction('open-link', { url: `https://kick.com/search?query=${encodeURIComponent(t)}` }), fallback: true, order: 2 },
    ];
  });
  // The memory of what was run (Recent, frecency): kept in the app's database.
  window.pd.palette
    ?.get()
    .then((m) => commands.remember(m, (next) => window.pd.palette.save(next)))
    .catch(() => {});
}
