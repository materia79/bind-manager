import { describe, it, expect, beforeEach } from 'vitest';
import { getReservedInfo, isReservedCode } from '../../src/input/reserved-codes.js';
import {
  DEFAULT_BLOCKED_SHORTCUTS,
  DEFAULT_KEYBOARD_LOCK_KEYS,
  FULLSCREEN_ONLY_SHORTCUTS,
  matchesShortcutPattern,
  parseShortcutPattern,
} from '../../src/input/browser-shortcut-guard.js';
import { createBindManager } from '../../src/core/bind-manager.js';

const level = (code, options) => getReservedInfo(code, options)?.level ?? null;

describe('getReservedInfo', () => {
  it('returns null for ordinary keys and combos', () => {
    for (const code of ['KeyW', 'F1', 'F5', 'Tab', 'Space', 'ShiftLeft+KeyC', 'AltLeft+KeyD', 'ControlLeft+KeyS', 'MouseButton2', 'MouseWheelUp']) {
      expect(getReservedInfo(code), code).toBeNull();
    }
  });

  it('returns null for empty input', () => {
    expect(getReservedInfo(null)).toBeNull();
    expect(getReservedInfo(undefined)).toBeNull();
    expect(getReservedInfo('')).toBeNull();
  });

  it("reports the guard's tab and window shortcuts as fullscreen-only", () => {
    for (const code of ['ControlLeft+KeyW', 'ControlRight+KeyW', 'ControlLeft+KeyT', 'ControlLeft+KeyN', 'ControlLeft+KeyQ',
      'ControlLeft+Tab', 'ControlLeft+ShiftLeft+Tab', 'ControlLeft+PageUp', 'ControlLeft+PageDown', 'ControlLeft+F4',
      'ControlLeft+ShiftLeft+KeyT', 'ControlLeft+ShiftLeft+KeyW', 'ControlLeft+ShiftLeft+KeyN']) {
      expect(level(code), code).toBe('fullscreen-only');
    }
  });

  it("matches the guard's patterns with at least their modifiers", () => {
    // Ctrl+Alt+W is not a Chromium shortcut, but the guard's Mod+KeyW covers it.
    expect(level('ControlLeft+AltLeft+KeyW')).toBe('fullscreen-only');
    expect(getReservedInfo('ShiftLeft+KeyW')).toBeNull();
  });

  it('reports keys that never reach the page as blocked, operating system combos with at least their modifiers', () => {
    for (const code of ['MetaLeft', 'MetaRight', 'ControlLeft+AltLeft+Delete', 'ControlLeft+ShiftLeft+Escape', 'ControlLeft+Escape',
      'AltLeft+Escape', 'ControlLeft+ShiftLeft+KeyQ', 'ControlLeft+AltLeft+ShiftLeft+Delete']) {
      expect(level(code), code).toBe('blocked');
    }
  });

  it('Alt+Tab: Tab is in the guard lock list, so fullscreen-only (with extra modifiers too); Alt+F4 is unreliable', () => {
    expect(DEFAULT_KEYBOARD_LOCK_KEYS).toContain('Tab');
    expect(level('AltLeft+Tab')).toBe('fullscreen-only');
    expect(level('AltLeft+ShiftLeft+Tab')).toBe('fullscreen-only');
    expect(level('AltLeft+F4')).toBe('unreliable');
  });

  it('macOS: Cmd+Q, Cmd+Tab, Cmd+Space and Cmd+H are blocked; Cmd combos the guard can cancel are not reported', () => {
    for (const code of ['MetaLeft+KeyQ', 'MetaLeft+Tab', 'MetaLeft+Space', 'MetaLeft+KeyH']) expect(level(code), code).toBe('blocked');
    for (const code of ['MetaLeft+KeyR', 'MetaLeft+KeyS', 'MetaLeft+KeyD', 'MetaLeft+Equal']) expect(getReservedInfo(code), code).toBeNull();
    expect(level('MetaLeft+KeyW')).toBe('fullscreen-only');
    expect(level('MetaLeft+KeyE')).toBe('unreliable');
  });

  it('reports browser-dependent keys as unreliable; Escape is never freed', () => {
    for (const code of ['Escape', 'F11', 'F12', 'ControlLeft+ShiftLeft+KeyI', 'ControlLeft+ShiftLeft+KeyJ', 'ControlLeft+ShiftLeft+KeyC',
      'ControlLeft+Digit1', 'ControlLeft+Digit9', 'ControlLeft+ShiftLeft+KeyP', 'ShiftLeft+MouseButton2', 'AltLeft+Space']) {
      expect(level(code), code).toBe('unreliable');
    }
    expect(level('Escape', { shortcutPolicy: { shortcuts: [...DEFAULT_BLOCKED_SHORTCUTS], block: ['Escape'], allow: [] } })).toBe('unreliable');
  });

  it("follows a configured guard's policy: a fullscreen-only shortcut it lets through is unreliable", () => {
    const policy = (over) => ({ shortcuts: [...DEFAULT_BLOCKED_SHORTCUTS], block: [], allow: [], ...over });
    expect(level('ControlLeft+KeyW', { shortcutPolicy: policy({}) })).toBe('fullscreen-only');
    expect(level('ControlLeft+KeyW', { shortcutPolicy: policy({ allow: ['Mod+KeyW'] }) })).toBe('unreliable');
    expect(level('ControlLeft+KeyT', { shortcutPolicy: policy({ shortcuts: [] }) })).toBe('unreliable');
    expect(level('ControlLeft+KeyT', { shortcutPolicy: policy({ shortcuts: [], block: ['Mod+KeyT'] }) })).toBe('fullscreen-only');
    // A Cmd combo the configured guard does not cancel is reported.
    expect(level('MetaLeft+KeyR', { shortcutPolicy: policy({ allow: ['Mod+KeyR'] }) })).toBe('unreliable');
  });

  it('gives a reason as a sentence for every level', () => {
    for (const code of ['ControlLeft+KeyW', 'MetaLeft', 'F11', 'AltLeft+Tab', 'AltLeft+F4']) {
      expect(getReservedInfo(code)?.reason, code).toMatch(/^[A-Z].*\.$/);
    }
  });

  it('isReservedCode mirrors getReservedInfo', () => {
    expect(isReservedCode('ControlLeft+KeyW')).toBe(true);
    expect(isReservedCode('KeyW')).toBe(false);
  });
});

