/**
 * The public fix 4efef61 ("new slots take defaults") combined with this
 * branch: saved bindings of actions not registered yet, and replace-mode
 * import. The commit's own tests live in tests/core/binding-store.test.js.
 */
import { describe, it, expect } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';

function memoryStorage(value = null) {
  const state = { value };
  return { state, load: () => state.value, save(b) { state.value = JSON.parse(JSON.stringify(b)); }, clear() { state.value = null; } };
}

describe('new slots take defaults, with unregistered saved entries and replace imports', () => {
  it('a saved entry of a lazily registered action with fewer slots: the new slots take their defaults', () => {
    const storage = memoryStorage({ later: { keyboard: ['KeyQ'], gamepad: ['GP_B4'] } });
    const m = createBindManager({ namespace: `ns-${Math.random()}`, storage });
    m.registerAction({ id: 'jump', slots: 1 });
    m.setBinding('jump', 0, 'Space');
    // Still unregistered: carried through unchanged by the save.
    expect(storage.state.value.later).toEqual({ keyboard: ['KeyQ'], gamepad: ['GP_B4'] });
    m.registerAction({ id: 'later', slots: 2, defaultBindings: ['KeyL', 'KeyK'], gamepadSlots: 2, defaultGamepadBindings: ['GP_A0N', 'GP_B14'] });
    expect(m.getBinding('later')).toEqual(['KeyQ', 'KeyK']);
    expect(m.getBinding('later', 'gamepad')).toEqual(['GP_B4', 'GP_B14']);
    m.destroy();
  });

  it('a replace import that clears a device of an unregistered action keeps it cleared on registration', () => {
    const storage = memoryStorage({});
    const m = createBindManager({ namespace: `ns-${Math.random()}`, storage });
    m.importBindings({ version: 2, bindings: { menu: { keyboard: ['KeyN'], gamepad: [] } } }, { mode: 'replace' });
    expect(storage.state.value.menu).toEqual({ keyboard: ['KeyN'], gamepad: [] });
    m.registerAction({ id: 'menu', slots: 1, defaultBindings: ['KeyM'], gamepadSlots: 1, defaultGamepadBindings: ['GP_B0'] });
    expect(m.getBinding('menu')).toEqual(['KeyN']);
    expect(m.getBinding('menu', 'gamepad')).toEqual([null]);
    m.destroy();
  });

  it('a replace import with fewer slots than the action registers later: the uncovered slots take their defaults', () => {
    const storage = memoryStorage({});
    const m = createBindManager({ namespace: `ns-${Math.random()}`, storage });
    m.importBindings({ version: 2, bindings: { menu: { keyboard: ['KeyN'], gamepad: ['GP_B1'] } } }, { mode: 'replace' });
    m.registerAction({ id: 'menu', slots: 2, defaultBindings: ['KeyM', 'KeyX'], gamepadSlots: 2, defaultGamepadBindings: ['GP_B2', 'GP_B1'] });
    expect(m.getBinding('menu')).toEqual(['KeyN', 'KeyX']);
    // Slot 1's default GP_B1 is already saved in slot 0: it is not repeated.
    expect(m.getBinding('menu', 'gamepad')).toEqual(['GP_B1', null]);
    m.destroy();
  });

  it('a registered action\'s replace import still clears the slots the payload leaves out', () => {
    const storage = memoryStorage({});
    const m = createBindManager({ namespace: `ns-${Math.random()}`, storage });
    m.registerAction({ id: 'fire', slots: 2, defaultBindings: ['KeyF', 'KeyG'] });
    m.importBindings({ version: 2, bindings: { fire: { keyboard: ['KeyH'] } } }, { mode: 'replace' });
    expect(m.getBinding('fire')).toEqual(['KeyH', null]);
    m.destroy();
  });
});
