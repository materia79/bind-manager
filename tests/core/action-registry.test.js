import { describe, it, expect } from 'vitest';
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
