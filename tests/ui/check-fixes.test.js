import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';
import { LocalStorageAdapter } from '../../src/storage/local-storage-adapter.js';
import { MARKUP_ACTIONS } from './fixtures/modal-markup-actions.js';
import MARKUP_021 from './fixtures/modal-0.2.1.html?raw';

// Fixes after the independent check of e5186fd (M1-M3, L1, L2, L5, L6).

let manager = null;

const DUALSENSE = {
  id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
  index: 0,
  connected: true,
  mapping: 'standard',
  buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })),
  axes: [0, 0, 0, 0],
};

function setGamepads(pads) {
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads });
}

const ACTIONS = [
  { id: 'jump', label: 'Jump', group: 'Movement', slots: 2, defaultBindings: ['Space', null], defaultGamepadBindings: ['GP_B0'] },
  { id: 'forward', label: 'Move Forward', group: 'Movement', slots: 2, defaultBindings: ['KeyW', 'ArrowUp'] },
  { id: 'chat', label: 'Chat', group: 'Social', slots: 1, defaultBindings: ['Enter'] },
  { id: 'pause', label: 'Pause', group: 'System', slots: 1, defaultBindings: ['Escape'] },
  { id: 'map', label: 'Map', group: 'System', slots: 1, defaultBindings: ['KeyM'] },
];

function createManager(options = {}) {
  manager = createBindManager({ namespace: `check-fixes-${Math.random()}`, storage: { load: () => null, save() {} }, ...options });
  manager.registerActions(ACTIONS);
  return manager;
}

const $ = (selector) => document.querySelector(selector);
const input = () => $('.bm-search-input');
const header = (group) => [...document.querySelectorAll('.bm-group-toggle')].find((b) => b.dataset.group === group);

function search(text) {
  const el = input();
  el.focus();
  el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function keydown(code, target, extra = {}) {
  const event = new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true, ...extra });
  target.dispatchEvent(event);
  return event;
}
const keyup = (code, target) => target.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true, cancelable: true }));

function expectFocusInModal() {
  expect(document.activeElement).not.toBe(document.body);
  expect($('.bm-modal').contains(document.activeElement)).toBe(true);
}

describe('M1 / L1: no orphan held when a key is held while the modal closes', () => {
  beforeEach(() => { document.body.innerHTML = ''; setGamepads([]); });
  afterEach(() => { manager?.destroy(); manager = null; });

  function track() {
    const events = [];
    manager.onAnyAction((e) => events.push(`${e.actionId}:${e.type}`));
    return events;
  }

  it('Escape held after it closed the modal: no pause:held', () => {
    createManager();
    const events = track();
    manager.open();
    keydown('Escape', $('.bm-modal'));
    expect(manager.isOpen()).toBe(false);
    // Auto-repeat lands on the page once the modal is gone
    keydown('Escape', document.body, { repeat: true });
    keydown('Escape', document.body, { repeat: true });
    keyup('Escape', document.body);
    expect(events).toEqual([]);
  });

  it('Enter held on the Close button: no chat:held', () => {
    createManager();
    const events = track();
    manager.open();
    const close = $('.bm-close-btn');
    close.focus();
    keydown('Enter', close);
    close.click(); // the browser's activation of the focused button
    expect(manager.isOpen()).toBe(false);
    keydown('Enter', document.body, { repeat: true });
    keyup('Enter', document.body);
    expect(events).toEqual([]);
  });

  it('W held in the field while Escape closes the modal: no forward:held', () => {
    createManager();
    const events = track();
    manager.open();
    input().focus();
    keydown('KeyW', input(), { key: 'w' });
    keydown('Escape', input());
    expect(manager.isOpen()).toBe(false);
    keydown('KeyW', document.body, { key: 'w', repeat: true });
    keyup('KeyW', document.body);
    expect(events).toEqual([]);
  });
});

