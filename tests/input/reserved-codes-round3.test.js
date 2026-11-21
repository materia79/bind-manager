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
  parseShortcutPattern,
} from '../../src/input/browser-shortcut-guard.js';
import { createBindManager } from '../../src/core/bind-manager.js';

const guardState = (over = {}) => ({
  enabled: true, shortcuts: [...DEFAULT_BLOCKED_SHORTCUTS], block: [], allow: [], blockBound: true,
  keyboardLock: true, keyboardLockKeys: [...DEFAULT_KEYBOARD_LOCK_KEYS], ...over,
});
const level = (code, options) => getReservedInfo(code, options)?.level ?? null;

describe('M1: Keyboard Lock changes a level only where the 0.2.0 README plainly says it delivers the combo', () => {
  const lockAll = guardState({ keyboardLockKeys: null });

  it('README:384 ("the Windows key" among the OS shortcuts Keyboard Lock changes): the bare Windows key with MetaLeft/MetaRight locked, or every key locked, is unreliable', () => {
    expect(level('MetaLeft', { platform: 'other', guard: lockAll })).toBe('unreliable');
    expect(level('MetaRight', { platform: 'other', guard: guardState({ keyboardLockKeys: ['MetaRight'] }) })).toBe('unreliable');
    // Not locked by the default list: stays blocked.
    expect(level('MetaLeft', { platform: 'other', guard: guardState() })).toBe('blocked');
  });

  it('README:384 ("Cmd+Tab" among the OS shortcuts Keyboard Lock changes): Cmd+Tab on a Mac with Tab locked is unreliable', () => {
    expect(level('MetaLeft+Tab', { platform: 'mac', guard: guardState() })).toBe('unreliable');
    expect(level('MetaLeft+Tab', { platform: 'mac', guard: lockAll })).toBe('unreliable');
    expect(getReservedInfo('MetaLeft+Tab', { platform: 'mac', guard: guardState() }).reason).toMatch(/^macOS uses it to switch applications; in fullscreen the browser guard's Keyboard Lock/);
    // Tab not locked: stays blocked.
    expect(level('MetaLeft+Tab', { platform: 'mac', guard: guardState({ keyboardLockKeys: ['KeyW'] }) })).toBe('blocked');
    expect(level('MetaLeft+Tab', { platform: 'mac', guard: null })).toBe('blocked');
  });

  // Back to blocked: no README line plainly says Keyboard Lock delivers these.
  // Each is checked with the default lock keys, with every key locked, and with
  // exactly its own key locked; the level must be the same as without any guard.
  const LOCKS = (key) => [guardState(), lockAll, guardState({ keyboardLockKeys: [key] })];
  const expectLockChangesNothing = (code, key, platforms, expected) => {
    for (const platform of platforms) {
      const base = level(code, { platform, guard: null });
      if (expected[platform]) expect(base, `${code} on ${platform} without a guard`).toBe(expected[platform]);
      for (const guard of LOCKS(key)) {
        expect(level(code, { platform, guard }), `${code} on ${platform}, lock keys ${JSON.stringify(guard.keyboardLockKeys)}`).toBe(base);
      }
    }
  };
  const BACK_TO_BLOCKED = [
    { name: 'Ctrl+Shift+Q', code: 'ControlLeft+ShiftLeft+KeyQ', key: 'KeyQ', platforms: ['other', 'mac', 'unknown'], expected: { other: 'blocked', mac: 'blocked', unknown: 'blocked' } },
    { name: 'Cmd+Q (Mac)', code: 'MetaLeft+KeyQ', key: 'KeyQ', platforms: ['mac', 'unknown'], expected: { mac: 'blocked', unknown: 'blocked' } },
    { name: 'Cmd+Space (Mac)', code: 'MetaLeft+Space', key: 'Space', platforms: ['mac', 'unknown'], expected: { mac: 'blocked', unknown: 'blocked' } },
    { name: 'Cmd+H (Mac)', code: 'MetaLeft+KeyH', key: 'KeyH', platforms: ['mac', 'unknown'], expected: { mac: 'blocked', unknown: 'blocked' } },
    { name: 'Ctrl+Esc', code: 'ControlLeft+Escape', key: 'Escape', platforms: ['other', 'mac'], expected: { other: 'blocked', mac: 'blocked' } },
    { name: 'Alt+Esc', code: 'AltLeft+Escape', key: 'Escape', platforms: ['other', 'mac'], expected: { other: 'blocked', mac: 'blocked' } },
    { name: 'Ctrl+Shift+Esc', code: 'ControlLeft+ShiftLeft+Escape', key: 'Escape', platforms: ['other', 'mac'], expected: { other: 'blocked', mac: 'blocked' } },
    // Win held together with Alt on Tab / F4: the Alt rules must not give it a lock path (round 4, M-1).
    { name: 'Win+Alt+Tab', code: 'AltLeft+MetaLeft+Tab', key: 'Tab', platforms: ['other', 'unknown'], expected: { other: 'blocked', unknown: 'blocked' } },
    { name: 'Win+Alt+F4', code: 'AltLeft+MetaLeft+F4', key: 'F4', platforms: ['other', 'unknown'], expected: { other: 'blocked', unknown: 'blocked' } },
    // Win + any key; on an unknown platform these keep their earlier level (Win+Tab/Q: blocked, others unreliable), the lock changes nothing.
    ...['KeyW', 'KeyT', 'KeyN', 'KeyQ', 'Tab', 'PageUp', 'PageDown', 'F4', 'KeyL', 'KeyR', 'KeyD', 'KeyE'].map((key) => ({
      name: `Win+${key.replace(/^Key/, '')}`, code: `MetaLeft+${key}`, key, platforms: ['other', 'unknown'],
      expected: { other: 'blocked', unknown: ['KeyQ', 'Tab'].includes(key) ? 'blocked' : 'unreliable' },
    })),
  ];
  for (const { name, code, key, platforms, expected } of BACK_TO_BLOCKED) {
    it(`no README line backs Keyboard Lock delivering ${name}: it stays ${Object.values(expected)[0]} whatever is locked`, () => {
      expectLockChangesNothing(code, key, platforms, expected);
    });
  }

  it('README:384 names the bare Windows key only: with Ctrl, Alt or Shift held and the Windows key pressed last there is no lock path (no README line backs it)', () => {
    for (const code of ['ControlLeft+MetaLeft', 'AltLeft+MetaLeft', 'ShiftLeft+MetaRight', 'ControlLeft+ShiftLeft+MetaLeft']) {
      const meta = code.split('+').at(-1);
      for (const guard of [lockAll, guardState({ keyboardLockKeys: [meta] })]) {
        expect(level(code, { platform: 'other', guard }), `${code} lock ${JSON.stringify(guard.keyboardLockKeys)}`).toBe('blocked');
      }
      expect(level(code, { platform: 'other', guard: null }), code).toBe('blocked');
    }
    // The bare key itself keeps its README:384 lock path.
    expect(level('MetaLeft', { platform: 'other', guard: guardState({ keyboardLockKeys: ['MetaLeft'] }) })).toBe('unreliable');
  });

  it('the Ctrl+Shift+Q reason agrees with README:382 (quit stays with the browser, also in fullscreen) and does not claim Chromium quits with it on a Mac', () => {
    for (const guard of [null, guardState(), lockAll]) {
      const { reason } = getReservedInfo('ControlLeft+ShiftLeft+KeyQ', { platform: 'other', guard });
      expect(reason).toBe('Chromium on Windows and Linux uses it to quit, and the browser keeps quit for itself even in fullscreen.');
      expect(reason).not.toMatch(/hand it to the page|macOS|Mac/);
    }
  });

  it('README:393 ("Locking Tab also captures Alt+Tab"): Alt+Tab stays fullscreen-only; Alt+F4 keeps its round-2 level under the lock', () => {
    expect(level('AltLeft+Tab', { platform: 'other', guard: guardState() })).toBe('fullscreen-only');
    expect(level('AltLeft+F4', { platform: 'other', guard: guardState() })).toBe('unreliable');
    expect(level('AltLeft+F4', { platform: 'other', guard: null })).toBe('blocked');
  });

  it('no README line backs Alt+Tab or Alt+F4 with other modifiers, or on a Mac or an unknown platform: they stay blocked whatever is locked', () => {
    for (const code of ['AltLeft+ShiftLeft+Tab', 'ControlLeft+AltLeft+Tab', 'ControlLeft+ShiftLeft+AltLeft+Tab', 'AltLeft+ShiftLeft+F4', 'ControlLeft+AltLeft+F4', 'ControlLeft+ShiftLeft+AltLeft+F4']) {
      for (const guard of [guardState(), lockAll]) expect(level(code, { platform: 'other', guard }), code).toBe('blocked');
    }
    for (const platform of ['mac', 'unknown']) {
      for (const code of ['AltLeft+Tab', 'AltLeft+F4']) {
        for (const guard of [guardState(), lockAll]) expect(level(code, { platform, guard }), `${code} on ${platform}`).toBe('blocked');
      }
    }
    // On a Mac only Cmd+Tab with exactly Cmd changes.
    for (const code of ['MetaLeft+ShiftLeft+Tab', 'ControlLeft+MetaLeft+Tab', 'ControlLeft+ShiftLeft+MetaLeft+Tab', 'AltLeft+MetaLeft+Tab', 'AltLeft+MetaLeft+F4']) {
      for (const guard of [guardState(), lockAll]) expect(level(code, { platform: 'mac', guard }), code).toBe(level(code, { platform: 'mac', guard: guardState({ keyboardLock: false }) }));
    }
  });

  it('README:388 ("Secure attention sequences such as Ctrl+Alt+Del can never be captured") and README:400: Ctrl+Alt+Del stays blocked under any lock', () => {
    for (const platform of ['other', 'mac', 'unknown']) {
      expect(level('ControlLeft+AltLeft+Delete', { platform, guard: lockAll }), platform).toBe('blocked');
    }
  });

  it('no lock, no change: guard disabled, keyboardLock off, or the key not locked keep the bare Windows key and Cmd+Tab blocked', () => {
    for (const guard of [null, guardState({ keyboardLockKeys: null, enabled: false }), guardState({ keyboardLockKeys: null, keyboardLock: false }), guardState({ keyboardLockKeys: [] })]) {
      expect(level('MetaLeft', { platform: 'other', guard }), JSON.stringify(guard)).toBe('blocked');
      expect(level('MetaLeft+Tab', { platform: 'mac', guard }), JSON.stringify(guard)).toBe('blocked');
    }
  });
});

describe('Keyboard Lock class test: under the lock exactly the README combos change level, on the README platform', () => {
  // The complete allowed list of level changes through the guard's Keyboard Lock.
  // `names`: the EXACT modifier set (by name); `keys`: the primary key codes.
  const ALLOWED = [
    { readme: 'README:384 (Cmd+Tab)', platform: 'mac', names: ['meta'], keys: ['Tab'], from: 'blocked', to: 'unreliable' },
    { readme: 'README:393 (Alt+Tab on Windows)', platform: 'other', names: ['alt'], keys: ['Tab'], from: 'blocked', to: 'fullscreen-only' },
    { readme: 'none: Alt+F4 keeps its earlier level (ruled by the lead)', platform: 'other', names: ['alt'], keys: ['F4'], from: 'blocked', to: 'unreliable' },
    { readme: 'README:384 (the Windows key)', platform: 'other', names: [], keys: ['MetaLeft', 'MetaRight'], from: 'blocked', to: 'unreliable' },
  ];
  const PLATFORMS = ['mac', 'other', 'unknown'];
  // Five modifier codes, 32 sets; AltRight adds the right-hand (AltGr) code.
  const MOD_CODES = ['ControlLeft', 'ShiftLeft', 'AltLeft', 'MetaLeft', 'AltRight'];
  const NAME = { ControlLeft: 'ctrl', ControlRight: 'ctrl', ShiftLeft: 'shift', ShiftRight: 'shift', AltLeft: 'alt', AltRight: 'alt', MetaLeft: 'meta', MetaRight: 'meta' };
  const GUARD_KEYS = [...DEFAULT_BLOCKED_SHORTCUTS, ...FULLSCREEN_ONLY_SHORTCUTS].flatMap((pattern) => parseShortcutPattern(pattern)?.keys ?? []);
  const KEYS = [...new Set([
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => `Key${c}`),
    ...'0123456789'.split('').map((d) => `Digit${d}`),
    ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
    'Tab', 'Escape', 'Space', 'Enter', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Equal', 'Minus', 'Slash', 'Quote', 'Backquote',
    'Numpad0', 'NumpadAdd', 'NumpadSubtract',
    'MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight',
    'MouseButton1', 'MouseButton2', 'MouseButton3', 'MouseButton4', 'MouseButton5', 'MouseWheelUp', 'MouseWheelDown',
    ...DEFAULT_KEYBOARD_LOCK_KEYS, ...GUARD_KEYS,
  ])];
  const NO_LOCK = guardState({ keyboardLock: false });
  const LOCK_ON_NO_KEYS = guardState({ keyboardLockKeys: [] });
  const LOCKS = (key) => [['default lock', guardState()], ['every key locked', guardState({ keyboardLockKeys: null })], ['own key locked', guardState({ keyboardLockKeys: [key] })]];

  let result;
  const compute = () => {
    if (result) return result;
    const observed = new Map(); // "platform code" -> Set of "from->to"
    const noLockMismatches = [];
    const lockTextWithoutGuard = [];
    let combos = 0;
    let calls = 0;
    for (const platform of PLATFORMS) {
      for (let mask = 0; mask < 32; mask += 1) {
        const modCodes = MOD_CODES.filter((_, i) => mask & (1 << i));
        for (const key of KEYS) {
          if (modCodes.includes(key)) continue;
          const code = [...modCodes, key].join('+');
          combos += 1;
          for (const bound of [true, false]) {
            const base = level(code, { platform, bound, guard: NO_LOCK });
            calls += 1;
            if (level(code, { platform, bound, guard: LOCK_ON_NO_KEYS }) !== base) noLockMismatches.push(`${platform} ${code} bound=${bound}`);
            if (/Keyboard Lock/.test(getReservedInfo(code, { platform, bound, guard: null })?.reason ?? '')) lockTextWithoutGuard.push(`${platform} ${code}`);
            calls += 2;
            for (const [, guard] of LOCKS(key)) {
              const locked = level(code, { platform, bound, guard });
              calls += 1;
              if (locked === base) continue;
              const id = `${platform} ${code}`;
              if (!observed.has(id)) observed.set(id, new Set());
              observed.get(id).add(`${base}->${locked}`);
            }
          }
        }
      }
    }
    const expected = new Map();
    for (const platform of PLATFORMS) {
      for (let mask = 0; mask < 32; mask += 1) {
        const modCodes = MOD_CODES.filter((_, i) => mask & (1 << i));
        const names = [...new Set(modCodes.map((m) => NAME[m]))].sort();
        for (const key of KEYS) {
          if (modCodes.includes(key)) continue;
          const entry = ALLOWED.find((e) => e.platform === platform && e.keys.includes(key) && JSON.stringify([...e.names].sort()) === JSON.stringify(names));
          if (entry) expected.set(`${platform} ${[...modCodes, key].join('+')}`, `${entry.from}->${entry.to}`);
        }
      }
    }
    result = {
      observed: Object.fromEntries([...observed].map(([id, set]) => [id, [...set].sort().join(' | ')]).sort(([a], [b]) => a.localeCompare(b))),
      expected: Object.fromEntries([...expected].sort(([a], [b]) => a.localeCompare(b))),
      noLockMismatches, lockTextWithoutGuard, combos, calls,
    };
    return result;
  };

  it('over every key x 32 modifier sets x 3 platforms x lock settings x bound/unbound, the combos whose level changes under the lock EQUAL the allowed list, with from- and to-level', () => {
    const { observed, expected, combos, calls } = compute();
    expect(observed).toEqual(expected);
    expect(combos).toBe(PLATFORMS.length * KEYS.reduce((n, key) => n + (MOD_CODES.includes(key) ? 16 : 32), 0));
    expect(calls).toBeGreaterThan(90000);
  });

  it('the no-lock settings agree: keyboardLock off and Keyboard Lock on with no keys give the same level everywhere; with no guard no reason mentions Keyboard Lock', () => {
    const { noLockMismatches, lockTextWithoutGuard } = compute();
    expect(noLockMismatches).toEqual([]);
    expect(lockTextWithoutGuard).toEqual([]);
  });

  for (const entry of ALLOWED) {
    it(`allowed: ${entry.readme}: on ${entry.platform}, ${entry.names.length ? `${entry.names.join('+')}+` : 'bare '}${entry.keys.join('/')} goes ${entry.from} -> ${entry.to}`, () => {
      const { observed } = compute();
      const ids = Object.keys(observed).filter((id) => id.startsWith(`${entry.platform} `) && entry.keys.includes(id.split('+').at(-1).replace(/^\S+ /, '')));
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(observed[id], id).toBe(`${entry.from}->${entry.to}`);
    });
  }
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

  it('L-8, L-3: with the guard off, F1/F3/F6/F7/F10 and the zoom keys get the note; for F1/F3/F6/F7 it follows README:378 (cancelling is up to each browser)', () => {
    const CAN = 'The browser may have its own shortcut on it. Nothing cancels it; the browser guard can.';
    const UP_TO_BROWSER = 'The browser may have its own shortcut on it. Nothing cancels it, and whether it can be cancelled at all is up to each browser.';
    for (const platform of ['other', 'mac']) {
      for (const code of ['F1', 'F3', 'F6', 'F7']) {
        expect(getReservedInfo(code, { platform, guard: null }), `${code} on ${platform}`).toEqual({ level: 'unreliable', reason: UP_TO_BROWSER });
      }
      const mod = platform === 'mac' ? 'MetaLeft' : 'ControlLeft';
      for (const code of ['F10', ...['Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract', 'Numpad0'].map((key) => `${mod}+${key}`)]) {
        expect(getReservedInfo(code, { platform, guard: null }), `${code} on ${platform}`).toEqual({ level: 'unreliable', reason: CAN });
      }
    }
    // With the guard enabled on defaults they are in its list: no note.
    for (const code of ['F1', 'F3', 'F6', 'F7', 'F10', 'ControlLeft+Equal', 'ControlLeft+Numpad0']) {
      expect(getReservedInfo(code, { platform: 'other', guard: guardState() }), code).toBeNull();
    }
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

  it('L-7: a truthy non-boolean enabled (1, "yes") counts as enabled, as the guard reads it', () => {
    for (const enabled of [1, 'yes']) {
      // Directly: the enabled guard cancels Ctrl+S (in its list), so there is no note.
      expect(getReservedInfo('ControlLeft+KeyS', { platform: 'other', guard: guardState({ enabled }) }), String(enabled)).toBeNull();
      expect(getReservedInfo('ControlLeft+KeyW', { platform: 'other', guard: guardState({ enabled }) }).reason, String(enabled)).toMatch(/the browser guard cancels that\.$/);
      // Through the manager: the real guard keeps the raw value and treats it as enabled.
      const manager = createBindManager({ namespace: `round3-l7-${n}-${String(enabled)}`, browserGuard: { enabled } });
      manager.registerAction({ id: 'save', slots: 1, defaultBindings: ['ControlLeft+KeyS'] });
      expect(manager.getReservedBindings(), String(enabled)).toEqual([]);
      manager.destroy();
    }
    // Control: disabled, the same binding gets the note.
    const manager = createBindManager({ namespace: `round3-l7-${n}-off`, browserGuard: { enabled: false } });
    manager.registerAction({ id: 'save', slots: 1, defaultBindings: ['ControlLeft+KeyS'] });
    expect(manager.getReservedBindings()).toHaveLength(1);
    manager.destroy();
  });

  it('L-6: a guard state without blockBound behaves as blockBound: true (README:309), like the guard', () => {
    const { blockBound, ...noBlockBound } = guardState({ shortcuts: [] });
    expect(blockBound).toBe(true);
    expect('blockBound' in noBlockBound).toBe(false);
    // Bound, not in the lists: cancelled because blockBound defaults to true.
    expect(getReservedInfo('ControlLeft+KeyS', { platform: 'other', guard: noBlockBound, bound: true })).toBeNull();
    expect(getReservedInfo('ControlLeft+KeyW', { platform: 'other', guard: noBlockBound, bound: true }).reason).toMatch(/the browser guard cancels that\.$/);
    // Unbound: let through.
    expect(getReservedInfo('ControlLeft+KeyS', { platform: 'other', guard: noBlockBound, bound: false })?.guardLetsThrough).toBe(true);
    // The real guard built without blockBound decides the same.
    for (const bound of [true, false]) {
      const store = { getActionsByCode: () => (bound ? ['save'] : []) };
      const guard = new BrowserShortcutGuard(store, { getHeldModifiers: () => ['ControlLeft'] }, { enabled: true, shortcuts: [] });
      expect(guard._shouldBlock('KeyS', { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false }), `bound=${bound}`).toBe(bound);
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
