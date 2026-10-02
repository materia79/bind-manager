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

describe('BindingStore commits', () => {
  it('resetAll() emits one reset event per action but commits once', () => {
    const { store } = setup();
    const events = [];
    let commits = 0;
    store.subscribe((e) => events.push(e.type));
    store.onCommit(() => { commits += 1; });

    store.resetAll();

    expect(events).toEqual(['reset', 'reset']);
    expect(commits).toBe(1);
  });

  it('commits once per mutation outside a batch', () => {
    const { store } = setup();
    let commits = 0;
    store.onCommit(() => { commits += 1; });
    store.set('jump', 0, 'KeyJ');
    store.clear('jump', 0);
    store.reset('jump');
    expect(commits).toBe(3);
  });

  it('commits a batch even when it throws part-way, and skips empty batches', () => {
    const { store } = setup();
    let commits = 0;
    store.onCommit(() => { commits += 1; });
    store.batch(() => {});
    expect(commits).toBe(0);
    expect(() => store.batch(() => {
      store.set('jump', 0, 'KeyJ');
      throw new Error('boom');
    })).toThrow('boom');
    expect(commits).toBe(1);
  });
});
