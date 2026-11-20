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

  describe('and importBindings', () => {
    const SAVED_MENUS = {
      menu: ['KeyI'],
      'menu-back': { keyboard: ['Escape'], gamepad: ['GP_B1'] },
    };

    function create(saved = SAVED_MENUS) {
      const storage = memoryStorage(saved);
      const m = createBindManager({ storage });
      m.registerAction({ id: 'jump', slots: 1, defaultBindings: ['Space'] });
      return { m, storage };
    }

    it('replace mode stores the payload entry of an unregistered id and drops saved ids it lacks', () => {
      const { m, storage } = create();
      const report = m.importBindings({
        version: 2,
        bindings: { jump: { keyboard: ['Space'], gamepad: [] }, menu: { keyboard: ['KeyN'], gamepad: [] } },
      }, { mode: 'replace' });

      expect(report.storedUnregisteredActions).toEqual(['menu']);
      expect(report.skippedUnknownActions).toEqual([]);
      // Storage is written even though no registered binding changed
      expect(storage.state.value.menu).toEqual({ keyboard: ['KeyN'], gamepad: [] });
      expect(Object.hasOwn(storage.state.value, 'menu-back')).toBe(false);

      m.registerAction({ id: 'menu', slots: 2, defaultBindings: ['KeyM'], defaultGamepadBindings: ['GP_B0'] });
      m.registerAction({ id: 'menu-back', slots: 1, defaultBindings: ['Backspace'], defaultGamepadBindings: ['GP_B2'] });
      expect(m.getBinding('menu')).toEqual(['KeyN', null]);
      expect(m.getBinding('menu', 'gamepad')).toEqual([null]);
      expect(m.getBinding('menu-back')).toEqual(['Backspace']);
      expect(m.getBinding('menu-back', 'gamepad')).toEqual(['GP_B2']);
      m.destroy();
    });

    it('replace mode without the unregistered id drops its saved entry; registration gets defaults', () => {
      const { m, storage } = create();
      const report = m.importBindings({ version: 2, bindings: { jump: { keyboard: ['KeyJ'] } } }, { mode: 'replace' });
      expect(report.storedUnregisteredActions).toEqual([]);
      expect(Object.keys(storage.state.value)).toEqual(['jump']);
      m.registerAction({ id: 'menu', slots: 1, defaultBindings: ['KeyM'] });
      expect(m.getBinding('menu')).toEqual(['KeyM']);
      m.destroy();
    });

    it('merge mode leaves saved entries of unregistered ids alone and stores nothing for them', () => {
      const { m, storage } = create();
      const report = m.importBindings({
        version: 2,
        bindings: { menu: { keyboard: ['KeyN'] }, extra: { keyboard: ['KeyX'] }, jump: { keyboard: ['KeyJ'] } },
      });
      expect(report.skippedUnknownActions).toEqual(['menu', 'extra']);
      expect(report.storedUnregisteredActions).toEqual([]);
      expect(storage.state.value.menu).toEqual(['KeyI']);
      expect(Object.hasOwn(storage.state.value, 'extra')).toBe(false);
      m.registerAction({ id: 'menu', slots: 1, defaultBindings: ['KeyM'] });
      expect(m.getBinding('menu')).toEqual(['KeyI']);
      m.destroy();
    });

    it('replace mode validates entries of unregistered ids like those of registered ones', () => {
      const { m, storage } = create({
        menu: { keyboard: ['KeyI'], gamepad: ['GP_B12'] },
        'menu-odd': { keyboard: ['KeyO'] },
      });
      const report = m.importBindings({
        version: 2,
        bindings: {
          // unknown code keeps the saved slot; a non-array field is reported and keeps the saved device
          menu: { keyboard: ['NotAKey', 'KeyN', 5], gamepad: 'GP_B0' },
          // unrecognisable entry: ignored, the saved entry is kept
          'menu-odd': 'KeyX',
          // unrecognisable and nothing saved: ignored, nothing stored
          bogus: 42,
        },
      }, { mode: 'replace' });

      expect(report.invalidEntries).toEqual([
        'Action "menu" gamepad must be an array',
        'Action "menu" keyboard slot 0 has unknown code "NotAKey"',
        'Action "menu" keyboard slot 2 has invalid value type',
      ]);
      expect(report.storedUnregisteredActions).toEqual(['menu']);
      expect(report.skippedUnknownActions).toEqual(['menu-odd', 'bogus']);
      expect(storage.state.value.menu).toEqual({ keyboard: ['KeyI', 'KeyN', null], gamepad: ['GP_B12'] });
      expect(storage.state.value['menu-odd']).toEqual({ keyboard: ['KeyO'] });
      expect(Object.hasOwn(storage.state.value, 'bogus')).toBe(false);

      // v1 payload: keyboard only, the saved gamepad slots are kept; unknown gamepad codes are rejected in v2
      m.importBindings({ version: 1, bindings: { menu: ['KeyQ'] } }, { mode: 'replace' });
      expect(storage.state.value.menu).toEqual({ keyboard: ['KeyQ'], gamepad: ['GP_B12'] });
      const r2 = m.importBindings({ version: 2, bindings: { menu: { keyboard: ['KeyQ'], gamepad: ['GP_B99'] } } }, { mode: 'replace' });
      expect(r2.invalidEntries).toEqual(['Action "menu" gamepad slot 0 has unknown code "GP_B99"']);
      expect(storage.state.value.menu).toEqual({ keyboard: ['KeyQ'], gamepad: ['GP_B12'] });
      m.destroy();
    });

    it('replace mode handles prototype-colliding unregistered ids as own keys', () => {
      const { m, storage } = create({ constructor: ['KeyC'] });
      const report = m.importBindings(
        '{"version":2,"bindings":{"__proto__":{"keyboard":["KeyP"],"gamepad":[]}}}',
        { mode: 'replace' },
      );
      expect(report.storedUnregisteredActions).toEqual(['__proto__']);
      const value = storage.state.value;
      expect(Object.hasOwn(value, '__proto__')).toBe(true);
      expect(value.__proto__).toEqual({ keyboard: ['KeyP'], gamepad: [] });
      expect(Object.hasOwn(value, 'constructor')).toBe(false);
      expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
      expect(Object.prototype.keyboard).toBeUndefined();

      m.registerAction({ id: '__proto__', slots: 2 });
      m.registerAction({ id: 'constructor', slots: 1, defaultBindings: ['KeyD'] });
      expect(m.getBinding('__proto__')).toEqual(['KeyP', null]);
      expect(m.getBinding('constructor')).toEqual(['KeyD']);
      m.destroy();
    });
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
