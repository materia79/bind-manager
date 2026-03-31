import { describe, it, expect, beforeEach } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';

let testCounter = 0;

describe('ModalController integration behavior', () => {
  beforeEach(() => {
    testCounter += 1;
    document.body.innerHTML = '';
  });

  it('locks parallel capture and reset while capturing', () => {
    const manager = createBindManager({ namespace: `modal-test-${testCounter}` });
    manager.registerAction({
      id: 'forward',
      slots: 2,
      defaultBindings: ['KeyW', 'ArrowUp'],
    });

    manager.open();

    const bindButtons = document.querySelectorAll('.bm-bind-btn');
    expect(bindButtons.length).toBe(3); // 2 keyboard slots + 1 gamepad slot

    // Start capture on first slot
    bindButtons[0].click();

    const firstButton = document.querySelector('.bm-bind-btn[data-slot="0"]');
    const secondButton = document.querySelector('.bm-bind-btn[data-slot="1"]');
    const resetAllButton = document.querySelector('.bm-reset-all-btn');

    expect(firstButton.classList.contains('bm-capturing')).toBe(true);
    expect(secondButton.disabled).toBe(true);
    expect(resetAllButton.disabled).toBe(true);

    // Cancel capture using Escape
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));

    expect(firstButton.classList.contains('bm-capturing')).toBe(false);
    expect(secondButton.disabled).toBe(false);
    expect(resetAllButton.disabled).toBe(false);

    manager.destroy();
  });
});
