import { describe, it, expect, beforeEach } from 'vitest';

import { createBindManager } from '../../src/core/bind-manager.js';

let testCounter = 0;

describe('BindManager gamepad profile overrides', () => {
  beforeEach(() => {
    testCounter += 1;
    document.body.innerHTML = '';
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [
        {
          id: '054c-0ce6-DualSense Wireless Controller',
          index: 0,
          connected: true,
          buttons: [],
          axes: [],
        },
      ],
    });
  });

  it('persists manual profile overrides across manager instances', () => {
    const bindingsState = { value: null };
    const overridesState = { value: {} };
    const storage = {
      load() {
        return bindingsState.value;
      },
      save(bindings) {
        bindingsState.value = bindings;
      },
      clear() {
        bindingsState.value = null;
        overridesState.value = {};
      },
      loadGamepadProfileOverrides() {
        return overridesState.value;
      },
      saveGamepadProfileOverrides(overrides) {
        overridesState.value = overrides;
      },
    };

    const managerA = createBindManager({ namespace: `profile-persist-${testCounter}`, storage });
    expect(managerA.getResolvedGamepadProfile(0).source).toBe('exact');
    managerA.setGamepadProfileOverride(0, { type: 'family', family: 'dualsense' });
    expect(managerA.getResolvedGamepadProfile(0).source).toBe('manual');
    expect(managerA.getGamepadLabel('GP_B12', 0)).toBe('D-Up');
    managerA.destroy();

    const managerB = createBindManager({ namespace: `profile-persist-${testCounter}`, storage });
    expect(managerB.getResolvedGamepadProfile(0).source).toBe('manual');
    expect(managerB.getGamepadLabel('GP_B12', 0)).toBe('D-Up');
    managerB.destroy();
  });
});
