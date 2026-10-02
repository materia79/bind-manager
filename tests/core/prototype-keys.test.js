import { describe, it, expect, beforeEach } from 'vitest';
import { ActionRegistry } from '../../src/core/action-registry.js';
import { BindingStore } from '../../src/core/binding-store.js';
import { LocalStorageAdapter } from '../../src/storage/local-storage-adapter.js';
import { createBindManager } from '../../src/core/bind-manager.js';

const RESERVED_IDS = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'];

function memoryStorage() {
  const state = { value: null };
  return {
    state,
    load() { return state.value; },
    save(bindings) { state.value = JSON.parse(JSON.stringify(bindings)); },
    clear() { state.value = null; },
  };
}

describe('action ids that collide with Object.prototype', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('BindingStore.getAll() returns them as own keys without touching the prototype', () => {
    const registry = new ActionRegistry();
    const store = new BindingStore(registry);
    store.init({});
    for (const id of RESERVED_IDS) {
      store.initAction(registry.register({ id, defaultBindings: ['KeyA'] }));
    }

    const all = store.getAll();
    expect(Object.keys(all)).toEqual(RESERVED_IDS);
    expect(Object.getPrototypeOf(all)).toBe(Object.prototype);
    expect(JSON.parse(JSON.stringify(all)).__proto__.keyboard).toEqual(['KeyA', null]);
    expect(Object.prototype.keyboard).toBeUndefined();
  });

  it('BindingStore.initAction() ignores inherited properties of the saved object', () => {
    const registry = new ActionRegistry();
    const store = new BindingStore(registry);
    store.init(Object.create({ jump: { keyboard: ['KeyX'] } }));
    store.initAction(registry.register({ id: 'jump', defaultBindings: ['Space'] }));
    store.initAction(registry.register({ id: 'constructor', defaultBindings: ['KeyC'] }));
    expect(store.get('jump')).toEqual(['Space', null]);
    expect(store.get('constructor')).toEqual(['KeyC', null]);
  });

  it('round-trips through the LocalStorageAdapter', () => {
    const adapter = new LocalStorageAdapter('proto-roundtrip');
    const registry = new ActionRegistry();
    const store = new BindingStore(registry);
    store.init(adapter.load());
    store.initAction(registry.register({ id: '__proto__' }));
    store.set('__proto__', 0, 'KeyP');
    adapter.save(store.getAll());

    const loaded = adapter.load();
    expect(Object.hasOwn(loaded, '__proto__')).toBe(true);
    const registry2 = new ActionRegistry();
    const store2 = new BindingStore(registry2);
    store2.init(loaded);
    store2.initAction(registry2.register({ id: '__proto__' }));
    expect(store2.get('__proto__')).toEqual(['KeyP', null]);
  });

  it('persists and restores them through the manager', () => {
    const storage = memoryStorage();
    const m1 = createBindManager({ storage });
    m1.registerAction({ id: '__proto__' });
    m1.registerAction({ id: 'constructor' });
    m1.setBinding('__proto__', 0, 'KeyP');
    m1.setBinding('constructor', 0, 'KeyC');
    expect(Object.keys(m1.exportBindings().bindings)).toEqual(['__proto__', 'constructor']);
    m1.destroy();

    const m2 = createBindManager({ storage });
    m2.registerAction({ id: '__proto__' });
    m2.registerAction({ id: 'constructor' });
    expect(m2.getBinding('__proto__')).toEqual(['KeyP', null]);
    expect(m2.getBinding('constructor')).toEqual(['KeyC', null]);
    m2.destroy();
  });

  it('importBindings() only reads own properties of the payload', () => {
    const m = createBindManager({ storage: memoryStorage() });
    m.registerAction({ id: 'jump', defaultBindings: ['Space'] });
    const bindings = Object.create({ jump: ['KeyX'] });
    const report = m.importBindings({ version: 1, bindings });
    expect(report.appliedSlots).toBe(0);
    expect(m.getBinding('jump')).toEqual(['Space', null]);
    m.destroy();
  });
});
