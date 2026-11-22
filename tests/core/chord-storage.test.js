/**
 * Stored bindings and chords (0.2.3). The bindings key stays
 * `bind-manager:<namespace>` with `{ version: 1, bindings }`; a chord is stored
 * as its canonical code string in a keyboard slot, like a combo:
 * "ControlLeft+ShiftLeft". A store written by 0.2.2 loads unchanged.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';

let manager = null;

/** A store exactly as 0.2.2 writes it: registered actions in { keyboard, gamepad } form, plus an action not registered yet. */
const STORE_022 = JSON.stringify({
  version: 1,
  bindings: {
    forward: { keyboard: ['KeyW', 'ArrowUp'], gamepad: ['GP_A1N'] },
    crouch: { keyboard: ['ControlLeft', null], gamepad: [null] },
    save: { keyboard: ['ControlLeft+KeyS', 'ShiftLeft+MouseButton0'], gamepad: [null] },
    zoom: { keyboard: ['ControlLeft+MouseWheelUp', null], gamepad: ['GP_B5'] },
    later: { keyboard: ['KeyL', null], gamepad: ['GP_B3'] },
  },
});

function register(m) {
  m.registerAction({ id: 'forward', defaultBindings: ['KeyW'], defaultGamepadBindings: ['GP_A1N'] });
  m.registerAction({ id: 'crouch', defaultBindings: ['KeyC'] });
  m.registerAction({ id: 'save', defaultBindings: ['F2'] });
  m.registerAction({ id: 'zoom', defaultBindings: ['KeyZ'] });
  m.registerAction({ id: 'names', defaultBindings: ['ControlLeft+ShiftLeft'] });
}

