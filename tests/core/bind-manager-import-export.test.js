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

    expect(payload.version).toBe(1);
    expect(payload.namespace).toBe(`import-export-test-${testCounter}`);
    expect(payload.bindings.forward).toEqual(['KeyW', 'ArrowUp']);
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
});
