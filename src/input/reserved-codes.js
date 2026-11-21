/**
 * Reserved input codes: bindings the browser or the operating system may keep
 * for itself, so a web page never, or not always, receives them.
 *
 * Levels:
 * - 'blocked'         : never reaches the page.
 * - 'fullscreen-only' : reaches the page only while it is fullscreen in a Chromium
 *                       browser (Chromium's tab and window shortcuts; Alt+Tab under
 *                       the guard's Keyboard Lock); outside fullscreen the browser
 *                       or the operating system acts first.
 * - 'unreliable'      : works in some browsers or situations only. Anything not
 *                       verified stays here, never 'blocked'.
 *
 * The browser guard (browser-shortcut-guard.js) is the single source of truth for
 * what the page can cancel: its lists are matched with its own pattern logic
 * (`Mod` is Ctrl or the Windows / Command key; a pattern matches with at least
 * its modifiers), and its real decision for a bound key counts (`allow`, its
 * lists, `blockBound`). A disabled guard cancels nothing.
 *
 * Keyboard Lock: under the guard's lock exactly the combos the 0.2.0 README
 * (section "What a page cannot block, and Keyboard Lock") names change level, on
 * the README's platform, with exactly their modifiers (LOCK_CHANGES): on a Mac
 * Cmd+Tab becomes 'unreliable' (README line 384); on a known non-Mac platform
 * Alt+Tab becomes 'fullscreen-only' (line 393), Alt+F4 'unreliable' (its earlier
 * level), and the bare Windows key 'unreliable' (line 384). On an unknown platform
 * the lock changes nothing. Every other combo keeps its level whatever is locked:
 * the general "every modifier combination" sentence (line 387) is not enough on
 * its own, line 388 limits it to keys the operating system lets go of, and
 * Ctrl+Alt+Del is never captured (lines 388, 400).
 *
 * The Windows / Command key depends on the platform: on a Mac it is Cmd, handled
 * through the guard's `Mod` logic; elsewhere it is the Windows key, whose combos
 * the operating system keeps. The macOS entries are not verified on a real Mac.
 */
import {
  DEFAULT_BLOCKED_SHORTCUTS,
  FULLSCREEN_ONLY_SHORTCUTS,
  matchesShortcutPattern,
  parseShortcutPattern,
} from './browser-shortcut-guard.js';

/**
 * @typedef {'blocked' | 'fullscreen-only' | 'unreliable'} ReservedLevel
 * @typedef {object} ReservedInfo
 * @property {ReservedLevel} level
 * @property {string} reason  Human-readable, complete sentence(s).
 * @property {boolean} [guardLetsThrough]  The enabled browser guard lets this
 *           browser shortcut through, so the browser also acts on it.
 */

/**
 * The effective state of a browser guard: the manager builds it from its guard
 * (`getShortcutPolicy()`, `getKeyboardLockSettings()`, the `blockBound` option).
 * Values are read the way the guard reads them: `enabled` must be truthy, a
 * missing `blockBound` or `keyboardLock` means true, otherwise truthiness counts.
 * `null` or a falsy `enabled` means nothing is cancelled.
 * @typedef {object} ReservedGuardState
 * @property {boolean} enabled
 * @property {string[]} [shortcuts]
 * @property {string[]} [block]
 * @property {string[]} [allow]
 * @property {boolean} [blockBound=true]
 * @property {boolean} [keyboardLock=true]
 * @property {readonly string[] | null} [keyboardLockKeys]  null = every key
 */

/** @typedef {'mac' | 'other' | 'unknown'} ReservedPlatform */

/**
 * Keys that never reach the page. Modifiers match "at least these", so
 * Alt+Shift+Tab counts as Alt+Tab. Under the guard's Keyboard Lock only the
 * entries of LOCK_CHANGES change level. The four Cmd entries are macOS shortcuts
 * (not verified on a real Mac) and Windows-key shortcuts elsewhere; `reasons`
 * holds the text per platform.
 * @type {Array<{ mods: string[], keys: string[], reason?: string, reasons?: Record<ReservedPlatform, string> }>}
 */
