import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';

// Bug A6: focus and scroll position were lost whenever the modal re-rendered.

let testCounter = 0;
let manager = null;

const DUALSENSE = {
  id: '054c-0ce6-DualSense Wireless Controller',
  index: 0,
  connected: true,
  mapping: '',
  buttons: Array.from({ length: 14 }, () => ({ pressed: false, value: 0 })),
  axes: new Array(12).fill(0),
};

function setGamepads(pads) {
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => pads,
  });
}

function createManager(options = {}) {
  manager = createBindManager({ namespace: `modal-focus-test-${testCounter}`, ...options });
  manager.registerAction({ id: 'forward', label: 'Forward', group: 'Move', slots: 2, defaultBindings: ['KeyW', 'ArrowUp'] });
  manager.registerAction({ id: 'back', label: 'Back', group: 'Move', slots: 2, defaultBindings: ['KeyS', 'ArrowDown'] });
  manager.registerAction({ id: 'jump', label: 'Jump', group: 'Move', slots: 1, gamepadSlots: 1, defaultBindings: ['Space'], defaultGamepadBindings: ['GP_B0'] });
  return manager;
}

const overlay = () => document.querySelector('.bm-overlay');
const modalBody = () => document.querySelector('.bm-modal-body');

/** Escape as a real key press would arrive: on the focused element, bubbling. */
function pressEscape() {
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true }));
}

