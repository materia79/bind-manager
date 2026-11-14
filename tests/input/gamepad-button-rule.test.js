/**
 * F2: a button counts as pressed by one rule, mapped or not:
 * `button.pressed || value > 0.5`. An in-memory edit of an unrelated button
 * must not change how any other button dispatches.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GamepadRuntime, isRawButtonPressed } from '../../src/input/gamepad-runtime.js';
import { ActionRegistry } from '../../src/core/action-registry.js';
import { BindingStore } from '../../src/core/binding-store.js';

const ID = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)';

/** A pad state: per raw button { pressed, value }. */
function pad(buttons = {}) {
  return {
    id: ID,
    index: 0,
    connected: true,
    mapping: 'standard',
    buttons: Array.from({ length: 17 }, (_, i) => buttons[i] ?? { pressed: false, value: 0 }),
    axes: [0, 0, 0, 0],
  };
}

function setup() {
  const registry = new ActionRegistry();
  const store = new BindingStore(registry);
  for (let i = 0; i < 17; i++) registry.register({ id: `GP_B${i}`, label: `B${i}`, slots: 1, gamepadSlots: 1 });
  store.init({});
  for (const action of registry.getAll()) store.initAction(action);
  for (let i = 0; i < 17; i++) store.set(`GP_B${i}`, 0, `GP_B${i}`, 'gamepad');
  const runtime = new GamepadRuntime(store, registry);
  const events = [];
  runtime.onAnyAction((e) => { if (e.type === 'pressed') events.push(e.code); });
  const pressedFor = (state) => {
    runtime._processGamepad(pad());
    events.length = 0;
    runtime._processGamepad(pad(state));
    const out = [...events].sort();
    runtime._processGamepad(pad());
    return out;
  };
  return { runtime, pressedFor };
}

const STATES = {
  digital: { 0: { pressed: true, value: 1 } },
  halfTrigger: { 7: { pressed: true, value: 0.3 } },
  pressedValueZero: { 3: { pressed: true, value: 0 } },
  overHalfNotPressed: { 6: { pressed: false, value: 0.6 } },
  underHalfNotPressed: { 6: { pressed: false, value: 0.4 } },
};

describe('GamepadRuntime — F2: one button rule, mapped or not', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad()] });
  });

  it('isRawButtonPressed is pressed || value > 0.5', () => {
    expect(isRawButtonPressed({ pressed: true, value: 0 })).toBe(true);
    expect(isRawButtonPressed({ pressed: false, value: 0.51 })).toBe(true);
    expect(isRawButtonPressed({ pressed: false, value: 0.5 })).toBe(false);
    expect(isRawButtonPressed(null)).toBe(false);
  });

  it.each(Object.entries(STATES))('%s dispatches the same before and after editing an unrelated button', (_, state) => {
    const { runtime, pressedFor } = setup();
    const before = pressedFor(state);
    expect(runtime.setProfileMappingEntry(0, 'GP_B9', { kind: 'button', index: 10 })).toBe(true);
    expect(runtime.getResolvedProfile(0).source).toBe('memory-edit');
    expect(pressedFor(state)).toEqual(before);
  });

  it('the expected codes fire', () => {
    const { pressedFor } = setup();
    expect(pressedFor(STATES.halfTrigger)).toEqual(['GP_B7']);
    expect(pressedFor(STATES.pressedValueZero)).toEqual(['GP_B3']);
    expect(pressedFor(STATES.underHalfNotPressed)).toEqual([]);
  });
});