describe('consistency with the browser guard', () => {
  const MODS = ['ControlLeft', 'ShiftLeft', 'AltLeft', 'MetaLeft'];
  const KEYS = [
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => `Key${c}`),
    ...'0123456789'.split('').map((d) => `Digit${d}`),
    ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
    'Tab', 'PageUp', 'PageDown', 'Escape', 'Delete', 'Space', 'Equal', 'Minus', 'MouseButton2', 'MouseButton3',
  ];
  const allCodes = () => {
    const out = [];
    for (let mask = 0; mask < 1 << MODS.length; mask += 1) {
      const mods = MODS.filter((_, i) => mask & (1 << i));
      for (const key of KEYS) out.push([...mods, key].join('+'));
    }
    return out;
  };
  const flagsOf = (code) => {
    const parts = code.split('+');
    return { primary: parts.at(-1), flags: { ctrlKey: parts.includes('ControlLeft'), shiftKey: parts.includes('ShiftLeft'), altKey: parts.includes('AltLeft'), metaKey: parts.includes('MetaLeft') } };
  };

  it("FULLSCREEN_ONLY_SHORTCUTS is part of the guard's default list, and its keys are in the guard's lock list", () => {
    for (const pattern of FULLSCREEN_ONLY_SHORTCUTS) {
      expect(DEFAULT_BLOCKED_SHORTCUTS, pattern).toContain(pattern);
      expect(DEFAULT_KEYBOARD_LOCK_KEYS, pattern).toContain(parseShortcutPattern(pattern).keys[0]);
    }
  });

  it("every fullscreen-only code is in the guard's lists (REQUIRED)", () => {
    const blocked = DEFAULT_BLOCKED_SHORTCUTS.map(parseShortcutPattern);
    let checked = 0;
    for (const code of allCodes()) {
      if (level(code) !== 'fullscreen-only') continue;
      checked += 1;
      const { primary, flags } = flagsOf(code);
      const inBlockedList = blocked.some((parsed) => matchesShortcutPattern(parsed, primary, flags));
      const inLockList = DEFAULT_KEYBOARD_LOCK_KEYS.includes(primary);
      expect(inBlockedList || inLockList, code).toBe(true);
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe('manager.getReservedBindings', () => {
  let n = 0;
  beforeEach(() => { n += 1; document.body.innerHTML = ''; });

  it('lists reserved keyboard and mouse bindings among the current ones', () => {
    const manager = createBindManager({ namespace: `reserved-test-${n}` });
    manager.registerAction({ id: 'close-bag', slots: 2, defaultBindings: ['ControlLeft+KeyW', 'KeyB'] });
    manager.registerAction({ id: 'menu', slots: 1, defaultBindings: ['ShiftLeft+MouseButton2'] });
    manager.registerAction({ id: 'walk', slots: 1, defaultBindings: ['KeyW'] });

    const found = manager.getReservedBindings();
    expect(found).toEqual([
      { actionId: 'close-bag', slot: 0, code: 'ControlLeft+KeyW', level: 'fullscreen-only', reason: expect.stringMatching(/close the tab/) },
      { actionId: 'menu', slot: 0, code: 'ShiftLeft+MouseButton2', level: 'unreliable', reason: expect.stringMatching(/context menu/) },
    ]);
    manager.destroy?.();
  });

  it("follows the manager's guard while it is enabled", () => {
    const manager = createBindManager({ namespace: `reserved-test-${n}`, browserGuard: { enabled: true, allow: ['Mod+KeyW'] } });
    manager.registerAction({ id: 'close-bag', slots: 1, defaultBindings: ['ControlLeft+KeyW'] });
    expect(manager.getReservedBindings()[0].level).toBe('unreliable');
    manager.browserGuard.setEnabled(false);
    expect(manager.getReservedBindings()[0].level).toBe('fullscreen-only');
    manager.destroy?.();
  });

  it('has no keyboard-lock option or argument any more', () => {
    const manager = createBindManager({ namespace: `reserved-test-${n}`, isKeyboardLocked: () => true });
    manager.registerAction({ id: 'close-bag', slots: 1, defaultBindings: ['ControlLeft+KeyW'] });
    expect(manager.getReservedBindings({ keyboardLocked: true })[0].level).toBe('fullscreen-only');
    expect(level('ControlLeft+KeyW', { keyboardLocked: true })).toBe('fullscreen-only');
    manager.destroy?.();
  });
});
