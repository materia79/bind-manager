/**
 * J14: an in-memory mapping edit on a pad without an exact profile starts
 * from the identity mapping of the pad's standard layout, so every input the
 * edit does not touch keeps working.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GamepadRuntime } from '../../src/input/gamepad-runtime.js';
import { ActionRegistry } from '../../src/core/action-registry.js';
import { BindingStore } from '../../src/core/binding-store.js';

const XBOX_ID = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)';

function pad({ pressed = [], axes = [0, 0, 0, 0], buttons = 17 } = {}) {
  return {
    id: XBOX_ID,
    index: 0,
    connected: true,
    mapping: 'standard',
    buttons: Array.from({ length: buttons }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
    axes,
  };
}

function setup() {
  const registry = new ActionRegistry();
  const store = new BindingStore(registry);
  const codes = [...Array.from({ length: 17 }, (_, i) => `GP_B${i}`), 'GP_A0N', 'GP_A0P', 'GP_A1N', 'GP_A1P', 'GP_A2N', 'GP_A2P', 'GP_A3N', 'GP_A3P'];
  for (const code of codes) registry.register({ id: code, label: code, slots: 1, gamepadSlots: 1 });
  store.init({});
  for (const action of registry.getAll()) store.initAction(action);
  for (const code of codes) store.set(code, 0, code, 'gamepad');
  const runtime = new GamepadRuntime(store, registry);
  const events = [];
  runtime.onAnyAction((e) => { if (e.type === 'pressed') events.push(e.code); });
  /** Press one raw button (or set axes) for one frame and return the logical codes pressed. */
  const press = (opts) => {
    runtime._processGamepad(pad());
    events.length = 0;
    runtime._processGamepad(pad(opts));
    const out = [...events];
    runtime._processGamepad(pad());
    return out.sort();
  };
  return { runtime, press };
}

describe('GamepadRuntime — J14: memory edit on a pad without an exact profile', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad()] });
  });

  it('editing one button keeps every other button and axis working', () => {
    const { runtime, press } = setup();
    expect(runtime.getResolvedProfile(0).source).toBe('family');
    expect(runtime.setProfileMappingEntry(0, 'GP_B0', { kind: 'button', index: 3 })).toBe(true);
    expect(runtime.getResolvedProfile(0).source).toBe('memory-edit');

    expect(press({ pressed: [0] })).toEqual([]);                 // GP_B0 moved away from raw 0
    expect(press({ pressed: [3] })).toEqual(['GP_B0', 'GP_B3']); // raw 3: edited GP_B0 and its own GP_B3
    for (let i = 1; i < 17; i++) {
      if (i === 3) continue;
      expect(press({ pressed: [i] }), `raw ${i}`).toEqual([`GP_B${i}`]);
    }
    expect(press({ axes: [-1, 0, 0, 0] })).toEqual(['GP_A0N']);
    expect(press({ axes: [0, 1, 0, 0] })).toEqual(['GP_A1P']);
    expect(press({ axes: [0, 0, 1, 0] })).toEqual(['GP_A2P']);
    expect(press({ axes: [0, 0, 0, -1] })).toEqual(['GP_A3N']);
  });

  it('the edited definition is the identity mapping plus the edit', () => {
    const { runtime } = setup();
    runtime.setProfileMappingEntry(0, 'GP_B5', { kind: 'axis', index: 2, direction: 'positive' });
    const def = runtime.getProfileDefinition(0);
    expect(def.mapping.GP_B4).toEqual({ kind: 'button', index: 4 });
    expect(def.mapping.GP_B5).toEqual({ kind: 'axis', index: 2, direction: 'positive' });
    expect(def.mapping.GP_A1N).toEqual({ kind: 'axis', index: 1, direction: 'negative' });
    expect(def.mapping.GP_B17).toBeUndefined(); // the pad has 17 buttons
    expect(def.family).toBe('xbox');
  });

  it('removing an entry leaves the rest working (and restores its own identity entry, F3)', () => {
    const { runtime, press } = setup();
    runtime.setProfileMappingEntry(0, 'GP_B1', { kind: 'button', index: 4 });
    runtime.setProfileMappingEntry(0, 'GP_B2', { kind: 'button', index: 5 });
    expect(runtime.removeProfileMappingEntry(0, 'GP_B1')).toBe(true);
    expect(press({ pressed: [1] })).toEqual(['GP_B1']);
    expect(press({ pressed: [0] })).toEqual(['GP_B0']);
    expect(press({ pressed: [5] })).toEqual(['GP_B2', 'GP_B5']);
    runtime.removeProfileMappingEntry(0, 'GP_B2');
    expect(press({ pressed: [2] })).toEqual(['GP_B2']);
    expect(press({ axes: [1, 0, 0, 0] })).toEqual(['GP_A0P']);
  });

  it('labels still come from the family', () => {
    const { runtime } = setup();
    runtime.setProfileMappingEntry(0, 'GP_B0', { kind: 'button', index: 3 });
    expect(runtime.getLabelForCode('GP_B1', 0)).toBe('B');
    expect(runtime.getLabelForCode('GP_B9', 0)).toBe('Menu');
  });
});
