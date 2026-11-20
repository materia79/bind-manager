/**
 * The public fix 4efef61 (half-axis analog actions, one value-0 event on
 * return to the deadband) combined with this branch: the releases on suppress
 * and on disconnect, exact profiles and in-memory mapping edits. The commit's
 * own tests live in tests/input/gamepad-runtime.test.js.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GamepadRuntime } from '../../src/input/gamepad-runtime.js';
import { ActionRegistry } from '../../src/core/action-registry.js';
import { BindingStore } from '../../src/core/binding-store.js';

const XBOX = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)';
const DS_RAW = '054c-0ce6-DualSense Wireless Controller';

function pad({ id = XBOX, mapping = 'standard', buttons = 17, axes = [0, 0, 0, 0] } = {}) {
  return { id, index: 0, connected: true, mapping, buttons: Array.from({ length: buttons }, () => ({ pressed: false, value: 0 })), axes };
}

/** Analog actions: left = GP_AxN, right = GP_AxP, steer = both halves (x = axis). */
function setup(axis = 0) {
  const registry = new ActionRegistry();
  const store = new BindingStore(registry);
  for (const id of ['left', 'right', 'steer', 'up']) registry.register({ id, slots: 1, gamepadSlots: 2, analog: true });
  store.init({});
  for (const action of registry.getAll()) store.initAction(action);
  store.set('left', 0, `GP_A${axis}N`, 'gamepad');
  store.set('right', 0, `GP_A${axis}P`, 'gamepad');
  store.set('steer', 0, `GP_A${axis}N`, 'gamepad');
  store.set('steer', 1, `GP_A${axis}P`, 'gamepad');
  store.set('up', 0, 'GP_A1N', 'gamepad');
  const runtime = new GamepadRuntime(store, registry, { deadband: 0.12 });
  const events = [];
  runtime.onAnyAction((e) => { if (e.type === 'analog') events.push(`${e.actionId}=${Math.round(e.value * 100) / 100}`); });
  const take = () => events.splice(0);
  return { runtime, take };
}

beforeEach(() => {
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
});

describe('half-axis analog actions and this branch (4efef61 combined)', () => {
  it('opening the modal sends 0 once per action whose half was active, nothing to the idle half', () => {
    const { runtime, take } = setup();
    runtime._processGamepad(pad({ axes: [-0.6, -0.5, 0, 0] }));
    expect(take().sort()).toEqual(['left=-0.6', 'steer=-0.6', 'up=-0.5']);
    runtime.setGameplaySuppressed(true);
    expect(take().sort()).toEqual(['left=0', 'steer=0', 'up=0']);
    // Polled while suppressed, released, gameplay back: no second 0.
    runtime._processGamepad(pad({ axes: [0, 0, 0, 0] }));
    runtime.setGameplaySuppressed(false);
    runtime._processGamepad(pad({ axes: [0, 0, 0, 0] }));
    expect(take()).toEqual([]);
  });

  it('suppress then un-suppress at once, stick released on the next frame: still one 0', () => {
    const { runtime, take } = setup();
    runtime._processGamepad(pad({ axes: [-0.6, 0, 0, 0] }));
    take();
    runtime.setGameplaySuppressed(true);
    runtime.setGameplaySuppressed(false);
    expect(take().sort()).toEqual(['left=0', 'steer=0']);
    runtime._processGamepad(pad({ axes: [0, 0, 0, 0] }));
    expect(take()).toEqual([]);
  });

  it('a stick still held when gameplay resumes sends its value again', () => {
    const { runtime, take } = setup();
    runtime._processGamepad(pad({ axes: [0.7, 0, 0, 0] }));
    runtime.setGameplaySuppressed(true);
    runtime.setGameplaySuppressed(false);
    take();
    runtime._processGamepad(pad({ axes: [0.7, 0, 0, 0] }));
    expect(take().sort()).toEqual(['right=0.7', 'steer=0.7']);
  });

  it('a disconnect sends 0 once to the active half only', () => {
    const { runtime, take } = setup();
    runtime._processGamepad(pad({ axes: [0.8, 0, 0, 0] }));
    take();
    runtime._handleDisconnect({ gamepad: pad() });
    expect(take().sort()).toEqual(['right=0', 'steer=0']);
  });

  it('two actions on the two halves: a direct swing from one side to the other', () => {
    const { runtime, take } = setup();
    runtime._processGamepad(pad({ axes: [0.6, 0, 0, 0] }));
    expect(take().sort()).toEqual(['right=0.6', 'steer=0.6']);
    runtime._processGamepad(pad({ axes: [-0.6, 0, 0, 0] }));
    expect(take().sort()).toEqual(['left=-0.6', 'right=0', 'steer=-0.6']);
    runtime._processGamepad(pad({ axes: [-0.05, 0, 0, 0] }));
    expect(take().sort()).toEqual(['left=0', 'steer=0']);
  });

  it('an exact profile mapping an axis: the half comes from the mapped raw axis', () => {
    // The shipped 054c-0ce6 profile maps the right stick Y (GP_A3N / GP_A3P) to raw axis 5.
    const { runtime, take } = setup(3);
    const raw = (axes) => pad({ id: DS_RAW, mapping: '', buttons: 14, axes: Object.assign(new Array(12).fill(0), { 9: 1 }, axes) });
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [raw({})] });
    expect(runtime.getResolvedProfile(0).source).toBe('exact');
    runtime._processGamepad(raw({}));
    runtime._processGamepad(raw({ 5: -0.7 }));
    expect(take().sort()).toEqual(['left=-0.7', 'steer=-0.7']);
    runtime._processGamepad(raw({ 3: -0.9 })); // raw axis 3 is the L2 analog, not GP_A3
    expect(take().sort()).toEqual(['left=0', 'steer=0']);
  });

  it('an in-memory mapping edit on that axis: only the edited half moves to its new input', () => {
    const { runtime, take } = setup();
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad()] });
    runtime.setProfileMappingEntry(0, 'GP_A0N', { kind: 'axis', index: 2, direction: 'negative' });
    runtime._processGamepad(pad());
    runtime._processGamepad(pad({ axes: [0, 0, -0.6, 0] }));
    expect(take().sort()).toEqual(['left=-0.6', 'steer=-0.6']);
    runtime._processGamepad(pad({ axes: [0.5, 0, 0, 0] })); // GP_A0P is still raw axis 0
    expect(take().sort()).toEqual(['left=0', 'right=0.5', 'steer=0.5']);
    runtime._processGamepad(pad({ axes: [-0.6, 0, 0, 0] })); // raw axis 0 negative no longer drives GP_A0N
    expect(take().sort()).toEqual(['right=0', 'steer=0']);
  });

  it('events of a half-bound action name their half in `code`; both-half actions have none', () => {
    const registry = new ActionRegistry();
    const store = new BindingStore(registry);
    registry.register({ id: 'left', slots: 1, gamepadSlots: 1, analog: true });
    registry.register({ id: 'steer', slots: 1, gamepadSlots: 2, analog: true });
    store.init({});
    for (const action of registry.getAll()) store.initAction(action);
    store.set('left', 0, 'GP_A0N', 'gamepad');
    store.set('steer', 0, 'GP_A0N', 'gamepad');
    store.set('steer', 1, 'GP_A0P', 'gamepad');
    const runtime = new GamepadRuntime(store, registry);
    const got = {};
    runtime.onAnyAction((e) => { if (e.type === 'analog') got[e.actionId] = e.code; });
    runtime._processGamepad(pad({ axes: [-0.6, 0, 0, 0] }));
    expect(got).toEqual({ left: 'GP_A0N', steer: undefined });
  });
});
