/**
 * L6: the resolved profile is cached per pad index. When a different pad
 * appears at an index without a disconnect in between (a real pad's
 * gamepadconnected while another object already holds slot 0, as the demo's
 * simulated controller does), the old pad's profile must not stay.
 */
import { describe, it, expect } from 'vitest';
import { GamepadRuntime } from '../../src/input/gamepad-runtime.js';
import { ActionRegistry } from '../../src/core/action-registry.js';
import { BindingStore } from '../../src/core/binding-store.js';

const pad = (id, buttons = 18) => ({
  id, index: 0, connected: true, mapping: 'standard',
  buttons: Array.from({ length: buttons }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0],
});

describe('GamepadRuntime — L6: a new pad at the same index', () => {
  it('re-resolves when the Gamepad.id at an index changes', () => {
    const registry = new ActionRegistry();
    const store = new BindingStore(registry);
    store.init({});
    const runtime = new GamepadRuntime(store, registry);
    let current = pad('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)');
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [current] });

    runtime._processGamepad(current);
    expect(runtime.getResolvedProfile(0).family).toBe('dualsense');
    expect(runtime.getLabelForCode('GP_B0', 0)).toBe('Cross');

    // Another pad takes slot 0; no gamepaddisconnected in between.
    current = pad('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)');
    runtime._processGamepad(current);
    expect(runtime.getResolvedProfile(0).family).toBe('xbox');
    expect(runtime.getLabelForCode('GP_B0', 0)).toBe('A');
    expect(runtime.getConnectedGamepads()[0].profile).toBe('xbox');
  });
});
