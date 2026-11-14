/**
 * F3: removing an in-memory mapping entry restores that code's base entry
 * (identity on a pad without an exact profile, the profile's own entry on a
 * pad with one); a mapping back to its base drops the edit; and
 * resetProfileMapping() / manager.resetGamepadProfileMapping() discard all
 * edits of a pad.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GamepadRuntime } from '../../src/input/gamepad-runtime.js';
import { ActionRegistry } from '../../src/core/action-registry.js';
import { BindingStore } from '../../src/core/binding-store.js';
import { createBindManager } from '../../src/core/bind-manager.js';

const XBOX = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)', mapping: 'standard', buttons: 17, axes: 4 };
const DS_RAW = { id: '054c-0ce6-DualSense Wireless Controller', mapping: '', buttons: 14, axes: 12 };

function pad(spec, pressed = []) {
  return {
    id: spec.id,
    index: 0,
    connected: true,
    mapping: spec.mapping,
    buttons: Array.from({ length: spec.buttons }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
    axes: new Array(spec.axes).fill(spec === DS_RAW ? 0 : 0),
  };
}

function setup(spec) {
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad(spec)] });
  const registry = new ActionRegistry();
  const store = new BindingStore(registry);
  for (let i = 0; i < 17; i++) registry.register({ id: `GP_B${i}`, label: `B${i}`, slots: 1, gamepadSlots: 1 });
  store.init({});
  for (const action of registry.getAll()) store.initAction(action);
  for (let i = 0; i < 17; i++) store.set(`GP_B${i}`, 0, `GP_B${i}`, 'gamepad');
  const runtime = new GamepadRuntime(store, registry);
  const events = [];
  runtime.onAnyAction((e) => { if (e.type === 'pressed') events.push(e.code); });
  const press = (raw) => {
    runtime._processGamepad(pad(spec));
    events.length = 0;
    runtime._processGamepad(pad(spec, [raw]));
    const out = [...events].sort();
    runtime._processGamepad(pad(spec));
    return out;
  };
  return { runtime, press };
}

describe('GamepadRuntime — F3: removing and resetting in-memory edits', () => {
  it('pad without an exact profile: removing an entry restores its identity mapping and drops the edit', () => {
    const { runtime, press } = setup(XBOX);
    runtime.removeProfileMappingEntry(0, 'GP_B0');
    // The removal equals the identity mapping again: no edit is kept.
    expect(runtime.getResolvedProfile(0).source).toBe('family');
    expect(press(0)).toEqual(['GP_B0']);

    runtime.setProfileMappingEntry(0, 'GP_B0', { kind: 'button', index: 3 });
    expect(press(0)).toEqual([]);
    expect(runtime.getResolvedProfile(0).source).toBe('memory-edit');
    runtime.removeProfileMappingEntry(0, 'GP_B0');
    expect(press(0)).toEqual(['GP_B0']);
    expect(runtime.getResolvedProfile(0).source).toBe('family');
    expect(runtime.getProfileDefinition(0)).toBeNull();
  });

  it('two edits, one removed: the other stays and the source stays memory-edit', () => {
    const { runtime, press } = setup(XBOX);
    runtime.setProfileMappingEntry(0, 'GP_B0', { kind: 'button', index: 3 });
    runtime.setProfileMappingEntry(0, 'GP_B1', { kind: 'button', index: 4 });
    runtime.removeProfileMappingEntry(0, 'GP_B0');
    expect(press(0)).toEqual(['GP_B0']);
    expect(press(4)).toEqual(['GP_B1', 'GP_B4']);
    expect(runtime.getResolvedProfile(0).source).toBe('memory-edit');
  });

  it('pad with an exact profile: removing an entry restores the profile entry', () => {
    const { runtime, press } = setup(DS_RAW);
    expect(runtime.getResolvedProfile(0).source).toBe('exact');
    expect(press(1)).toEqual(['GP_B0']);                 // raw 1 is Cross in the profile
    runtime.setProfileMappingEntry(0, 'GP_B0', { kind: 'button', index: 3 });
    expect(press(1)).toEqual([]);
    runtime.removeProfileMappingEntry(0, 'GP_B0');
    expect(press(1)).toEqual(['GP_B0']);
    expect(runtime.getResolvedProfile(0).source).toBe('exact');
  });

  it('resetProfileMapping discards every edit of the pad', () => {
    const { runtime, press } = setup(XBOX);
    runtime.setProfileMappingEntry(0, 'GP_B0', { kind: 'button', index: 3 });
    runtime.setProfileMappingEntry(0, 'GP_B5', { kind: 'button', index: 6 });
    expect(runtime.resetProfileMapping(0)).toBe(true);
    expect(runtime.getResolvedProfile(0).source).toBe('family');
    expect(press(0)).toEqual(['GP_B0']);
    expect(press(5)).toEqual(['GP_B5']);
    expect(runtime.resetProfileMapping(0)).toBe(false);
  });
});

describe('manager.resetGamepadProfileMapping (F3)', () => {
  let manager;
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad(XBOX)] });
    manager = createBindManager({ namespace: `reset-${Math.random()}`, storage: { load: () => null, save() {} } });
  });
  afterEach(() => manager.destroy());

  it('discards the in-memory edits of a pad', () => {
    manager.setGamepadProfileMappingEntry(0, 'GP_B0', { kind: 'button', index: 3 });
    expect(manager.getResolvedGamepadProfile(0).source).toBe('memory-edit');
    expect(manager.resetGamepadProfileMapping(0)).toBe(true);
    expect(manager.getResolvedGamepadProfile(0).source).toBe('family');
    expect(manager.resetGamepadProfileMapping(0)).toBe(false);
  });
});
