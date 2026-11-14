import { describe, it, expect, beforeEach } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';

function memoryStorage(initial) {
  const state = { value: initial == null ? null : JSON.parse(JSON.stringify(initial)) };
  return {
    state,
    load() { return state.value; },
    save(bindings) { state.value = JSON.parse(JSON.stringify(bindings)); },
    clear() { state.value = null; },
  };
}

// The game registers its menu actions lazily, after gameplay has started.
const SAVED = {
  jump: { keyboard: ['KeyJ'], gamepad: ['GP_B0'] },
  'menu-up': { keyboard: ['KeyI', null], gamepad: ['GP_B12'] },
  'menu-legacy': ['KeyO'],
};

describe('saved bindings of actions that are not registered yet', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('survive set, reset, resetAll and a merge import, and are picked up on registration', () => {
    const storage = memoryStorage(SAVED);
    const m = createBindManager({ storage });
    m.registerAction({ id: 'jump', slots: 1, defaultBindings: ['Space'] });
    expect(m.getBinding('jump')).toEqual(['KeyJ']);

    m.setBinding('jump', 0, 'KeyK');
    expect(storage.state.value['menu-up']).toEqual(SAVED['menu-up']);
    expect(storage.state.value['menu-legacy']).toEqual(SAVED['menu-legacy']);
    expect(storage.state.value.jump.keyboard).toEqual(['KeyK']);

    m.resetAction('jump');
    expect(storage.state.value['menu-up']).toEqual(SAVED['menu-up']);

    m.setBinding('jump', 0, 'KeyL');
    m.resetAll();
    expect(storage.state.value.jump.keyboard).toEqual(['Space']);
    expect(storage.state.value['menu-up']).toEqual(SAVED['menu-up']);
    expect(storage.state.value['menu-legacy']).toEqual(SAVED['menu-legacy']);

    m.importBindings({ version: 2, bindings: { jump: { keyboard: ['KeyM'] } } });
    expect(storage.state.value.jump.keyboard).toEqual(['KeyM']);
    expect(storage.state.value['menu-up']).toEqual(SAVED['menu-up']);

    // exportBindings() / getBindings() stay limited to registered actions
    expect(Object.keys(m.exportBindings().bindings)).toEqual(['jump']);

    m.registerAction({ id: 'menu-up', slots: 2, defaultBindings: ['ArrowUp'], defaultGamepadBindings: ['GP_B13'] });
    m.registerAction({ id: 'menu-legacy', slots: 1, defaultBindings: ['Escape'] });
    expect(m.getBinding('menu-up')).toEqual(['KeyI', null]);
    expect(m.getBinding('menu-up', 'gamepad')).toEqual(['GP_B12']);
    expect(m.getBinding('menu-legacy')).toEqual(['KeyO']);
    m.destroy();
  });

  it('carry prototype-colliding ids through as own keys without polluting the prototype', () => {
    const saved = JSON.parse('{"__proto__":{"keyboard":["KeyP"]},"constructor":{"keyboard":["KeyC"]}}');
    const storage = memoryStorage(saved);
    const m = createBindManager({ storage });
    m.registerAction({ id: 'jump', defaultBindings: ['Space'] });
    m.setBinding('jump', 0, 'KeyK');

    const value = storage.state.value;
    expect(Object.hasOwn(value, '__proto__')).toBe(true);
    expect(value.__proto__).toEqual({ keyboard: ['KeyP'] });
    expect(value.constructor).toEqual({ keyboard: ['KeyC'] });
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.prototype.keyboard).toBeUndefined();
    m.destroy();
  });

  it('are removed by clearStorage() and not written back by the next save', () => {
    const storage = memoryStorage(SAVED);
    const m = createBindManager({ storage });
    m.registerAction({ id: 'jump', slots: 1, defaultBindings: ['Space'] });

    expect(m.clearStorage()).toBe(true);
    expect(storage.state.value).toBeNull();

    m.setBinding('jump', 0, 'KeyK');
    expect(Object.keys(storage.state.value)).toEqual(['jump']);

    // A later registration gets its defaults, not the cleared saved binding
    m.registerAction({ id: 'menu-up', slots: 2, defaultBindings: ['ArrowUp'] });
    expect(m.getBinding('menu-up')).toEqual(['ArrowUp', null]);
    m.destroy();
  });
});
