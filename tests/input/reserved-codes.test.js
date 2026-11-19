import { describe, it, expect, beforeEach } from 'vitest';
import { getReservedInfo, isReservedCode } from '../../src/input/reserved-codes.js';
import { createBindManager } from '../../src/core/bind-manager.js';

describe('getReservedInfo', () => {
  it('returns null for ordinary keys and combos', () => {
    for (const code of ['KeyW', 'F1', 'F5', 'Tab', 'Space', 'ShiftLeft+KeyC', 'AltLeft+KeyD', 'ControlLeft+KeyS', 'MouseButton2', 'MouseWheelUp']) {
      expect(getReservedInfo(code), code).toBeNull();
    }
  });

  it('returns null for empty input', () => {
    expect(getReservedInfo(null)).toBeNull();
    expect(getReservedInfo(undefined)).toBeNull();
    expect(getReservedInfo('')).toBeNull();
  });

  it('flags tab and window shortcuts as blocked', () => {
    for (const code of ['ControlLeft+KeyW', 'ControlRight+KeyW', 'ControlLeft+KeyT', 'ControlLeft+KeyN', 'ControlLeft+Tab', 'ControlLeft+ShiftLeft+KeyT', 'AltLeft+F4']) {
      expect(getReservedInfo(code)?.level, code).toBe('blocked');
    }
  });

  it('matches modifiers exactly', () => {
    expect(getReservedInfo('ControlLeft+AltLeft+KeyW')).toBeNull();
    expect(getReservedInfo('ShiftLeft+KeyW')).toBeNull();
  });

  it('flags the meta key alone and in combos', () => {
    expect(getReservedInfo('MetaLeft')?.level).toBe('blocked');
    expect(getReservedInfo('MetaLeft+KeyD')?.level).toBe('blocked');
  });

  it('flags browser-dependent keys as unreliable', () => {
    for (const code of ['F11', 'F12', 'Escape', 'ControlLeft+Digit1', 'ShiftLeft+MouseButton2']) {
      expect(getReservedInfo(code)?.level, code).toBe('unreliable');
    }
  });

  it('gives a reason as a sentence', () => {
    expect(getReservedInfo('ControlLeft+KeyW')?.reason).toMatch(/\.$/);
  });

  it('frees lockable shortcuts when keyboard lock is active', () => {
    const locked = { keyboardLocked: true };
    expect(getReservedInfo('ControlLeft+KeyW', locked)).toBeNull();
    expect(getReservedInfo('Escape', locked)).toBeNull();
    expect(getReservedInfo('MetaLeft', locked)).toBeNull();
    // Not freed by the lock:
    expect(getReservedInfo('AltLeft+F4', locked)?.level).toBe('blocked');
    expect(getReservedInfo('F11', locked)?.level).toBe('unreliable');
  });

  it('isReservedCode mirrors getReservedInfo', () => {
    expect(isReservedCode('ControlLeft+KeyW')).toBe(true);
    expect(isReservedCode('KeyW')).toBe(false);
  });
});

describe('manager.getReservedBindings', () => {
  let n = 0;
  beforeEach(() => { n += 1; document.body.innerHTML = ''; });

  it('lists reserved bindings among the current ones', () => {
    const manager = createBindManager({ namespace: `reserved-test-${n}` });
    manager.registerAction({ id: 'close-bag', slots: 2, defaultBindings: ['ControlLeft+KeyW', 'KeyB'] });
    manager.registerAction({ id: 'walk', slots: 1, defaultBindings: ['KeyW'] });

    const found = manager.getReservedBindings();
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ actionId: 'close-bag', slot: 0, code: 'ControlLeft+KeyW', level: 'blocked' });
    manager.destroy?.();
  });

  it('honours the isKeyboardLocked option', () => {
    let locked = false;
    const manager = createBindManager({ namespace: `reserved-test-${n}`, isKeyboardLocked: () => locked });
    manager.registerAction({ id: 'close-bag', slots: 1, defaultBindings: ['ControlLeft+KeyW'] });

    expect(manager.getReservedBindings()).toHaveLength(1);
    locked = true;
    expect(manager.getReservedBindings()).toHaveLength(0);
    manager.destroy?.();
  });
});
