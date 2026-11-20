import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';

describe('manager.destroy()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
  });

  afterEach(() => vi.useRealTimers());

  it('is idempotent', () => {
    const manager = createBindManager({ namespace: 'destroy-twice', debug: true, builtInTools: true });
    manager.registerAction({ id: 'jump', defaultBindings: ['Space'] });
    manager.open();
    manager.destroy();
    expect(() => manager.destroy()).not.toThrow();
    expect(document.body.children).toHaveLength(0);
  });

  it('closes an open modal first, so active becomes false and listeners hear it', () => {
    const manager = createBindManager({ namespace: 'destroy-open' });
    const changes = [];
    manager.onActiveChange((active) => changes.push(active));
    manager.open();
    manager.destroy();
    expect(manager.active).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it('leaves no built-in tool timers running', () => {
    vi.useFakeTimers();
    const manager = createBindManager({ namespace: 'destroy-tools', builtInTools: true });
    manager.open();
    manager.openInputRemap();
    manager.openControllerTest();
    expect(vi.getTimerCount()).toBeGreaterThan(0);   // live monitor + controller polling
    manager.destroy();
    vi.advanceTimersByTime(1);                       // flush deferred 0 ms listener removals
    expect(vi.getTimerCount()).toBe(0);
  });
});
