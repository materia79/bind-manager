import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MouseRuntime } from '../../src/input/mouse-runtime.js';
import { KeyboardRuntime } from '../../src/input/keyboard-runtime.js';
import { ActionRegistry } from '../../src/core/action-registry.js';
import { BindingStore } from '../../src/core/binding-store.js';

function setup() {
  const registry = new ActionRegistry();
  const store = new BindingStore(registry);
  const kbRuntime = new KeyboardRuntime(store);
  const mouseRuntime = new MouseRuntime(store, kbRuntime);
  kbRuntime.start();
  mouseRuntime.start();
  return { registry, store, kbRuntime, mouseRuntime };
}

function registerAction(registry, store, id, defaultBindings = ['MouseButton0']) {
  const action = registry.register({ id, slots: 2, defaultBindings });
  store.initAction(action);
}

function mousedown(button = 0) {
  window.dispatchEvent(new MouseEvent('mousedown', { button, bubbles: true }));
}
function mouseup(button = 0) {
  window.dispatchEvent(new MouseEvent('mouseup', { button, bubbles: true }));
}
function wheel(deltaY = -120) {
  window.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true }));
}
function keydown(code) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat: false }));
}
function keyup(code) {
  window.dispatchEvent(new KeyboardEvent('keyup', { code }));
}

