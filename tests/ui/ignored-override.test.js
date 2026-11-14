/**
 * F7: an exact profile that does not fit the connected pad is still stored
 * (setGamepadProfileOverride keeps returning true), but the resolved
 * profile reports it in ignoredOverride, the manager warns once, and the
 * bindings modal and the tester show a note next to the profile select.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createBindManager } from '../../src/core/bind-manager.js';
import { PADS, installPad } from './tools/real-manager.js';
import { installManualRaf } from './tools/helpers.js';

const NOTE = "saved profile does not fit this controller's layout";

function mount(spec) {
  const raf = installManualRaf();
  installPad(spec);
  const manager = createBindManager({ namespace: `ignored-${Math.random()}`, builtInTools: true, storage: { load: () => null, save() {} } });
  manager.registerAction({ id: 'jump', label: 'Jump', defaultGamepadBindings: ['GP_B0'] });
  manager.open();
  manager.openControllerTest();
  raf.step(2);
  const q = (s) => document.querySelector(s);
  const visibleText = (sel) => {
    const el = q(sel);
    return el && !el.hidden ? el.textContent : null;
  };
  return { manager, raf, q, visibleText };
}

describe('ignored exact-profile override (F7)', () => {
  let t = null;
  let warn;
  afterEach(() => {
    t?.manager.destroy();
    t = null;
    warn?.mockRestore();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('is stored, reported, warned once and noted in both UIs', () => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = mount(PADS.dualsense);          // standard mapping: the raw 054c-0ce6 profile cannot apply
    expect(t.visibleText('.bm-profile-note')).toBeNull();
    expect(t.visibleText('.bm-tester-profile-note')).toBeNull();

    expect(t.manager.setGamepadProfileOverride(0, { type: 'profile', key: '054c-0ce6' })).toBe(true);
    t.raf.step();
    const resolved = t.manager.getResolvedGamepadProfile(0);
    expect(resolved.ignoredOverride).toEqual({ type: 'profile', key: '054c-0ce6' });
    expect(resolved.source).toBe('family');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/does not fit/);
    expect(t.visibleText('.bm-profile-note')).toBe(NOTE);
    expect(t.visibleText('.bm-tester-profile-note')).toBe(NOTE);

    t.manager.setGamepadProfileOverride(0, { type: 'profile', key: '054c-0ce6' });
    expect(warn).toHaveBeenCalledTimes(1);

    t.manager.clearGamepadProfileOverride(0);
    t.raf.step();
    expect(t.visibleText('.bm-profile-note')).toBeNull();
    expect(t.visibleText('.bm-tester-profile-note')).toBeNull();
  });

  it('a fitting exact profile shows no note and does not warn', () => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = mount(PADS.dualsenseRaw);
    t.manager.setGamepadProfileOverride(0, { type: 'profile', key: '054c-0ce6' });
    t.raf.step();
    expect(t.manager.getResolvedGamepadProfile(0).source).toBe('manual');
    expect(warn).not.toHaveBeenCalled();
    expect(t.visibleText('.bm-profile-note')).toBeNull();
    expect(t.visibleText('.bm-tester-profile-note')).toBeNull();
  });
});
