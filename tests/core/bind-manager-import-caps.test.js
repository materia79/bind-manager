/**
 * J9: a replace-mode import cannot store unbounded data through ids that are
 * not registered, and a failed save does not silently end persistence.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';

function memoryStorage() {
  const state = { value: null, saves: 0 };
  return {
    state,
    load: () => state.value,
    save(bindings) { state.saves += 1; state.value = JSON.parse(JSON.stringify(bindings)); },
    clear() { state.value = null; },
  };
}

describe('replace-mode import caps for unregistered ids', () => {
  let manager;
  let storage;

  beforeEach(() => {
    document.body.innerHTML = '';
    storage = memoryStorage();
    manager = createBindManager({ namespace: `caps-${Math.random()}`, storage });
    manager.registerAction({ id: 'jump', label: 'Jump', slots: 1, gamepadSlots: 1, defaultBindings: ['Space'] });
  });
  afterEach(() => manager.destroy());

  it('keeps at most 16 slots per device of a stored entry and reports the cut', () => {
    const huge = new Array(1_500_000).fill('KeyA');
    const report = manager.importBindings({ version: 2, bindings: { later: { keyboard: huge, gamepad: new Array(40).fill('GP_B0') } } }, { mode: 'replace' });
    expect(report.storedUnregisteredActions).toEqual(['later']);
    const stored = storage.state.value.later;
    expect(stored.keyboard).toHaveLength(16);
    expect(stored.gamepad).toHaveLength(16);
    expect(report.invalidEntries).toEqual(expect.arrayContaining([
      'Action "later" keyboard has 1500000 slots; only the first 16 are stored',
      'Action "later" gamepad has 40 slots; only the first 16 are stored',
    ]));
    expect(JSON.stringify(storage.state.value).length).toBeLessThan(2000);
  });

  it('drops ids longer than 128 characters', () => {
    const longId = 'x'.repeat(5000);
    const okId = 'y'.repeat(128);
    const report = manager.importBindings({ version: 2, bindings: { [longId]: { keyboard: ['KeyA'] }, [okId]: { keyboard: ['KeyB'] } } }, { mode: 'replace' });
    expect(report.storedUnregisteredActions).toEqual([okId]);
    expect(report.droppedUnregisteredActions).toEqual([`${'x'.repeat(128)}…`]);
    expect(report.skippedUnknownActions).toEqual([]);
    expect(report.invalidEntries.some((m) => m.includes('longer than 128 characters'))).toBe(true);
    expect(Object.keys(storage.state.value)).toEqual(['jump', okId]);
  });

  it('stores at most 512 unregistered ids per import', () => {
    const bindings = {};
    for (let i = 0; i < 600; i++) bindings[`later-${i}`] = { keyboard: ['KeyA'] };
    const report = manager.importBindings({ version: 2, bindings }, { mode: 'replace' });
    expect(report.storedUnregisteredActions).toHaveLength(512);
    expect(report.droppedUnregisteredActions).toHaveLength(88);
    expect(report.droppedUnregisteredActions[0]).toBe('later-512');
    expect(report.invalidEntries).toContain('88 unregistered action ids beyond the first 512 were not stored');
    expect(Object.keys(storage.state.value)).toHaveLength(513);
  });

  it('a stored entry within the caps applies when its action registers', () => {
    manager.importBindings({ version: 2, bindings: { later: { keyboard: new Array(30).fill(null).map((_, i) => (i === 0 ? 'KeyQ' : null)) } } }, { mode: 'replace' });
    manager.registerAction({ id: 'later', label: 'Later', slots: 2 });
    expect(manager.getBinding('later')).toEqual(['KeyQ', null]);
  });
});

describe('a failed save does not break later saves', () => {
  let manager;
  let setItem;
  let warn;

  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const real = Storage.prototype.setItem;
    let fail = 0;
    setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function patched(key, value) {
      if (fail > 0) {
        fail -= 1;
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return real.call(this, key, value);
    });
    setItem.failNext = (n = 1) => { fail = n; };
    manager = createBindManager({ namespace: 'quota-test' });
    manager.registerAction({ id: 'jump', label: 'Jump', slots: 1, gamepadSlots: 1, defaultBindings: ['Space'] });
  });

  afterEach(() => {
    manager.destroy();
    setItem.mockRestore();
    warn.mockRestore();
    window.localStorage.clear();
  });

  const saved = () => JSON.parse(window.localStorage.getItem('bind-manager:quota-test'))?.bindings?.jump?.keyboard;

  it('keeps saving on later changes and exposes the failure', () => {
    expect(manager.getStorageStatus()).toEqual({ ok: true, failedSaves: 0, lastError: null, lastFailure: null });

    setItem.failNext(2);
    manager.setBinding('jump', 0, 'KeyJ');
    manager.setBinding('jump', 0, 'KeyK');
    expect(saved()).toBeUndefined();
    const status = manager.getStorageStatus();
    expect(status.ok).toBe(false);
    expect(status.failedSaves).toBe(2);
    expect(status.lastError?.name).toBe('QuotaExceededError');
    expect(warn).toHaveBeenCalledTimes(1);

    manager.setBinding('jump', 0, 'KeyL');
    expect(saved()).toEqual(['KeyL']);
    // F10: a successful save clears lastError; lastFailure keeps the last failure.
    expect(manager.getStorageStatus()).toMatchObject({ ok: true, failedSaves: 2, lastError: null });
    expect(manager.getStorageStatus().lastFailure.error.name).toBe('QuotaExceededError');
    expect(typeof manager.getStorageStatus().lastFailure.at).toBe('number');

    setItem.failNext(1);
    manager.setBinding('jump', 0, 'KeyM');
    expect(warn).toHaveBeenCalledTimes(1); // warned once per manager
    manager.setBinding('jump', 0, 'KeyN');
    expect(saved()).toEqual(['KeyN']);
  });

  it('a custom adapter that throws counts as a failed save', () => {
    const storage = { load: () => null, save: vi.fn(() => { throw new Error('disk full'); }), clear() {} };
    const m = createBindManager({ namespace: 'custom-throws', storage });
    m.registerAction({ id: 'a', label: 'A', slots: 1 });
    m.setBinding('a', 0, 'KeyA');
    expect(m.getStorageStatus()).toMatchObject({ ok: false, failedSaves: 1 });
    expect(m.getStorageStatus().lastError.message).toBe('disk full');
    storage.save.mockImplementation(() => {});
    m.setBinding('a', 0, 'KeyB');
    expect(m.getStorageStatus().ok).toBe(true);
    m.destroy();
  });
});
