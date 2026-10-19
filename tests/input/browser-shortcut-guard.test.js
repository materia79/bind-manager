import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BrowserShortcutGuard,
  DEFAULT_BLOCKED_SHORTCUTS,
  DEFAULT_KEYBOARD_LOCK_KEYS,
  parseShortcutPattern,
  matchesShortcutPattern,
} from '../../src/input/browser-shortcut-guard.js';
import { KeyboardRuntime } from '../../src/input/keyboard-runtime.js';
import { ActionRegistry } from '../../src/core/action-registry.js';
import { BindingStore } from '../../src/core/binding-store.js';

let cleanups = [];

function setup(options = {}, { uiActive = () => false } = {}) {
  const registry = new ActionRegistry();
  const store = new BindingStore(registry);
  const kbRuntime = new KeyboardRuntime(store);
  kbRuntime.start();
  const guard = new BrowserShortcutGuard(store, kbRuntime, {
    enabled: true,
    when: 'always',
    ...options,
    isUiActive: uiActive,
  });
  guard.start();
  cleanups.push(() => { guard.stop(); kbRuntime.stop(); });
  const bind = (id, defaultBindings) => store.initAction(registry.register({ id, slots: 2, defaultBindings }));
  return { guard, store, registry, kbRuntime, bind };
}

