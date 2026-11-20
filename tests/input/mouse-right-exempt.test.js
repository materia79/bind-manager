/**
 * J10: a bound right button pressed inside an exempt target (text field,
 * bind-manager UI) dispatches nothing, so the native context menu that opens
 * there (on mousedown on Linux/macOS) and swallows the mouseup cannot leave
 * MouseButton2 pressed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MouseRuntime } from '../../src/input/mouse-runtime.js';
import { KeyboardRuntime } from '../../src/input/keyboard-runtime.js';
import { ActionRegistry } from '../../src/core/action-registry.js';
import { BindingStore } from '../../src/core/binding-store.js';

function press(target, type, button = 2) {
  target.dispatchEvent(new MouseEvent(type, { button, bubbles: true, cancelable: true }));
}

describe('MouseRuntime — J10: right press in an exempt target', () => {
  let rt;
  let events;
  let surface;
  let textarea;
  let bmUi;

  beforeEach(() => {
    document.body.innerHTML = '<canvas id="game"></canvas><textarea id="chat"></textarea><div class="bm-overlay"><button id="bm-btn">x</button></div>';
    surface = document.getElementById('game');
    textarea = document.getElementById('chat');
    bmUi = document.getElementById('bm-btn');
    const registry = new ActionRegistry();
    const store = new BindingStore(registry);
    const kb = new KeyboardRuntime(store);
    rt = new MouseRuntime(store, kb);
    kb.start();
    rt.start();
    store.initAction(registry.register({ id: 'aim', slots: 1, defaultBindings: ['MouseButton2'] }));
    events = [];
    rt.onAnyAction((e) => events.push(`${e.code}:${e.type}`));
    rt._kb = kb;
  });

  afterEach(() => {
    rt.stop();
    rt._kb.stop();
    document.body.innerHTML = '';
  });

  it('right press in a textarea: no pressed, nothing stuck (the menu swallows the mouseup)', () => {
    press(textarea, 'mousedown');
    expect(events).toEqual([]);
    expect(rt.isPressed('MouseButton2')).toBe(false);
  });

  it('right press in the bind-manager UI: no pressed', () => {
    press(bmUi, 'mousedown');
    press(bmUi, 'mouseup');
    expect(events).toEqual([]);
    expect(rt.isPressed('MouseButton2')).toBe(false);
  });

  it('right press on the game surface still works', () => {
    press(surface, 'mousedown');
    expect(rt.isPressed('MouseButton2')).toBe(true);
    press(surface, 'mouseup');
    expect(events).toEqual(['MouseButton2:pressed', 'MouseButton2:released']);
    expect(rt.isPressed('MouseButton2')).toBe(false);
  });

  it('a press that starts on the surface and is released over a text field still releases', () => {
    press(surface, 'mousedown');
    press(textarea, 'mouseup');
    expect(events).toEqual(['MouseButton2:pressed', 'MouseButton2:released']);
    expect(rt.isPressed('MouseButton2')).toBe(false);
  });

  it('a left press in a text field still dispatches (only the right button is exempt)', () => {
    rt._store.set('aim', 0, 'MouseButton0');
    press(textarea, 'mousedown', 0);
    press(textarea, 'mouseup', 0);
    expect(events).toEqual(['MouseButton0:pressed', 'MouseButton0:released']);
  });
});