function pressTab(shiftKey = false) {
  const target = document.activeElement ?? document.body;
  const event = new KeyboardEvent('keydown', { code: 'Tab', key: 'Tab', shiftKey, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function expectFocusInsideModal() {
  expect(document.activeElement).not.toBe(document.body);
  expect(overlay().contains(document.activeElement)).toBe(true);
}

describe('ModalController focus and scroll (A6)', () => {
  beforeEach(() => {
    testCounter += 1;
    document.body.innerHTML = '';
    setGamepads([DUALSENSE]);
  });

  afterEach(() => {
    manager?.destroy();
    manager = null;
  });

  it('keeps focus inside the modal after a per-action reset, and Escape still closes it', () => {
    createManager();
    manager.open();
    manager.setBinding('forward', 0, 'KeyI');

    const resetBtn = document.querySelector('.bm-action-reset-btn[data-action-id="forward"]');
    resetBtn.focus();
    resetBtn.click();

    expect(manager.getBinding('forward')[0]).toBe('KeyW');
    expect(document.querySelector('.bm-bind-btn[data-action-id="forward"][data-slot="0"]').textContent).toBe('W');
    expectFocusInsideModal();
    expect(document.activeElement).toBe(resetBtn);

    pressEscape();
    expect(manager.isOpen()).toBe(false);
  });

  it('keeps focus inside the modal after Reset All, and Escape still closes it', () => {
    createManager();
    manager.open();
    manager.setBinding('back', 1, 'KeyK');

    const resetAll = document.querySelector('.bm-reset-all-btn');
    resetAll.focus();
    resetAll.click();

    expect(manager.getBinding('back')[1]).toBe('ArrowDown');
    expectFocusInsideModal();

    pressEscape();
    expect(manager.isOpen()).toBe(false);
  });

  it('keeps focus on the profile select after a profile change, and Escape still closes it', () => {
    createManager();
    manager.open();

    const select = document.querySelector('.bm-profile-select');
    select.focus();
    select.value = 'family:dualsense';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expectFocusInsideModal();
    expect(document.activeElement.classList.contains('bm-profile-select')).toBe(true);
    expect(document.activeElement.value).toBe('family:dualsense');
    // A chosen profile is a manual override
    expect(document.querySelector('.bm-profile-chip')?.textContent).toBe('Manual · DualSense');

    pressEscape();
    expect(manager.isOpen()).toBe(false);
  });

  it('does not rebuild the modal on reset or profile change', () => {
    createManager();
    manager.open();
    const modal = document.querySelector('.bm-modal');

    document.querySelector('.bm-action-reset-btn[data-action-id="jump"]').click();
    document.querySelector('.bm-reset-all-btn').click();
    const select = document.querySelector('.bm-profile-select');
    select.value = 'family:dualsense';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(document.querySelector('.bm-modal')).toBe(modal);
  });

  it('preserves body scrollTop and the focused bind button across refresh()', () => {
    createManager();
    manager.open();

    modalBody().scrollTop = 120;
    const btn = document.querySelector('.bm-bind-btn[data-action-id="back"][data-slot="1"][data-device="keyboard"]');
    btn.focus();

    // Registering an action while open triggers refresh()
    manager.registerAction({ id: 'crouch', label: 'Crouch', group: 'Move', slots: 1, defaultBindings: ['KeyC'] });

    expect(document.querySelector('.bm-bind-btn[data-action-id="crouch"]')).not.toBeNull();
    expect(modalBody().scrollTop).toBe(120);
    const focused = document.activeElement;
    expect(focused.classList.contains('bm-bind-btn')).toBe(true);
    expect(focused.dataset.actionId).toBe('back');
    expect(focused.dataset.slot).toBe('1');
    expect(focused.dataset.device).toBe('keyboard');

    pressEscape();
    expect(manager.isOpen()).toBe(false);
  });

  it('restores body scrollTop when the modal is reopened', () => {
    createManager();
    manager.open();
    modalBody().scrollTop = 80;
    manager.close();
    manager.open();
    expect(modalBody().scrollTop).toBe(80);
  });

  it('returns focus to the opener on close', () => {
    createManager();
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.appendChild(opener);
    opener.focus();

    manager.open();
    expectFocusInsideModal();

    pressEscape();
    expect(manager.isOpen()).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('cycles Tab and Shift+Tab inside the modal', () => {
    createManager();
    manager.open();

    const focusables = [...document.querySelectorAll('.bm-modal button, .bm-modal select')]
      .filter((el) => !el.disabled && getComputedStyle(el).visibility !== 'hidden');
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    expect(first.classList.contains('bm-close-btn')).toBe(true);
    expect(last.classList.contains('bm-reset-all-btn')).toBe(true);

    last.focus();
    const forward = pressTab();
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    const backward = pressTab(true);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    // From the modal container itself (focused on open), Tab enters the modal
    document.querySelector('.bm-modal').focus();
    pressTab();
    expect(document.activeElement).toBe(first);
  });

  it('keeps Tab inside the capture modal while it is on top', () => {
    createManager();
    manager.open();

    document.querySelector('.bm-bind-btn[data-device="gamepad"]').click();
    const captureModal = document.querySelector('.bm-capture-modal');
    expect(captureModal.contains(document.activeElement)).toBe(true);

    for (let i = 0; i < 3; i++) {
      const event = pressTab(i % 2 === 1);
      expect(event.defaultPrevented).toBe(true);
      expect(captureModal.contains(document.activeElement)).toBe(true);
    }

    // Escape cancels the capture, focus returns to the bind button, a second Escape closes
    pressEscape();
    expect(manager.isOpen()).toBe(true);
    expectFocusInsideModal();
    pressEscape();
    expect(manager.isOpen()).toBe(false);
  });

  it('moves focus to the bind button when clearing a slot hides its clear button', () => {
    createManager();
    manager.open();
    const clearBtn = document.querySelector('.bm-clear-slot-btn[data-action-id="forward"][data-slot="0"][data-device="keyboard"]');
    clearBtn.focus();
    clearBtn.click();
    expect(manager.getBinding('forward')[0]).toBeNull();
    expectFocusInsideModal();
    expect(document.activeElement.classList.contains('bm-bind-btn')).toBe(true);
    pressEscape();
    expect(manager.isOpen()).toBe(false);
  });
});

describe('ModalController gamepad profile panel', () => {
  beforeEach(() => {
    testCounter += 1;
    document.body.innerHTML = '';
  });

  afterEach(() => {
    manager?.destroy();
    manager = null;
  });

  it('shows one line with name, source chip and select, and no Auto button', () => {
    setGamepads([DUALSENSE]);
    createManager();
    manager.open();

    const panel = document.querySelector('.bm-profile-panel');
    expect(panel).not.toBeNull();
    expect(panel.querySelector('.bm-profile-auto-btn')).toBeNull();
    expect(panel.querySelectorAll('button')).toHaveLength(0);

    const name = panel.querySelector('.bm-profile-name');
    expect(name.textContent).toBe('DualSense Wireless Controller');
    expect(name.getAttribute('title')).toBe(DUALSENSE.id);
    expect(panel.textContent).not.toContain('054c-0ce6');

    const chip = panel.querySelector('.bm-profile-chip');
    expect(chip.textContent).toBe('Exact · DualSense');

    const select = panel.querySelector('.bm-profile-select');
    expect(select.value).toBe('__auto__');
    expect(select.options[0].textContent).toBe('Auto detect');

    // Children form a single row: name, chip, select (no nested blocks)
    expect([...panel.children].map((el) => el.className.split(' ')[0])).toEqual([
      'bm-profile-name', 'bm-profile-chip', 'bm-profile-select',
    ]);
  });

  it('selecting Auto detect clears a manual override', () => {
    setGamepads([DUALSENSE]);
    createManager();
    manager.open();
    const select = document.querySelector('.bm-profile-select');

    select.value = 'family:dualsense';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(manager.getResolvedGamepadProfile(0).source).toBe('manual');

    select.value = '__auto__';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(manager.getResolvedGamepadProfile(0).source).toBe('exact');
    expect(document.querySelector('.bm-profile-chip').textContent).toBe('Exact · DualSense');
  });

  it('shows one muted line when no controller is connected and updates in place on connect', () => {
    const pads = [];
    setGamepads(pads);
    createManager();
    manager.open();

    const panel = document.querySelector('.bm-profile-panel');
    expect(panel.classList.contains('bm-profile-panel-empty')).toBe(true);
    expect(panel.textContent.trim()).toBe('No controller connected');
    expect(panel.querySelector('select')).toBeNull();

    const modal = document.querySelector('.bm-modal');
    pads.push(DUALSENSE);
    window.dispatchEvent(new Event('bm-gamepad-connected'));

    expect(document.querySelector('.bm-modal')).toBe(modal);
    expect(document.querySelector('.bm-profile-panel-empty')).toBeNull();
    expect(document.querySelector('.bm-profile-chip')?.textContent).toBe('Exact · DualSense');
  });
});

describe('ModalController focus after capture and repeated open (delta)', () => {
  beforeEach(() => {
    testCounter += 1;
    document.body.innerHTML = '';
    setGamepads([DUALSENSE]);
  });

  afterEach(() => {
    manager?.destroy();
    manager = null;
  });

  function pressKeyOnWindow(code) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true, cancelable: true }));
  }

  it('returns focus to the captured slot when refresh() rebuilt the modal during the capture (m1)', () => {
    createManager();
    manager.open();
    document.querySelector('.bm-bind-btn[data-action-id="back"][data-slot="1"][data-device="keyboard"]').click();
    expect(document.querySelector('.bm-capture-modal').contains(document.activeElement)).toBe(true);

    // Registering an action while capturing rebuilds the modal
    manager.registerAction({ id: 'crouch', label: 'Crouch', group: 'Move', slots: 1, defaultBindings: ['KeyC'] });
    pressKeyOnWindow('KeyZ');

    expect(manager.getBinding('back')[1]).toBe('KeyZ');
    const focused = document.activeElement;
    expect(overlay().contains(focused)).toBe(true);
    expect(focused.dataset.actionId).toBe('back');
    expect(focused.dataset.slot).toBe('1');
    expect(focused.dataset.device).toBe('keyboard');

    pressEscape();
    expect(manager.isOpen()).toBe(false);
  });

  it('returns focus to the bind button after Escape cancels a refreshed capture (m1)', () => {
    createManager();
    manager.open();
    document.querySelector('.bm-bind-btn[data-action-id="jump"][data-device="gamepad"]').click();
    manager.registerAction({ id: 'crouch', label: 'Crouch', group: 'Move', slots: 1, defaultBindings: ['KeyC'] });

    pressEscape();
    expect(manager.isOpen()).toBe(true);
    const focused = document.activeElement;
    expect(focused.classList.contains('bm-bind-btn')).toBe(true);
    expect(focused.dataset.actionId).toBe('jump');
    expect(focused.dataset.device).toBe('gamepad');
    pressEscape();
    expect(manager.isOpen()).toBe(false);
  });

  it('cancels on pointerdown without letting the press move focus (M4)', () => {
    createManager();
    manager.open();
    document.querySelector('.bm-bind-btn[data-action-id="forward"][data-slot="0"]').click();
    const cancel = document.querySelector('.bm-capture-cancel-btn');
    const down = new Event('pointerdown', { bubbles: true, cancelable: true });
    cancel.dispatchEvent(down);

    // preventDefault on pointerdown suppresses the compatibility mousedown that would blur
    expect(down.defaultPrevented).toBe(true);
    expect(document.querySelector('.bm-capture-overlay').getAttribute('aria-hidden')).toBe('true');
    expect(document.activeElement.dataset.actionId).toBe('forward');
  });

  it('open() while already open keeps focus and scroll (m8)', () => {
    createManager();
    manager.open();
    modalBody().scrollTop = 64;
    const btn = document.querySelector('.bm-bind-btn[data-action-id="back"][data-slot="0"]');
    btn.focus();

    manager.open();
    expect(document.activeElement).toBe(btn);
    expect(modalBody().scrollTop).toBe(64);
  });

  it('gives the action label a title with the full text (m4)', () => {
    createManager();
    manager.registerAction({ id: 'long', label: 'A very long action label that will be ellipsized', slots: 1 });
    manager.open();
    const label = document.querySelector('.bm-action-row[data-action-id="long"] .bm-action-label');
    expect(label.getAttribute('title')).toBe('A very long action label that will be ellipsized');
  });

  it('puts the full conflict text in the warning title (m5)', () => {
    createManager();
    manager.open();
    document.querySelector('.bm-bind-btn[data-action-id="back"][data-slot="0"]').click();
    pressKeyOnWindow('KeyW');
    const warning = document.querySelector('.bm-conflict-warning');
    expect(warning.classList.contains('bm-hidden')).toBe(false);
    expect(warning.textContent).toContain('"Forward"');
    expect(warning.getAttribute('title')).toBe(warning.textContent);
  });
});
