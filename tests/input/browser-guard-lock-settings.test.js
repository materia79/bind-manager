/**
 * PR #2 round 2: the browser guard gains one read-only way to read its
 * effective Keyboard Lock settings, and nothing else of the guard changes:
 * its default lists keep the exact values of 0.2.0 (1e16d9f).
 */
import { describe, it, expect } from 'vitest';
import {
  BrowserShortcutGuard,
  DEFAULT_BLOCKED_SHORTCUTS,
  DEFAULT_KEYBOARD_LOCK_KEYS,
} from '../../src/input/browser-shortcut-guard.js';

// The lists exactly as 0.2.0 (1e16d9f) declares them.
const BLOCKED_0_2_0 = [
  'F5', 'Mod+KeyR',
  'Mod+KeyS', 'Mod+KeyP', 'Mod+KeyF', 'Mod+KeyG', 'Mod+KeyD', 'Mod+KeyH',
  'Mod+KeyJ', 'Mod+KeyU', 'Mod+KeyO', 'Mod+KeyL',
  'F1', 'F3', 'F6', 'F7', 'F10', 'F12',
  'Alt',
  'Slash', 'Quote',
  'Mod+Equal', 'Mod+Minus', 'Mod+Digit0', 'Mod+NumpadAdd', 'Mod+NumpadSubtract', 'Mod+Numpad0',
  'Backspace', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'PageUp', 'PageDown', 'Home', 'End',
  'Mod+KeyW', 'Mod+KeyT', 'Mod+KeyN', 'Mod+KeyQ', 'Ctrl+Tab', 'Ctrl+PageUp', 'Ctrl+PageDown', 'Ctrl+F4',
  'MouseWheel', 'Mod+MouseWheel', 'Shift+MouseWheel',
  'MouseButton1', 'MouseButton3', 'MouseButton4',
];
const LOCK_0_2_0 = ['KeyW', 'KeyT', 'KeyN', 'KeyQ', 'Tab', 'PageUp', 'PageDown', 'F4'];

const fakeStore = { getActionsByCode: () => [] };

describe('browser guard: read-only Keyboard Lock settings', () => {
  it('the default lists keep the exact values and order of 0.2.0', () => {
    expect([...DEFAULT_BLOCKED_SHORTCUTS]).toEqual(BLOCKED_0_2_0);
    expect([...DEFAULT_KEYBOARD_LOCK_KEYS]).toEqual(LOCK_0_2_0);
    expect(Object.isFrozen(DEFAULT_BLOCKED_SHORTCUTS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_KEYBOARD_LOCK_KEYS)).toBe(true);
  });

  it('reports enabled, keyboardLock and the effective lock keys', () => {
    const guard = new BrowserShortcutGuard(fakeStore, null, {});
    expect(guard.getKeyboardLockSettings()).toEqual({ enabled: false, keyboardLock: true, keyboardLockKeys: LOCK_0_2_0 });
    guard.setEnabled(true);
    expect(guard.getKeyboardLockSettings().enabled).toBe(true);
    expect(new BrowserShortcutGuard(fakeStore, null, { keyboardLock: false }).getKeyboardLockSettings().keyboardLock).toBe(false);
    expect(new BrowserShortcutGuard(fakeStore, null, { keyboardLockKeys: null }).getKeyboardLockSettings().keyboardLockKeys).toBeNull();
    expect(new BrowserShortcutGuard(fakeStore, null, { keyboardLockKeys: ['KeyA'] }).getKeyboardLockSettings().keyboardLockKeys).toEqual(['KeyA']);
  });

  it('returns frozen copies: a caller cannot change the guard through them', () => {
    const guard = new BrowserShortcutGuard(fakeStore, null, { enabled: true, keyboardLockKeys: ['KeyA'] });
    const settings = guard.getKeyboardLockSettings();
    expect(Object.isFrozen(settings)).toBe(true);
    expect(Object.isFrozen(settings.keyboardLockKeys)).toBe(true);
    expect(() => { settings.enabled = false; }).toThrow();
    expect(() => { settings.keyboardLockKeys.push('KeyB'); }).toThrow();
    expect(guard.getKeyboardLockSettings()).toEqual({ enabled: true, keyboardLock: true, keyboardLockKeys: ['KeyA'] });
    expect(guard.getKeyboardLockSettings().keyboardLockKeys).not.toBe(settings.keyboardLockKeys);
  });
});
