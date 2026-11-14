/**
 * J4: the Controller Tester with real family data through the real manager:
 * label variants, optional nodes the pad does not have, the profile chip for
 * every source and the header name from the resolver.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PADS, mountRealTester } from './real-manager.js';
import { profileSourceChip, formatProfileSummary } from '../../../src/ui/tools/profile-options.js';

const OPTIONAL = ['GP_B17', 'GP_B18', 'GP_B19', 'GP_B20', 'GP_B21', 'GP_B22', 'GP_B23'];

describe('Controller Tester with real families (J4)', () => {
  let t = null;

  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => {
    t?.manager.destroy();
    t = null;
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('an Xbox Elite pad shows Paddle 1..4', () => {
    t = mountRealTester(PADS.xboxElite);
    expect(t.manager.getResolvedGamepadProfile(0).labelVariant).toBe('xbox-elite');
    expect(['GP_B17', 'GP_B18', 'GP_B19', 'GP_B20'].map((c) => t.node(c).querySelector('title').textContent))
      .toEqual(['Paddle 1', 'Paddle 2', 'Paddle 3', 'Paddle 4']);
    expect(OPTIONAL.filter(t.shown)).toEqual(['GP_B17', 'GP_B18', 'GP_B19', 'GP_B20']);
    t.setButton(19, 1);
    t.raf.step();
    expect(t.lit('GP_B19')).toBe(true);
  });

  it('nodes the pad does not report are hidden even when the family names them', () => {
    t = mountRealTester(PADS.xboxOne);       // xbox family names GP_B17 Share; this pad has 17 buttons
    expect(OPTIONAL.filter(t.shown)).toEqual([]);
  });

  it('a generic 17-button pad shows no extra keys (generic labels name all 24)', () => {
    t = mountRealTester(PADS.generic);
    expect(t.manager.getGamepadLabel('GP_B20', 0)).toBe('Btn 20');
    expect(OPTIONAL.filter(t.shown)).toEqual([]);
  });

  it('header shows the resolver display name; chip names every source', () => {
    t = mountRealTester(PADS.dualsenseRaw);
    expect(t.q('.bm-tester-device').textContent).toBe('DualSense Wireless Controller');
    expect(t.q('.bm-tester-profile-chip').textContent).toBe('Exact');
    t.manager.destroy();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';

    t = mountRealTester(PADS.xboxSeries);
    const resolved = t.manager.getResolvedGamepadProfile(0);
    expect(t.q('.bm-tester-device').textContent).toBe(resolved.displayName);
    expect(t.q('.bm-tester-device').title).toContain(PADS.xboxSeries.id);
    expect(t.q('.bm-tester-profile-chip').textContent).toBe('Family');

    t.manager.setGamepadProfileOverride(0, { type: 'family', family: 'stadia' });
    t.raf.step();
    expect(t.q('.bm-tester-profile-chip').textContent).toBe('Manual');
    t.manager.clearGamepadProfileOverride(0);

    t.manager.setGamepadProfileMappingEntry(0, 'GP_B0', { kind: 'button', index: 3 });
    t.raf.step();
    expect(t.q('.bm-tester-profile-chip').textContent).toBe('Edited');
    expect(t.q('.bm-tester-profile-chip').title).not.toMatch(/memory-edit/);
    expect(t.q('.bm-tester-device').textContent).toBe('Xbox Wireless Controller');
  });

  it('every resolver source has a chip text and a summary', () => {
    for (const source of ['manual', 'exact', 'family', 'generic', 'memory-edit']) {
      expect(profileSourceChip(source)).not.toBe(source);
      expect(formatProfileSummary({ source, family: 'xbox' })).not.toContain(source);
    }
    expect(profileSourceChip('memory-edit')).toBe('Edited');
  });
});
