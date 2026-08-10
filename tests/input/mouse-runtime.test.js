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
