/**
 * GamepadRuntime tests.
 *
 * Because the Web Gamepad API requires real hardware and animation frames,
 * we test the runtime by directly calling _processGamepad() with synthetic
 * gamepad objects. We also test the public helper methods.
 *
 * jsdom does not provide navigator.getGamepads(), requestAnimationFrame, or
 * vibrationActuator, so all of those are stubbed here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

let __mockControllerProfile = null;
vi.mock('../../src/input/controller_definitions/index.js', () => ({
  findControllerProfileByGamepadId: () => __mockControllerProfile,
}));

import { GamepadRuntime } from '../../src/input/gamepad-runtime.js';
import { ActionRegistry } from '../../src/core/action-registry.js';
import { BindingStore } from '../../src/core/binding-store.js';
import { GP_B0, GP_B1, GP_B2, GP_A0N, GP_A0P, GP_A1N } from '../../src/input/gamepad-codes.js';

// ── Minimal fake gamepad factory ────────────────────────────────────────────

function makeGamepad(id = 'Fake Gamepad', index = 0, buttons = [], axes = []) {
  const btnCount = 17;
  const axisCount = 4;
  return {
    id,
    index,
    connected: true,
    buttons: Array.from({ length: btnCount }, (_, i) => ({
      pressed: buttons[i] ?? false,
      value:   buttons[i] ? 1 : 0,
    })),
    axes: Array.from({ length: axisCount }, (_, i) => axes[i] ?? 0),
    vibrationActuator: null,
  };
}

function makeMappedGamepad(id = '054c-0ce6-DualSense Wireless Controller', index = 0, buttons = {}, axes = {}) {
  const btnCount = 20;
  const axisCount = 12;
  return {
    id,
    index,
    connected: true,
    buttons: Array.from({ length: btnCount }, (_, i) => ({
      pressed: buttons[i] ?? false,
      value: buttons[i] ? 1 : 0,
    })),
    axes: Array.from({ length: axisCount }, (_, i) => axes[i] ?? 0),
    vibrationActuator: null,
  };
}

// ── Test setup ───────────────────────────────────────────────────────────────

function setup(options = {}) {
  const registry = new ActionRegistry();
  const store    = new BindingStore(registry);

  registry.register({ id: 'jump',    label: 'Jump',    slots: 1, gamepadSlots: 1 });
  registry.register({ id: 'moveX',   label: 'Move X',  slots: 1, gamepadSlots: 1, analog: true });
  registry.register({ id: 'special', label: 'Special', slots: 1, gamepadSlots: 1, playerIndex: 1 });

  store.init({});
  for (const action of registry.getAll()) store.initAction(action);

  // Bind GP_B0 to 'jump', GP_A0N to 'moveX', GP_B1 to 'special'
  store.set('jump',    0, GP_B0,  'gamepad');
  store.set('moveX',   0, GP_A0N, 'gamepad');
  store.set('special', 0, GP_B1,  'gamepad');

  const runtime = new GamepadRuntime(store, registry, options);
  return { registry, store, runtime };
}

beforeEach(() => {
  __mockControllerProfile = null;
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => [],
  });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GamepadRuntime — digital button events', () => {
  it('fires pressed when button goes from up to down', () => {
    const { runtime } = setup();
    const events = [];
    runtime.onAction('jump', e => events.push(e));

    runtime._processGamepad(makeGamepad('GP', 0, { 0: false }));
    expect(events).toHaveLength(0);

    runtime._processGamepad(makeGamepad('GP', 0, { 0: true }));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('pressed');
    expect(events[0].code).toBe(GP_B0);
    expect(events[0].device).toBe('gamepad');
  });

  it('fires held while button stays down', () => {
    const { runtime } = setup();
    const events = [];
    runtime.onAction('jump', e => events.push(e));

    runtime._processGamepad(makeGamepad('GP', 0, { 0: true }));  // pressed
    runtime._processGamepad(makeGamepad('GP', 0, { 0: true }));  // held
    runtime._processGamepad(makeGamepad('GP', 0, { 0: true }));  // held

    expect(events[0].type).toBe('pressed');
    expect(events[1].type).toBe('held');
    expect(events[2].type).toBe('held');
  });

  it('fires released when button goes up', () => {
    const { runtime } = setup();
    const events = [];
    runtime.onAction('jump', e => events.push(e));

    runtime._processGamepad(makeGamepad('GP', 0, { 0: true }));
    runtime._processGamepad(makeGamepad('GP', 0, { 0: false }));

    expect(events[1].type).toBe('released');
    expect(events[1].value).toBe(0);
  });

  it('does not fire for buttons with no binding', () => {
    const { runtime } = setup();
    const events = [];
    runtime.onAnyAction(e => events.push(e));

    // GP_B2 has no binding
    runtime._processGamepad(makeGamepad('GP', 0, { 2: true }));
    expect(events).toHaveLength(0);
  });
});

describe('GamepadRuntime — axis digital events', () => {
  const THRESHOLD = 0.5;

  it('fires pressed when axis crosses negative threshold', () => {
    const { runtime } = setup({ analogThreshold: THRESHOLD });
    const events = [];
    runtime.onAction('moveX', e => events.push(e.type));

    runtime._processGamepad(makeGamepad('GP', 0, {}, [0]));
    runtime._processGamepad(makeGamepad('GP', 0, {}, [-0.8]));
    expect(events).toContain('pressed');
  });

  it('fires held while axis stays beyond threshold', () => {
    const { runtime } = setup({ analogThreshold: THRESHOLD });
    const typeLog = [];
    runtime.onAction('moveX', e => { if (e.type !== 'analog') typeLog.push(e.type); });

    runtime._processGamepad(makeGamepad('GP', 0, {}, [-0.9])); // pressed + analog
    runtime._processGamepad(makeGamepad('GP', 0, {}, [-0.9])); // held + analog
    expect(typeLog).toEqual(['pressed', 'held']);
  });

  it('fires released when axis returns inside threshold', () => {
    const { runtime } = setup({ analogThreshold: THRESHOLD });
    const typeLog = [];
    runtime.onAction('moveX', e => { if (e.type !== 'analog') typeLog.push(e.type); });

    runtime._processGamepad(makeGamepad('GP', 0, {}, [-0.9])); // pressed + analog
    runtime._processGamepad(makeGamepad('GP', 0, {}, [0]));    // released
    expect(typeLog).toEqual(['pressed', 'released']);
  });

  it('does not fire digital events below deadband', () => {
    const { runtime } = setup({ deadband: 0.12, analogThreshold: THRESHOLD });
    const events = [];
    runtime.onAction('moveX', e => events.push(e));

    runtime._processGamepad(makeGamepad('GP', 0, {}, [-0.05])); // below deadband
    // No analog event either (below deadband)
    const analogEvents = events.filter(e => e.type === 'analog');
    expect(analogEvents).toHaveLength(0);
  });
});

describe('GamepadRuntime — analog events', () => {
  it('fires analog events above deadband when action.analog is true', () => {
    const { runtime } = setup({ deadband: 0.12 });
    const analogEvents = [];
    runtime.onAction('moveX', e => { if (e.type === 'analog') analogEvents.push(e); });

    runtime._processGamepad(makeGamepad('GP', 0, {}, [-0.7]));
    expect(analogEvents).toHaveLength(1);
    expect(analogEvents[0].value).toBeCloseTo(-0.7);
    expect(analogEvents[0].axisIndex).toBe(0);
  });

  it('does NOT fire analog for actions without analog:true', () => {
    const { runtime } = setup();
    const analogEvents = [];
    // 'jump' uses GP_B0, no analog flag
    runtime.onAction('jump', e => { if (e.type === 'analog') analogEvents.push(e); });

    runtime._processGamepad(makeGamepad('GP', 0, { 0: true }));
    expect(analogEvents).toHaveLength(0);
  });
});

describe('GamepadRuntime — playerIndex filtering', () => {
  it('fires events for playerIndex-matched gamepad only', () => {
    const { runtime } = setup();
    const events = [];
    runtime.onAction('special', e => events.push(e)); // playerIndex: 1

    // Gamepad index 0 — should NOT fire 'special'
    runtime._processGamepad(makeGamepad('GP', 0, { 1: true }));
    expect(events).toHaveLength(0);

    // Gamepad index 1 — SHOULD fire 'special'
    runtime._processGamepad(makeGamepad('GP', 1, { 1: true }));
    expect(events).toHaveLength(1);
    expect(events[0].gamepadIndex).toBe(1);
  });

  it('fires events for all gamepads when playerIndex is null (default)', () => {
    const { runtime } = setup();
    const events = [];
    runtime.onAction('jump', e => events.push(e)); // playerIndex: null

    runtime._processGamepad(makeGamepad('GP', 0, { 0: true }));
    runtime._processGamepad(makeGamepad('GP', 1, { 0: true }));
    runtime._processGamepad(makeGamepad('GP', 2, { 0: true }));
    expect(events).toHaveLength(3);
  });
});

describe('GamepadRuntime — gameplay suppression', () => {
  it('suppresses action events when setGameplaySuppressed(true)', () => {
    const { runtime } = setup();
    const events = [];
    runtime.onAction('jump', e => events.push(e));
    runtime.setGameplaySuppressed(true);

    runtime._processGamepad(makeGamepad('GP', 0, { 0: true }));
    expect(events).toHaveLength(0);
  });

  it('resumes events after setGameplaySuppressed(false)', () => {
    const { runtime } = setup();
    const events = [];
    runtime.onAction('jump', e => events.push(e));
    runtime.setGameplaySuppressed(true);
    runtime._processGamepad(makeGamepad('GP', 0, { 0: true }));
    runtime.setGameplaySuppressed(false);
    runtime._processGamepad(makeGamepad('GP', 0, { 0: false })); // release
    runtime._processGamepad(makeGamepad('GP', 0, { 0: true }));  // fresh press
    expect(events.some(e => e.type === 'pressed')).toBe(true);
  });
});

describe('GamepadRuntime — capture mode', () => {
  it('delivers first button press to capture callback and suppresses actions', () => {
    const { runtime } = setup();
    const actionEvents = [];
    runtime.onAction('jump', e => actionEvents.push(e));

    let captured = null;
    runtime.startCapture(code => { captured = code; });

    runtime._processGamepad(makeGamepad('GP', 0, { 0: true }));
    expect(captured).toBe(GP_B0);
    expect(actionEvents).toHaveLength(0); // no action events during capture
  });

  it('delivers first axis push to capture callback', () => {
    const { runtime } = setup({ analogThreshold: 0.5 });
    let captured = null;
    runtime.startCapture(code => { captured = code; });

    runtime._processGamepad(makeGamepad('GP', 0, {}, [-0.9]));
    expect(captured).toBe(GP_A0N);
  });

  it('calls callback with null on cancelCapture', () => {
    const { runtime } = setup();
    let captured = 'NOT_SET';
    runtime.startCapture(code => { captured = code; });
    runtime.cancelCapture();
    expect(captured).toBeNull();
  });

  it('calls callback with null when the gamepad disconnects during capture', () => {
    const { runtime } = setup();
    let captured = 'NOT_SET';
    runtime.startCapture(code => { captured = code; });

    runtime._handleDisconnect({ gamepad: makeGamepad('GP', 0) });

    expect(captured).toBeNull();
  });

  it('cancels previous capture when startCapture is called again', () => {
    const { runtime } = setup();
    const results = [];
    runtime.startCapture(code => results.push({ first: code }));
    runtime.startCapture(code => results.push({ second: code }));
    // First capture should have been cancelled with null
    expect(results.length).toBe(1);
    expect(results[0]).toEqual({ first: null });
  });

  it('does not fire action events while in capture mode', () => {
    const { runtime } = setup();
    const actionEvents = [];
    runtime.onAnyAction(e => actionEvents.push(e));
    runtime.startCapture(() => {});

    runtime._processGamepad(makeGamepad('GP', 0, { 0: true }));
    expect(actionEvents).toHaveLength(0);
  });
});

describe('GamepadRuntime — isPressed', () => {
  it('returns true for a pressed button', () => {
    const { runtime } = setup();
    runtime._processGamepad(makeGamepad('GP', 0, { 0: true }));
    expect(runtime.isPressed(GP_B0)).toBe(true);
  });

  it('returns false for a released button', () => {
    const { runtime } = setup();
    runtime._processGamepad(makeGamepad('GP', 0, { 0: true }));
    runtime._processGamepad(makeGamepad('GP', 0, { 0: false }));
    expect(runtime.isPressed(GP_B0)).toBe(false);
  });

  it('returns true when axis exceeds threshold in correct direction', () => {
    const { runtime } = setup({ analogThreshold: 0.5 });
    runtime._processGamepad(makeGamepad('GP', 0, {}, [-0.9]));
    expect(runtime.isPressed(GP_A0N)).toBe(true);
    expect(runtime.isPressed(GP_A0P)).toBe(false);
  });

  it('returns false for unknown/invalid codes', () => {
    const { runtime } = setup();
    expect(runtime.isPressed('')).toBe(false);
    expect(runtime.isPressed('KeyW')).toBe(false);
    expect(runtime.isPressed('INVALID')).toBe(false);
  });
});

describe('GamepadRuntime — onAnyAction', () => {
  it('receives events from all bound actions', () => {
    const { runtime } = setup();
    const events = [];
    runtime.onAnyAction(e => events.push(e.actionId));

    runtime._processGamepad(makeGamepad('GP', 0, { 0: true })); // jump
    expect(events).toContain('jump');
  });

  it('unsubscribes cleanly', () => {
    const { runtime } = setup();
    const events = [];
    const unsub = runtime.onAnyAction(e => events.push(e));
    unsub();

    runtime._processGamepad(makeGamepad('GP', 0, { 0: true }));
    expect(events).toHaveLength(0);
  });
});

describe('GamepadRuntime — controller definition mapping', () => {
  it('exposes resolved profile details and exact labels for the active gamepad', () => {
    __mockControllerProfile = {
      key: '054c-0ce6',
      vendorId: '054c',
      productId: '0ce6',
      profileHint: 'dualsense',
      family: 'dualsense',
      labels: {
        GP_B12: 'D-Pad Up',
      },
      mapping: {},
    };

    const { runtime } = setup();
    const gamepad = makeMappedGamepad(undefined, 0, {}, {});
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [gamepad],
    });

    const resolved = runtime.getResolvedProfile(0);

    expect(resolved.source).toBe('exact');
    expect(resolved.profileKey).toBe('054c-0ce6');
    expect(runtime.getActiveProfile(0)).toBe('dualsense');
    expect(runtime.getLabelForCode('GP_B12', 0)).toBe('D-Pad Up');
  });

  it('applies manual family overrides ahead of exact generated labels', () => {
    __mockControllerProfile = {
      key: '054c-0ce6',
      vendorId: '054c',
      productId: '0ce6',
      profileHint: 'dualsense',
      family: 'dualsense',
      labels: {
        GP_B12: 'D-Pad Up',
      },
      mapping: {},
    };

    const { runtime } = setup({
      profileOverrides: {
        '054c-0ce6': { type: 'family', family: 'dualsense' },
      },
    });
    const gamepad = makeMappedGamepad(undefined, 0, {}, {});
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [gamepad],
    });

    const resolved = runtime.getResolvedProfile(0);

    expect(resolved.source).toBe('manual');
    expect(runtime.getLabelForCode('GP_B12', 0)).toBe('D-Up');
  });

  it('dispatches logical GP_B0 when mapped physical button index is pressed', () => {
    __mockControllerProfile = {
      vendorId: '054c',
      productId: '0ce6',
      profileHint: 'dualsense',
      mapping: {
        GP_B0: { kind: 'button', index: 1 },
      },
    };

    const { runtime } = setup();
    const events = [];
    runtime.onAction('jump', (e) => events.push(e));

    runtime._processGamepad(makeMappedGamepad(undefined, 0, { 1: true }, {}));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('pressed');
    expect(events[0].code).toBe('GP_B0');
  });

  it('treats mapped axis direction as logical button for digital dispatch', () => {
    __mockControllerProfile = {
      vendorId: '054c',
      productId: '0ce6',
      profileHint: 'dualsense',
      mapping: {
        GP_B0: { kind: 'axis', index: 9, direction: 'negative' },
      },
    };

    const { runtime } = setup({ analogThreshold: 0.5 });
    const events = [];
    runtime.onAction('jump', (e) => events.push(e));

    runtime._processGamepad(makeMappedGamepad(undefined, 0, {}, { 9: -1 }));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('pressed');
    expect(events[0].code).toBe('GP_B0');
  });

  it('maps logical axis GP_A0N/GP_A0P from configured physical axis and supports analog events', () => {
    __mockControllerProfile = {
      vendorId: '054c',
      productId: '0ce6',
      profileHint: 'dualsense',
      mapping: {
        GP_A0N: { kind: 'axis', index: 5, direction: 'negative' },
        GP_A0P: { kind: 'axis', index: 5, direction: 'positive' },
      },
    };

    const { runtime } = setup({ analogThreshold: 0.5, deadband: 0.12 });
    const events = [];
    runtime.onAction('moveX', (e) => events.push(e));

    runtime._processGamepad(makeMappedGamepad(undefined, 0, {}, { 5: -0.9 }));

    const pressed = events.find((e) => e.type === 'pressed');
    const analog = events.find((e) => e.type === 'analog');
    expect(pressed?.code).toBe('GP_A0N');
    expect(analog?.axisIndex).toBe(0);
    expect(analog?.value).toBeCloseTo(-0.9);
  });

  it('distinguishes D-pad directions when mapped as hat values on one axis', () => {
    __mockControllerProfile = {
      vendorId: '054c',
      productId: '0ce6',
      profileHint: 'dualsense',
      mapping: {
        GP_B12: { kind: 'hat', index: 9, value: -1.0, tolerance: 0.2 },
        GP_B13: { kind: 'hat', index: 9, value: 0.142857, tolerance: 0.2 },
        GP_B14: { kind: 'hat', index: 9, value: 0.714286, tolerance: 0.2 },
        GP_B15: { kind: 'hat', index: 9, value: -0.428571, tolerance: 0.2 },
      },
    };

    const { registry, store, runtime } = setup({ analogThreshold: 0.5 });
    registry.register({ id: 'dpadUp', label: 'DPad Up', slots: 1, gamepadSlots: 1 });
    registry.register({ id: 'dpadDown', label: 'DPad Down', slots: 1, gamepadSlots: 1 });
    registry.register({ id: 'dpadLeft', label: 'DPad Left', slots: 1, gamepadSlots: 1 });
    registry.register({ id: 'dpadRight', label: 'DPad Right', slots: 1, gamepadSlots: 1 });
    store.initAction(registry.get('dpadUp'));
    store.initAction(registry.get('dpadDown'));
    store.initAction(registry.get('dpadLeft'));
    store.initAction(registry.get('dpadRight'));
    store.set('dpadUp', 0, 'GP_B12', 'gamepad');
    store.set('dpadDown', 0, 'GP_B13', 'gamepad');
    store.set('dpadLeft', 0, 'GP_B14', 'gamepad');
    store.set('dpadRight', 0, 'GP_B15', 'gamepad');

    const hit = [];
    runtime.onAnyAction((e) => {
      if (e.type === 'pressed') hit.push(e.actionId);
    });

    runtime._processGamepad(makeMappedGamepad(undefined, 0, {}, { 9: -1.0 }));
    runtime._processGamepad(makeMappedGamepad(undefined, 0, {}, { 9: 1.285714 }));

    runtime._processGamepad(makeMappedGamepad(undefined, 0, {}, { 9: 0.142857 }));
    runtime._processGamepad(makeMappedGamepad(undefined, 0, {}, { 9: 1.285714 }));

    runtime._processGamepad(makeMappedGamepad(undefined, 0, {}, { 9: 0.714286 }));
    runtime._processGamepad(makeMappedGamepad(undefined, 0, {}, { 9: 1.285714 }));

    runtime._processGamepad(makeMappedGamepad(undefined, 0, {}, { 9: -0.428571 }));

    expect(hit).toContain('dpadUp');
    expect(hit).toContain('dpadDown');
    expect(hit).toContain('dpadLeft');
    expect(hit).toContain('dpadRight');
  });

  it('capture returns the intended hat-mapped D-pad code instead of always GP_B12', () => {
    __mockControllerProfile = {
      vendorId: '054c',
      productId: '0ce6',
      profileHint: 'dualsense',
      mapping: {
        GP_B12: { kind: 'hat', index: 9, value: -1.0, tolerance: 0.2 },
        GP_B13: { kind: 'hat', index: 9, value: 0.142857, tolerance: 0.2 },
        GP_B14: { kind: 'hat', index: 9, value: 0.714286, tolerance: 0.2 },
        GP_B15: { kind: 'hat', index: 9, value: -0.428571, tolerance: 0.2 },
      },
    };

    const { runtime } = setup({ analogThreshold: 0.5 });
    let captured = null;
    runtime.startCapture((code) => { captured = code; });

    runtime._processGamepad(makeMappedGamepad(undefined, 0, {}, { 9: 1.285714 }));
    runtime._processGamepad(makeMappedGamepad(undefined, 0, {}, { 9: 0.142857 }));

    expect(captured).toBe('GP_B13');
  });
});