describe('chords in storage', () => {
  beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });
  afterEach(() => { manager?.destroy(); manager = null; });

  it('a store written by 0.2.2 loads unchanged and is written back unchanged', () => {
    localStorage.setItem('bind-manager:compat', STORE_022);
    manager = createBindManager({ namespace: 'compat' });
    register(manager);
    const old = JSON.parse(STORE_022).bindings;
    for (const id of ['forward', 'crouch', 'save', 'zoom']) {
      expect(manager.getBinding(id, 'keyboard')).toEqual(old[id].keyboard);
      expect(manager.getBinding(id, 'gamepad')).toEqual(old[id].gamepad);
    }
    // An action new in this version gets its default chord
    expect(manager.getBinding('names')).toEqual(['ControlLeft+ShiftLeft', null]);
    // A change saves: every 0.2.2 entry, the unregistered one included, is written as it was
    manager.setBinding('names', 1, 'ControlRight+ShiftRight');
    const saved = JSON.parse(localStorage.getItem('bind-manager:compat'));
    expect(saved.version).toBe(1);
    for (const id of Object.keys(old)) expect(saved.bindings[id]).toEqual(old[id]);
  });

  it('a store written by 0.2.3 loads unchanged and is saved byte for byte as it was (0.2.4)', () => {
    // Written by the released 0.2.3 sources (chords, combos, mouse, wheel, gamepad,
    // an unregistered action) with the registrations below
    const STORE_023 = '{"version":1,"bindings":{"forward":{"keyboard":["KeyW","ArrowUp"],"gamepad":["GP_A1N"]},"crouch":{"keyboard":["ControlLeft","ControlRight+ShiftRight+AltRight"],"gamepad":[null]},"save":{"keyboard":["ControlLeft+KeyS","ShiftLeft+MouseButton0"],"gamepad":[null]},"names":{"keyboard":["ControlLeft+ShiftLeft","ControlRight+ShiftRight"],"gamepad":[null]},"zoom":{"keyboard":["MouseWheelUp","ControlLeft+MouseWheelUp",null],"gamepad":["GP_B5",null]},"later":{"keyboard":["KeyL",null],"gamepad":["GP_B3"]}}}';
    localStorage.setItem('bind-manager:compat023', STORE_023);
    manager = createBindManager({ namespace: 'compat023' });
    manager.registerAction({ id: 'forward', defaultBindings: ['KeyW', 'ArrowUp'], defaultGamepadBindings: ['GP_A1N'] });
    manager.registerAction({ id: 'crouch', defaultBindings: ['ControlLeft'] });
    manager.registerAction({ id: 'save', defaultBindings: ['F2'] });
    manager.registerAction({ id: 'names', slots: 2, defaultBindings: ['ControlLeft+ShiftLeft'] });
    manager.registerAction({ id: 'zoom', slots: 3, gamepadSlots: 2, defaultBindings: ['MouseWheelUp'] });
    const old = JSON.parse(STORE_023).bindings;
    for (const id of ['forward', 'crouch', 'save', 'names', 'zoom']) {
      expect(manager.getBinding(id, 'keyboard')).toEqual(old[id].keyboard);
      expect(manager.getBinding(id, 'gamepad')).toEqual(old[id].gamepad);
    }
    // Two changes that cancel out: both are saved, the last save is the 0.2.3 store again
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    try {
      manager.setBinding('forward', 0, 'KeyQ');
      manager.setBinding('forward', 0, 'KeyW');
      expect(setItem).toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
    }
    expect(localStorage.getItem('bind-manager:compat023')).toBe(STORE_023);
    // An export and a merge import of it change nothing either
    const report = manager.importBindings(manager.exportBindings());
    expect([report.appliedSlots, report.invalidEntries]).toEqual([0, []]);
    expect(localStorage.getItem('bind-manager:compat023')).toBe(STORE_023);
  });

  it('a chord is stored as its canonical code string in a keyboard slot', () => {
    manager = createBindManager({ namespace: 'format' });
    manager.registerAction({ id: 'names', slots: 2, defaultBindings: ['ControlLeft+ShiftLeft'] });
    manager.setBinding('names', 1, 'AltRight+ShiftRight');
    expect(localStorage.getItem('bind-manager:format')).toBe(JSON.stringify({
      version: 1,
      bindings: { names: { keyboard: ['ControlLeft+ShiftLeft', 'ShiftRight+AltRight'], gamepad: [null] } },
    }));
  });

  it('round trip: a stored chord loads back and fires', () => {
    manager = createBindManager({ namespace: 'round' });
    manager.registerAction({ id: 'names', slots: 1 });
    manager.setBinding('names', 0, 'ControlLeft+AltLeft');
    manager.destroy();
    manager = createBindManager({ namespace: 'round' });
    const handle = manager.registerAction({ id: 'names', slots: 1 });
    expect(manager.getBinding('names')).toEqual(['ControlLeft+AltLeft']);
    const seen = [];
    handle.onPressed((e) => seen.push(e.code));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'AltLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft' }));
    expect(seen).toEqual(['ControlLeft+AltLeft']);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ControlLeft' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'AltLeft' }));
  });

  it('a stored chord in another order (written by hand or by another tool) loads in canonical order', () => {
    localStorage.setItem('bind-manager:order', JSON.stringify({ version: 1, bindings: { names: { keyboard: ['ShiftLeft+ControlLeft'], gamepad: [] } } }));
    manager = createBindManager({ namespace: 'order' });
    manager.registerAction({ id: 'names', slots: 1 });
    expect(manager.getBinding('names')).toEqual(['ControlLeft+ShiftLeft']);
  });

  it('the legacy array form (v1 entries) with a chord loads too', () => {
    localStorage.setItem('bind-manager:legacy', JSON.stringify({ version: 1, bindings: { names: ['ControlLeft+ShiftLeft', 'KeyN'] } }));
    manager = createBindManager({ namespace: 'legacy' });
    manager.registerAction({ id: 'names' });
    expect(manager.getBinding('names')).toEqual(['ControlLeft+ShiftLeft', 'KeyN']);
  });
});
