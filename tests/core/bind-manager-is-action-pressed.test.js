import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';

function makeGamepad(index, pressedButtons = []) {
  return {
    id: 'Fake Gamepad',
    index,
    connected: true,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: pressedButtons.includes(i),
      value: pressedButtons.includes(i) ? 1 : 0,
    })),
    axes: [0, 0, 0, 0],
  };
}

describe('manager.isActionPressed', () => {
  let manager;
  let pads;
  let frames;

  // Run one gamepad poll through the manager's own requestAnimationFrame loop.
  function frame(nextPads) {
    pads = nextPads;
    const pending = frames;
    frames = [];
    pending.forEach((cb) => cb());
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    pads = [];
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb) => { frames.push(cb); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', () => { frames = []; });
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads });
    manager = createBindManager({ namespace: 'test-is-action-pressed' });
  });

  afterEach(() => {
    manager.destroy();
    vi.unstubAllGlobals();
  });

  it('honours playerIndex for gamepad bindings', () => {
    manager.registerAction({ id: 'p2-jump', playerIndex: 1, defaultGamepadBindings: ['GP_B0'] });
    manager.registerAction({ id: 'any-jump', defaultGamepadBindings: ['GP_B0'] });
    frame([makeGamepad(0, [0]), makeGamepad(1)]);           // player 1 (index 0) presses A
    expect(manager.isActionPressed('any-jump')).toBe(true);
    expect(manager.isActionPressed('p2-jump')).toBe(false);

    frame([makeGamepad(0), makeGamepad(1, [0])]);           // player 2 (index 1) presses A
    expect(manager.isActionPressed('p2-jump')).toBe(true);
  });

  it('reports wheel bindings as not pressed (wheel is a pulse)', () => {
    manager.registerAction({ id: 'zoom-in', defaultBindings: ['MouseWheelUp'] });
    const types = [];
    manager.onAnyAction((e) => {
      types.push(e.type);
      if (e.type === 'pressed') expect(manager.isActionPressed('zoom-in')).toBe(false);
    });
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: -120 }));
    expect(types).toEqual(['pressed', 'released']);
    expect(manager.isActionPressed('zoom-in')).toBe(false);
  });
});
