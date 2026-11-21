import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import README from '../../README.md?raw';
import { createBindManager } from '../../src/core/bind-manager.js';

// 0.2.3: modifier-only chords in the Key Bindings modal, and the findings N1-N3
// of the 0.2.2 check.

let manager = null;

function setGamepads(pads) {
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads });
}

const ACTIONS = [
  { id: 'jump', label: 'Jump', group: 'Movement', slots: 2, defaultBindings: ['Space', null] },
  { id: 'forward', label: 'Move Forward', group: 'Movement', slots: 2, defaultBindings: ['KeyW', 'ArrowUp'] },
  { id: 'names', label: 'Show Names', group: 'Interface', slots: 2, defaultBindings: ['ControlLeft+ShiftLeft', null] },
  { id: 'crouch', label: 'Crouch', group: 'Movement', slots: 1, defaultBindings: ['ControlLeft'] },
  { id: 'map', label: 'Map', group: 'System', slots: 1, defaultBindings: ['KeyM'] },
];

function createManager(options = {}) {
  manager = createBindManager({ namespace: `chords-modal-${Math.random()}`, storage: { load: () => null, save() {} }, ...options });
  manager.registerActions(ACTIONS);
  return manager;
}

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const input = () => $('.bm-search-input');
const bindBtn = (id, slot = 0) => $(`.bm-bind-btn[data-action-id="${id}"][data-slot="${slot}"][data-device="keyboard"]`);
const header = (group) => $$('.bm-group-toggle').find((b) => b.dataset.group === group);
const visibleRows = () => $$('.bm-action-row').filter((r) => !r.closest('[hidden]')).map((r) => r.dataset.actionId);
const warning = () => $('.bm-conflict-warning');

