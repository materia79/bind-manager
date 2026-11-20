import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';

function press(code, repeat = false) {
  const event = new KeyboardEvent('keydown', { code, repeat, cancelable: true });
  window.dispatchEvent(event);
  return event;
}

describe('debug toggle key', () => {
  let manager;

  beforeEach(() => {
    document.body.innerHTML = '';
    manager = createBindManager({ namespace: 'test-debug-key', debug: true, debugKey: 'F5' });
  });

  afterEach(() => manager.destroy());

  it('toggles once per physical press and ignores auto-repeat', () => {
    press('F5');
    expect(manager.isOpen()).toBe(true);
    const repeated = [press('F5', true), press('F5', true), press('F5', true)];
    expect(manager.isOpen()).toBe(true);
    // the browser default (reload) is still prevented for repeats
    expect(repeated.every((event) => event.defaultPrevented)).toBe(true);

    press('F5');
    expect(manager.isOpen()).toBe(false);
  });
});
