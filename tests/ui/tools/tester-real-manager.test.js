/**
 * The Controller Tester on the real manager and real family data (J3): it
 * evaluates mappings with the runtime's helpers and covers GP_B17..GP_B23.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PADS, mountRealTester } from './real-manager.js';

const step = 2 / 7;

const DPAD = ['GP_B12', 'GP_B13', 'GP_B14', 'GP_B15'];

describe('Controller Tester on the real manager (J3)', () => {
  let t = null;

  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => {
    t?.manager.destroy();
    t = null;
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('a hat diagonal lights two D-pad segments (exact DualSense profile)', () => {
    t = mountRealTester(PADS.dualsenseRaw);
    expect(t.manager.getResolvedGamepadProfile(0).source).toBe('exact');
    expect(DPAD.filter(t.lit)).toEqual([]);
    t.setAxis(9, -1 + step);            // up-right
    t.raf.step();
    expect(DPAD.filter(t.lit)).toEqual(['GP_B12', 'GP_B15']);
    t.setAxis(9, -1 + 5 * step);        // down-left
    t.raf.step();
    expect(DPAD.filter(t.lit)).toEqual(['GP_B13', 'GP_B14']);
    t.setAxis(9, 9 / 7);                // neutral
    t.raf.step();
    expect(DPAD.filter(t.lit)).toEqual([]);
  });

  it('standard DualSense (18 buttons): the Touchpad node (GP_B17) is shown and lights', () => {
    t = mountRealTester(PADS.dualsense);
    expect(t.shown('GP_B17')).toBe(true);
    expect(t.node('GP_B17').querySelector('title').textContent).toBe('Touchpad');
    expect(t.lit('GP_B17')).toBe(false);
    t.setButton(17, 1);
    t.raf.step();
    expect(t.lit('GP_B17')).toBe(true);
  });

  it('Xbox Series pad: Share shows at 17 and lights', () => {
    t = mountRealTester(PADS.xboxSeries);
    expect(t.manager.getResolvedGamepadProfile(0).family).toBe('xbox');
    expect(t.shown('GP_B17')).toBe(true);
    expect(t.node('GP_B17').querySelector('.bm-pad-label').textContent).toBe('Share');
    t.setButton(17, 1);
    t.raf.step();
    expect(t.lit('GP_B17')).toBe(true);
  });

  it('Steam Deck (28de:1205, 24 buttons): the extra-key row shows and each of 18-23 lights its own key', () => {
    t = mountRealTester(PADS.steamDeck);
    expect(t.manager.getResolvedGamepadProfile(0).family).toBe('steam');
    const extras = ['GP_B18', 'GP_B19', 'GP_B20', 'GP_B21', 'GP_B22', 'GP_B23'];
    for (const code of extras) expect(t.shown(code), code).toBe(true);
    for (let i = 18; i <= 23; i++) {
      t.setButton(i, 1);
      t.raf.step();
      expect(extras.filter(t.lit), `raw ${i}`).toEqual([`GP_B${i}`]);
      t.setButton(i, 0);
      t.raf.step();
    }
    expect(extras.filter(t.lit)).toEqual([]);
  });
});
