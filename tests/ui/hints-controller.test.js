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
          mapping: '',
          buttons: Array.from({ length: 14 }, () => ({ pressed: false, value: 0 })),
          axes: new Array(12).fill(0),
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

  it('gives each hint label a title with the full text', () => {
    const manager = createBindManager({ namespace: `hints-test-${testCounter}` });
    const label = 'A hint label that is far too long to fit on any reasonable screen, eighty chars';
    manager.registerAction({ id: 'long', label, slots: 1, defaultBindings: ['KeyL'] }).showHint();

    const el = document.querySelector('.bm-hint-label');
    expect(el.getAttribute('title')).toBe(label);

    manager.destroy();
  });
});
