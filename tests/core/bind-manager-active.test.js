import { describe, it, expect, beforeEach } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';

describe('bind-manager active state & cursor persistence', () => {
  let manager;

  beforeEach(() => {
    document.body.innerHTML = '';
    manager = createBindManager({ namespace: 'test-active' });
  });

  it('active is false initially', () => {
    expect(manager.active).toBe(false);
  });

  it('active becomes true when modal is opened', () => {
    manager.open();
    expect(manager.active).toBe(true);
  });

  it('active becomes false when modal is closed', () => {
    manager.open();
    manager.close();
    expect(manager.active).toBe(false);
  });

  it('keepCursorAfterClose defaults to false', () => {
    expect(manager.keepCursorAfterClose).toBe(false);
  });

  it('keepCursorAfterClose can be set and read back', () => {
    manager.keepCursorAfterClose = true;
    expect(manager.keepCursorAfterClose).toBe(true);
    manager.keepCursorAfterClose = false;
    expect(manager.keepCursorAfterClose).toBe(false);
  });

  it('keepCursorAfterClose coerces to boolean', () => {
    manager.keepCursorAfterClose = 1;
    expect(manager.keepCursorAfterClose).toBe(true);
    manager.keepCursorAfterClose = 0;
    expect(manager.keepCursorAfterClose).toBe(false);
  });

  it('onActiveChange fires on open', () => {
    const calls = [];
    manager.onActiveChange((active) => calls.push(active));
    manager.open();
    expect(calls).toEqual([true]);
  });

  it('onActiveChange fires on close', () => {
    manager.open();
    const calls = [];
    manager.onActiveChange((active) => calls.push(active));
    manager.close();
    expect(calls).toEqual([false]);
  });

  it('onActiveChange does not fire when state unchanged', () => {
    const calls = [];
    manager.onActiveChange((active) => calls.push(active));
    manager.open();
    // Opening again should not re-fire
    manager.open();
    expect(calls).toEqual([true]);
  });

  it('onActiveChange unsubscribe works', () => {
    const calls = [];
    const unsub = manager.onActiveChange((active) => calls.push(active));
    unsub();
    manager.open();
    expect(calls).toEqual([]);
  });

  it('destroy stops runtimes without error', () => {
    manager.open();
    expect(() => manager.destroy()).not.toThrow();
  });
});
