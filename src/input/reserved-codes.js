/**
 * Reserved input codes: bindings the browser or the operating system may keep
 * for itself, so a web page never (or not always) receives them.
 *
 * Levels:
 * - 'blocked'    : the browser or OS handles it; preventDefault() has no effect
 *                  in a normal tab. The page may not even see the event.
 * - 'unreliable' : works in some browsers or situations only.
 *
 * With the Keyboard Lock API active (Chromium, fullscreen only) the browser
 * hands most 'blocked' browser shortcuts to the page. Pass
 * `{ keyboardLocked: true }` to reflect that; OS-level entries stay reserved.
 */
import { MODIFIER_CODES } from './key-names.js';

/**
 * @typedef {object} ReservedInfo
 * @property {'blocked' | 'unreliable'} level
 * @property {string} reason  Human-readable, complete sentence.
 * @property {boolean} lockable  True if Keyboard Lock in fullscreen frees it.
 */

/**
 * Rules are matched on a normalized combo: modifier sides are ignored
 * (ControlLeft and ControlRight both count as "ctrl"), order is irrelevant.
 * `mods` must match exactly.
 * @type {Array<{ mods: string[], keys: string[], level: 'blocked' | 'unreliable', reason: string, lockable?: boolean }>}
 */
const RULES = [
  // --- Tab and window management: the browser acts before the page can cancel ---
  { mods: ['ctrl'], keys: ['KeyW', 'F4'], level: 'blocked', lockable: true, reason: 'The browser uses it to close the tab.' },
  { mods: ['ctrl'], keys: ['KeyT'], level: 'blocked', lockable: true, reason: 'The browser uses it to open a new tab.' },
  { mods: ['ctrl'], keys: ['KeyN'], level: 'blocked', lockable: true, reason: 'The browser uses it to open a new window.' },
  { mods: ['ctrl', 'shift'], keys: ['KeyW'], level: 'blocked', lockable: true, reason: 'The browser uses it to close the window.' },
  { mods: ['ctrl', 'shift'], keys: ['KeyT'], level: 'blocked', lockable: true, reason: 'The browser uses it to reopen a closed tab.' },
  { mods: ['ctrl', 'shift'], keys: ['KeyN', 'KeyP'], level: 'blocked', lockable: true, reason: 'The browser uses it to open a private window.' },
  { mods: ['ctrl'], keys: ['Tab', 'PageUp', 'PageDown'], level: 'blocked', lockable: true, reason: 'The browser uses it to switch tabs.' },
  { mods: ['ctrl', 'shift'], keys: ['Tab'], level: 'blocked', lockable: true, reason: 'The browser uses it to switch tabs.' },
  { mods: ['ctrl', 'shift'], keys: ['KeyQ'], level: 'blocked', reason: 'The browser uses it to quit.' },

  // --- Operating system ---
  { mods: ['alt'], keys: ['F4'], level: 'blocked', reason: 'The operating system uses it to close the window.' },
  { mods: ['alt'], keys: ['Tab'], level: 'blocked', lockable: true, reason: 'The operating system uses it to switch windows.' },
  { mods: ['ctrl', 'alt'], keys: ['Delete'], level: 'blocked', reason: 'The operating system reserves it.' },
  { mods: ['alt'], keys: ['Space'], level: 'unreliable', reason: 'The operating system may open the window menu.' },

  // --- Works in some browsers only ---
  { mods: ['ctrl'], keys: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'], level: 'unreliable', reason: 'Some browsers use it to switch tabs.' },
  { mods: ['ctrl'], keys: ['KeyQ'], level: 'unreliable', reason: 'Some browsers use it to quit.' },
  { mods: [], keys: ['F11'], level: 'unreliable', reason: 'Most browsers use it to toggle fullscreen.' },
  { mods: [], keys: ['F12'], level: 'unreliable', reason: 'Most browsers use it to open the developer tools.' },
  { mods: ['ctrl', 'shift'], keys: ['KeyI', 'KeyJ', 'KeyC'], level: 'unreliable', reason: 'Most browsers use it to open the developer tools.' },
  { mods: [], keys: ['Escape'], level: 'unreliable', lockable: true, reason: 'The browser uses it to leave fullscreen and pointer lock.' },
  { mods: ['shift'], keys: ['MouseButton2'], level: 'unreliable', reason: 'Firefox opens its context menu on Shift + right click.' },
];

const MOD_NAME = {
  ControlLeft: 'ctrl', ControlRight: 'ctrl',
  ShiftLeft: 'shift', ShiftRight: 'shift',
  AltLeft: 'alt', AltRight: 'alt',
  MetaLeft: 'meta', MetaRight: 'meta',
};

/**
 * Returns why a key or combo code is reserved, or null if it is free to bind.
 * @param {string | null | undefined} code  e.g. "ControlLeft+KeyW", "F11", "MouseButton2"
 * @param {{ keyboardLocked?: boolean }} [options]
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
  const primaryIsModifier = MODIFIER_CODES.has(primary);

  let info = null;
  if (mods.has('meta') || (primaryIsModifier && MOD_NAME[primary] === 'meta')) {
    info = { level: 'blocked', lockable: true, reason: 'The operating system reserves the Windows / Command key.' };
  } else {
    for (const rule of RULES) {
      if (!rule.keys.includes(primary)) continue;
      if (rule.mods.length !== mods.size) continue;
      if (!rule.mods.every(m => mods.has(m))) continue;
      info = { level: rule.level, lockable: rule.lockable === true, reason: rule.reason };
      break;
    }
  }

  if (!info) return null;
  if (options.keyboardLocked && info.lockable) return null;
  return info;
}

/**
 * Convenience: true if the code is reserved at any level.
 * @param {string | null | undefined} code
 * @param {{ keyboardLocked?: boolean }} [options]
 */
export function isReservedCode(code, options) {
  return getReservedInfo(code, options) !== null;
}
