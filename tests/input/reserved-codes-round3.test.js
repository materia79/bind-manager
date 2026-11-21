/**
 * PR #2 round 3: the findings of the round-2 check.
 * README line numbers refer to README.md as of 0.2.0 (1e16d9f), section
 * "What a page cannot block, and Keyboard Lock".
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectPlatform, getReservedInfo } from '../../src/input/reserved-codes.js';
import {
  BrowserShortcutGuard,
  DEFAULT_BLOCKED_SHORTCUTS,
  DEFAULT_KEYBOARD_LOCK_KEYS,
  FULLSCREEN_ONLY_SHORTCUTS,
} from '../../src/input/browser-shortcut-guard.js';
import { createBindManager } from '../../src/core/bind-manager.js';

const guardState = (over = {}) => ({
  enabled: true, shortcuts: [...DEFAULT_BLOCKED_SHORTCUTS], block: [], allow: [], blockBound: true,
  keyboardLock: true, keyboardLockKeys: [...DEFAULT_KEYBOARD_LOCK_KEYS], ...over,
});
const level = (code, options) => getReservedInfo(code, options)?.level ?? null;

describe('M1: Keyboard Lock can deliver what the 0.2.0 README says it can', () => {
  const lockAll = guardState({ keyboardLockKeys: null });

  it('README:384 ("the Windows key" among the OS shortcuts Keyboard Lock changes) + README:387 ("lock() with no arguments captures every key"): bare Windows key under lock() of every key is unreliable', () => {
    expect(level('MetaLeft', { platform: 'other', guard: lockAll })).toBe('unreliable');
    expect(level('MetaRight', { platform: 'other', guard: guardState({ keyboardLockKeys: ['MetaRight'] }) })).toBe('unreliable');
    // Not locked by the default list: stays blocked.
    expect(level('MetaLeft', { platform: 'other', guard: guardState() })).toBe('blocked');
  });

  it('README:387 ("captures the listed KeyboardEvent.code keys with every modifier combination"): Win + a locked key is unreliable', () => {
    for (const code of ['MetaLeft+Tab', 'MetaLeft+KeyW', 'MetaLeft+KeyT', 'MetaLeft+KeyN', 'MetaLeft+KeyQ', 'MetaLeft+PageUp', 'MetaLeft+PageDown', 'MetaLeft+F4']) {
      expect(level(code, { platform: 'other', guard: guardState() }), code).toBe('unreliable');
    }
    expect(level('MetaLeft+KeyE', { platform: 'other', guard: lockAll })).toBe('unreliable');
    // KeyE is not in the default lock list: stays blocked.
    expect(level('MetaLeft+KeyE', { platform: 'other', guard: guardState() })).toBe('blocked');
  });

  it('README:384 ("Cmd+Tab" among the OS shortcuts Keyboard Lock changes) + README:387: Cmd+Tab and Cmd+Q with Tab / KeyQ locked are unreliable; Cmd+Space, Cmd+H only under lock() of every key', () => {
    for (const platform of ['mac', 'other']) {
      expect(level('MetaLeft+Tab', { platform, guard: guardState() }), platform).toBe('unreliable');
      expect(level('MetaLeft+KeyQ', { platform, guard: guardState() }), platform).toBe('unreliable');
      expect(level('MetaLeft+Space', { platform, guard: guardState() }), platform).toBe('blocked');
      expect(level('MetaLeft+Space', { platform, guard: lockAll }), platform).toBe('unreliable');
      expect(level('MetaLeft+KeyH', { platform, guard: lockAll }), platform).toBe('unreliable');
    }
  });

  it('README:387 (every modifier combination of a locked key): Ctrl+Shift+Q with KeyQ locked is unreliable', () => {
    expect(level('ControlLeft+ShiftLeft+KeyQ', { platform: 'other', guard: guardState() })).toBe('unreliable');
    expect(level('ControlLeft+ShiftLeft+KeyQ', { platform: 'other', guard: null })).toBe('blocked');
  });

  it('README:387 (every modifier combination; Escape is lockable, README:389): Ctrl+Esc, Alt+Esc, Ctrl+Shift+Esc with Escape locked are unreliable', () => {
    for (const code of ['ControlLeft+Escape', 'AltLeft+Escape', 'ControlLeft+ShiftLeft+Escape']) {
      expect(level(code, { platform: 'other', guard: lockAll }), code).toBe('unreliable');
      expect(level(code, { platform: 'other', guard: guardState() }), code).toBe('blocked'); // Escape not in the default list
    }
  });

  it('README:388 ("Secure attention sequences such as Ctrl+Alt+Del can never be captured") and README:400: Ctrl+Alt+Del stays blocked under any lock', () => {
    expect(level('ControlLeft+AltLeft+Delete', { platform: 'other', guard: lockAll })).toBe('blocked');
  });

  it('no lock, no change: guard disabled, keyboardLock off, or the key not locked keep blocked', () => {
    for (const guard of [null, guardState({ enabled: false }), guardState({ keyboardLock: false }), guardState({ keyboardLockKeys: [] })]) {
      for (const code of ['MetaLeft+Tab', 'MetaLeft+KeyW', 'ControlLeft+ShiftLeft+KeyQ']) {
        expect(level(code, { platform: 'other', guard }), code).toBe('blocked');
      }
    }
  });
});

describe('M2: one "nothing cancels it" decision for Windows/Linux and Mac', () => {
  // Each row: the same browser command on a non-Mac platform and on a Mac.
  const ROWS = [
    { other: 'ControlLeft+KeyS', mac: 'MetaLeft+KeyS' },
    { other: 'ControlLeft+KeyR', mac: 'MetaLeft+KeyR' },
    { other: 'ControlLeft+KeyL', mac: 'MetaLeft+KeyL' },
    { other: 'ControlLeft+KeyD', mac: 'MetaLeft+KeyD' },
    { other: 'F5', mac: 'F5' },
    { other: 'ControlLeft+MouseWheelUp', mac: 'MetaLeft+MouseWheelUp' },
  ];
  const CONTEXTS = [
    { name: 'guard disabled', guard: null, expected: { level: 'unreliable', guardLetsThrough: undefined } },
    { name: 'guard default', guard: guardState(), expected: null },
    { name: 'guard allows it', guard: guardState({ allow: ['Mod+KeyS', 'Mod+KeyR', 'Mod+KeyL', 'Mod+KeyD', 'F5', 'Mod+MouseWheel'] }), expected: { level: 'unreliable', guardLetsThrough: true } },
    { name: 'shortcuts [] (blockBound cancels the bound key)', guard: guardState({ shortcuts: [] }), expected: null },
    { name: 'shortcuts [] + blockBound:false', guard: guardState({ shortcuts: [], blockBound: false }), expected: { level: 'unreliable', guardLetsThrough: true } },
  ];

  for (const { name, guard, expected } of CONTEXTS) {
    it(`${name}: the same result on both platforms`, () => {
      for (const row of ROWS) {
        for (const platform of ['other', 'mac']) {
          const result = getReservedInfo(row[platform], { platform, guard });
          if (expected === null) expect(result, `${row[platform]} on ${platform}`).toBeNull();
          else expect({ level: result?.level, guardLetsThrough: result?.guardLetsThrough }, `${row[platform]} on ${platform}`).toEqual(expected);
        }
      }
    });
  }

  it('the reason names the browser guard when nothing cancels it, and the dialog lead covers the guard case', () => {
    expect(getReservedInfo('ControlLeft+KeyS', { platform: 'other', guard: null }).reason).toBe('The browser may have its own shortcut on it. Nothing cancels it; the browser guard can.');
    expect(getReservedInfo('MetaLeft+KeyS', { platform: 'mac', guard: null }).reason).toBe('The browser may have its own shortcut on it. Nothing cancels it; the browser guard can.');
  });

  it('scrolling keys, mouse buttons and AltGr combos get no note', () => {
    for (const code of ['Space', 'ArrowUp', 'Backspace', 'MouseButton1', 'MouseButton3', 'MouseWheelUp', 'AltLeft', 'Slash', 'ControlLeft+AltLeft+KeyS']) {
      expect(getReservedInfo(code, { platform: 'other', guard: null }), code).toBeNull();
    }
  });
});

describe('L1: the feature agrees with the guard\'s own decision (differential against BrowserShortcutGuard._shouldBlock)', () => {
  // Codes whose level depends on the guard's decision: the tab/window shortcuts
  // (fullscreen-only vs lets through) and the browser commands (null vs unreliable).
  const CANDIDATES = [
    ['ControlLeft', 'KeyW'], ['ControlLeft', 'KeyT'], ['ControlLeft', 'Tab'], ['ControlLeft', 'PageUp'], ['ControlLeft', 'F4'],
    ['ControlLeft', 'KeyS'], ['ControlLeft', 'KeyR'], ['ControlLeft', 'KeyL'], ['ControlLeft', 'Equal'], ['', 'F5'], ['', 'F1'],
    ['ControlLeft', 'MouseWheelUp'], ['ControlLeft+ShiftLeft', 'KeyW'], ['ControlLeft+ShiftLeft', 'KeyR'],
  ];
  const POOL = [...FULLSCREEN_ONLY_SHORTCUTS, 'Mod+KeyS', 'Mod+KeyR', 'Mod+KeyL', 'Mod+Equal', 'F5', 'F1', 'Mod+MouseWheel', 'Ctrl+KeyW', 'Shift+KeyR', 'Mod+Shift+KeyW'];

  let seed = 20261121;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const subset = () => POOL.filter(() => random() < 0.35);

  it('400 random policies x bound/unbound: level and the guard agree on every candidate', () => {
    let compared = 0;
    for (let i = 0; i < 400; i += 1) {
      const policy = { shortcuts: subset(), block: subset(), allow: subset(), blockBound: random() < 0.5 };
      for (const bound of [true, false]) {
        const store = { getActionsByCode: () => (bound ? ['action'] : []) };
        for (const [modText, key] of CANDIDATES) {
          const modifiers = modText ? modText.split('+') : [];
          const runtime = { getHeldModifiers: () => modifiers };
          const guard = new BrowserShortcutGuard(store, runtime, { enabled: true, ...policy });
          const flags = { ctrlKey: modifiers.includes('ControlLeft'), shiftKey: modifiers.includes('ShiftLeft'), altKey: false, metaKey: false };
          const guardCancels = guard._shouldBlock(key, flags);
          const code = [...modifiers, key].join('+');
          const info = getReservedInfo(code, { platform: 'other', bound, guard: { enabled: true, ...policy, keyboardLock: true, keyboardLockKeys: [...DEFAULT_KEYBOARD_LOCK_KEYS] } });
          const featureSaysCancelled = info === null || info.level === 'fullscreen-only';
          expect(featureSaysCancelled, `${code} bound=${bound} ${JSON.stringify(policy)}`).toBe(guardCancels);
          expect(!!info?.guardLetsThrough, `${code} lets-through flag`).toBe(!guardCancels);
          compared += 1;
        }
      }
    }
    expect(compared).toBe(400 * 2 * CANDIDATES.length);
  });
});

describe('L2, L3: platform texts', () => {
  it('L2: on Windows, Win+Q/Tab/Space/H have the Windows-key reason, never a macOS one', () => {
    for (const code of ['MetaLeft+KeyQ', 'MetaLeft+Tab', 'MetaLeft+Space', 'MetaLeft+KeyH']) {
      const result = getReservedInfo(code, { platform: 'other', guard: null });
      expect(result.level, code).toBe('blocked');
      expect(result.reason, code).not.toMatch(/macOS/);
      expect(result.reason).toBe('The operating system uses the Windows key for its own shortcuts.');
      expect(getReservedInfo(code, { platform: 'mac', guard: null }).reason, code).toMatch(/^macOS/);
    }
  });

  it('L3: the bare Cmd key on a Mac is not called blocked', () => {
    for (const code of ['MetaLeft', 'MetaRight']) {
      const result = getReservedInfo(code, { platform: 'mac', guard: null });
      expect(result.level, code).toBe('unreliable');
      expect(result.reason).toMatch(/Command key reaches the page/);
    }
    expect(level('MetaLeft', { platform: 'other', guard: null })).toBe('blocked');
    expect(level('MetaLeft', { platform: 'unknown', guard: null })).toBe('unreliable');
  });
});

describe('L4: non-boolean option values are read the way the guard reads them', () => {
  let n = 0;
  beforeEach(() => { n += 1; document.body.innerHTML = ''; });

  it('blockBound 0 or "": the guard does not cancel the bound key, the note says so', () => {
    for (const blockBound of [0, '']) {
      const manager = createBindManager({ namespace: `round3-l4-${n}-${String(blockBound)}`, browserGuard: { enabled: true, shortcuts: [], blockBound } });
      manager.registerAction({ id: 'close-bag', slots: 1, defaultBindings: ['ControlLeft+KeyW'] });
      expect(manager.getReservedBindings()[0], String(blockBound)).toMatchObject({ level: 'unreliable', guardLetsThrough: true });
      manager.destroy();
    }
  });

  it('keyboardLock 0 or "": the guard never locks, so Alt+Tab is blocked', () => {
    for (const keyboardLock of [0, '']) {
      const manager = createBindManager({ namespace: `round3-l4-lock-${n}-${String(keyboardLock)}`, browserGuard: { enabled: true, keyboardLock } });
      manager.registerAction({ id: 'switch', slots: 1, defaultBindings: ['AltLeft+Tab'] });
      expect(manager.getReservedBindings()[0].level, String(keyboardLock)).toBe('blocked');
      manager.destroy();
    }
  });

  it('enabled 0 or "": the guard is disabled', () => {
    for (const enabled of [0, '']) {
      expect(level('ControlLeft+KeyW', { platform: 'other', guard: guardState({ enabled, allow: ['Mod+KeyW'] }) }), String(enabled)).toBe('fullscreen-only');
      expect(getReservedInfo('ControlLeft+KeyW', { platform: 'other', guard: guardState({ enabled }) }).reason).toMatch(/game has to cancel/);
    }
  });
});

describe('L5: platform detection never throws, falls back to unknown', () => {
  let original;
  beforeEach(() => { original = Object.getOwnPropertyDescriptor(globalThis, 'navigator'); });
  afterEach(() => { if (original) Object.defineProperty(globalThis, 'navigator', original); });

  it('a throwing global navigator getter: detectPlatform() and getReservedInfo() do not throw', () => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, get() { throw new Error('no navigator'); } });
    expect(detectPlatform()).toBe('unknown');
    expect(() => getReservedInfo('MetaLeft+KeyE')).not.toThrow();
    expect(getReservedInfo('MetaLeft+KeyE').level).toBe('unreliable');
  });

  it('"darwin" is a Mac, not Windows; Windows is still recognised', () => {
    expect(detectPlatform({ platform: 'darwin' })).toBe('mac');
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (darwin) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/26.0.0' })).toBe('mac');
    expect(detectPlatform({ platform: 'Win32' })).toBe('other');
    expect(detectPlatform({ userAgentData: { platform: 'Windows' } })).toBe('other');
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })).toBe('other');
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)' })).toBe('other');
  });

  it('a Proxy that throws on every read, and non-string values, are unknown', () => {
    const hostile = new Proxy({}, { get() { throw new Error('no'); } });
    expect(detectPlatform(hostile)).toBe('unknown');
    expect(detectPlatform({ platform: 42, userAgent: {} })).toBe('unknown');
  });
});
