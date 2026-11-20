import { describe, it, expect, vi, afterEach } from 'vitest';
import { ActionRegistry } from '../../src/core/action-registry.js';

describe('ActionRegistry', () => {
  it('registers actions with defaults', () => {
    const registry = new ActionRegistry();
    const action = registry.register({ id: 'jump' });

    expect(action.label).toBe('jump');
    expect(action.group).toBe('General');
    expect(action.slots).toBe(2);
    expect(action.defaultBindings).toEqual([]);
  });

  it('rejects duplicate action ids', () => {
    const registry = new ActionRegistry();
    registry.register({ id: 'jump' });
    expect(() => registry.register({ id: 'jump' })).toThrow(/already registered/i);
  });

  it('groups actions by group name', () => {
    const registry = new ActionRegistry();
    registry.register({ id: 'forward', group: 'Movement' });
    registry.register({ id: 'backward', group: 'Movement' });
    registry.register({ id: 'open-map', group: 'UI' });

    const groups = registry.getGroups();
    expect(groups.get('Movement')?.map(a => a.id)).toEqual(['forward', 'backward']);
    expect(groups.get('UI')?.map(a => a.id)).toEqual(['open-map']);
  });
});

describe('ActionRegistry slot validation', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([NaN, Infinity, -Infinity, 1.5, 0, -1, '2'])('rejects slots = %s', (slots) => {
    const registry = new ActionRegistry();
    expect(() => registry.register({ id: 'jump', slots })).toThrow(/slots must be a positive integer/);
    expect(registry.has('jump')).toBe(false);
  });

  it.each([NaN, Infinity, 2.5, 0])('rejects gamepadSlots = %s', (gamepadSlots) => {
    const registry = new ActionRegistry();
    expect(() => registry.register({ id: 'jump', gamepadSlots })).toThrow(/gamepadSlots must be a positive integer/);
  });

  it('uses the default slot counts when they are omitted or null', () => {
    const registry = new ActionRegistry();
    const a = registry.register({ id: 'a' });
    const b = registry.register({ id: 'b', slots: null, gamepadSlots: null });
    expect([a.slots, a.gamepadSlots]).toEqual([2, 1]);
    expect([b.slots, b.gamepadSlots]).toEqual([2, 1]);
  });

  it('warns and truncates defaultBindings longer than slots', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const registry = new ActionRegistry();
    const action = registry.register({ id: 'jump', slots: 1, defaultBindings: ['Space', 'KeyJ'] });
    expect(action.defaultBindings).toEqual(['Space']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/defaultBindings has 2 entries but only 1 slot/);
  });

  it('warns and truncates defaultGamepadBindings longer than gamepadSlots', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const registry = new ActionRegistry();
    const action = registry.register({ id: 'jump', defaultGamepadBindings: ['GP_B0', 'GP_B1'] });
    expect(action.defaultGamepadBindings).toEqual(['GP_B0']);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not warn when defaults fit', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new ActionRegistry().register({ id: 'jump', slots: 2, defaultBindings: ['Space'] });
    expect(warn).not.toHaveBeenCalled();
  });
});
