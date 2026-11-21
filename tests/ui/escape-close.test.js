import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';

// 0.2.2 fix: the Escape that closes the bindings modal is used up there. Before,
// gameplay was live again by the time the key reached the keyboard runtime's
// window listener, so an action bound to Escape (a pause menu) fired as well.

let manager = null;

function press(code, target) {
  target.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }));
  target.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true, cancelable: true }));
}

describe('Escape that closes the bindings modal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    manager = createBindManager({ namespace: `escape-close-${Math.random()}`, storage: { load: () => null, save() {} } });
    manager.registerAction({ id: 'pause', label: 'Pause', slots: 1, defaultBindings: ['Escape'] });
  });
  afterEach(() => { manager?.destroy(); manager = null; });

  it('closes the modal without firing an action bound to Escape', () => {
    const events = [];
    manager.onAnyAction((e) => events.push(`${e.actionId}:${e.type}`));
    manager.open();
    press('Escape', document.querySelector('.bm-modal'));
    expect(manager.isOpen()).toBe(false);
    expect(events).toEqual([]);
    // Gameplay is live again: the next Escape is the game's
    press('Escape', document.body);
    expect(events).toEqual(['pause:pressed', 'pause:released']);
  });

  it('does not reach window keydown listeners', () => {
    const seen = vi.fn();
    window.addEventListener('keydown', seen);
    try {
      manager.open();
      press('Escape', document.querySelector('.bm-modal'));
      expect(manager.isOpen()).toBe(false);
      expect(seen).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', seen);
    }
  });
});
