/**
 * J11: a code latched by setGameplaySuppressed(true) and released while
 * suppressed must not swallow the first press after gameplay resumes.
 */
import { describe, it, expect } from 'vitest';
import { GamepadRuntime } from '../../src/input/gamepad-runtime.js';
import { ActionRegistry } from '../../src/core/action-registry.js';
import { BindingStore } from '../../src/core/binding-store.js';

function pad(pressed = [], axes = [0, 0, 0, 0]) {
  return {
    id: 'Fake Gamepad (STANDARD GAMEPAD)',
    index: 0,
    connected: true,
    mapping: 'standard',
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
    axes,
  };
}

function setup() {
  const registry = new ActionRegistry();
  const store = new BindingStore(registry);
  registry.register({ id: 'jump', label: 'Jump', slots: 1, gamepadSlots: 1 });
  registry.register({ id: 'left', label: 'Left', slots: 1, gamepadSlots: 1 });
  store.init({});
  for (const action of registry.getAll()) store.initAction(action);
  store.set('jump', 0, 'GP_B0', 'gamepad');
  store.set('left', 0, 'GP_A0N', 'gamepad');
  const runtime = new GamepadRuntime(store, registry);
  const events = [];
  runtime.onAnyAction((e) => events.push(`${e.code}:${e.type}`));
  return { runtime, events };
}

describe('GamepadRuntime — J11: no stale latch after suppression', () => {
  it('a button released while suppressed fires pressed in the first frame after un-suppress', () => {
    const { runtime, events } = setup();
    runtime._processGamepad(pad([0]));          // hold
    runtime.setGameplaySuppressed(true);        // latches GP_B0, fires released
    runtime._processGamepad(pad([]));           // released, polled while suppressed
    runtime.setGameplaySuppressed(false);
    events.length = 0;
    runtime._processGamepad(pad([0]));          // fresh press in the first gameplay frame
    expect(events).toEqual(['GP_B0:pressed']);
  });

  it('an axis direction released while suppressed fires pressed in the first frame after un-suppress', () => {
    const { runtime, events } = setup();
    runtime._processGamepad(pad([], [-1, 0, 0, 0]));
    runtime.setGameplaySuppressed(true);
    runtime._processGamepad(pad([], [0, 0, 0, 0]));
    runtime.setGameplaySuppressed(false);
    events.length = 0;
    runtime._processGamepad(pad([], [-1, 0, 0, 0]));
    expect(events).toEqual(['GP_A0N:pressed']);
  });

  it('a button still held through suppression stays silent until released', () => {
    const { runtime, events } = setup();
    runtime._processGamepad(pad([0]));
    runtime.setGameplaySuppressed(true);
    runtime._processGamepad(pad([0]));
    runtime.setGameplaySuppressed(false);
    events.length = 0;
    runtime._processGamepad(pad([0]));
    expect(events).toEqual([]);
    runtime._processGamepad(pad([]));
    runtime._processGamepad(pad([0]));
    expect(events).toEqual(['GP_B0:pressed']);
  });
});