const WINDOWS_KEY_REASON = 'The operating system uses the Windows key for its own shortcuts.';
const BLOCKED_RULES = [
  { mods: ['ctrl', 'alt'], keys: ['Delete'], reason: 'The operating system reserves it.' },
  { mods: ['ctrl', 'shift'], keys: ['Escape'], reason: 'The operating system uses it to open the Task Manager.' },
  { mods: ['ctrl'], keys: ['Escape'], reason: 'The operating system uses Ctrl+Esc (the Start menu on Windows).' },
  { mods: ['alt'], keys: ['Escape'], reason: 'The operating system uses it to switch windows.' },
  { mods: ['ctrl', 'shift'], keys: ['KeyQ'], reason: 'Chromium on Windows and Linux uses it to quit, and the browser keeps quit for itself even in fullscreen.' },
  { mods: ['alt'], keys: ['F4'], reason: 'The operating system uses it to close the window.' },
  { mods: ['alt'], keys: ['Tab'], reason: 'The operating system uses it to switch windows.' },
  { mods: ['meta'], keys: ['KeyQ'], reasons: { mac: 'macOS uses it to quit the browser.', other: WINDOWS_KEY_REASON, unknown: 'macOS and Windows use it for their own shortcuts.' } },
  { mods: ['meta'], keys: ['Tab'], reasons: { mac: 'macOS uses it to switch applications.', other: WINDOWS_KEY_REASON, unknown: 'macOS and Windows use it for their own shortcuts.' } },
  { mods: ['meta'], keys: ['Space'], reasons: { mac: 'macOS uses it to open Spotlight.', other: WINDOWS_KEY_REASON, unknown: 'macOS and Windows use it for their own shortcuts.' } },
  { mods: ['meta'], keys: ['KeyH'], reasons: { mac: 'macOS uses it to hide the browser.', other: WINDOWS_KEY_REASON, unknown: 'macOS and Windows use it for their own shortcuts.' } },
];

/**
 * The complete list of level changes under the guard's Keyboard Lock (guard
 * enabled, `keyboardLock` on, the key locked): platform, EXACT modifier set, key.
 * @type {Array<{ platform: ReservedPlatform, mods: string[], keys: string[], level: ReservedLevel }>}
 */
const LOCK_CHANGES = [
  { platform: 'mac', mods: ['meta'], keys: ['Tab'], level: 'unreliable' }, // README line 384: Cmd+Tab
  { platform: 'other', mods: ['alt'], keys: ['Tab'], level: 'fullscreen-only' }, // README line 393: Alt+Tab
  { platform: 'other', mods: ['alt'], keys: ['F4'], level: 'unreliable' }, // Alt+F4: its earlier level, kept
  { platform: 'other', mods: [], keys: ['MetaLeft', 'MetaRight'], level: 'unreliable' }, // README line 384: the Windows key
];

/**
 * Keys that work in some browsers or situations only. `atLeast` rules match with
 * at least their modifiers; the others match exactly.
 * @type {Array<{ mods: string[], keys: string[], reason: string, atLeast?: boolean }>}
 */