function search(text) {
  const el = input();
  el.focus();
  el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const FLAG = { ControlLeft: 'ctrlKey', ControlRight: 'ctrlKey', ShiftLeft: 'shiftKey', ShiftRight: 'shiftKey', AltLeft: 'altKey', AltRight: 'altKey', MetaLeft: 'metaKey', MetaRight: 'metaKey' };
const held = new Set();
/** A key event on the focused element, as the browser sends it (bubbles to window). */
function key(type, code) {
  if (type === 'keydown') held.add(code); else held.delete(code);
  const init = { code, key: code, bubbles: true, cancelable: true };
  for (const c of held) if (FLAG[c]) init[FLAG[c]] = true;
  (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent(type, init));
}

describe('chords in the rebind dialog', () => {
  beforeEach(() => { document.body.innerHTML = ''; setGamepads([]); held.clear(); });
  afterEach(() => { manager?.destroy(); manager = null; });

  it('a default chord shows a readable label, with the full text in the title', () => {
    createManager();
    manager.open();
    expect(bindBtn('names').textContent).toBe('Left Ctrl + Left Shift');
    expect(bindBtn('names').title).toContain('Left Ctrl + Left Shift');
  });

  it('records Ctrl + Shift: committed when the first key goes up', () => {
    createManager();
    manager.open();
    bindBtn('names', 1).click();
    expect($('.bm-capture-detail').textContent).toMatch(/modifiers alone/);
    key('keydown', 'ShiftRight');
    key('keydown', 'ControlRight');
    expect(manager.getBinding('names')[1]).toBe(null);
    key('keyup', 'ShiftRight');
    expect(manager.getBinding('names')[1]).toBe('ControlRight+ShiftRight');
    key('keyup', 'ControlRight');
    expect(bindBtn('names', 1).textContent).toBe('Right Ctrl + Right Shift');
    expect(warning().classList.contains('bm-hidden')).toBe(true);
    // Focus is back on the slot, the modal stays open
    expect(document.activeElement).toBe(bindBtn('names', 1));
    expect(manager.isOpen()).toBe(true);
  });

  it('a single modifier and a combo record as before', () => {
    createManager();
    manager.open();
    bindBtn('jump', 1).click();
    key('keydown', 'AltLeft');
    key('keyup', 'AltLeft');
    expect(manager.getBinding('jump')[1]).toBe('AltLeft');
    bindBtn('jump', 1).click();
    key('keydown', 'ControlLeft');
    key('keydown', 'ShiftLeft');
    key('keydown', 'KeyJ');
    key('keyup', 'ShiftLeft');
    key('keyup', 'ControlLeft');
    expect(manager.getBinding('jump')[1]).toBe('AltLeft');
    key('keyup', 'KeyJ');
    expect(manager.getBinding('jump')[1]).toBe('ControlLeft+ShiftLeft+KeyJ');
  });

  it('recording a chord that is bound elsewhere shows the conflict note', () => {
    createManager();
    manager.open();
    bindBtn('jump', 1).click();
    key('keydown', 'ControlLeft');
    key('keydown', 'ShiftLeft');
    key('keyup', 'ControlLeft');
    key('keyup', 'ShiftLeft');
    expect(manager.getBinding('jump')[1]).toBe('ControlLeft+ShiftLeft');
    expect(warning().textContent).toMatch(/^Left Ctrl \+ Left Shift is also bound to "Show Names" — both will be active\./);
  });

  it('recording a chord with the Windows key adds the reserved-key note', () => {
    createManager();
    manager.open();
    bindBtn('jump', 1).click();
    key('keydown', 'ControlLeft');
    key('keydown', 'MetaLeft');
    key('keyup', 'MetaLeft');
    key('keyup', 'ControlLeft');
    expect(manager.getBinding('jump')[1]).toBe('ControlLeft+MetaLeft');
    expect(warning().classList.contains('bm-hidden')).toBe(false);
    expect(warning().textContent).toMatch(/Windows key|Command key/);
  });

  it('the recorded chord fires after the modal closes; nothing fires while it is open', () => {
    createManager();
    const seen = [];
    manager.onAnyAction((e) => seen.push(`${e.actionId}:${e.type}:${e.code}`));
    manager.open();
    bindBtn('map', 0).click();
    key('keydown', 'ShiftLeft');
    key('keydown', 'AltLeft');
    key('keyup', 'AltLeft');
    key('keyup', 'ShiftLeft');
    manager.close();
    expect(seen).toEqual([]);
    key('keydown', 'AltLeft');
    key('keydown', 'ShiftLeft');
    key('keyup', 'AltLeft');
    key('keyup', 'ShiftLeft');
    expect(seen).toEqual(['map:pressed:ShiftLeft+AltLeft', 'map:released:ShiftLeft+AltLeft']);
  });

  it('search finds a chord by its keys, in any word order', () => {
    createManager();
    manager.open();
    search('ctrl shift');
    expect(visibleRows()).toEqual(['names']);
    search('shift left ctrl');
    expect(visibleRows()).toEqual(['names']);
    search('left ctrl');
    expect(visibleRows()).toEqual(['crouch', 'names']);
  });

  it('a group of chords folds and counts like any other', () => {
    createManager();
    manager.open();
    expect(header('Interface').textContent).toMatch(/1 \/ 1/);
    manager.setGroupCollapsed('Interface', true);
    expect(bindBtn('names').closest('[hidden]')).not.toBeNull();
    search('ctrl shift');
    expect(visibleRows()).toEqual(['names']);
  });
});

describe('N1: a script empties the search field while its clear button has focus', () => {
  beforeEach(() => { document.body.innerHTML = ''; setGamepads([]); });
  afterEach(() => { manager?.destroy(); manager = null; });

  it('the focus goes to the field, not to the page', () => {
    createManager();
    manager.open();
    search('map');
    const clear = $('.bm-search-clear');
    clear.focus();
    expect(document.activeElement).toBe(clear);
    // A host script, not the player: value set and an input event
    input().value = '';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    expect(clear.hidden).toBe(true);
    expect(document.activeElement).toBe(input());
  });
});

describe('N2: a focused group header keeps the focus across a re-render during a filter', () => {
  beforeEach(() => { document.body.innerHTML = ''; setGamepads([]); });
  afterEach(() => { manager?.destroy(); manager = null; });

  it('registerAction() while the header of a group without matches has the focus', () => {
    createManager();
    manager.open();
    search('space');
    header('Movement').focus();
    // The group loses its match but stays shown while its header holds the focus
    manager.setBinding('jump', 0, 'KeyJ');
    expect(document.activeElement).toBe(header('Movement'));
    manager.registerAction({ id: 'late', label: 'Late Action', group: 'Other', defaultBindings: ['KeyL'] });
    expect(document.activeElement).toBe(header('Movement'));
    expect(header('Movement').closest('[hidden]')).toBeNull();
    // Until the text changes
    search('spac');
    expect(header('Movement').closest('[hidden]')).not.toBeNull();
  });

  it('registerAction() while the header of a group with matches has the focus (unchanged)', () => {
    createManager();
    manager.open();
    search('move');
    header('Movement').focus();
    manager.registerAction({ id: 'late', label: 'Late Action', group: 'Other' });
    expect(document.activeElement).toBe(header('Movement'));
  });
});

describe('N3: the README timing paragraph counts the rows of the timing test', () => {
  beforeEach(() => { document.body.innerHTML = ''; setGamepads([]); });
  afterEach(() => { manager?.destroy(); manager = null; });

  it('the rows the widening keystroke brings back are the ones the README names', () => {
    // The actions of tests/e2e/perf-many-rows.spec.js
    manager = createBindManager({ namespace: `perf-${Math.random()}`, storage: { load: () => null, save() {} } });
    const keys = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const defs = [];
    for (let i = 0; i < 400; i++) {
      const bound = i % 8 === 0;
      defs.push({
        id: `spell-${i}`, label: `Spell ${i + 1}`, description: `Casts spell number ${i + 1}`, group: `Group ${(i % 16) + 1}`, slots: 2, gamepadSlots: 1,
        defaultBindings: bound ? [`Key${keys[(i / 8) % 26 | 0]}`, null] : [null, null],
        defaultGamepadBindings: bound ? [`GP_B${(i / 8) % 16 | 0}`] : [null],
      });
    }
    manager.registerActions(defs);
    manager.open();
    search('spell 12');
    const narrow = visibleRows().length;
    search('spell 1');
    const wide = visibleRows().length;
    const sentence = README.match(/deleting one character to bring back (\d+) rows \(from (\d+) to (\d+)\)/);
    expect(sentence, `README timing sentence (${narrow} back to ${wide})`).not.toBeNull();
    expect(sentence.slice(1).map(Number)).toEqual([wide - narrow, narrow, wide]);
  });
});
