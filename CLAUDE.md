# Pear Drops

An Electron app that farms Kick emote and badge drops. `src/main/` is the Electron side, `src/preload/` the bridges, and `src/renderer/` the app's pages (plain scripts, no build step). `README.md` has the features, how Kick drops work, the commands and the project structure.

## Working on a change

- Use the skills in `.claude/skills/`: `start-change`, `run-dev`, `drive-app`, `open-pr`, `platform-api-probe`, `release-video`. Changes go on a branch and end as a pull request; never commit to `main`. Don't change the version or `CHANGELOG.md`.
- Tests:
  - `npm test` for unit tests (`test/unit/` mirrors `src/` file by file)
  - `npm run test:launch` for the real app in demo mode, always hidden and muted
  - `npm run test:coverage` checks per-file minimums in `test/coverage-min.json`; they can't go down

  Add tests next to similar ones for every new code path.
- Everything must work against the stand-in Kick (`src/main/demo.js`, `PD_DEMO=1`). Screenshots, videos and tests only ever show made-up channels, chatters and accounts.
- No system pop-ups in the app's pages: no `alert`/`confirm`/`prompt`, native message boxes or menus, `<datalist>`, or date pickers. `npm test` checks this.
- Developer tooling must work on Windows, macOS and Linux.

## How the app works

- Kick credits watch time from its own player's WebSocket `user_event` (`tracking.user.watch.livestream`, about every 120 s while playing). The app runs the real kick.com page in a `<webview>` docked in its own page (`watcher.js`), so its pop-ups sit over the stream, and never sends these itself.
- Kick credits **one stream per account**. `farmer.js` counts uncredited watch events to detect another session taking the credit.
- All Kick API calls run inside a hidden kick.com page (`kick-api.js`). The login token is read there and never leaves it.
- The renderer updates the DOM by morphing it (`setHTML` in `format.js`), so ticking numbers don't rebuild images or shift the layout. Charts are drawn at measured sizes and kept out of the layout flow.
- Kick's campaign list keeps ended drops (`status: "expired"`) for a few months. `archive.js` saves every drop seen (details, progress and images, served to the pages as `pd-img://`), so the Done tab and History outlive Kick's copy.
- **The search box** (Ctrl/⌘+K: `palette.js`, `commands.js`, `fuzzy.js`, and Pear Drops' own commands in `palette-items.js`) finds and does anything in the app. **Anything new a person can click, open or set gets a command there**, in the same change:
  - **A button** (a `data-action`): a command that runs the same action, with `runAction('<action>')`, so the two can't do different things.
  - **A tab or filter:** a command of its own, by name, that opens it already on it (as "Done: Missed" or "Developer: Requests" do).
  - **A setting:** a row in `SETTINGS_ROWS` in `app.js`. Its Settings page and the box both read that list, so the row is all it needs.
  - **Something left out on purpose** (a close button, one row of a list): a line in `test/palette-coverage.js`, with why.
  - Three tests hold this. `test/unit/renderer/palette-coverage.test.js` reads every page's `data-action`s and every setting in `store.js`. `test/launch/palette-coverage.test.js` opens each part of the app and checks every button, tab id and Settings control on screen. A new part of the app (a page, a dialog, a menu) gets opened in that launch test too.
- Every notable event goes to `history.js`. New features that change farming should record an event and show it in the History view.
- **Data** lives in one SQLite database, `pear-drops.db` in the data folder, through `db.js` (Node's built-in `node:sqlite`). It holds the history, the drop archive, the startup cache and small state (`security`, `updates`). Settings stay in `settings.json`, and drop images stay files.
  - Only `db.js` touches `node:sqlite`. Other modules get the `Db` (or one of its slots) passed in, and tests use `new Db(':memory:')`.
  - A schema change is a new step at the end of `MIGRATIONS` in `db.js`. Never edit a released step.
  - Launch tests read what was saved with `readDb()` from `test/launch/app.js`.
  - `backups.js` copies it to `backups/` on a schedule (Settings › Privacy & data). The Db copies itself there before a schema update, and `openDb` puts the newest good backup back when the file is damaged, recording `data-restored` (or `data-reset`) in History.

## Connected apps (Grapevine)

- **How it works.** `connected.js` links Pear Drops with other StreamOrchard apps (Stream Multiview) through `@streamorchard/grapevine`. That package (repo `StreamOrchard/grapevine`) owns:
  - the protocol and the capability schemas (`drops.farming` and `rewards.daily`, which Pear Drops provides, and `players`, which it uses)
  - the list of apps that can link
- **What goes where:**
  - **Changing what's sent** (a new field, event or method) starts in Grapevine (its `change-capability` skill), then a Grapevine release, then `npm install @streamorchard/grapevine@^<version>` here. Never edit `node_modules`, and never send fields the schema doesn't have.
  - **Something Grapevine's library can't do** (its key store, the link, its helpers) is fixed in Grapevine too: a change and a release there, then the bump here. Don't work around it with a copy in this app; Stream Multiview will need the same.
  - **A new app** is added in Grapevine's known-apps list. The cards here come from it, so it needs no code here.
  - **A new capability Pear Drops provides or uses** needs its line in `CAPABILITIES` in `src/renderer/app.js`: an icon, a few words, and the whole sentence for its tooltip. The card lists the capabilities by direction, one line each. A capability without wording still gets a plain line with its name.
- **Activity** (a card's Activity button): `activity.js` keeps every message Grapevine reports (its `message` event) and what `connected.js` notices, in memory, for this run. `src/renderer/activity.js` says each in plain words: a new method or event of a capability needs its words in `describeActivity` there.
- **Tests** use demo mode's stand-in Stream Multiview (`pdDemo.multiview()`), in a Grapevine folder of the data folder's own. Never the real app.
- **What Pear Drops speaks** is declared once, in `package.json`'s `grapevine` field: its app id, and the capability versions it provides and uses. `connected.js` reads it, and every release tag keeps it.
- **After a Pear Drops release** that adds or changes what's sent, record it in Grapevine (its `app-shipped` skill). That fixes those capability versions and lets other apps say "update Pear Drops to <version>". `start-change` runs `npm run grapevine:check` first (never `npx grapevine-check`, which would fetch a package of that name if Grapevine isn't installed), which lists any release not yet recorded and the command for it, so this isn't left to memory.
