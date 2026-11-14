/**
 * J13: the exact DualSense profile (054c-0ce6, raw layout 14 buttons / 12
 * axes) remaps only pads the browser did not remap. Uses the real generated
 * registry, not a mock.
 */
import { describe, it, expect } from 'vitest';
import { GamepadRuntime } from '../../src/input/gamepad-runtime.js';
import { ActionRegistry } from '../../src/core/action-registry.js';
import { BindingStore } from '../../src/core/binding-store.js';

const FIREFOX_ID = '054c-0ce6-DualSense Wireless Controller';

function pad({ mapping, buttons, axes, pressed = [] }) {
  return {
    id: FIREFOX_ID,
    index: 0,
    connected: true,
    mapping,
    buttons: Array.from({ length: buttons }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
    axes: new Array(axes).fill(0),
  };
}

function setup() {
  const registry = new ActionRegistry();
  const store = new BindingStore(registry);
  registry.register({ id: 'cross', label: 'Cross', slots: 1, gamepadSlots: 1 });
  registry.register({ id: 'circle', label: 'Circle', slots: 1, gamepadSlots: 1 });
  registry.register({ id: 'square', label: 'Square', slots: 1, gamepadSlots: 1 });
  store.init({});
  for (const action of registry.getAll()) store.initAction(action);
  store.set('cross', 0, 'GP_B0', 'gamepad');
  store.set('circle', 0, 'GP_B1', 'gamepad');
  store.set('square', 0, 'GP_B2', 'gamepad');
  const runtime = new GamepadRuntime(store, registry);
  const events = [];
  runtime.onAnyAction((e) => { if (e.type === 'pressed') events.push(e.code); });
  return { runtime, events };
}

describe('GamepadRuntime — exact profile gating (real registry)', () => {
  it("mapping 'standard': raw button 0 stays GP_B0 (the profile's raw mapping is not applied)", () => {
    const { runtime, events } = setup();
    const layout = { mapping: 'standard', buttons: 18, axes: 4 };
    runtime._processGamepad(pad(layout));
    runtime._processGamepad(pad({ ...layout, pressed: [0] }));
    expect(events).toEqual(['GP_B0']);
    expect(runtime._getResolvedProfileForGamepad(pad(layout)).source).toBe('family');
  });

  it("mapping 'standard' with the profile's own counts is still not remapped", () => {
    const { runtime, events } = setup();
    const layout = { mapping: 'standard', buttons: 14, axes: 12 };
    runtime._processGamepad(pad(layout));
    runtime._processGamepad(pad({ ...layout, pressed: [0] }));
    expect(events).toEqual(['GP_B0']);
  });

  it("mapping '' with 14 buttons and 12 axes is remapped: raw 0 is Square (GP_B2), raw 1 is Cross (GP_B0)", () => {
    const { runtime, events } = setup();
    const layout = { mapping: '', buttons: 14, axes: 12 };
    runtime._processGamepad(pad(layout));
    expect(runtime._getResolvedProfileForGamepad(pad(layout)).source).toBe('exact');
    runtime._processGamepad(pad({ ...layout, pressed: [0] }));
    runtime._processGamepad(pad(layout));
    runtime._processGamepad(pad({ ...layout, pressed: [1] }));
    expect(events).toEqual(['GP_B2', 'GP_B0']);
  });
});