describe('M2: focus never falls out of the modal when the filter hides the focused control', () => {
  beforeEach(() => { document.body.innerHTML = ''; setGamepads([]); });
  afterEach(() => { manager?.destroy(); manager = null; });

  it('a focused group header stays shown when a label change leaves its group without a match', () => {
    createManager();
    manager.open();
    search('space');
    header('Movement').focus();
    manager.setBinding('jump', 0, 'KeyJ');
    expect(document.activeElement).toBe(header('Movement'));
    expect(header('Movement').closest('.bm-group').hidden).toBe(false);
    keydown('Escape', document.activeElement);
    expect(manager.isOpen()).toBe(false);
  });

  it('the same after a gamepad profile change', () => {
    setGamepads([DUALSENSE]);
    createManager();
    manager.open();
    search('cross');
    header('Movement').focus();
    manager.setGamepadProfileOverride(0, { type: 'family', family: 'xbox' });
    expect($('.bm-bind-btn[data-action-id="jump"][data-device="gamepad"]').textContent).toBe('A');
    expectFocusInModal();
    expect(document.activeElement).toBe(header('Movement'));
    // jsdom keeps focus on hidden elements: check that the header is really shown
    expect(header('Movement').closest('[hidden]')).toBeNull();
  });

  it('a focused clear-slot button that hides goes to its bind button', () => {
    createManager();
    manager.open();
    const clear = $('.bm-clear-slot-btn[data-action-id="forward"][data-slot="1"][data-device="keyboard"]');
    clear.focus();
    manager.clearBinding('forward', 1);
    expect(document.activeElement).toBe($('.bm-bind-btn[data-action-id="forward"][data-slot="1"][data-device="keyboard"]'));
  });

  it('a focused clear button that hides goes to the field', () => {
    createManager();
    manager.open();
    search('map');
    $('.bm-search-clear').focus();
    keydown('Escape', $('.bm-search-clear'));
    expect(document.activeElement).toBe(input());
  });

  it('the last line of defence: a focused control hidden some other way lands on the field', () => {
    createManager();
    manager.open();
    search('map');
    const btn = $('.bm-bind-btn[data-action-id="map"]');
    btn.focus();
    // Hidden by something the filter does not manage, then any filter pass runs
    btn.closest('.bm-device-rows').setAttribute('hidden', '');
    manager.setBinding('jump', 1, 'KeyJ');
    expect(document.activeElement).toBe(input());
  });
});

describe('M3: IME composition counts as typing', () => {
  beforeEach(() => { document.body.innerHTML = ''; setGamepads([]); });
  afterEach(() => { manager?.destroy(); manager = null; });

  const composing = { key: 'Process', keyCode: 229, isComposing: true };

  it('a composing keystroke on a letter debugKey does not toggle the modal', () => {
    createManager({ debug: true, debugKey: 'KeyM' });
    manager.open();
    input().focus();
    keydown('KeyM', input(), composing);
    expect(manager.isOpen()).toBe(true);
    // keyCode 229 alone (some browsers) also counts
    keydown('KeyM', input(), { key: 'Process', keyCode: 229 });
    expect(manager.isOpen()).toBe(true);
  });

  it('the Escape that cancels a composition neither clears the text nor closes the modal', () => {
    createManager();
    manager.open();
    search('ju');
    const event = keydown('Escape', input(), { key: 'Escape', keyCode: 229, isComposing: true });
    expect(event.defaultPrevented).toBe(false);
    expect(input().value).toBe('ju');
    expect(manager.isOpen()).toBe(true);
    // Once the composition is over, Escape clears as usual
    keydown('Escape', input());
    expect(input().value).toBe('');
  });

  it('the same Escape on an empty field does not close the modal either', () => {
    createManager();
    manager.open();
    input().focus();
    keydown('Escape', input(), { key: 'Escape', keyCode: 229, isComposing: true });
    expect(manager.isOpen()).toBe(true);
  });
});

describe('L6: Escape on the clear button clears the text', () => {
  beforeEach(() => { document.body.innerHTML = ''; setGamepads([]); });
  afterEach(() => { manager?.destroy(); manager = null; });

  it('clears and keeps the modal open, focus in the field', () => {
    createManager();
    manager.open();
    search('map');
    $('.bm-search-clear').focus();
    const event = keydown('Escape', $('.bm-search-clear'));
    expect(event.defaultPrevented).toBe(true);
    expect(input().value).toBe('');
    expect(manager.isOpen()).toBe(true);
    expect(document.activeElement).toBe(input());
  });

  it('on a group header Escape closes the modal as anywhere else in the list', () => {
    createManager();
    manager.open();
    search('m');
    header('System').focus();
    keydown('Escape', header('System'));
    expect(manager.isOpen()).toBe(false);
  });
});