const UNRELIABLE_RULES = [
  { mods: [], keys: ['Escape'], atLeast: true, reason: 'The browser uses it to leave fullscreen and pointer lock.' },
  { mods: [], keys: ['F11'], atLeast: true, reason: 'Most browsers use it to toggle fullscreen.' },
  { mods: [], keys: ['F12'], atLeast: true, reason: 'Most browsers use it to open the developer tools.' },
  { mods: ['ctrl', 'shift'], keys: ['KeyI', 'KeyJ', 'KeyC'], reason: 'Most browsers use it to open the developer tools.' },
  { mods: ['ctrl'], keys: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'], reason: 'Some browsers use it to switch tabs.' },
  { mods: ['ctrl', 'shift'], keys: ['KeyP'], reason: 'Firefox uses it to open a private window.' },
  { mods: ['shift'], keys: ['MouseButton2'], reason: 'Firefox opens its context menu on Shift + right click.' },
  { mods: ['alt'], keys: ['Space'], reason: 'The operating system may open the window menu.' },
];

/** What the browser does with each of the guard's fullscreen-only shortcuts. */
const FULLSCREEN_ONLY_REASONS = {
  'Mod+KeyW': 'The browser uses it to close the tab.',
  'Mod+KeyT': 'The browser uses it to open a new tab.',
  'Mod+KeyN': 'The browser uses it to open a new window.',
  'Mod+KeyQ': 'Firefox uses it to quit (Chromium uses Ctrl+Shift+Q, or Cmd+Q on macOS).',
  'Ctrl+Tab': 'The browser uses it to switch tabs.',
  'Ctrl+PageUp': 'The browser uses it to switch tabs.',
  'Ctrl+PageDown': 'The browser uses it to switch tabs.',
  'Ctrl+F4': 'The browser uses it to close the tab.',
};

const MOD_NAME = {
  ControlLeft: 'ctrl', ControlRight: 'ctrl',
  ShiftLeft: 'shift', ShiftRight: 'shift',
  AltLeft: 'alt', AltRight: 'alt',
  MetaLeft: 'meta', MetaRight: 'meta',
};

/** README line 378 (0.2.0): "Whether F1/F3/F6/F7/F12 can be cancelled is up to each browser." (F12 has its own rule.) */
const BROWSER_DECIDES_CANCEL = new Set(['F1', 'F3', 'F6', 'F7']);

const FULLSCREEN_ONLY_PARSED = FULLSCREEN_ONLY_SHORTCUTS.map((pattern) => ({ pattern, parsed: parseShortcutPattern(pattern) }));

/**
 * The guard's browser commands: its default patterns with a Ctrl / `Mod` modifier
 * (reload, save, print, find, history, zoom, Ctrl+wheel …) or on a function key
 * (F5, F1 …), minus the tab and window shortcuts (those are 'fullscreen-only').
 * Scrolling keys, the mouse buttons (the mouse runtime cancels bound ones itself)
 * and bare Alt / Slash / Quote are not included.
 */
const BROWSER_COMMAND_PARSED = DEFAULT_BLOCKED_SHORTCUTS
  .filter((pattern) => !FULLSCREEN_ONLY_SHORTCUTS.includes(pattern))
  .map(parseShortcutPattern)
  .filter((parsed) => parsed && (parsed.mods.includes('mod') || parsed.mods.includes('ctrl') || parsed.keys.every((key) => /^F\d+$/.test(key))));

/**
 * The platform as a page can read it: `navigator.userAgentData.platform`, then
 * `navigator.platform`, then the user agent. Never throws: anything unreadable,
 * including the global navigator itself, counts as 'unknown'.
 * @param {...any} args  an optional navigator (injectable for tests); without an
 *   argument the global navigator is read
 * @returns {ReservedPlatform}
 */
export function detectPlatform(...args) {
  try {
    const nav = args.length > 0 ? args[0] : globalThis.navigator;
    const sources = [nav?.userAgentData?.platform, nav?.platform, nav?.userAgent];
    for (const value of sources) {
      if (typeof value !== 'string' || !value.trim()) continue;
      if (/mac|iphone|ipad|ipod|darwin/i.test(value)) return 'mac';
      if (/windows|\bwin(16|32|64|ce)?\b|linux|x11|\bcros\b|chrome os|android|bsd/i.test(value)) return 'other';
    }
  } catch { /* an unreadable navigator counts as unknown */ }
  return 'unknown';
}

/**
 * Returns why a key or combo code is reserved, or null if it is free to bind.
 * @param {string | null | undefined} code  e.g. "ControlLeft+KeyW", "F11", "MouseButton2"
 * @param {{ guard?: ReservedGuardState | null, platform?: ReservedPlatform, bound?: boolean }} [options]
 *   `guard`: the effective state of a browser guard (default: none, nothing is
 *   cancelled). `platform`: default detectPlatform(). `bound`: whether the code is,
 *   or is about to be, bound (default true), for the guard's `blockBound`.
 * @returns {ReservedInfo | null}
 */
export function getReservedInfo(code, options = {}) {
  if (typeof code !== 'string' || code.length === 0) return null;
  const guard = options.guard?.enabled ? options.guard : null;
  const platform = options.platform ?? detectPlatform();
  const bound = options.bound !== false;
  const parts = code.split('+');
  const primary = parts[parts.length - 1];
  const mods = new Set();
  for (const part of parts.slice(0, -1)) {
    const name = MOD_NAME[part];
    if (name) mods.add(name);
  }
  const lockLevel = _guardLocks(guard, primary) ? _lockChange(platform, mods, primary) : undefined;
  const underLock = (reason) => ({ level: 'unreliable', reason: `${reason.slice(0, -1)}; in fullscreen the browser guard's Keyboard Lock (Chromium only) may hand it to the page.` });

  // The Windows / Command key, pressed last.
  if (MOD_NAME[primary] === 'meta') {
    if (platform === 'mac') return { level: 'unreliable', reason: 'On macOS the Command key reaches the page, but keys pressed while it is held are browser shortcuts (not verified on a real Mac).' };
    if (platform === 'unknown') return { level: 'unreliable', reason: 'The Windows key never reaches the page on Windows; on macOS the Command key does.' };
    const reason = 'The operating system reserves the Windows key.';
    return lockLevel === 'unreliable' ? underLock(reason) : { level: 'blocked', reason };
  }

  for (const rule of BLOCKED_RULES) {
    if (!rule.keys.includes(primary) || !rule.mods.every((m) => mods.has(m))) continue;
    const reason = rule.reasons ? rule.reasons[platform] : rule.reason;
    if (lockLevel === 'fullscreen-only') {
      return { level: 'fullscreen-only', reason: `${reason.slice(0, -1)}; in fullscreen the browser guard's Keyboard Lock (Chromium only) hands it to the page.` };
    }
    if (lockLevel === 'unreliable') return underLock(reason);
    return { level: 'blocked', reason };
  }

  // Windows-key combos: no README line says Keyboard Lock delivers them.
  if (mods.has('meta') && platform === 'other') return { level: 'blocked', reason: WINDOWS_KEY_REASON };
  if (mods.has('meta') && platform === 'unknown') {
    return { level: 'unreliable', reason: 'The operating system may use Windows / Command key combinations.' };
  }

  for (const rule of UNRELIABLE_RULES) {
    if (!rule.keys.includes(primary) || !rule.mods.every((m) => mods.has(m))) continue;
    if (!rule.atLeast && rule.mods.length !== mods.size) continue;
    return { level: 'unreliable', reason: rule.reason };
  }

  const flags = { ctrlKey: mods.has('ctrl'), shiftKey: mods.has('shift'), altKey: mods.has('alt'), metaKey: mods.has('meta') };
  // With Alt, Ctrl+Alt is AltGr on many layouts: not a browser shortcut.
  if (!mods.has('alt')) {
    const fullscreenOnly = FULLSCREEN_ONLY_PARSED.find(({ parsed }) => matchesShortcutPattern(parsed, primary, flags));
    if (fullscreenOnly) {
      const reason = FULLSCREEN_ONLY_REASONS[fullscreenOnly.pattern];
      if (!guard) {
        return { level: 'fullscreen-only', reason: `${reason} In fullscreen the game has to cancel the browser's action itself; the browser guard does that.` };
      }
      if (_guardCancels(guard, primary, flags, bound)) {
        return { level: 'fullscreen-only', reason: `${reason.slice(0, -1)}; in fullscreen the browser guard cancels that.` };
      }
      return { level: 'unreliable', reason, guardLetsThrough: true };
    }
    if (BROWSER_COMMAND_PARSED.some((parsed) => matchesShortcutPattern(parsed, primary, flags))) {
      return _uncancelled(guard, primary, flags, bound);
    }
  }
  // A Cmd combo on a Mac: the browser's own Cmd shortcut, unless the guard cancels it.
  if (mods.has('meta')) return _uncancelled(guard, primary, flags, bound);
  return null;
}

/**
 * Convenience: true if the code is reserved at any level.
 * @param {string | null | undefined} code
 * @param {{ guard?: ReservedGuardState | null, platform?: ReservedPlatform, bound?: boolean }} [options]
 */
export function isReservedCode(code, options) {
  return getReservedInfo(code, options) !== null;
}

/**
 * The one "nothing cancels it" decision, for the guard's browser commands on every
 * platform and for Cmd combos on a Mac: null when the guard cancels the key,
 * otherwise 'unreliable' (with `guardLetsThrough` while the guard is enabled).
 */
function _uncancelled(guard, primary, flags, bound) {
  if (guard && _guardCancels(guard, primary, flags, bound)) return null;
  const reason = 'The browser may have its own shortcut on it.';
  if (guard) return { level: 'unreliable', reason, guardLetsThrough: true };
  return {
    level: 'unreliable',
    reason: BROWSER_DECIDES_CANCEL.has(primary)
      ? `${reason} Nothing cancels it, and whether it can be cancelled at all is up to each browser.`
      : `${reason} Nothing cancels it; the browser guard can.`,
  };
}

/** The guard's real decision for this key: allow wins, then its lists, then blockBound for a bound key. */
function _guardCancels(guard, primary, flags, bound) {
  const matches = (list) => (list ?? []).some((pattern) => matchesShortcutPattern(parseShortcutPattern(pattern), primary, flags));
  if (matches(guard.allow)) return false;
  if (matches(guard.shortcuts) || matches(guard.block)) return true;
  return !!(guard.blockBound ?? true) && bound;
}

/** The level a LOCK_CHANGES entry gives a locked combo: same platform, exactly its modifiers. */
function _lockChange(platform, mods, primary) {
  const entry = LOCK_CHANGES.find((e) => e.platform === platform && e.keys.includes(primary)
    && mods.size === e.mods.length && e.mods.every((m) => mods.has(m)));
  return entry?.level;
}

/** True when the enabled guard requests Keyboard Lock and locks this key. */
function _guardLocks(guard, primary) {
  if (!guard || !(guard.keyboardLock ?? true)) return false;
  return guard.keyboardLockKeys === null || (guard.keyboardLockKeys ?? []).includes(primary);
}
