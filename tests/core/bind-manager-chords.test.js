/**
 * Modifier-only chords through the manager (0.2.3): the browser guard cancels a
 * bound chord like a bound combo, reserved-key notes read chords, conflicts and
 * isActionPressed() work, and stored chords round-trip.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';
import { getReservedInfo } from '../../src/input/reserved-codes.js';

const FLAG = { ControlLeft: 'ctrlKey', ControlRight: 'ctrlKey', ShiftLeft: 'shiftKey', ShiftRight: 'shiftKey', AltLeft: 'altKey', AltRight: 'altKey', MetaLeft: 'metaKey', MetaRight: 'metaKey' };
const held = new Set();

/** A key event as a browser sends it (modifier flags of the keys down), returns defaultPrevented. */
function key(type, code) {
  if (type === 'keydown') held.add(code); else held.delete(code);
  const init = { code, bubbles: true, cancelable: true };
  for (const c of held) if (FLAG[c]) init[FLAG[c]] = true;
  const event = new KeyboardEvent(type, init);
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

let manager = null;

describe('chords through the manager', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    held.clear();
  });
  afterEach(() => { manager?.destroy(); manager = null; });

  it('the browser guard cancels the keys of a bound chord (blockBound), in either order', () => {
    manager = createBindManager({ namespace: 'chord-guard', browserGuard: { when: 'always', shortcuts: [] } });
    manager.registerAction({ id: 'names', defaultBindings: ['ControlLeft+ShiftLeft'] });
    expect(key('keydown', 'ControlLeft')).toBe(false);
    expect(key('keydown', 'ShiftLeft')).toBe(true);
    expect(key('keyup', 'ShiftLeft')).toBe(true);
    expect(key('keyup', 'ControlLeft')).toBe(false);
    expect(key('keydown', 'ShiftLeft')).toBe(false);
    expect(key('keydown', 'ControlLeft')).toBe(true);
    key('keyup', 'ControlLeft');
    key('keyup', 'ShiftLeft');
    // Not the chord: another side, or an extra modifier
    expect(key('keydown', 'ControlRight')).toBe(false);
    expect(key('keydown', 'ShiftLeft')).toBe(false);
    key('keyup', 'ShiftLeft');
    key('keyup', 'ControlRight');
    key('keydown', 'AltLeft');
    key('keydown', 'ControlLeft');
    expect(key('keydown', 'ShiftLeft')).toBe(false);
  });

  it('without a chord bound, modifiers are cancelled exactly as in 0.2.2 (only when bound alone)', () => {
    manager = createBindManager({ namespace: 'chord-guard-none', browserGuard: { when: 'always', shortcuts: [] } });
    manager.registerAction({ id: 'crouch', defaultBindings: ['ControlLeft'] });
    expect(key('keydown', 'ShiftLeft')).toBe(false);
    expect(key('keydown', 'ControlLeft')).toBe(true);
    expect(key('keyup', 'ControlLeft')).toBe(true);
    expect(key('keyup', 'ShiftLeft')).toBe(false);
  });

  it('isActionPressed() follows the chord, and events reach the handle', () => {
    manager = createBindManager({ namespace: 'chord-pressed' });
    const handle = manager.registerAction({ id: 'names', defaultBindings: ['ControlLeft+ShiftLeft'] });
    const seen = [];
    handle.onPressed((e) => seen.push(`pressed:${e.code}`));
    handle.onHeld((e) => seen.push(`held:${e.code}`));
    handle.onReleased((e) => seen.push(`released:${e.code}`));
    key('keydown', 'ShiftLeft');
    expect(manager.isActionPressed('names')).toBe(false);
    key('keydown', 'ControlLeft');
    expect(manager.isActionPressed('names')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft', repeat: true, ctrlKey: true, shiftKey: true }));
    key('keyup', 'ShiftLeft');
    expect(manager.isActionPressed('names')).toBe(false);
    key('keyup', 'ControlLeft');
    expect(seen).toEqual(['pressed:ControlLeft+ShiftLeft', 'held:ControlLeft+ShiftLeft', 'released:ControlLeft+ShiftLeft']);
  });

  it('nothing fires while the modal is open', () => {
    manager = createBindManager({ namespace: 'chord-modal' });
    manager.registerAction({ id: 'names', defaultBindings: ['ControlLeft+ShiftLeft'] });
    const seen = [];
    manager.onAnyAction((e) => seen.push(e.type));
    manager.open();
    key('keydown', 'ControlLeft');
    key('keydown', 'ShiftLeft');
    key('keyup', 'ShiftLeft');
    key('keyup', 'ControlLeft');
    manager.close();
    expect(seen).toEqual([]);
  });

  it('conflicts: the same chord in another slot is a conflict; a smaller or bigger chord, or a combo, is not', () => {
    manager = createBindManager({ namespace: 'chord-conflicts' });
    manager.registerAction({ id: 'names', slots: 1, defaultBindings: ['ControlLeft+ShiftLeft'] });
    manager.registerAction({ id: 'crouch', slots: 1, defaultBindings: ['ControlLeft'] });
    manager.registerAction({ id: 'x', slots: 1 });
    expect(manager.setBinding('x', 0, 'ShiftLeft+ControlLeft').conflicts).toEqual([{ actionId: 'names', slot: 0 }]);
    expect(manager.setBinding('x', 0, 'ControlLeft+ShiftLeft+AltLeft').conflicts).toEqual([]);
    expect(manager.setBinding('x', 0, 'ControlLeft+ShiftLeft+KeyA').conflicts).toEqual([]);
    expect(manager.setBinding('x', 0, 'ShiftLeft').conflicts).toEqual([]);
  });

  it('reserved-key notes: a chord with the Windows key is blocked off a Mac; Ctrl+Shift and Shift+Alt are free', () => {
    expect(getReservedInfo('ControlLeft+MetaLeft', { platform: 'other' })?.level).toBe('blocked');
    expect(getReservedInfo('ShiftLeft+MetaRight', { platform: 'other' })?.level).toBe('blocked');
    expect(getReservedInfo('ControlLeft+MetaLeft', { platform: 'mac' })?.level).toBe('unreliable');
    expect(getReservedInfo('ControlLeft+MetaLeft', { platform: 'unknown' })?.level).toBe('unreliable');
    expect(getReservedInfo('ControlLeft+ShiftLeft', { platform: 'other' })).toBe(null);
    expect(getReservedInfo('ShiftLeft+AltLeft', { platform: 'other' })).toBe(null);
    expect(getReservedInfo('ControlRight+ShiftRight+AltRight', { platform: 'mac' })).toBe(null);
  });

  it('getReservedBindings() lists a bound Windows-key chord', () => {
    manager = createBindManager({ namespace: 'chord-reserved' });
    manager.registerAction({ id: 'names', slots: 1, defaultBindings: ['ControlLeft+MetaLeft'] });
    const found = manager.getReservedBindings();
    // The platform comes from jsdom's navigator: a known one or unknown, never free
    expect(found.map((f) => [f.actionId, f.code])).toEqual([['names', 'ControlLeft+MetaLeft']]);
  });

  it('import accepts chords (merge and replace) and puts them in canonical order', () => {
    manager = createBindManager({ namespace: 'chord-import' });
    manager.registerAction({ id: 'names', slots: 2 });
    const report = manager.importBindings({ version: 2, bindings: { names: { keyboard: ['ShiftRight+ControlRight', 'ControlLeft+ShiftLeft'], gamepad: [] } } });
    expect(report.invalidEntries).toEqual([]);
    expect(manager.getBinding('names')).toEqual(['ControlRight+ShiftRight', 'ControlLeft+ShiftLeft']);
    expect(manager.exportBindings({ includeMetadata: false }).bindings.names.keyboard).toEqual(['ControlRight+ShiftRight', 'ControlLeft+ShiftLeft']);
  });

  it('importing a chord that differs from the stored one only in key order is no change: no change event, no save (0.2.4)', () => {
    manager = createBindManager({ namespace: 'chord-import-order' });
    manager.registerAction({ id: 'names', slots: 2, defaultBindings: ['ControlLeft+ShiftLeft', null] });
    manager.setBinding('names', 1, 'ControlRight+AltRight');
    const stored = localStorage.getItem('bind-manager:chord-import-order');
    const changes = [];
    manager.subscribe((e) => changes.push(e));
    const payload = { version: 2, bindings: { names: { keyboard: ['ShiftLeft+ControlLeft', 'AltRight+ControlRight'], gamepad: [null] } } };
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    try {
      const report = manager.importBindings(payload);
      expect(report.invalidEntries).toEqual([]);
      expect(report.appliedSlots).toBe(0);
      expect(report.appliedActions).toBe(0);
      expect(changes).toEqual([]);
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
    }
    // Replace mode: no change either (it rewrites the saved entries of unregistered
    // actions on every import, as before, here with the same bytes)
    const report = manager.importBindings(payload, { mode: 'replace' });
    expect([report.appliedSlots, report.appliedActions]).toEqual([0, 0]);
    expect(changes).toEqual([]);
    expect(localStorage.getItem('bind-manager:chord-import-order')).toBe(stored);
    expect(manager.getBinding('names')).toEqual(['ControlLeft+ShiftLeft', 'ControlRight+AltRight']);
    // A real change in the same import still applies
    const changed = manager.importBindings({ version: 2, bindings: { names: { keyboard: ['ShiftLeft+ControlLeft', 'ShiftRight+ControlRight'], gamepad: [null] } } });
    expect(changed.appliedSlots).toBe(1);
    expect(manager.getBinding('names')).toEqual(['ControlLeft+ShiftLeft', 'ControlRight+ShiftRight']);
  });
});
