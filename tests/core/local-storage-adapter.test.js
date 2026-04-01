import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalStorageAdapter } from '../../src/storage/local-storage-adapter.js';

let testCounter = 0;
let originalLocalStorage;

describe('LocalStorageAdapter', () => {
  beforeEach(() => {
    testCounter += 1;
    originalLocalStorage = window.localStorage;
    const backing = new Map();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem(key) { return backing.has(key) ? backing.get(key) : null; },
        setItem(key, value) { backing.set(key, String(value)); },
        removeItem(key) { backing.delete(key); },
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
  });

  it('saves and loads bindings', () => {
    const adapter = new LocalStorageAdapter(`test-${testCounter}`);
    adapter.save({ jump: ['Space'] });
    expect(adapter.load()).toEqual({ jump: ['Space'] });
  });

  it('returns null for missing payload', () => {
    const adapter = new LocalStorageAdapter(`missing-${testCounter}`);
    expect(adapter.load()).toBeNull();
  });

  it('clears saved payload', () => {
    const adapter = new LocalStorageAdapter(`clear-${testCounter}`);
    adapter.save({ jump: ['Space'] });
    adapter.clear();
    expect(adapter.load()).toBeNull();
  });

  it('saves and loads gamepad profile overrides', () => {
    const adapter = new LocalStorageAdapter(`overrides-${testCounter}`);
    adapter.saveGamepadProfileOverrides({
      '054c-0ce6': { type: 'family', family: 'dualsense' },
    });

    expect(adapter.loadGamepadProfileOverrides()).toEqual({
      '054c-0ce6': { type: 'family', family: 'dualsense' },
    });
  });
});
