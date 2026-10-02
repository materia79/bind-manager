import { describe, it, expect, beforeEach } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';

let testCounter = 0;

describe('BindManager export/import', () => {
  beforeEach(() => {
    testCounter += 1;
    document.body.innerHTML = '';
  });

  function createWithActions() {
    const manager = createBindManager({ namespace: `import-export-test-${testCounter}` });
    manager.registerAction({
      id: 'forward',
      slots: 2,
      defaultBindings: ['KeyW', 'ArrowUp'],
    });
    manager.registerAction({
      id: 'jump',
      slots: 1,
      defaultBindings: ['Space'],
    });
    return manager;
  }

  it('exports versioned payload', () => {
    const manager = createWithActions();
    const payload = manager.exportBindings();

  expect(payload.version).toBe(2);
    expect(payload.namespace).toBe(`import-export-test-${testCounter}`);
    // v2 format: each action has { keyboard, gamepad }
    expect(payload.bindings.forward.keyboard).toEqual(['KeyW', 'ArrowUp']);
    expect(Array.isArray(payload.bindings.forward.gamepad)).toBe(true);
    expect(payload.bindings.jump.keyboard).toEqual(['Space']);
    expect(typeof payload.metadata.exportedAt).toBe('string');

    manager.destroy();
  });

  it('imports using merge mode by default', () => {
    const manager = createWithActions();

    const report = manager.importBindings({
      version: 1,
      bindings: {
        forward: ['KeyI', null],
      },
    });

    expect(report.mode).toBe('merge');
    expect(report.appliedActions).toBe(1);
    expect(manager.getBinding('forward')).toEqual(['KeyI', null]);
    expect(manager.getBinding('jump')).toEqual(['Space']);

    manager.destroy();
  });

  it('imports using replace mode and clears missing actions', () => {
    const manager = createWithActions();

    const report = manager.importBindings(
      {
        version: 1,
        bindings: {
          jump: ['KeyJ'],
        },
      },
      { mode: 'replace' }
    );

    expect(report.mode).toBe('replace');
    expect(manager.getBinding('jump')).toEqual(['KeyJ']);
    expect(manager.getBinding('forward')).toEqual([null, null]);

    manager.destroy();
  });

  it('reports unknown actions and invalid payloads', () => {
    const manager = createWithActions();

    const report1 = manager.importBindings({
      version: 1,
      bindings: {
        unknown: ['KeyP'],
      },
    });
    expect(report1.skippedUnknownActions).toEqual(['unknown']);

    const report2 = manager.importBindings('{bad-json');
    expect(report2.invalidEntries.length).toBeGreaterThan(0);

    manager.destroy();
  });

  it('rejects unsupported payload versions without applying changes', () => {
    const manager = createWithActions();

    const report = manager.importBindings({
      version: 3,
      bindings: {
        forward: { keyboard: ['KeyI', null], gamepad: [] },
      },
    });

    expect(report.invalidEntries.length).toBe(1);
    expect(report.invalidEntries[0]).toMatch(/version/i);
    expect(report.appliedActions).toBe(0);
    expect(report.appliedSlots).toBe(0);
    expect(manager.getBinding('forward')).toEqual(['KeyW', 'ArrowUp']);

    const fractional = manager.importBindings({ version: 1.5, bindings: { forward: ['KeyI'] } });
    expect(fractional.invalidEntries.length).toBe(1);
    expect(manager.getBinding('forward')).toEqual(['KeyW', 'ArrowUp']);

    const zero = manager.importBindings({ version: 0, bindings: { forward: ['KeyI'] } });
    expect(zero.invalidEntries.length).toBe(1);
    expect(manager.getBinding('forward')).toEqual(['KeyW', 'ArrowUp']);

    manager.destroy();
  });

  it('reports a non-array device field in v2 entries and leaves those slots untouched', () => {
    const manager = createWithActions();

    const report = manager.importBindings({
      version: 2,
      bindings: {
        forward: { keyboard: 'KeyI', gamepad: [] },
        jump: { keyboard: ['KeyJ'], gamepad: { 0: 'GP_B0' } },
      },
    });

    expect(report.invalidEntries).toContain('Action "forward" keyboard must be an array');
    expect(report.invalidEntries).toContain('Action "jump" gamepad must be an array');
    expect(manager.getBinding('forward')).toEqual(['KeyW', 'ArrowUp']);
    expect(manager.getBinding('jump')).toEqual(['KeyJ']);
    expect(manager.getBinding('jump', 'gamepad')).toEqual([null]);

    manager.destroy();
  });

  it('leaves slots of a missing device field unchanged in v2 entries', () => {
    const manager = createWithActions();
    manager.setBinding('jump', 0, 'GP_B0', 'gamepad');

    const report = manager.importBindings({
      version: 2,
      bindings: {
        jump: { keyboard: ['KeyJ'] },
      },
    });

    expect(report.invalidEntries).toEqual([]);
    expect(manager.getBinding('jump')).toEqual(['KeyJ']);
    expect(manager.getBinding('jump', 'gamepad')).toEqual(['GP_B0']);

    manager.destroy();
  });

  it('rejects unknown keyboard and gamepad codes and keeps those slots unchanged', () => {
    const manager = createWithActions();

    const report = manager.importBindings({
      version: 2,
      bindings: {
        forward: { keyboard: ['NotAKey', 'KeyI'], gamepad: ['GP_B99'] },
      },
    });

    expect(report.invalidEntries).toContain('Action "forward" keyboard slot 0 has unknown code "NotAKey"');
    expect(report.invalidEntries).toContain('Action "forward" gamepad slot 0 has unknown code "GP_B99"');
    expect(manager.getBinding('forward')).toEqual(['KeyW', 'KeyI']);
    expect(manager.getBinding('forward', 'gamepad')).toEqual([null]);
    expect(report.appliedSlots).toBe(1);

    manager.destroy();
  });
});

describe('resetAll persistence', () => {
  it('writes storage once, not once per action', () => {
    document.body.innerHTML = '';
    let saves = 0;
    const storage = { load: () => null, save: () => { saves += 1; }, clear() {} };
    const manager = createBindManager({ storage });
    manager.registerActions([
      { id: 'a', defaultBindings: ['KeyA'] },
      { id: 'b', defaultBindings: ['KeyB'] },
      { id: 'c', defaultBindings: ['KeyC'] },
    ]);
    saves = 0;
    manager.resetAll();
    expect(saves).toBe(1);
    manager.destroy();
  });
});
