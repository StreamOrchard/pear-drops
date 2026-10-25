// The search box (Ctrl/⌘+K, src/renderer/palette.js), from the main process's side: the key pressed inside the
// docked stream or chat (a <webview> keeps its keys, so its page never sees it), and what the box remembers of what
// was run (Recent, and how often), kept in the database as small state.

const RECENT = 20;
const USED = 300;

/**
 * Is this key (a before-input-event's input) Ctrl/⌘+K? ⌘ on a Mac, Ctrl elsewhere, so Ctrl+K on a Mac still
 * reaches Kick's own text boxes.
 */
function isPaletteKey(input, platform = process.platform) {
  if (!input || input.type !== 'keyDown' || String(input.key).toLowerCase() !== 'k' || input.alt || input.shift) return false;
  return platform === 'darwin' ? !!input.meta && !input.control : !!input.control && !input.meta;
}

/** What the page asks to save, kept to what the box uses: { recent: [ids], used: { id: { n, t } } }. */
function cleanMemory(m) {
  const id = (x) => typeof x === 'string' && x.length > 0 && x.length <= 200;
  const recent = Array.isArray(m?.recent) ? [...new Set(m.recent.filter(id))].slice(0, RECENT) : [];
  const used = Object.entries(m?.used && typeof m.used === 'object' ? m.used : {})
    .filter(([k, v]) => id(k) && Number.isFinite(v?.n) && v.n > 0 && Number.isFinite(v?.t))
    .sort((a, b) => b[1].t - a[1].t)
    .slice(0, USED)
    .map(([k, v]) => [k, { n: Math.min(1e6, Math.floor(v.n)), t: v.t }]);
  return { recent, used: Object.fromEntries(used) };
}

module.exports = { isPaletteKey, cleanMemory };
