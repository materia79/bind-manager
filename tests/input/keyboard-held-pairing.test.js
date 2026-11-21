import { describe, it, expect, afterEach } from 'vitest';
import { KeyboardRuntime } from '../../src/input/keyboard-runtime.js';
import { ActionRegistry } from '../../src/core/action-registry.js';
import { BindingStore } from '../../src/core/binding-store.js';

// 0.2.2 fix (check M1/L1): 'held' only follows a dispatched 'pressed'. A key
// pressed while gameplay was suppressed (the bindings modal open) and still
// held after it closed sent auto-repeat 'held' events with no 'pressed'
// before and no 'released' after.

let runtime = null;

function setup(actions) {
  const registry = new ActionRegistry();
  const store = new BindingStore(registry);
  for (const def of actions) store.initAction(registry.register({ slots: 2, ...def }));
  runtime = new KeyboardRuntime(store);
  runtime.start();
  const events = [];
  runtime.onAnyAction((e) => events.push(`${e.actionId}:${e.type}:${e.code}`));
  return { runtime, events };
}

const down = (code, repeat = false, opts = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat, ...opts }));
const up = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code }));

describe('KeyboardRuntime: held only after a dispatched pressed', () => {
  afterEach(() => { runtime?.stop(); runtime = null; });

  it('a single key pressed normally: pressed, held, held, released (unchanged)', () => {
    const { events } = setup([{ id: 'forward', defaultBindings: ['KeyW'] }]);
    down('KeyW');
    down('KeyW', true);
    down('KeyW', true);
    up('KeyW');
    expect(events).toEqual(['forward:pressed:KeyW', 'forward:held:KeyW', 'forward:held:KeyW', 'forward:released:KeyW']);
  });

  it('a combo pressed normally: pressed, held and released on the combo code (unchanged)', () => {
    const { events } = setup([{ id: 'save', defaultBindings: ['ControlLeft+KeyS'] }, { id: 'back', defaultBindings: ['KeyS'] }]);
    down('ControlLeft');
    down('KeyS');
    down('KeyS', true);
    up('KeyS');
    up('ControlLeft');
    expect(events).toEqual(['save:pressed:ControlLeft+KeyS', 'save:held:ControlLeft+KeyS', 'save:released:ControlLeft+KeyS']);
  });

  it('a modifier bound alone, held: pressed, held, released (unchanged)', () => {
    const { events } = setup([{ id: 'crouch', defaultBindings: ['ControlLeft'] }]);
    down('ControlLeft');
    down('ControlLeft', true);
    up('ControlLeft');
    expect(events).toEqual(['crouch:pressed:ControlLeft', 'crouch:held:ControlLeft', 'crouch:released:ControlLeft']);
  });

  it('a key pressed while suppressed and still held after: no held, no released', () => {
    const { runtime, events } = setup([{ id: 'pause', defaultBindings: ['Escape'] }]);
    runtime.setGameplaySuppressed(true);
    down('Escape');
    runtime.setGameplaySuppressed(false);
    down('Escape', true);
    down('Escape', true);
    up('Escape');
    expect(events).toEqual([]);
    // The next real press works as usual
    down('Escape');
    down('Escape', true);
    up('Escape');
    expect(events).toEqual(['pause:pressed:Escape', 'pause:held:Escape', 'pause:released:Escape']);
  });

  it('a key held across suppression: released when it begins, then silent until pressed again', () => {
    const { runtime, events } = setup([{ id: 'forward', defaultBindings: ['KeyW'] }]);
    down('KeyW');
    runtime.setGameplaySuppressed(true);
    down('KeyW', true);
    runtime.setGameplaySuppressed(false);
    down('KeyW', true);
    up('KeyW');
    expect(events).toEqual(['forward:pressed:KeyW', 'forward:released:KeyW']);
  });

  it('a repeat after window blur cleared the state sends nothing', () => {
    const { events } = setup([{ id: 'forward', defaultBindings: ['KeyW'] }]);
    down('KeyW');
    window.dispatchEvent(new Event('blur'));
    down('KeyW', true);
    up('KeyW');
    expect(events).toEqual(['forward:pressed:KeyW', 'forward:released:KeyW']);
  });

  it('a key pressed during a capture and held after it sends no held', () => {
    const { runtime, events } = setup([{ id: 'sprint', defaultBindings: ['ShiftLeft'] }]);
    runtime.startCapture(() => {});
    down('ShiftLeft');
    runtime.cancelCapture();
    down('ShiftLeft', true);
    expect(events).toEqual([]);
  });
});
