import { describe, it, expect, beforeEach } from 'vitest';
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
