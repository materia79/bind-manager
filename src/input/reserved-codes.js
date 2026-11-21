/**
 * Reserved input codes: bindings the browser or the operating system may keep
 * for itself, so a web page never, or not always, receives them.
 *
 * Levels:
 * - 'blocked'         : never reaches the page (operating system keys, secure
 *                       sequences, the browser's quit command).
 * - 'fullscreen-only' : reaches the page only while it is fullscreen (Chromium's
 *                       tab and window shortcuts); outside fullscreen the browser
 *                       acts first. Membership comes from the browser guard's lists.
 * - 'unreliable'      : works in some browsers or situations only. Anything not
 *                       verified stays here, never 'blocked'.
 *
 * The browser guard (browser-shortcut-guard.js) is the single source of truth for
 * what the page can cancel: shortcuts in its lists are matched with its own
 * pattern logic, so `Mod` covers Ctrl and the Windows / Command key alike, and a
 * pattern matches with at least its modifiers. A Windows / Command combo the guard
 * can cancel is therefore not reported.
 *
 * The macOS entries (Cmd+Q, Cmd+Tab, Cmd+Space, Cmd+H) are not verified on a real
 * Mac.
 */
import { MODIFIER_CODES } from './key-names.js';
import {
  DEFAULT_BLOCKED_SHORTCUTS,
  DEFAULT_KEYBOARD_LOCK_KEYS,
  FULLSCREEN_ONLY_SHORTCUTS,
  matchesShortcutPattern,
  parseShortcutPattern,
} from './browser-shortcut-guard.js';

/**
 * @typedef {'blocked' | 'fullscreen-only' | 'unreliable'} ReservedLevel
 * @typedef {object} ReservedInfo
 * @property {ReservedLevel} level
 * @property {string} reason  Human-readable, complete sentence.
 */

/**
 * The shortcut policy of a configured browser guard, as `getShortcutPolicy()`
 * returns it. Without one, the guard's defaults apply.
 * @typedef {{ shortcuts?: string[], block?: string[], allow?: string[] }} ShortcutPolicy
 */

/**
 * Keys that never reach the page. Modifiers match "at least these", so
 * Alt+Shift+Tab counts as Alt+Tab. `keyboardLock` marks an operating system combo
 * whose key is in the guard's lock list (DEFAULT_KEYBOARD_LOCK_KEYS), so Keyboard
 * Lock may hand it to the page in fullscreen: 'verified' (the README's Keyboard Lock
 * section states it for Alt+Tab) makes it 'fullscreen-only', 'unverified' makes it
 * 'unreliable'. Without its key in the lock list the rule stays 'blocked'.
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
  // macOS (not verified on a real Mac).
  { mods: ['meta'], keys: ['KeyQ'], reason: 'macOS uses it to quit the browser.' },
  { mods: ['meta'], keys: ['Tab'], reason: 'macOS uses it to switch applications.' },
  { mods: ['meta'], keys: ['Space'], reason: 'macOS uses it to open Spotlight.' },
  { mods: ['meta'], keys: ['KeyH'], reason: 'macOS uses it to hide the browser.' },
];

/**
 * Keys that work in some browsers or situations only. Modifiers match exactly.
 * @type {Array<{ mods: string[], keys: string[], reason: string }>}
 */
const UNRELIABLE_RULES = [
  { mods: [], keys: ['Escape'], reason: 'The browser uses it to leave fullscreen and pointer lock.' },
  { mods: [], keys: ['F11'], reason: 'Most browsers use it to toggle fullscreen.' },
  { mods: [], keys: ['F12'], reason: 'Most browsers use it to open the developer tools.' },
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
const DEFAULT_BLOCKED_PARSED = DEFAULT_BLOCKED_SHORTCUTS.map(parseShortcutPattern).filter(Boolean);

/**
 * Returns why a key or combo code is reserved, or null if it is free to bind.
 * @param {string | null | undefined} code  e.g. "ControlLeft+KeyW", "F11", "MouseButton2"
 * @param {{ shortcutPolicy?: ShortcutPolicy | null }} [options]
 *   `shortcutPolicy`: the policy of a configured browser guard; a fullscreen-only
 *   shortcut it does not cancel is reported as 'unreliable'.
 * @returns {ReservedInfo | null}
 */
export function getReservedInfo(code, options = {}) {
  if (typeof code !== 'string' || code.length === 0) return null;
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
    if (rule.keyboardLock && DEFAULT_KEYBOARD_LOCK_KEYS.includes(primary)) {
      return rule.keyboardLock === 'verified'
        ? { level: 'fullscreen-only', reason: `${rule.reason.slice(0, -1)}; in fullscreen, Keyboard Lock (Chromium only) hands it to the page.` }
        : { level: 'unreliable', reason: `${rule.reason.slice(0, -1)}; in fullscreen, Keyboard Lock (Chromium only) may hand it to the page.` };
    }
    return { level: 'blocked', reason: rule.reason };
  }

  for (const rule of UNRELIABLE_RULES) {
    if (!rule.keys.includes(primary) || rule.mods.length !== mods.size || !rule.mods.every((m) => mods.has(m))) continue;
    return { level: 'unreliable', reason: rule.reason };
  }

  const flags = { ctrlKey: mods.has('ctrl'), shiftKey: mods.has('shift'), altKey: mods.has('alt'), metaKey: mods.has('meta') };
  const policy = options.shortcutPolicy ?? null;
  const fullscreenOnly = FULLSCREEN_ONLY_PARSED.find(({ parsed }) => matchesShortcutPattern(parsed, primary, flags));
  if (fullscreenOnly) {
    const reason = FULLSCREEN_ONLY_REASONS[fullscreenOnly.pattern] ?? 'The browser uses it for tab or window management.';
    if (policy && !_policyCancels(policy, primary, flags)) {
      return { level: 'unreliable', reason: `${reason.slice(0, -1)}, and the browser guard is set to let it through.` };
    }
    return { level: 'fullscreen-only', reason };
  }

  if (mods.has('meta')) {
    const cancellable = policy
      ? _policyCancels(policy, primary, flags)
      : DEFAULT_BLOCKED_PARSED.some((parsed) => matchesShortcutPattern(parsed, primary, flags));
    if (!cancellable) return { level: 'unreliable', reason: 'The operating system may use Windows / Command key combinations.' };
  }
  return null;
}

/**
 * Convenience: true if the code is reserved at any level.
 * @param {string | null | undefined} code
 * @param {{ shortcutPolicy?: ShortcutPolicy | null }} [options]
 */
export function isReservedCode(code, options) {
  return getReservedInfo(code, options) !== null;
}

/** True when a guard with this policy cancels the key: blocked by its lists, not allowed. */
function _policyCancels(policy, primary, flags) {
  const matches = (list) => (list ?? []).some((pattern) => matchesShortcutPattern(parseShortcutPattern(pattern), primary, flags));
  if (matches(policy.allow)) return false;
  return matches(policy.shortcuts ?? DEFAULT_BLOCKED_SHORTCUTS) || matches(policy.block);
}
