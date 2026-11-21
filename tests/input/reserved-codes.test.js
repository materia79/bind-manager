import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectPlatform, getReservedInfo, isReservedCode } from '../../src/input/reserved-codes.js';
import {
  DEFAULT_BLOCKED_SHORTCUTS,
  DEFAULT_KEYBOARD_LOCK_KEYS,
  FULLSCREEN_ONLY_SHORTCUTS,
  matchesShortcutPattern,
  parseShortcutPattern,
} from '../../src/input/browser-shortcut-guard.js';
import { createBindManager } from '../../src/core/bind-manager.js';

/** An enabled guard in its default configuration, with overrides. */
const guardState = (over = {}) => ({
  enabled: true, shortcuts: [...DEFAULT_BLOCKED_SHORTCUTS], block: [], allow: [], blockBound: true,
  keyboardLock: true, keyboardLockKeys: [...DEFAULT_KEYBOARD_LOCK_KEYS], ...over,
});
const info = (code, options = {}) => getReservedInfo(code, { platform: 'other', ...options });
const level = (code, options) => info(code, options)?.level ?? null;

describe('getReservedInfo', () => {
  it('returns null for ordinary keys and combos', () => {
    for (const code of ['KeyW', 'F1', 'F5', 'Tab', 'Space', 'ShiftLeft+KeyC', 'AltLeft+KeyD', 'ControlLeft+KeyS', 'MouseButton2', 'MouseWheelUp']) {
      expect(info(code), code).toBeNull();
    }
  });

  it('returns null for empty input', () => {
    expect(getReservedInfo(null)).toBeNull();
    expect(getReservedInfo(undefined)).toBeNull();
    expect(getReservedInfo('')).toBeNull();
  });

  it("reports the guard's tab and window shortcuts as fullscreen-only, also with Shift", () => {
    for (const code of ['ControlLeft+KeyW', 'ControlRight+KeyW', 'ControlLeft+KeyT', 'ControlLeft+KeyN', 'ControlLeft+KeyQ',
      'ControlLeft+Tab', 'ControlLeft+ShiftLeft+Tab', 'ControlLeft+PageUp', 'ControlLeft+PageDown', 'ControlLeft+F4',
      'ControlLeft+ShiftLeft+KeyT', 'ControlLeft+ShiftLeft+KeyW', 'ControlLeft+ShiftLeft+KeyN']) {
      expect(level(code), code).toBe('fullscreen-only');
      expect(level(code, { guard: guardState() }), code).toBe('fullscreen-only');
    }
  });

  it('L1: never fullscreen-only with Alt in the combo (Ctrl+Alt is AltGr on many layouts)', () => {
    for (const code of ['ControlLeft+AltLeft+KeyW', 'ControlLeft+AltRight+KeyT', 'ControlLeft+AltLeft+Tab']) {
      expect(level(code), code).not.toBe('fullscreen-only');
    }
    expect(info('ControlLeft+AltLeft+KeyW')).toBeNull();
    expect(info('ShiftLeft+KeyW')).toBeNull();
  });

  it('M2: with the guard disabled the reason says the game has to cancel the browser action, naming the browser guard', () => {
    const disabled = info('ControlLeft+KeyW', { guard: null });
    expect(disabled.level).toBe('fullscreen-only');
    expect(disabled.reason).toMatch(/close the tab\. In fullscreen the game has to cancel the browser's action itself; the browser guard does that\.$/);
    expect(info('ControlLeft+KeyW', { guard: guardState({ enabled: false }) })).toEqual(disabled);
    expect(info('ControlLeft+KeyW', { guard: guardState() }).reason).toMatch(/the browser guard cancels that\.$/);
  });

  it('M1: the level follows the guard\'s real decision for a bound key (blockBound)', () => {
    // shortcuts [] but blockBound (default true): the guard cancels the bound key.
    expect(level('ControlLeft+KeyW', { guard: guardState({ shortcuts: [] }) })).toBe('fullscreen-only');
    // block brings it back explicitly.
    expect(level('ControlLeft+KeyW', { guard: guardState({ shortcuts: [], blockBound: false, block: ['Mod+KeyW'] }) })).toBe('fullscreen-only');
    // Really let through: allow, or blockBound:false and not in the lists.
    for (const guard of [guardState({ allow: ['Mod+KeyW'] }), guardState({ shortcuts: [], blockBound: false })]) {
      const letThrough = info('ControlLeft+KeyW', { guard });
      expect(letThrough).toEqual({ level: 'unreliable', reason: 'The browser uses it to close the tab.', guardLetsThrough: true });
    }
    // An unbound code with blockBound but not in the lists is let through.
    expect(info('ControlLeft+KeyW', { guard: guardState({ shortcuts: [] }), bound: false })?.guardLetsThrough).toBe(true);
  });

  it('reports keys that never reach the page as blocked, operating system combos with at least their modifiers', () => {
    for (const code of ['MetaLeft', 'MetaRight', 'ControlLeft+AltLeft+Delete', 'ControlLeft+ShiftLeft+Escape', 'ControlLeft+Escape',
      'AltLeft+Escape', 'ControlLeft+ShiftLeft+KeyQ', 'ControlLeft+AltLeft+ShiftLeft+Delete']) {
      expect(level(code), code).toBe('blocked');
    }
  });

  it('M2: Alt+Tab is fullscreen-only only while the guard is enabled, requests Keyboard Lock and locks Tab; otherwise blocked', () => {
    expect(level('AltLeft+Tab', { guard: guardState() })).toBe('fullscreen-only');
    expect(level('AltLeft+ShiftLeft+Tab', { guard: guardState() })).toBe('fullscreen-only');
    expect(level('AltLeft+Tab', { guard: guardState({ keyboardLockKeys: null }) })).toBe('fullscreen-only');
    expect(level('AltLeft+Tab', { guard: null })).toBe('blocked');
    expect(level('AltLeft+Tab', { guard: guardState({ enabled: false }) })).toBe('blocked');
    expect(level('AltLeft+Tab', { guard: guardState({ keyboardLock: false }) })).toBe('blocked');
    expect(level('AltLeft+Tab', { guard: guardState({ keyboardLockKeys: ['KeyW'] }) })).toBe('blocked');
    // Alt+F4: unverified under the lock, so unreliable there; blocked without it.
    expect(level('AltLeft+F4', { guard: guardState() })).toBe('unreliable');
    expect(level('AltLeft+F4', { guard: null })).toBe('blocked');
  });

  it('M3: Windows-key combos by platform: Mac uses the Mod logic, others are blocked, unknown is unreliable', () => {
    const mac = (code, guard) => getReservedInfo(code, { platform: 'mac', guard })?.level ?? null;
    // Mac
    for (const code of ['MetaLeft+KeyQ', 'MetaLeft+Tab', 'MetaLeft+Space', 'MetaLeft+KeyH']) expect(mac(code), code).toBe('blocked');
    expect(mac('MetaLeft+KeyW')).toBe('fullscreen-only');
    expect(mac('MetaLeft+KeyR', guardState())).toBeNull(); // the guard cancels Cmd+R
    expect(mac('MetaLeft+KeyE', guardState())).toBeNull(); // bound, blockBound
    expect(mac('MetaLeft+KeyR', null)).toBe('unreliable'); // M2: nothing cancels it
    expect(mac('MetaLeft+KeyS', guardState({ enabled: false }))).toBe('unreliable');
    expect(mac('MetaLeft+KeyR', guardState({ allow: ['Mod+KeyR'] }))).toBe('unreliable');
    // Not a Mac
    for (const code of ['MetaLeft+KeyW', 'MetaLeft+KeyR', 'MetaLeft+KeyE', 'MetaLeft+KeyD']) {
      expect(getReservedInfo(code, { platform: 'other', guard: guardState() })?.level, code).toBe('blocked');
    }
    // Unknown
    for (const code of ['MetaLeft+KeyW', 'MetaLeft+KeyR', 'MetaLeft+KeyE']) {
      expect(getReservedInfo(code, { platform: 'unknown', guard: guardState() })?.level, code).toBe('unreliable');
    }
    expect(getReservedInfo('MetaLeft+KeyQ', { platform: 'unknown' })?.level).toBe('blocked');
  });

  it('L2: Escape with any modifiers is unreliable unless a blocked rule matches; F11 and F12 with at least their modifiers', () => {
    for (const code of ['Escape', 'ShiftLeft+Escape', 'ControlLeft+F12', 'ShiftLeft+F11', 'AltLeft+ShiftLeft+F12', 'F11', 'F12']) {
      expect(level(code), code).toBe('unreliable');
    }
    for (const code of ['ControlLeft+Escape', 'AltLeft+Escape', 'ControlLeft+ShiftLeft+Escape']) expect(level(code), code).toBe('blocked');
    expect(level('Escape', { guard: guardState({ block: ['Escape'] }) })).toBe('unreliable');
  });

  it('reports the other browser-dependent keys as unreliable', () => {
    for (const code of ['ControlLeft+ShiftLeft+KeyI', 'ControlLeft+ShiftLeft+KeyJ', 'ControlLeft+ShiftLeft+KeyC',
      'ControlLeft+Digit1', 'ControlLeft+Digit9', 'ControlLeft+ShiftLeft+KeyP', 'ShiftLeft+MouseButton2', 'AltLeft+Space']) {
      expect(level(code), code).toBe('unreliable');
    }
  });

  it('gives a reason as complete sentences for every level', () => {
    for (const code of ['ControlLeft+KeyW', 'MetaLeft', 'F11', 'AltLeft+Tab', 'AltLeft+F4', 'MetaLeft+KeyE']) {
      expect(info(code, { guard: guardState() })?.reason, code).toMatch(/^[A-Z].*\.$/);
      expect(info(code)?.reason, code).toMatch(/^[A-Z].*\.$/);
    }
  });

  it('isReservedCode mirrors getReservedInfo', () => {
    expect(isReservedCode('ControlLeft+KeyW', { platform: 'other' })).toBe(true);
    expect(isReservedCode('KeyW', { platform: 'other' })).toBe(false);
  });
});

describe('M3: platform detection', () => {
  it('reads userAgentData.platform first, then navigator.platform, then the user agent', () => {
    expect(detectPlatform({ userAgentData: { platform: 'macOS' }, platform: 'Win32' })).toBe('mac');
    expect(detectPlatform({ userAgentData: { platform: 'Windows' } })).toBe('other');
    expect(detectPlatform({ userAgentData: { platform: '' }, platform: 'MacIntel' })).toBe('mac');
    expect(detectPlatform({ platform: 'Win32' })).toBe('other');
    expect(detectPlatform({ platform: 'Linux x86_64' })).toBe('other');
    expect(detectPlatform({ platform: '', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })).toBe('mac');
    expect(detectPlatform({ platform: '', userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)' })).toBe('other');
    expect(detectPlatform({ platform: 'iPad' })).toBe('mac');
  });

  it('is unknown when nothing is readable, and never throws', () => {
    expect(detectPlatform({})).toBe('unknown');
    expect(detectPlatform(null)).toBe('unknown'); // no navigator at all (undefined falls back to the global one)
    expect(detectPlatform({ platform: '', userAgent: 'SomeBrowser/1.0' })).toBe('unknown');
    const hostile = { get userAgentData() { throw new Error('no'); } };
    expect(detectPlatform(hostile)).toBe('unknown');
  });
});

describe('L3: consistency with the browser guard (REQUIRED)', () => {
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
  const FULLSCREEN = FULLSCREEN_ONLY_SHORTCUTS.map(parseShortcutPattern);
  // The one lock-derived rule, named: Alt (+ anything) + Tab while the guard locks Tab.
  const isAltTabLockRule = (primary, flags, guard) => primary === 'Tab' && flags.altKey
    && !!guard?.enabled && guard.keyboardLock !== false && (guard.keyboardLockKeys === null || guard.keyboardLockKeys.includes('Tab'));

  const contexts = {
    'guard disabled': null,
    'default policy': guardState(),
    'custom policy': guardState({ shortcuts: ['Mod+KeyW', 'Ctrl+Tab'], allow: ['Mod+KeyT'], keyboardLockKeys: ['Tab', 'KeyW'] }),
  };

  it("FULLSCREEN_ONLY_SHORTCUTS is part of the guard's default list, and its keys are in the guard's lock list", () => {
    for (const pattern of FULLSCREEN_ONLY_SHORTCUTS) {
      expect(DEFAULT_BLOCKED_SHORTCUTS, pattern).toContain(pattern);
      expect(DEFAULT_KEYBOARD_LOCK_KEYS, pattern).toContain(parseShortcutPattern(pattern).keys[0]);
    }
  });

  for (const [name, guard] of Object.entries(contexts)) {
    for (const platform of ['mac', 'other', 'unknown']) {
      it(`every fullscreen-only code matches a guard pattern or is the Alt+Tab lock rule (${name}, ${platform})`, () => {
        let checked = 0;
        for (const code of allCodes()) {
          if (getReservedInfo(code, { guard, platform })?.level !== 'fullscreen-only') continue;
          checked += 1;
          const { primary, flags } = flagsOf(code);
          const guardPattern = !flags.altKey && FULLSCREEN.some((parsed) => matchesShortcutPattern(parsed, primary, flags));
          expect(guardPattern || isAltTabLockRule(primary, flags, guard), code).toBe(true);
        }
        expect(checked).toBeGreaterThan(10);
      });
    }
  }
});

describe('manager.getReservedBindings', () => {
  let n = 0;
  let originalNavigator;
  beforeEach(() => {
    n += 1;
    document.body.innerHTML = '';
    originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  });
  afterEach(() => {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  });
  // The real navigator with only the platform fields replaced (getGamepads etc. stay).
  const asPlatform = (platform) => Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: Object.create(originalNavigator.get ? originalNavigator.get.call(globalThis) : originalNavigator.value, {
      platform: { value: platform }, userAgent: { value: '' }, userAgentData: { value: undefined },
    }),
  });

  it('lists reserved keyboard and mouse bindings among the current ones (guard disabled, the default)', () => {
    const manager = createBindManager({ namespace: `reserved-test-${n}` });
    manager.registerAction({ id: 'close-bag', slots: 2, defaultBindings: ['ControlLeft+KeyW', 'KeyB'] });
    manager.registerAction({ id: 'menu', slots: 1, defaultBindings: ['ShiftLeft+MouseButton2'] });
    manager.registerAction({ id: 'walk', slots: 1, defaultBindings: ['KeyW'] });

    expect(manager.getReservedBindings()).toEqual([
      { actionId: 'close-bag', slot: 0, code: 'ControlLeft+KeyW', level: 'fullscreen-only', reason: expect.stringMatching(/close the tab\. In fullscreen the game has to cancel/) },
      { actionId: 'menu', slot: 0, code: 'ShiftLeft+MouseButton2', level: 'unreliable', reason: expect.stringMatching(/context menu/) },
    ]);
    manager.destroy?.();
  });

  it("follows the manager's guard: blockBound cancels a bound key, allow lets it through", () => {
    const blockBound = createBindManager({ namespace: `reserved-test-${n}-a`, browserGuard: { enabled: true, shortcuts: [] } });
    blockBound.registerAction({ id: 'close-bag', slots: 1, defaultBindings: ['ControlLeft+KeyW'] });
    expect(blockBound.getReservedBindings()[0]).toMatchObject({ level: 'fullscreen-only', reason: expect.stringMatching(/guard cancels that/) });
    blockBound.destroy?.();

    const allow = createBindManager({ namespace: `reserved-test-${n}-b`, browserGuard: { enabled: true, allow: ['Mod+KeyW'] } });
    allow.registerAction({ id: 'close-bag', slots: 1, defaultBindings: ['ControlLeft+KeyW'] });
    expect(allow.getReservedBindings()[0]).toMatchObject({ level: 'unreliable', guardLetsThrough: true });
    allow.browserGuard.setEnabled(false);
    expect(allow.getReservedBindings()[0]).toMatchObject({ level: 'fullscreen-only', reason: expect.stringMatching(/game has to cancel/) });
    allow.destroy?.();

    const notBound = createBindManager({ namespace: `reserved-test-${n}-c`, browserGuard: { enabled: true, shortcuts: [], blockBound: false } });
    notBound.registerAction({ id: 'close-bag', slots: 1, defaultBindings: ['ControlLeft+KeyW'] });
    expect(notBound.getReservedBindings()[0]).toMatchObject({ level: 'unreliable', guardLetsThrough: true });
    notBound.destroy?.();
  });

  it("Alt+Tab follows the manager's guard lock settings", () => {
    const off = createBindManager({ namespace: `reserved-test-${n}-d` });
    off.registerAction({ id: 'switch', slots: 1, defaultBindings: ['AltLeft+Tab'] });
    expect(off.getReservedBindings()[0].level).toBe('blocked');
    off.destroy?.();
    const on = createBindManager({ namespace: `reserved-test-${n}-e`, browserGuard: true });
    on.registerAction({ id: 'switch', slots: 1, defaultBindings: ['AltLeft+Tab'] });
    expect(on.getReservedBindings()[0].level).toBe('fullscreen-only');
    on.destroy?.();
    const noLock = createBindManager({ namespace: `reserved-test-${n}-f`, browserGuard: { keyboardLock: false } });
    noLock.registerAction({ id: 'switch', slots: 1, defaultBindings: ['AltLeft+Tab'] });
    expect(noLock.getReservedBindings()[0].level).toBe('blocked');
    noLock.destroy?.();
  });

  it('M3: uses the detected platform for Windows-key combos', () => {
    for (const [platform, expected] of [['MacIntel', 'unreliable'], ['Win32', 'blocked'], ['', 'unreliable']]) {
      asPlatform(platform);
      const manager = createBindManager({ namespace: `reserved-test-${n}-${platform || 'none'}` });
      manager.registerAction({ id: 'odd', slots: 1, defaultBindings: ['MetaLeft+KeyE'] });
      expect(manager.getReservedBindings()[0]?.level, platform).toBe(expected);
      manager.destroy?.();
    }
  });

  it('has no keyboard-lock option or argument any more', () => {
    const manager = createBindManager({ namespace: `reserved-test-${n}-g`, isKeyboardLocked: () => true });
    manager.registerAction({ id: 'close-bag', slots: 1, defaultBindings: ['ControlLeft+KeyW'] });
    expect(manager.getReservedBindings({ keyboardLocked: true })[0].level).toBe('fullscreen-only');
    expect(level('ControlLeft+KeyW', { keyboardLocked: true })).toBe('fullscreen-only');
    manager.destroy?.();
  });
});