describe('MouseRuntime capture', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('does not commit capture on mousedown, only on mouseup', () => {
    const { mouseRuntime } = setup();
    let captured = null;
    mouseRuntime.startCapture((code) => { captured = code; });

    mousedown(0);
    expect(captured).toBeNull();

    mouseup(0);
    expect(captured).toBe('MouseButton0');
    mouseRuntime.stop();
  });

  it('captures right mouse button', () => {
    const { mouseRuntime } = setup();
    let captured = null;
    mouseRuntime.startCapture((code) => { captured = code; });

    mousedown(2);
    mouseup(2);
    expect(captured).toBe('MouseButton2');
    mouseRuntime.stop();
  });

  it('captures mouse button with keyboard modifier combo', () => {
    const { kbRuntime, mouseRuntime } = setup();
    let captured = null;
    // Start both runtimes in capture mode to mirror real usage
    mouseRuntime.startCapture((code) => { captured = code; });

    // Hold Shift via keyboard (tracked in kbRuntime._pressed)
    keydown('ShiftLeft');
    mousedown(0);
    mouseup(0);
    expect(captured).toBe('ShiftLeft+MouseButton0');

    keyup('ShiftLeft');
    mouseRuntime.stop();
    kbRuntime.stop();
  });

  it('captures wheel up immediately', () => {
    const { mouseRuntime } = setup();
    let captured = null;
    mouseRuntime.startCapture((code) => { captured = code; });

    wheel(-120);
    expect(captured).toBe('MouseWheelUp');
    mouseRuntime.stop();
  });

  it('captures wheel down immediately', () => {
    const { mouseRuntime } = setup();
    let captured = null;
    mouseRuntime.startCapture((code) => { captured = code; });

    wheel(120);
    expect(captured).toBe('MouseWheelDown');
    mouseRuntime.stop();
  });

  it('wheel capture waits for a full notch and cancels scrolling meanwhile', () => {
    const { mouseRuntime } = setup();
    let captured = null;
    mouseRuntime.startCapture((code) => { captured = code; });

    const small = new WheelEvent('wheel', { deltaY: 10, bubbles: true, cancelable: true });
    window.dispatchEvent(small);
    expect(captured).toBeNull();
    expect(small.defaultPrevented).toBe(true);

    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 10, bubbles: true, cancelable: true }));
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 10, bubbles: true, cancelable: true }));
    expect(captured).toBe('MouseWheelDown');
    mouseRuntime.stop();
  });

  it('captures a Ctrl+wheel chord', () => {
    const { kbRuntime, mouseRuntime } = setup();
    let captured = null;
    mouseRuntime.startCapture((code) => { captured = code; });
    keydown('ControlLeft');
    wheel(-120);
    expect(captured).toBe('ControlLeft+MouseWheelUp');
    keyup('ControlLeft');
    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('captures Shift+wheel even when the browser reports it on deltaX', () => {
    const { kbRuntime, mouseRuntime } = setup();
    let captured = null;
    mouseRuntime.startCapture((code) => { captured = code; });
    keydown('ShiftLeft');
    window.dispatchEvent(new WheelEvent('wheel', { deltaX: 120, shiftKey: true, bubbles: true }));
    expect(captured).toBe('ShiftLeft+MouseWheelDown');
    keyup('ShiftLeft');
    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('cancelCapture prevents callback', () => {
    const { mouseRuntime } = setup();
    let captured = 'not-called';
    mouseRuntime.startCapture((code) => { captured = code; });
    mouseRuntime.cancelCapture();

    mousedown(0);
    mouseup(0);
    expect(captured).toBe('not-called');
    mouseRuntime.stop();
  });
});

describe('MouseRuntime gameplay dispatch', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('dispatches pressed and released for mouse button', () => {
    const { registry, store, mouseRuntime, kbRuntime } = setup();
    registerAction(registry, store, 'fire', ['MouseButton0']);
    const events = [];
    mouseRuntime.onAction('fire', (e) => events.push(e));

    mousedown(0);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('pressed');

    mouseup(0);
    expect(events).toHaveLength(2);
    expect(events[1].type).toBe('released');

    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('dispatches combo mouse action when combo binding exists', () => {
    const { registry, store, mouseRuntime, kbRuntime } = setup();
    registerAction(registry, store, 'alt-fire', ['ShiftLeft+MouseButton0']);
    const events = [];
    mouseRuntime.onAction('alt-fire', (e) => events.push(e));

    keydown('ShiftLeft');
    mousedown(0);
    expect(events).toHaveLength(1);
    expect(events[0].code).toBe('ShiftLeft+MouseButton0');

    mouseup(0);
    expect(events).toHaveLength(2);
    expect(events[1].type).toBe('released');

    keyup('ShiftLeft');
    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('dispatches wheel as pressed+released pulse', () => {
    const { registry, store, mouseRuntime, kbRuntime } = setup();
    registerAction(registry, store, 'zoom-in', ['MouseWheelUp']);
    const events = [];
    mouseRuntime.onAction('zoom-in', (e) => events.push(e));

    wheel(-120);
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('pressed');
    expect(events[1].type).toBe('released');

    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('dispatches one pulse per notch for line-mode and accumulated trackpad deltas', () => {
    const { registry, store, mouseRuntime, kbRuntime } = setup();
    registerAction(registry, store, 'next-weapon', ['MouseWheelDown']);
    const pressed = [];
    mouseRuntime.onAction('next-weapon', (e) => { if (e.type === 'pressed') pressed.push(e); });

    // Firefox line mode: 3 lines = one notch
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 3, deltaMode: 1, bubbles: true }));
    expect(pressed).toHaveLength(1);

    // Trackpad: 4 × 8 px = 32 px → one notch on the 4th event
    for (let i = 0; i < 3; i++) {
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 8, bubbles: true }));
    }
    expect(pressed).toHaveLength(1);
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 8, bubbles: true }));
    expect(pressed).toHaveLength(2);

    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('dispatches Ctrl+wheel and Shift+wheel chords to combo bindings', () => {
    const { registry, store, mouseRuntime, kbRuntime } = setup();
    registerAction(registry, store, 'zoom', ['ControlLeft+MouseWheelUp']);
    registerAction(registry, store, 'strafe', ['ShiftLeft+MouseWheelDown']);
    const events = [];
    mouseRuntime.onAnyAction((e) => { if (e.type === 'pressed') events.push(e.actionId); });

    keydown('ControlLeft');
    wheel(-120);
    keyup('ControlLeft');
    keydown('ShiftLeft');
    window.dispatchEvent(new WheelEvent('wheel', { deltaX: 120, shiftKey: true, bubbles: true }));
    keyup('ShiftLeft');

    expect(events).toEqual(['zoom', 'strafe']);
    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('ignores pure horizontal wheel motion (no spurious Wheel Down)', () => {
    const { registry, store, mouseRuntime, kbRuntime } = setup();
    registerAction(registry, store, 'next-weapon', ['MouseWheelDown']);
    const events = [];
    mouseRuntime.onAction('next-weapon', (e) => events.push(e));
    window.dispatchEvent(new WheelEvent('wheel', { deltaX: 120, bubbles: true }));
    expect(events).toHaveLength(0);
    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('isPressed returns true while mouse button is held', () => {
    const { registry, store, mouseRuntime, kbRuntime } = setup();
    registerAction(registry, store, 'fire', ['MouseButton0']);

    mousedown(0);
    expect(mouseRuntime.isPressed('MouseButton0')).toBe(true);

    mouseup(0);
    expect(mouseRuntime.isPressed('MouseButton0')).toBe(false);

    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('prevents the browser default for bound thumb buttons on mousedown, mouseup and auxclick', () => {
    const { registry, store, mouseRuntime, kbRuntime } = setup();
    registerAction(registry, store, 'nav-back', ['MouseButton3']);

    for (const type of ['mousedown', 'mouseup', 'auxclick']) {
      const event = new MouseEvent(type, { button: 3, bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented, type).toBe(true);
    }

    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('leaves the browser default alone for unbound thumb buttons', () => {
    const { mouseRuntime, kbRuntime } = setup();

    for (const type of ['mousedown', 'mouseup', 'auxclick']) {
      const event = new MouseEvent(type, { button: 4, bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented, type).toBe(false);
    }

    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('never prevents the primary button default even when bound', () => {
    const { registry, store, mouseRuntime, kbRuntime } = setup();
    registerAction(registry, store, 'fire', ['MouseButton0']);

    const event = new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);

    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('prevents the default for a combo-bound thumb button only while the modifier is held', () => {
    const { registry, store, mouseRuntime, kbRuntime } = setup();
    registerAction(registry, store, 'combo-nav', ['ShiftLeft+MouseButton4']);

    const bare = new MouseEvent('mousedown', { button: 4, bubbles: true, cancelable: true });
    window.dispatchEvent(bare);
    expect(bare.defaultPrevented).toBe(false);
    mouseup(4);

    keydown('ShiftLeft');
    const combo = new MouseEvent('mousedown', { button: 4, bubbles: true, cancelable: true });
    window.dispatchEvent(combo);
    expect(combo.defaultPrevented).toBe(true);
    keyup('ShiftLeft');

    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('does not prevent defaults while gameplay is suppressed', () => {
    const { registry, store, mouseRuntime, kbRuntime } = setup();
    registerAction(registry, store, 'nav-back', ['MouseButton3']);
    mouseRuntime.setGameplaySuppressed(true);

    for (const type of ['mousedown', 'mouseup', 'auxclick']) {
      const event = new MouseEvent(type, { button: 3, bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented, type).toBe(false);
    }

    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('clears active bindings on setGameplaySuppressed(true)', () => {
    const { registry, store, mouseRuntime, kbRuntime } = setup();
    registerAction(registry, store, 'fire', ['MouseButton0']);
    const events = [];
    mouseRuntime.onAction('fire', (e) => events.push(e));

    mousedown(0);
    mouseRuntime.setGameplaySuppressed(true);
    const releases = events.filter(e => e.type === 'released');
    expect(releases.length).toBeGreaterThanOrEqual(1);

    kbRuntime.stop();
    mouseRuntime.stop();
  });
});

describe('MouseRuntime pressed state across capture and suppression', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function contextMenu() {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    return event;
  }

  it('keeps suppressing the context menu for a capture started right after another one completed', async () => {
    const { kbRuntime, mouseRuntime } = setup();
    mouseRuntime.startCapture(() => {});
    mousedown(2);
    mouseup(2);                          // completes, schedules deferred listener removal
    mouseRuntime.startCapture(() => {}); // next capture in the same tick
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(contextMenu().defaultPrevented).toBe(true);

    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('removes the context-menu suppression when capture is cancelled with no button held', () => {
    const { kbRuntime, mouseRuntime } = setup();
    mouseRuntime.startCapture(() => {});
    mouseRuntime.cancelCapture();

    expect(contextMenu().defaultPrevented).toBe(false);

    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('swallows the release of a button pressed during a cancelled capture', async () => {
    const { registry, store, kbRuntime, mouseRuntime } = setup();
    registerAction(registry, store, 'aim', ['MouseButton2']);
    const events = [];
    mouseRuntime.onAction('aim', (e) => events.push(e));

    mouseRuntime.startCapture(() => {});
    mousedown(2);
    mouseRuntime.cancelCapture();        // e.g. keyboard Escape while right button is held
    mouseup(2);

    expect(events).toEqual([]);
    // the context menu that follows the right-button release is still suppressed
    expect(contextMenu().defaultPrevented).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The capture listener is gone; gameplay (suppressed here, as while the
    // modal is open) would cancel it for the bound right button on its own.
    mouseRuntime.setGameplaySuppressed(true);
    expect(contextMenu().defaultPrevented).toBe(false);

    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('does not dispatch released for a button pressed while gameplay was suppressed', () => {
    const { registry, store, kbRuntime, mouseRuntime } = setup();
    registerAction(registry, store, 'fire', ['MouseButton0']);
    const events = [];
    mouseRuntime.onAction('fire', (e) => events.push(e));

    mouseRuntime.setGameplaySuppressed(true);
    mousedown(0);
    mouseRuntime.setGameplaySuppressed(false);
    mouseup(0);

    expect(events).toEqual([]);
    expect(mouseRuntime.isPressed('MouseButton0')).toBe(false);

    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('stop() removes capture listeners even when the runtime was never started', () => {
    const registry = new ActionRegistry();
    const store = new BindingStore(registry);
    const mouseRuntime = new MouseRuntime(store, new KeyboardRuntime(store));
    mouseRuntime.startCapture(() => {});
    mouseRuntime.stop();

    expect(contextMenu().defaultPrevented).toBe(false);
  });

  it('stop() after cancelCapture leaves no listener or pending timer behind', async () => {
    const { kbRuntime, mouseRuntime } = setup();
    mouseRuntime.startCapture(() => {});
    mousedown(2);
    mouseRuntime.cancelCapture();
    mouseRuntime.stop();

    expect(contextMenu().defaultPrevented).toBe(false);
    expect(mouseRuntime._contextMenuTimer).toBeNull();
    kbRuntime.stop();
  });

  it('a blur after a cancelled capture does not swallow a later gameplay release', () => {
    const { registry, store, kbRuntime, mouseRuntime } = setup();
    registerAction(registry, store, 'aim', ['MouseButton2']);
    const events = [];
    mouseRuntime.onAction('aim', (e) => events.push(e.type));

    mouseRuntime.startCapture(() => {});
    mousedown(2);
    mouseRuntime.cancelCapture();
    window.dispatchEvent(new Event('blur')); // the release happens outside the window

    mousedown(2);
    mouseup(2);
    expect(events).toEqual(['pressed', 'released']);
    expect(mouseRuntime.isPressed('MouseButton2')).toBe(false);
    expect(contextMenu().defaultPrevented).toBe(true); // still bound in gameplay
    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('stop() releases buttons that are still held', () => {
    const { registry, store, kbRuntime, mouseRuntime } = setup();
    registerAction(registry, store, 'fire', ['MouseButton0']);
    const events = [];
    mouseRuntime.onAction('fire', (e) => events.push(e.type));

    mousedown(0);
    mouseRuntime.stop();

    expect(events).toEqual(['pressed', 'released']);
    expect(mouseRuntime.isPressed('MouseButton0')).toBe(false);
    kbRuntime.stop();
  });
});

describe('MouseRuntime focus loss and the gameplay context menu', () => {
  let restoreVisibility = null;
  let running = [];

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    restoreVisibility?.();
    restoreVisibility = null;
    // stop() is idempotent: a failing test must not leak window listeners
    for (const { kbRuntime, mouseRuntime } of running) { mouseRuntime.stop(); kbRuntime.stop(); }
    running = [];
  });

  function tracked() {
    const ctx = setup();
    running.push(ctx);
    return ctx;
  }

  function setVisibility(state) {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    restoreVisibility = () => { delete document.visibilityState; };
    document.dispatchEvent(new Event('visibilitychange'));
  }

  function contextMenu() {
    const event = new MouseEvent('contextmenu', { button: 2, bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it('window blur releases held buttons with released events', () => {
    const { registry, store, kbRuntime, mouseRuntime } = tracked();
    registerAction(registry, store, 'fire', ['MouseButton0']);
    registerAction(registry, store, 'aim', ['ShiftLeft+MouseButton2']);
    const events = [];
    mouseRuntime.onAnyAction((e) => events.push(`${e.actionId}:${e.type}`));

    mousedown(0);
    keydown('ShiftLeft');
    mousedown(2);
    keyup('ShiftLeft');
    window.dispatchEvent(new Event('blur'));

    expect(events).toEqual(['fire:pressed', 'aim:pressed', 'fire:released', 'aim:released']);
    expect(mouseRuntime.isPressed('MouseButton0')).toBe(false);
    expect(mouseRuntime.isPressed('ShiftLeft+MouseButton2')).toBe(false);
    // The lost mouseup arriving late dispatches nothing more
    mouseup(0);
    expect(events).toHaveLength(4);
    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('the page becoming hidden releases held buttons; becoming visible does not', () => {
    const { registry, store, kbRuntime, mouseRuntime } = tracked();
    registerAction(registry, store, 'aim', ['MouseButton2']);
    const events = [];
    mouseRuntime.onAction('aim', (e) => events.push(e.type));

    mousedown(2);
    setVisibility('visible');
    expect(events).toEqual(['pressed']);
    setVisibility('hidden');
    expect(events).toEqual(['pressed', 'released']);
    expect(mouseRuntime.isPressed('MouseButton2')).toBe(false);
    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('blur resets a partially accumulated wheel notch', () => {
    const { registry, store, kbRuntime, mouseRuntime } = tracked();
    registerAction(registry, store, 'next', ['MouseWheelDown']);
    const pressed = [];
    mouseRuntime.onAction('next', (e) => { if (e.type === 'pressed') pressed.push(e); });

    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 20, bubbles: true }));
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 20, bubbles: true }));
    expect(pressed).toHaveLength(0);
    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('cancels the context menu during gameplay when the right button is bound', () => {
    const { registry, store, kbRuntime, mouseRuntime } = tracked();
    expect(contextMenu()).toBe(false);
    registerAction(registry, store, 'aim', ['MouseButton2']);
    expect(contextMenu()).toBe(true);
    kbRuntime.stop();
    mouseRuntime.stop();
    expect(contextMenu()).toBe(false);
  });

  it('cancels the context menu for a right-button combo only while its modifier is held', () => {
    const { registry, store, kbRuntime, mouseRuntime } = tracked();
    registerAction(registry, store, 'aim', ['ShiftLeft+MouseButton2']);
    expect(contextMenu()).toBe(false);
    keydown('ShiftLeft');
    expect(contextMenu()).toBe(true);
    keyup('ShiftLeft');
    kbRuntime.stop();
    mouseRuntime.stop();
  });

  it('does not cancel the context menu while gameplay is suppressed', () => {
    const { registry, store, kbRuntime, mouseRuntime } = tracked();
    registerAction(registry, store, 'aim', ['MouseButton2']);
    mouseRuntime.setGameplaySuppressed(true);
    expect(contextMenu()).toBe(false);
    mouseRuntime.setGameplaySuppressed(false);
    expect(contextMenu()).toBe(true);
    kbRuntime.stop();
    mouseRuntime.stop();
  });
});

/**
 * Replays the spied window add/removeEventListener calls for `type` (a repeated
 * add of the same listener + capture flag is a no-op, like the DOM) and returns
 * the registrations still live.
 */
function trackWindowListeners() {
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  const captureOf = (opts) => (typeof opts === 'boolean' ? opts : !!opts?.capture);
  return (type) => {
    const calls = [
      ...add.mock.calls.map((args, i) => ({ isAdd: true, args, order: add.mock.invocationCallOrder[i] })),
      ...remove.mock.calls.map((args, i) => ({ isAdd: false, args, order: remove.mock.invocationCallOrder[i] })),
    ].filter(({ args }) => args[0] === type).sort((a, b) => a.order - b.order);
    const live = [];
    for (const { isAdd, args: [, fn, opts] } of calls) {
      const i = live.findIndex((l) => l.fn === fn && l.capture === captureOf(opts));
      if (isAdd && i === -1) live.push({ fn, capture: captureOf(opts), passive: !(opts && opts.passive === false) });
      else if (!isAdd && i !== -1) live.splice(i, 1);
    }
    return live;
  };
}

describe('MouseRuntime wheel listener passivity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function wheelListener(live, mouseRuntime) {
    const own = live('wheel').filter((l) => l.fn === mouseRuntime._onWheel);
    expect(own.length).toBeLessThanOrEqual(1);
    if (own.length === 0) return 'none';
    return own[0].passive ? 'passive' : 'non-passive';
  }

  it('is passive by default and non-passive only while a wheel code is bound during gameplay', () => {
    const live = trackWindowListeners();
    const { registry, store, kbRuntime, mouseRuntime } = setup();
    registerAction(registry, store, 'fire', ['MouseButton0']);
    mouseRuntime.refreshBindings();
    expect(wheelListener(live, mouseRuntime)).toBe('passive');

    // Registration emits no change event: the manager calls refreshBindings()
    registerAction(registry, store, 'next', ['MouseWheelDown']);
    mouseRuntime.refreshBindings();
    expect(wheelListener(live, mouseRuntime)).toBe('non-passive');

    // A host handler can still cancel the scroll through originalEvent; the runtime itself does not
    const seen = [];
    mouseRuntime.onAction('next', (e) => { if (e.type === 'pressed') seen.push(e); });
    const event = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    expect(seen).toHaveLength(1);
    expect(event.defaultPrevented).toBe(false);
    mouseRuntime.onAction('next', (e) => e.originalEvent.preventDefault());
    const cancelled = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    window.dispatchEvent(cancelled);
    expect(cancelled.defaultPrevented).toBe(true);

    mouseRuntime.setGameplaySuppressed(true);
    expect(wheelListener(live, mouseRuntime)).toBe('passive');
    mouseRuntime.setGameplaySuppressed(false);
    expect(wheelListener(live, mouseRuntime)).toBe('non-passive');

    // Followed through store change events
    store.clear('next', 0);
    expect(wheelListener(live, mouseRuntime)).toBe('passive');
    store.set('fire', 1, 'ShiftLeft+MouseWheelUp');
    expect(wheelListener(live, mouseRuntime)).toBe('non-passive');
    store.reset('fire');
    expect(wheelListener(live, mouseRuntime)).toBe('passive');

    mouseRuntime.stop();
    kbRuntime.stop();
    expect(wheelListener(live, mouseRuntime)).toBe('none');
    store.set('next', 0, 'MouseWheelUp'); // no longer followed once stopped
    expect(wheelListener(live, mouseRuntime)).toBe('none');
  });

  it('is non-passive while a capture runs and passive again after cancel or commit', () => {
    const live = trackWindowListeners();
    const { kbRuntime, mouseRuntime } = setup();

    mouseRuntime.startCapture(() => {});
    expect(wheelListener(live, mouseRuntime)).toBe('non-passive');
    mouseRuntime.cancelCapture();
    expect(wheelListener(live, mouseRuntime)).toBe('passive');

    mouseRuntime.startCapture(() => {});
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
    expect(wheelListener(live, mouseRuntime)).toBe('passive');

    mouseRuntime.startCapture(() => {});
    mousedown(2);
    mouseup(2);
    expect(wheelListener(live, mouseRuntime)).toBe('passive');

    mouseRuntime.startCapture(() => {});
    mouseRuntime.stop();
    kbRuntime.stop();
    expect(wheelListener(live, mouseRuntime)).toBe('none');
  });

  it('adds no wheel listener for a capture on a runtime that was never started', () => {
    const live = trackWindowListeners();
    const registry = new ActionRegistry();
    const store = new BindingStore(registry);
    const mouseRuntime = new MouseRuntime(store, new KeyboardRuntime(store));
    mouseRuntime.startCapture(() => {});
    expect(wheelListener(live, mouseRuntime)).toBe('none');
    mouseRuntime.stop();
  });
});
