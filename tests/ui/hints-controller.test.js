import { describe, it, expect, beforeEach } from 'vitest';

import { createBindManager } from '../../src/core/bind-manager.js';

let testCounter = 0;

describe('HintsController gamepad labels', () => {
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

  it('renders exact generated labels in hints instead of family fallback labels', () => {
    const manager = createBindManager({ namespace: `hints-test-${testCounter}` });
    const action = manager.registerAction({
      id: 'open-map',
      label: 'Open Map',
      slots: 1,
      gamepadSlots: 1,
      defaultBindings: ['KeyM'],
      defaultGamepadBindings: ['GP_B12'],
    });

    action.showHint();

    const hintBar = document.querySelector('.bm-hints');
    expect(hintBar?.textContent).toContain('D-Pad Up');
    expect(hintBar?.textContent).not.toContain('D-Up');

    manager.destroy();
  });
});
