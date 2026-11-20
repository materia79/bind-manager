/**
 * F8: a node the tester shows as pressed means the game gets 'pressed'. The
 * tester uses the runtime's own rule and thresholds; movement below the
 * threshold shows as a partial fill, not as pressed.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { PADS, mountRealTester } from './real-manager.js';

const CODES = [
  ...Array.from({ length: 17 }, (_, i) => `GP_B${i}`),
  'GP_A0N', 'GP_A0P', 'GP_A1N', 'GP_A1P', 'GP_A2N', 'GP_A2P', 'GP_A3N', 'GP_A3P',
];

/** Small deterministic PRNG (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('tester pressed state = runtime pressed (F8)', () => {
  let t = null;
  afterEach(() => {
    t?.manager.destroy();
    t = null;
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  const cls = (code) => {
    const g = t.node(code);
    return { active: g.classList.contains('bm-active'), partial: g.classList.contains('bm-partial') };
  };

  it('a button at 0.4 (pressed: false) shows a partial fill, at 0.6 pressed', () => {
    t = mountRealTester(PADS.xboxOne);
    t.pad.buttons[5] = { pressed: false, touched: true, value: 0.4 };
    t.raf.step();
    expect(cls('GP_B5')).toEqual({ active: false, partial: true });
    t.pad.buttons[5] = { pressed: false, touched: true, value: 0.6 };
    t.raf.step();
    expect(cls('GP_B5')).toEqual({ active: true, partial: false });
    t.pad.buttons[5] = { pressed: false, touched: false, value: 0 };
    t.raf.step();
    expect(cls('GP_B5')).toEqual({ active: false, partial: false });
  });

  it('an axis at 0.45 shows a partial fill on its direction, at 0.6 pressed', () => {
    t = mountRealTester(PADS.xboxOne);
    expect(t.manager.getGamepadThresholds()).toMatchObject({ analogThreshold: 0.5, deadband: 0.12, buttonThreshold: 0.5 });
    t.setAxis(0, -0.45);
    t.raf.step();
    expect(cls('GP_A0N')).toEqual({ active: false, partial: true });
    t.setAxis(0, -0.6);
    t.raf.step();
    expect(cls('GP_A0N')).toEqual({ active: true, partial: false });
  });

  it('20 random pad states light exactly the codes the runtime dispatches as pressed', () => {
    t = mountRealTester(PADS.xboxOne);
    for (const code of CODES) t.manager.registerAction({ id: code, label: code, slots: 1, gamepadSlots: 1, defaultGamepadBindings: [code] });
    const pressed = new Set();
    t.manager.onAnyAction((e) => { if (e.device === 'gamepad' && e.type === 'pressed') pressed.add(e.code); });
    const random = rng(1234);
    for (let n = 0; n < 20; n++) {
      // Neutral first, so every active code is a fresh press.
      for (let i = 0; i < 17; i++) t.pad.buttons[i] = { pressed: false, touched: false, value: 0 };
      for (let a = 0; a < 4; a++) t.pad.axes[a] = 0;
      t.raf.step(2);
      pressed.clear();
      for (let i = 0; i < 17; i++) {
        const value = random() < 0.5 ? 0 : Math.round(random() * 100) / 100;
        t.pad.buttons[i] = { pressed: value > 0 && random() < 0.3, touched: value > 0, value };
      }
      for (let a = 0; a < 4; a++) t.pad.axes[a] = Math.round((random() * 2 - 1) * 100) / 100;
      t.raf.step();
      const lit = CODES.filter((code) => t.node(code)?.classList.contains('bm-active'));
      expect(lit.sort(), `state ${n}`).toEqual([...pressed].sort());
    }
  });
});