function key(code, init = {}, type = 'keydown', target = window) {
  const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

function mouse(type, button, init = {}, target = window) {
  const event = new MouseEvent(type, { button, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

function wheel(init = {}, target = window) {
  const event = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups = [];
  vi.restoreAllMocks();
});

describe('shortcut patterns', () => {
  it('parses generic modifiers and key aliases', () => {
    expect(parseShortcutPattern('Mod+Shift+KeyR')).toEqual({ keys: ['KeyR'], mods: ['mod', 'shift'] });
    expect(parseShortcutPattern('Alt')).toEqual({ keys: ['AltLeft', 'AltRight'], mods: [] });
    expect(parseShortcutPattern('Ctrl+MouseWheel')).toEqual({ keys: ['MouseWheelUp', 'MouseWheelDown'], mods: ['ctrl'] });
    expect(parseShortcutPattern('ControlLeft+KeyS')).toEqual({ keys: ['KeyS'], mods: ['ctrl'] });
    expect(parseShortcutPattern('Bogus+KeyS')).toBeNull();
    expect(parseShortcutPattern('')).toBeNull();
  });

  it('matches when at least the pattern modifiers are held; Mod = Ctrl or Meta', () => {
    const p = parseShortcutPattern('Mod+KeyR');
    expect(matchesShortcutPattern(p, 'KeyR', { ctrlKey: true })).toBe(true);
    expect(matchesShortcutPattern(p, 'KeyR', { metaKey: true })).toBe(true);
    expect(matchesShortcutPattern(p, 'KeyR', { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(matchesShortcutPattern(p, 'KeyR', {})).toBe(false);
    expect(matchesShortcutPattern(parseShortcutPattern('F5'), 'F5', { ctrlKey: true })).toBe(true);
  });

  it('default lists cover the documented shortcuts', () => {
    for (const p of ['F5', 'Mod+KeyR', 'Mod+KeyS', 'Mod+KeyP', 'Mod+KeyF', 'Mod+KeyG', 'Mod+KeyD',
      'Mod+KeyH', 'Mod+KeyJ', 'Mod+KeyU', 'Mod+KeyO', 'Mod+KeyL', 'F1', 'F3', 'F6', 'F7', 'F12', 'Alt',
      'Mod+Equal', 'Mod+Minus', 'Backspace', 'Space', 'ArrowDown', 'Mod+MouseWheel', 'Shift+MouseWheel',
      'MouseButton1', 'Mod+KeyW', 'Mod+KeyT', 'Mod+KeyN', 'Ctrl+Tab']) {
      expect(DEFAULT_BLOCKED_SHORTCUTS, p).toContain(p);
    }
    expect(DEFAULT_KEYBOARD_LOCK_KEYS).toEqual(expect.arrayContaining(['KeyW', 'KeyT', 'KeyN', 'Tab']));
    expect(DEFAULT_KEYBOARD_LOCK_KEYS).not.toContain('Escape');
  });
});

describe('BrowserShortcutGuard keyboard', () => {
  it('cancels default browser shortcuts while engaged', () => {
    setup();
    expect(key('F5')).toBe(true);
    expect(key('KeyR', { ctrlKey: true })).toBe(true);
    expect(key('KeyR', { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(key('KeyS', { metaKey: true })).toBe(true);
    expect(key('Equal', { ctrlKey: true })).toBe(true);
    expect(key('Space')).toBe(true);
    expect(key('Backspace')).toBe(true);
    expect(key('F12')).toBe(true);
  });

  it('cancels Alt on keydown and keyup (menu-bar focus)', () => {
    setup();
    expect(key('AltLeft', { altKey: true })).toBe(true);
    expect(key('AltLeft', {}, 'keyup')).toBe(true);
  });

  it('leaves unlisted, unbound keys alone', () => {
    setup();
    expect(key('KeyR')).toBe(false);
    expect(key('KeyK', { ctrlKey: true })).toBe(false);
    expect(key('Escape')).toBe(false);
    expect(key('F11')).toBe(false);
  });

  it('cancels any key that resolves to a bound action, including with modifiers', () => {
    const { bind } = setup();
    bind('move-forward', ['KeyW']);
    bind('quick-save', ['ShiftLeft+KeyK']);
    expect(key('KeyW')).toBe(true);
    expect(key('KeyK')).toBe(false);
    key('ShiftLeft', { shiftKey: true });
    expect(key('KeyK', { shiftKey: true })).toBe(true);
    key('ShiftLeft', {}, 'keyup');
  });

  it('blockBound: false only uses the pattern lists', () => {
    const { bind } = setup({ blockBound: false });
    bind('interact', ['KeyE']);
    expect(key('KeyE')).toBe(false);
  });

  it('allow wins over the default list; block opts extra keys in', () => {
    const { guard } = setup({ allow: ['Mod+KeyF'], block: ['Tab'] });
    expect(key('KeyF', { ctrlKey: true })).toBe(false);
    expect(key('Tab')).toBe(true);
    guard.block('Mod+KeyF');
    expect(key('KeyF', { ctrlKey: true })).toBe(true);
    guard.allow(['Tab', 'F5']);
    expect(key('Tab')).toBe(false);
    expect(key('F5')).toBe(false);
    expect(guard.getShortcutPolicy().allow).toEqual(expect.arrayContaining(['Tab', 'F5']));
  });

  it('allow also overrides bound-action blocking', () => {
    const { bind } = setup({ allow: ['Space'] });
    bind('jump', ['Space']);
    expect(key('Space')).toBe(false);
  });

  it('a custom shortcuts list replaces the default list', () => {
    setup({ shortcuts: ['KeyQ'] });
    expect(key('F5')).toBe(false);
    expect(key('KeyQ')).toBe(true);
  });

  it('never interferes while the bind-manager UI is active', () => {
    let ui = true;
    const { bind } = setup({}, { uiActive: () => ui });
    bind('jump', ['Space']);
    expect(key('F5')).toBe(false);
    expect(key('Space')).toBe(false);
    ui = false;
    expect(key('F5')).toBe(true);
  });

  it('never interferes with text inputs, textareas or contenteditable', () => {
    setup();
    const input = document.createElement('input');
    const area = document.createElement('textarea');
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    // jsdom does not implement isContentEditable
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    document.body.append(input, area, editable);
    for (const el of [input, area, editable]) {
      expect(key('Space', {}, 'keydown', el)).toBe(false);
      expect(key('Backspace', {}, 'keydown', el)).toBe(false);
      expect(key('KeyF', { ctrlKey: true }, 'keydown', el)).toBe(false);
    }
    // Focused text field disengages the guard entirely
    input.focus();
    expect(key('F5')).toBe(false);
  });

  it('treats checkbox / button inputs as non-text', () => {
    setup();
    const box = document.createElement('input');
    box.type = 'checkbox';
    document.body.append(box);
    expect(key('Space', {}, 'keydown', box)).toBe(true);
  });

  it('ignores events aimed at bind-manager UI', () => {
    setup();
    const overlay = document.createElement('div');
    overlay.className = 'bm-overlay';
    const btn = document.createElement('button');
    overlay.append(btn);
    document.body.append(overlay);
    expect(key('Space', {}, 'keydown', btn)).toBe(false);
  });

  it('runs in the capture phase so a game stopPropagation cannot bypass it', () => {
    setup();
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    canvas.addEventListener('keydown', (e) => e.stopPropagation());
    expect(key('F5', {}, 'keydown', canvas)).toBe(true);
  });

  it('does nothing when disabled, and can be toggled at runtime', () => {
    const { guard } = setup({ enabled: false });
    expect(guard.isEngaged()).toBe(false);
    expect(key('F5')).toBe(false);
    guard.setEnabled(true);
    expect(key('F5')).toBe(true);
  });

  it('stop() removes all listeners', () => {
    const { guard } = setup();
    guard.stop();
    expect(key('F5')).toBe(false);
    expect(wheel()).toBe(false);
  });
});

describe('BrowserShortcutGuard mouse and wheel', () => {
  it('cancels page scroll, Ctrl+wheel zoom and Shift+wheel horizontal scroll', () => {
    setup();
    expect(wheel()).toBe(true);
    expect(wheel({ deltaY: -3, ctrlKey: true })).toBe(true);
    expect(wheel({ deltaY: 0, deltaX: 40, shiftKey: true })).toBe(true);
  });

  it('can keep plain wheel scrolling while still blocking Ctrl+wheel zoom', () => {
    setup({ shortcuts: DEFAULT_BLOCKED_SHORTCUTS.filter((p) => p !== 'MouseWheel') });
    expect(wheel()).toBe(false);
    expect(wheel({ ctrlKey: true })).toBe(true);
  });

  it('cancels a bound wheel direction even without patterns', () => {
    const { bind } = setup({ shortcuts: [] });
    bind('next-weapon', ['MouseWheelDown']);
    expect(wheel({ deltaY: 120 })).toBe(true);
    expect(wheel({ deltaY: -120 })).toBe(false);
  });

  it('cancels the context menu (configurable)', () => {
    setup();
    expect(mouse('contextmenu', 2)).toBe(true);
    cleanups.forEach((fn) => fn());
    cleanups = [];
    setup({ contextMenu: false });
    expect(mouse('contextmenu', 2)).toBe(false);
  });

  it('cancels middle-click autoscroll and thumb-button navigation, never the primary button', () => {
    setup();
    for (const type of ['mousedown', 'mouseup', 'auxclick']) {
      expect(mouse(type, 1), `${type} middle`).toBe(true);
      expect(mouse(type, 3), `${type} back`).toBe(true);
      expect(mouse(type, 4), `${type} forward`).toBe(true);
    }
    expect(mouse('mousedown', 0)).toBe(false);
  });

  it('keeps the context menu inside text fields', () => {
    setup();
    const input = document.createElement('input');
    document.body.append(input);
    expect(mouse('contextmenu', 2, {}, input)).toBe(false);
  });
});

describe('BrowserShortcutGuard engagement (when: auto)', () => {
  function stubPointerLock(el) {
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => el });
  }
  function stubFullscreen(el) {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => el });
  }
  afterEach(() => {
    delete document.pointerLockElement;
    delete document.fullscreenElement;
  });

  it('is not engaged without pointer lock, fullscreen, focus or host flag', () => {
    const { guard } = setup({ when: 'auto' });
    expect(guard.isEngaged()).toBe(false);
    expect(key('F5')).toBe(false);
  });

  it('engages under pointer lock on the target', () => {
    const canvas = document.createElement('canvas');
    const other = document.createElement('div');
    document.body.append(canvas, other);
    const { guard } = setup({ when: 'auto', target: canvas });
    stubPointerLock(other);
    expect(guard.isEngaged()).toBe(false);
    stubPointerLock(canvas);
    expect(guard.isEngaged()).toBe(true);
    expect(key('F5')).toBe(true);
  });

  it('engages under pointer lock anywhere when no target is set', () => {
    const { guard } = setup({ when: 'auto' });
    stubPointerLock(document.body);
    expect(guard.isEngaged()).toBe(true);
  });

  it('engages in fullscreen containing the target', () => {
    const wrap = document.createElement('div');
    const canvas = document.createElement('canvas');
    wrap.append(canvas);
    document.body.append(wrap);
    const { guard } = setup({ when: 'auto', target: canvas });
    stubFullscreen(wrap);
    expect(guard.isEngaged()).toBe(true);
  });

  it('engages while focus is inside the target', () => {
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    document.body.append(canvas);
    const { guard } = setup({ when: 'auto', target: canvas });
    expect(guard.isEngaged()).toBe(false);
    canvas.focus();
    expect(guard.isEngaged()).toBe(true);
  });

  it('engages via setGameOwnsInput(true) and a custom predicate', () => {
    const { guard } = setup({ when: 'auto' });
    guard.setGameOwnsInput(true);
    expect(guard.isEngaged()).toBe(true);
    guard.setGameOwnsInput(false);
    expect(guard.isEngaged()).toBe(false);

    let owns = false;
    const custom = setup({ when: () => owns }).guard;
    expect(custom.isEngaged()).toBe(false);
    owns = true;
    expect(custom.isEngaged()).toBe(true);
  });
});

describe('BrowserShortcutGuard Keyboard Lock', () => {
  let keyboard;
  beforeEach(() => {
    keyboard = { lock: vi.fn(() => Promise.resolve()), unlock: vi.fn() };
    Object.defineProperty(navigator, 'keyboard', { configurable: true, get: () => keyboard });
  });
  afterEach(() => {
    delete navigator.keyboard;
    delete document.fullscreenElement;
  });

  function setFullscreen(el) {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => el });
    document.dispatchEvent(new Event('fullscreenchange'));
  }

  it('reports support via feature detection', () => {
    const { guard } = setup();
    expect(guard.keyboardLockSupported).toBe(true);
    delete navigator.keyboard;
    expect(guard.keyboardLockSupported).toBe(false);
  });

  it('locks the default key set on entering fullscreen and unlocks on exit', async () => {
    const { guard } = setup();
    setFullscreen(document.documentElement);
    expect(keyboard.lock).toHaveBeenCalledWith([...DEFAULT_KEYBOARD_LOCK_KEYS]);
    await Promise.resolve();
    await Promise.resolve();
    expect(guard.isKeyboardLocked()).toBe(true);
    setFullscreen(null);
    expect(keyboard.unlock).toHaveBeenCalled();
    expect(guard.isKeyboardLocked()).toBe(false);
  });

  it('keyboardLockKeys: null locks every key', () => {
    setup({ keyboardLockKeys: null });
    setFullscreen(document.documentElement);
    expect(keyboard.lock).toHaveBeenCalledWith();
  });

  it('does not lock when disabled or keyboardLock is false', () => {
    setup({ enabled: false });
    setFullscreen(document.documentElement);
    cleanups.forEach((fn) => fn());
    cleanups = [];
    setup({ keyboardLock: false });
    setFullscreen(document.documentElement);
    expect(keyboard.lock).not.toHaveBeenCalled();
  });

  it('does not lock for fullscreen of an unrelated element', () => {
    const canvas = document.createElement('canvas');
    const video = document.createElement('video');
    document.body.append(canvas, video);
    setup({ target: canvas });
    setFullscreen(video);
    expect(keyboard.lock).not.toHaveBeenCalled();
  });

  it('is a no-op without navigator.keyboard', () => {
    delete navigator.keyboard;
    const { guard } = setup();
    expect(() => setFullscreen(document.documentElement)).not.toThrow();
    expect(guard.isKeyboardLocked()).toBe(false);
  });

  it('enterFullscreen() requests the lock before fullscreen and reports both', async () => {
    const { guard } = setup();
    const el = document.createElement('div');
    document.body.append(el);
    const order = [];
    keyboard.lock.mockImplementation(() => { order.push('lock'); return Promise.resolve(); });
    el.requestFullscreen = vi.fn(() => { order.push('fullscreen'); return Promise.resolve(); });
    const result = await guard.enterFullscreen(el);
    expect(order).toEqual(['lock', 'fullscreen']);
    expect(el.requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' });
    expect(result).toEqual({ fullscreen: true, keyboardLocked: true });
  });

  it('enterFullscreen() releases the lock when fullscreen is refused', async () => {
    const { guard } = setup();
    const el = document.createElement('div');
    const error = new Error('denied');
    el.requestFullscreen = vi.fn(() => Promise.reject(error));
    const result = await guard.enterFullscreen(el);
    expect(result).toEqual({ fullscreen: false, keyboardLocked: false, error });
    expect(keyboard.unlock).toHaveBeenCalled();
    expect(guard.isKeyboardLocked()).toBe(false);
  });

  it('enterFullscreen() reports keyboardLocked: false when lock() rejects', async () => {
    const { guard } = setup();
    keyboard.lock.mockImplementation(() => Promise.reject(new DOMException('nope', 'InvalidStateError')));
    const el = document.createElement('div');
    el.requestFullscreen = vi.fn(() => Promise.resolve());
    expect(await guard.enterFullscreen(el)).toEqual({ fullscreen: true, keyboardLocked: false });
  });

  it('exitFullscreen() unlocks and leaves fullscreen', async () => {
    const { guard } = setup();
    await guard.enterFullscreen(Object.assign(document.createElement('div'), {
      requestFullscreen: () => Promise.resolve(),
    }));
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => document.body });
    document.exitFullscreen = vi.fn(() => Promise.resolve());
    await guard.exitFullscreen();
    expect(keyboard.unlock).toHaveBeenCalled();
    expect(document.exitFullscreen).toHaveBeenCalled();
    delete document.exitFullscreen;
  });
});

describe('BrowserShortcutGuard leave-site guard', () => {
  function unload() {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it('is off by default', () => {
    const { guard } = setup();
    key('KeyW');
    expect(guard.isLeaveGuardArmed()).toBe(false);
    expect(unload()).toBe(false);
  });

  it('leaveGuard: true arms on the first engaged input and prompts on unload', () => {
    const { guard } = setup({ leaveGuard: true, when: 'auto' });
    key('KeyW');
    expect(guard.isLeaveGuardArmed()).toBe(false);
    guard.setGameOwnsInput(true);
    expect(guard.isLeaveGuardArmed()).toBe(true);
    // Stays armed after the game releases input (e.g. cursor freed to click the tab X)
    guard.setGameOwnsInput(false);
    expect(unload()).toBe(true);
  });

  it('disarmLeaveGuard() lets the app navigate, re-arms on the next engagement', () => {
    const { guard } = setup({ leaveGuard: true });
    key('KeyW');
    expect(guard.isLeaveGuardArmed()).toBe(true);
    guard.disarmLeaveGuard();
    expect(unload()).toBe(false);
    key('KeyW');
    expect(guard.isLeaveGuardArmed()).toBe(true);
  });

  it('armLeaveGuard() works without the option', () => {
    const { guard } = setup();
    guard.armLeaveGuard();
    expect(unload()).toBe(true);
    guard.disarmLeaveGuard();
    expect(unload()).toBe(false);
  });
});
