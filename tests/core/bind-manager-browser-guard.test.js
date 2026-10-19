import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';
import { DEFAULT_BLOCKED_SHORTCUTS } from '../../src/index.js';

function key(code, init = {}, target = window) {
  const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('createBindManager browserGuard option', () => {
  let manager;

  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  afterEach(() => {
    manager?.destroy();
    manager = null;
  });

  it('is opt-in: by default the guard exists but cancels nothing', () => {
    manager = createBindManager({ namespace: 'guard-default' });
    expect(manager.browserGuard.enabled).toBe(false);
    manager.browserGuard.setGameOwnsInput(true);
    expect(manager.browserGuard.isEngaged()).toBe(false);
    expect(key('F5')).toBe(false);
  });

  it('browserGuard: true enables the default list (auto engagement)', () => {
    manager = createBindManager({ namespace: 'guard-true', browserGuard: true });
    expect(manager.browserGuard.enabled).toBe(true);
    expect(key('F5')).toBe(false); // not engaged yet
    manager.browserGuard.setGameOwnsInput(true);
    expect(key('F5')).toBe(true);
    expect(manager.browserGuard.getShortcutPolicy().shortcuts).toEqual([...DEFAULT_BLOCKED_SHORTCUTS]);
  });

  it('object form is enabled unless enabled: false', () => {
    manager = createBindManager({ namespace: 'guard-obj', browserGuard: { when: 'always', allow: ['F5'] } });
    expect(manager.browserGuard.enabled).toBe(true);
    expect(key('F5')).toBe(false);
    expect(key('KeyS', { ctrlKey: true })).toBe(true);
    manager.destroy();
    manager = createBindManager({ namespace: 'guard-off', browserGuard: { enabled: false, when: 'always' } });
    expect(manager.browserGuard.enabled).toBe(false);
  });

  it('cancels bound combos while engaged', () => {
    manager = createBindManager({ namespace: 'guard-bound', browserGuard: { when: 'always', shortcuts: [] } });
    manager.registerAction({ id: 'interact', defaultBindings: ['KeyE'] });
    expect(key('KeyE')).toBe(true);
    expect(key('KeyQ')).toBe(false);
  });

  it('disengages while the bindings modal is open', () => {
    manager = createBindManager({ namespace: 'guard-modal', browserGuard: { when: 'always' } });
    manager.registerAction({ id: 'jump', defaultBindings: ['Space'] });
    expect(manager.browserGuard.isEngaged()).toBe(true);
    manager.open();
    expect(manager.browserGuard.isEngaged()).toBe(false);
    expect(key('Space')).toBe(false);
    manager.close();
    expect(key('Space')).toBe(true);
  });

  it('disengages while a built-in tool is open', () => {
    manager = createBindManager({
      namespace: 'guard-tools',
      browserGuard: { when: 'always' },
      builtInTools: { inputRemap: true, controllerTest: true },
    });
    manager.openControllerTest();
    expect(manager.browserGuard.isEngaged()).toBe(false);
  });

  it('keeps the debug toggle working (F5 toggles the modal and is cancelled)', () => {
    manager = createBindManager({ namespace: 'guard-debug', debug: true, browserGuard: { when: 'always' } });
    expect(key('F5')).toBe(true);
    expect(manager.isOpen()).toBe(true);
    // Modal open: guard is off, but the debug listener still cancels F5 itself
    expect(key('F5')).toBe(true);
    expect(manager.isOpen()).toBe(false);
  });

  it('destroy() removes guard listeners and disarms the leave guard', () => {
    manager = createBindManager({ namespace: 'guard-destroy', browserGuard: { when: 'always', leaveGuard: true } });
    key('KeyW');
    expect(manager.browserGuard.isLeaveGuardArmed()).toBe(true);
    manager.destroy();
    expect(manager.browserGuard.isLeaveGuardArmed()).toBe(false);
    expect(key('F5')).toBe(false);
    manager = null;
  });

  it('wheelPixelThreshold is forwarded to wheel notch detection', () => {
    manager = createBindManager({ namespace: 'guard-wheel', wheelPixelThreshold: 100 });
    manager.registerAction({ id: 'next', defaultBindings: ['MouseWheelDown'] });
    const pressed = [];
    manager.onAnyAction((e) => { if (e.type === 'pressed') pressed.push(e.actionId); });
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 60 }));
    expect(pressed).toEqual([]);
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 60 }));
    expect(pressed).toEqual(['next']);
  });
});
