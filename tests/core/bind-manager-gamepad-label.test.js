import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createBindManager } from '../../src/core/bind-manager.js';

function pad(id, index, buttonCount = 17) {
  return {
    id,
    index,
    connected: true,
    mapping: 'standard',
    buttons: Array.from({ length: buttonCount }, () => ({ pressed: false, value: 0 })),
    axes: [0, 0, 0, 0],
  };
}

describe('manager.getGamepadLabel without an index', () => {
  let manager = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    // Slot 0 is empty (pad unplugged), slot 1 holds a DualSense.
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [null, pad('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', 1, 18), null, null],
    });
    manager = createBindManager({ namespace: 'label-first-connected', storage: { load: () => null, save() {} } });
  });

  afterEach(() => manager?.destroy());

  it('uses the first connected pad when pad 0 is absent', () => {
    expect(manager.getGamepadLabel('GP_B0')).toBe('Cross');
    expect(manager.getGamepadLabel('GP_B17')).toBe('Touchpad');
  });

  it('an explicit index still selects that pad', () => {
    expect(manager.getGamepadLabel('GP_B0', 1)).toBe('Cross');
    expect(manager.getGamepadLabel('GP_B0', 0)).toBe('Btn 0');
  });
});
