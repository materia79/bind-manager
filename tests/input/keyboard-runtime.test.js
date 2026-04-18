import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KeyboardRuntime } from '../../src/input/keyboard-runtime.js';
import { ActionRegistry } from '../../src/core/action-registry.js';
import { BindingStore } from '../../src/core/binding-store.js';

function setup() {
  const registry = new ActionRegistry();
  const store = new BindingStore(registry);
  const runtime = new KeyboardRuntime(store);
  runtime.start();
  return { registry, store, runtime };
}

function registerAction(registry, store, id, defaultBindings = ['KeyW']) {
  const action = registry.register({ id, slots: 2, defaultBindings });
  store.initAction(action);
}

function keydown(code, opts = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat: false, ...opts }));
}
function keyup(code) {
  window.dispatchEvent(new KeyboardEvent('keyup', { code }));
}

describe('KeyboardRuntime capture-on-release', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('does not commit capture on keydown, only on keyup', () => {
    const { runtime } = setup();
    let captured = null;
    runtime.startCapture((code) => { captured = code; });

    keydown('KeyC');
    expect(captured).toBeNull();

    keyup('KeyC');
    expect(captured).toBe('KeyC');
    runtime.stop();
  });

  it('captures modifier combo when Shift is held and primary key is released', () => {
    const { runtime } = setup();
    let captured = null;
    runtime.startCapture((code) => { captured = code; });

    keydown('ShiftLeft');
    keydown('KeyC');
    expect(captured).toBeNull();

    keyup('KeyC');
    expect(captured).toBe('ShiftLeft+KeyC');
    runtime.stop();
  });

  it('captures multi-modifier combo in canonical order', () => {
    const { runtime } = setup();
    let captured = null;
    runtime.startCapture((code) => { captured = code; });

    keydown('ShiftLeft');
    keydown('ControlLeft');
    keydown('KeyA');
    keyup('KeyA');
    expect(captured).toBe('ControlLeft+ShiftLeft+KeyA');
    runtime.stop();
  });

  it('captures modifier-only bind when modifier released with no primary key', () => {
    const { runtime } = setup();
    let captured = null;
    runtime.startCapture((code) => { captured = code; });

    keydown('ShiftLeft');
    expect(captured).toBeNull();

    keyup('ShiftLeft');
    expect(captured).toBe('ShiftLeft');
    runtime.stop();
  });

  it('cancels capture immediately on Escape keydown (not release)', () => {
    const { runtime } = setup();
    let captured = 'not-called';
    runtime.startCapture((code) => { captured = code; });

    keydown('Escape');
    expect(captured).toBeNull();
    runtime.stop();
  });

  it('ignores repeat events during capture', () => {
    const { runtime } = setup();
    let captured = null;
    runtime.startCapture((code) => { captured = code; });

    keydown('KeyW');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', repeat: true }));
    expect(captured).toBeNull();

    keyup('KeyW');
    expect(captured).toBe('KeyW');
    runtime.stop();
  });

  it('getHeldModifiers returns modifiers in canonical order', () => {
    const { runtime } = setup();
    keydown('ShiftLeft');
    keydown('ControlLeft');
    const mods = runtime.getHeldModifiers();
    expect(mods).toEqual(['ControlLeft', 'ShiftLeft']);
    keyup('ShiftLeft');
    keyup('ControlLeft');
    runtime.stop();
  });
});

describe('KeyboardRuntime combo gameplay dispatch', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('dispatches combo action when combo binding exists', () => {
    const { registry, store, runtime } = setup();
    registerAction(registry, store, 'sprint', ['ShiftLeft+KeyW']);
    const events = [];
    runtime.onAction('sprint', (e) => events.push(e));

    keydown('ShiftLeft');
    keydown('KeyW');
    expect(events).toHaveLength(1);
    expect(events[0].code).toBe('ShiftLeft+KeyW');
    expect(events[0].type).toBe('pressed');

    keyup('KeyW');
    expect(events).toHaveLength(2);
    expect(events[1].type).toBe('released');
    expect(events[1].code).toBe('ShiftLeft+KeyW');

    keyup('ShiftLeft');
    runtime.stop();
  });

  it('falls back to simple code when combo binding does not exist', () => {
    const { registry, store, runtime } = setup();
    registerAction(registry, store, 'forward', ['KeyW']);
    const events = [];
    runtime.onAction('forward', (e) => events.push(e));

    keydown('ShiftLeft');
    keydown('KeyW');
    // Should dispatch simple KeyW since ShiftLeft+KeyW is not bound
    const pressedEvent = events.find(e => e.code === 'KeyW' && e.type === 'pressed');
    expect(pressedEvent).toBeDefined();

    keyup('KeyW');
    const releasedEvent = events.find(e => e.code === 'KeyW' && e.type === 'released');
    expect(releasedEvent).toBeDefined();

    keyup('ShiftLeft');
    runtime.stop();
  });

  it('isPressed returns true for active combo codes', () => {
    const { registry, store, runtime } = setup();
    registerAction(registry, store, 'sprint', ['ShiftLeft+KeyW']);

    keydown('ShiftLeft');
    keydown('KeyW');
    expect(runtime.isPressed('ShiftLeft+KeyW')).toBe(true);

    keyup('KeyW');
    expect(runtime.isPressed('ShiftLeft+KeyW')).toBe(false);

    keyup('ShiftLeft');
    runtime.stop();
  });

  it('clears active bindings on blur', () => {
    const { registry, store, runtime } = setup();
    registerAction(registry, store, 'forward', ['KeyW']);

    keydown('KeyW');
    expect(runtime.isPressed('KeyW')).toBe(true);

    window.dispatchEvent(new Event('blur'));
    expect(runtime.isPressed('KeyW')).toBe(false);
    runtime.stop();
  });

  it('clears active bindings on setGameplaySuppressed(true)', () => {
    const { registry, store, runtime } = setup();
    registerAction(registry, store, 'forward', ['KeyW']);
    const events = [];
    runtime.onAction('forward', (e) => events.push(e));

    keydown('KeyW');
    runtime.setGameplaySuppressed(true);
    const releases = events.filter(e => e.type === 'released');
    expect(releases.length).toBeGreaterThanOrEqual(1);
    runtime.stop();
  });
});
