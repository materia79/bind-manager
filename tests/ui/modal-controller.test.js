import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';
import { ModalController } from '../../src/ui/modal-controller.js';

let testCounter = 0;

describe('ModalController integration behavior', () => {
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

    const captureOverlay = document.querySelector('.bm-capture-overlay');
    expect(captureOverlay?.getAttribute('aria-hidden')).toBe('false');

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
    expect(captureOverlay?.getAttribute('aria-hidden')).toBe('true');

    manager.destroy();
  });

  it('keeps the bindings modal open when Escape cancels from the capture dialog', () => {
    const manager = createBindManager({ namespace: `modal-test-${testCounter}` });
    manager.registerAction({
      id: 'forward',
      slots: 1,
      gamepadSlots: 1,
      defaultBindings: ['KeyW'],
      defaultGamepadBindings: ['GP_B12'],
    });

    manager.open();

    const keyboardButton = document.querySelector('.bm-bind-btn[data-device="keyboard"]');
    keyboardButton.click();

    const captureDialog = document.querySelector('.bm-capture-modal');
    expect(captureDialog).not.toBeNull();

    captureDialog.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));

    expect(manager.isOpen()).toBe(true);
    expect(document.querySelector('.bm-overlay')?.style.display).toBe('flex');
    expect(document.querySelector('.bm-capture-overlay')?.getAttribute('aria-hidden')).toBe('true');

    manager.destroy();
  });

  it('opens the dedicated capture dialog for gamepad rebinding and closes it on cancel', () => {
    const manager = createBindManager({ namespace: `modal-test-${testCounter}` });
    manager.registerAction({
      id: 'forward',
      slots: 1,
      gamepadSlots: 1,
      defaultBindings: ['KeyW'],
      defaultGamepadBindings: ['GP_B12'],
    });

    manager.open();

    const gamepadButton = document.querySelector('.bm-bind-btn[data-device="gamepad"]');
    gamepadButton.click();

    expect(document.querySelector('.bm-capture-overlay')?.getAttribute('aria-hidden')).toBe('false');

    const cancelButton = document.querySelector('.bm-capture-cancel-btn');
    cancelButton.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(manager.isOpen()).toBe(true);
    expect(document.querySelector('.bm-capture-overlay')?.getAttribute('aria-hidden')).toBe('true');

    manager.destroy();
  });

  it('renders exact generated gamepad labels in the modal', () => {
    const manager = createBindManager({ namespace: `modal-test-${testCounter}` });
    manager.registerAction({
      id: 'forward',
      slots: 1,
      gamepadSlots: 1,
      defaultBindings: ['KeyW'],
      defaultGamepadBindings: ['GP_B12'],
    });

    manager.open();

    const gamepadButton = document.querySelector('.bm-bind-btn[data-device="gamepad"]');
    expect(gamepadButton?.textContent).toBe('D-Pad Up');

    manager.destroy();
  });

  it('allows overriding the active profile from the modal selector', () => {
    const manager = createBindManager({ namespace: `modal-test-${testCounter}` });
    manager.registerAction({
      id: 'forward',
      slots: 1,
      gamepadSlots: 1,
      defaultBindings: ['KeyW'],
      defaultGamepadBindings: ['GP_B12'],
    });

    manager.open();

    const select = document.querySelector('.bm-profile-select');
    expect(select).not.toBeNull();
    select.value = 'family:dualsense';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const gamepadButton = document.querySelector('.bm-bind-btn[data-device="gamepad"]');
    expect(gamepadButton?.textContent).toBe('D-Up');

    manager.destroy();
  });

  it('renders configured footer actions and invokes them', () => {
    let clicked = 0;
    const manager = createBindManager({
      namespace: `modal-test-${testCounter}`,
      footerActions: [{ id: 'test-action', label: 'Test', onClick: () => { clicked += 1; } }],
    });
    manager.registerAction({
      id: 'forward',
      slots: 1,
      gamepadSlots: 1,
      defaultBindings: ['KeyW'],
      defaultGamepadBindings: ['GP_B12'],
    });

    manager.open();

    const footerAction = document.querySelector('.bm-footer-action-btn[data-footer-action-id="test-action"]');
    expect(footerAction?.textContent).toBe('Test');

    footerAction.click();
    expect(clicked).toBe(1);

    manager.destroy();
  });

  it('registers gamepad change listeners once and removes them on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const refreshSpy = vi.spyOn(ModalController.prototype, '_updateBindButtons');

    const manager = createBindManager({ namespace: `modal-test-${testCounter}` });
    manager.registerAction({
      id: 'forward',
      slots: 2,
      gamepadSlots: 1,
      defaultBindings: ['KeyW', 'ArrowUp'],
      defaultGamepadBindings: ['GP_B12'],
    });

    const countAdds = (type) => addSpy.mock.calls.filter(([t]) => t === type).length;
    const countRemoves = (type) => removeSpy.mock.calls.filter(([t]) => t === type).length;

    // Listeners are registered during mount(), before any binding change
    const addsAfterMount = countAdds('bm-gamepad-connected');
    expect(addsAfterMount).toBeGreaterThanOrEqual(1);

    manager.open();

    // Several binding changes must not re-register the gamepad listeners
    manager.setBinding('forward', 0, 'KeyI');
    manager.setBinding('forward', 1, 'KeyK');
    manager.setBinding('forward', 0, 'KeyJ');

    expect(countAdds('bm-gamepad-connected')).toBe(addsAfterMount);
    expect(countAdds('bm-gamepad-disconnected')).toBe(addsAfterMount);
    expect(countAdds('bm-gamepad-profile-changed')).toBe(addsAfterMount);

    refreshSpy.mockClear();
    window.dispatchEvent(new Event('bm-gamepad-connected'));
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('bm-gamepad-connected'));
    expect(refreshSpy).toHaveBeenCalledTimes(2);

    manager.destroy();

    // Every registered listener is removed again on unmount
    expect(countRemoves('bm-gamepad-connected')).toBe(addsAfterMount);
    expect(countRemoves('bm-gamepad-disconnected')).toBe(addsAfterMount);
    expect(countRemoves('bm-gamepad-profile-changed')).toBe(addsAfterMount);

    refreshSpy.mockClear();
    window.dispatchEvent(new Event('bm-gamepad-connected'));
    expect(refreshSpy).not.toHaveBeenCalled();

    addSpy.mockRestore();
    removeSpy.mockRestore();
    refreshSpy.mockRestore();
  });
});
