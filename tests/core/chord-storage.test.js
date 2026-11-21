/**
 * Stored bindings and chords (0.2.3). The bindings key stays
 * `bind-manager:<namespace>` with `{ version: 1, bindings }`; a chord is stored
 * as its canonical code string in a keyboard slot, like a combo:
 * "ControlLeft+ShiftLeft". A store written by 0.2.2 loads unchanged.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