describe('L2: both options off renders the 0.2.1 markup exactly', () => {
  beforeEach(() => { document.body.innerHTML = ''; setGamepads([]); });
  afterEach(() => { manager?.destroy(); manager = null; });

  it('the serialized modal equals the stored 0.2.1 result, text nodes included', () => {
    // Generated once from 4404c3d's src with the same actions and options
    const expected = MARKUP_021.replace(/\r\n/g, '\n');
    manager = createBindManager({
      namespace: 'markup-021', storage: { load: () => null, save() {} },
      footerActions: [{ id: 'help', label: 'Help', onClick() {} }],
      bindSearch: false, groupFolding: false,
    });
    manager.registerActions(MARKUP_ACTIONS);
    manager.open();
    expect(document.querySelector('.bm-overlay').outerHTML).toBe(expected);
  });
});

describe('L5: the fold cap keeps the newest choices, whatever the names', () => {
  beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); setGamepads([]); });
  afterEach(() => { manager?.destroy(); manager = null; });

  it('stores choices oldest first as pairs; an integer-like name set last is still the newest after a reload', () => {
    const ns = `fold-order-${Math.random()}`;
    manager = createBindManager({ namespace: ns });
    manager.registerActions(ACTIONS);
    manager.setGroupCollapsed('Spells', true);
    manager.setGroupCollapsed('7', true);
    expect(localStorage.getItem(`bind-manager:${ns}:collapsed-groups`)).toBe('{"version":2,"groups":[["Spells",true],["7",true]]}');
    manager.destroy();
    document.body.innerHTML = '';
    manager = createBindManager({ namespace: ns });
    manager.registerActions(ACTIONS);
    // Fill the cap: '7' must survive, 'Spells' (older) goes first
    for (let i = 0; i < 255; i++) manager.setGroupCollapsed(`G${i}`, true);
    const stored = JSON.parse(localStorage.getItem(`bind-manager:${ns}:collapsed-groups`));
    expect(stored.groups).toHaveLength(256);
    expect(stored.groups.map(([name]) => name)).toContain('7');
    expect(stored.groups.map(([name]) => name)).not.toContain('Spells');
    expect(manager.isGroupCollapsed('7')).toBe(true);
  });

  it('a stored list longer than 256 keeps its last 256 (the newest)', () => {
    const ns = `fold-long-${Math.random()}`;
    const groups = Array.from({ length: 300 }, (_, i) => [`G${i}`, true]);
    localStorage.setItem(`bind-manager:${ns}:collapsed-groups`, JSON.stringify({ version: 2, groups }));
    manager = createBindManager({ namespace: ns });
    expect(manager.isGroupCollapsed('G43')).toBe(false);
    expect(manager.isGroupCollapsed('G44')).toBe(true);
    expect(manager.isGroupCollapsed('G299')).toBe(true);
  });

  it('a name listed twice counts with its last entry', () => {
    const ns = `fold-dup-${Math.random()}`;
    localStorage.setItem(`bind-manager:${ns}:collapsed-groups`, JSON.stringify({ version: 2, groups: [['A', true], ['B', true], ['A', false]] }));
    manager = createBindManager({ namespace: ns });
    expect(manager.isGroupCollapsed('A')).toBe(false);
    expect(manager.isGroupCollapsed('B')).toBe(true);
  });

  it('version 1 (an object) stays readable, in its stored order', () => {
    const adapter = new LocalStorageAdapter('fold-v1');
    localStorage.setItem('bind-manager:fold-v1:collapsed-groups', '{"version":1,"groups":{"A":true,"B":false,"C":"yes"}}');
    expect(adapter.loadCollapsedGroups()).toEqual([['A', true], ['B', false]]);
    manager = createBindManager({ namespace: 'fold-v1' });
    expect(manager.isGroupCollapsed('A')).toBe(true);
    expect(manager.isGroupCollapsed('B')).toBe(false);
  });

  it('bad version 2 entries are dropped', () => {
    const adapter = new LocalStorageAdapter('fold-v2-bad');
    localStorage.setItem('bind-manager:fold-v2-bad:collapsed-groups', JSON.stringify({ version: 2, groups: [['A', true], ['B'], [1, true], ['C', 'yes'], 'D', null, ['E', false, 'extra']] }));
    expect(adapter.loadCollapsedGroups()).toEqual([['A', true]]);
    for (const raw of ['{"version":2,"groups":{"A":true}}', '{"version":3,"groups":[["A",true]]}']) {
      localStorage.setItem('bind-manager:fold-v2-bad:collapsed-groups', raw);
      expect(adapter.loadCollapsedGroups(), raw).toEqual([]);
    }
  });
});
