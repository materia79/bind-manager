import { describe, it, expect } from 'vitest';
import { ActionRegistry } from '../../src/core/action-registry.js';
import { BindingStore } from '../../src/core/binding-store.js';

function setup() {
  const registry = new ActionRegistry();
  const store = new BindingStore(registry);
  store.init(null);

  const forward = registry.register({
    id: 'forward',
    slots: 2,
    defaultBindings: ['KeyW', 'ArrowUp'],
  });
  const jump = registry.register({
    id: 'jump',
    slots: 1,
    defaultBindings: ['Space'],
  });

  store.initAction(forward);
  store.initAction(jump);

  return { store };
}

describe('BindingStore', () => {
  it('loads defaults per action', () => {
    const { store } = setup();
    expect(store.get('forward')).toEqual(['KeyW', 'ArrowUp']);
    expect(store.get('jump')).toEqual(['Space']);
  });

  it('reports conflicts but still applies assignment', () => {
    const { store } = setup();
    const result = store.set('jump', 0, 'KeyW');
    expect(result.conflicts).toEqual([{ actionId: 'forward', slot: 0 }]);
    expect(store.get('jump')).toEqual(['KeyW']);
  });

  it('clears a slot without resetting defaults', () => {
    const { store } = setup();
    store.clear('forward', 1);
    expect(store.get('forward')).toEqual(['KeyW', null]);
  });

  it('reset restores action defaults', () => {
    const { store } = setup();
    store.set('forward', 0, 'KeyI');
    store.reset('forward');
    expect(store.get('forward')).toEqual(['KeyW', 'ArrowUp']);
  });
});

describe('BindingStore — slots added after saving', () => {
  function withSaved(saved) {
    const registry = new ActionRegistry();
    const store = new BindingStore(registry);
    store.init(saved);
    store.initAction(registry.register({
      id: 'left', slots: 2, defaultBindings: ['ArrowLeft', 'KeyA'],
      gamepadSlots: 2, defaultGamepadBindings: ['GP_A0N', 'GP_B14'],
    }));
    return store;
  }

  it('keeps a saved single gamepad slot and fills the new slot with its default', () => {
    const store = withSaved({ left: { keyboard: ['KeyJ', null], gamepad: ['GP_B4'] } });
    expect(store.get('left', 'gamepad')).toEqual(['GP_B4', 'GP_B14']);
    expect(store.get('left', 'keyboard')).toEqual(['KeyJ', null]);
  });

  it('does not duplicate a default the user already saved in another slot', () => {
    const store = withSaved({ left: { keyboard: ['KeyJ', null], gamepad: ['GP_B14'] } });
    expect(store.get('left', 'gamepad')).toEqual(['GP_B14', null]);
  });

  it('keeps explicitly cleared slots cleared', () => {
    const store = withSaved({ left: { keyboard: [null, null], gamepad: ['GP_A0N', null] } });
    expect(store.get('left', 'gamepad')).toEqual(['GP_A0N', null]);
  });
});
