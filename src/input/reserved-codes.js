/**
 * Reserved input codes: bindings the browser or the operating system may keep
 * for itself, so a web page never, or not always, receives them.
 *
 * Levels:
 * - 'blocked'         : never reaches the page.
 * - 'fullscreen-only' : reaches the page only while it is fullscreen (Chromium's
 *                       tab and window shortcuts; Alt+Tab under the guard's
 *                       Keyboard Lock); outside fullscreen the browser or the
 *                       operating system acts first.
 * - 'unreliable'      : works in some browsers or situations only. Anything not
 *                       verified stays here, never 'blocked'.
 *
 * The browser guard (browser-shortcut-guard.js) is the single source of truth for
 * what the page can cancel: its lists are matched with its own pattern logic
 * (`Mod` is Ctrl or the Windows / Command key; a pattern matches with at least
 * its modifiers), and its real decision for a bound key counts (`allow`, its
 * lists, `blockBound`). A disabled guard cancels nothing.
 *
 * The Windows / Command key depends on the platform: on a Mac it is Cmd, handled
 * through the guard's `Mod` logic; elsewhere it is the Windows key, whose combos
 * the operating system keeps. The macOS entries are not verified on a real Mac.
 */
import { MODIFIER_CODES } from './key-names.js';
import {
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
 * `null` or `enabled: false` means nothing is cancelled.
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
 * Alt+Shift+Tab counts as Alt+Tab. `keyboardLock` marks an operating system combo
 * the guard's Keyboard Lock may hand to the page in fullscreen, when the guard is
 * enabled, requests the lock and locks that key: 'verified' (the README's Keyboard
 * Lock section states it for Alt+Tab) makes it 'fullscreen-only', 'unverified'
 * makes it 'unreliable'. Otherwise the rule stays 'blocked'.
 * The four Cmd entries are macOS (not verified on a real Mac); the same combos are
 * Windows-key shortcuts elsewhere, so they are 'blocked' on every platform.
 * @type {Array<{ mods: string[], keys: string[], reason: string, keyboardLock?: 'verified' | 'unverified' }>}
 */
const BLOCKED_RULES = [
  { mods: ['ctrl', 'alt'], keys: ['Delete'], reason: 'The operating system reserves it.' },
  { mods: ['ctrl', 'shift'], keys: ['Escape'], reason: 'The operating system uses it to open the Task Manager.' },
  { mods: ['ctrl'], keys: ['Escape'], reason: 'The operating system uses it to open the Start menu.' },
  { mods: ['alt'], keys: ['Escape'], reason: 'The operating system uses it to switch windows.' },
  { mods: ['ctrl', 'shift'], keys: ['KeyQ'], reason: 'The browser uses it to quit, also in fullscreen.' },
  { mods: ['alt'], keys: ['F4'], keyboardLock: 'unverified', reason: 'The operating system uses it to close the window.' },
  { mods: ['alt'], keys: ['Tab'], keyboardLock: 'verified', reason: 'The operating system uses it to switch windows.' },
  { mods: ['meta'], keys: ['KeyQ'], reason: 'macOS uses it to quit the browser.' },
  { mods: ['meta'], keys: ['Tab'], reason: 'macOS uses it to switch applications.' },
  { mods: ['meta'], keys: ['Space'], reason: 'macOS uses it to open Spotlight.' },
  { mods: ['meta'], keys: ['KeyH'], reason: 'macOS uses it to hide the browser.' },
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
  'Mod+KeyQ': 'The browser uses it to quit.',
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

const FULLSCREEN_ONLY_PARSED = FULLSCREEN_ONLY_SHORTCUTS.map((pattern) => ({ pattern, parsed: parseShortcutPattern(pattern) }));

/**
 * The platform as a page can read it: `navigator.userAgentData.platform`, then
 * `navigator.platform`, then the user agent. Never throws.
 * @param {any} [nav] defaults to the global navigator (injectable for tests)
 * @returns {ReservedPlatform}
 */
export function detectPlatform(nav = typeof navigator === 'undefined' ? undefined : navigator) {
  try {
    const sources = [nav?.userAgentData?.platform, nav?.platform, nav?.userAgent];
    for (const value of sources) {
      if (typeof value !== 'string' || !value.trim()) continue;
      if (/mac|iphone|ipad|ipod/i.test(value)) return 'mac';
      if (/win|linux|x11|cros|chrome os|android|bsd/i.test(value)) return 'other';
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
  // A modifier bound on its own is its own primary key.
  if (MODIFIER_CODES.has(primary) && MOD_NAME[primary] === 'meta') {
    return { level: 'blocked', reason: 'The operating system reserves the Windows / Command key.' };
  }

  for (const rule of BLOCKED_RULES) {
    if (!rule.keys.includes(primary) || !rule.mods.every((m) => mods.has(m))) continue;
    if (rule.keyboardLock && _guardLocks(guard, primary)) {
      return rule.keyboardLock === 'verified'
        ? { level: 'fullscreen-only', reason: `${rule.reason.slice(0, -1)}; in fullscreen the browser guard's Keyboard Lock (Chromium only) hands it to the page.` }
        : { level: 'unreliable', reason: `${rule.reason.slice(0, -1)}; in fullscreen the browser guard's Keyboard Lock (Chromium only) may hand it to the page.` };
    }
    return { level: 'blocked', reason: rule.reason };
  }

  if (mods.has('meta') && platform === 'other') {
    return { level: 'blocked', reason: 'The operating system uses the Windows key for its own shortcuts.' };
  }
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
  const fullscreenOnly = mods.has('alt') ? null : FULLSCREEN_ONLY_PARSED.find(({ parsed }) => matchesShortcutPattern(parsed, primary, flags));
  if (fullscreenOnly) {
    const reason = FULLSCREEN_ONLY_REASONS[fullscreenOnly.pattern] ?? 'The browser uses it for tab or window management.';
    if (!guard) {
      return { level: 'fullscreen-only', reason: `${reason} In fullscreen the game has to cancel the browser's action itself; the browser guard does that.` };
    }
    if (_guardCancels(guard, primary, flags, bound)) {
      return { level: 'fullscreen-only', reason: `${reason.slice(0, -1)}; in fullscreen the browser guard cancels that.` };
    }
    return { level: 'unreliable', reason, guardLetsThrough: true };
  }

  // A Cmd combo on a Mac: the browser's own Cmd shortcut, unless the guard cancels it.
  if (mods.has('meta') && !(guard && _guardCancels(guard, primary, flags, bound))) {
    return { level: 'unreliable', reason: 'The browser may have its own Cmd shortcut for it, and nothing cancels it.' };
  }
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

/** The guard's real decision for this key: allow wins, then its lists, then blockBound for a bound key. */
function _guardCancels(guard, primary, flags, bound) {
  const matches = (list) => (list ?? []).some((pattern) => matchesShortcutPattern(parseShortcutPattern(pattern), primary, flags));
  if (matches(guard.allow)) return false;
  if (matches(guard.shortcuts) || matches(guard.block)) return true;
  return guard.blockBound !== false && bound;
}

/** True when the enabled guard requests Keyboard Lock and locks this key. */
function _guardLocks(guard, primary) {
  if (!guard || guard.keyboardLock === false) return false;
  return guard.keyboardLockKeys === null || (guard.keyboardLockKeys ?? []).includes(primary);
}
