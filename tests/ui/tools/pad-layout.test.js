import { describe, it, expect } from 'vitest';
import {
  PAD_VIEWBOX,
  EXTRA_CODES,
  buildPadLayout,
  computePadBoxes,
  boxesOverlap,
  boxContains,
  shapeBox,
  getStickLayoutForFamily,
  shouldShowPadNode,
  shortenPadLabel,
  fitPadLabel,
  estimateTextWidth,
} from '../../../src/ui/tools/pad-layout.js';
import { FAMILIES, FAMILY_LABELS, labelFor } from './fixtures/family-labels.js';

const LAYOUTS = ['offset', 'symmetric'];
const VIEW = { x: 0, y: 0, w: PAD_VIEWBOX.width, h: PAD_VIEWBOX.height };

describe('pad layout tables', () => {
  it('maps families to stick layouts', () => {
    expect(getStickLayoutForFamily('dualshock4')).toBe('symmetric');
    expect(getStickLayoutForFamily('dualsense')).toBe('symmetric');
    for (const f of ['xbox', 'xbox360', 'switch-pro', 'steam', 'stadia', 'generic', undefined]) {
      expect(getStickLayoutForFamily(f)).toBe('offset');
    }
  });

  it.each(LAYOUTS)('%s layout has every element once', (layout) => {
    const codes = buildPadLayout(layout).flatMap((el) => (el.kind === 'stick' ? [el.code, ...Object.values(el.dirs)] : [el.code]));
    const expected = [
      ...Array.from({ length: 24 }, (_, i) => `GP_B${i}`),
      ...[0, 1, 2, 3].flatMap((i) => [`GP_A${i}N`, `GP_A${i}P`]),
    ];
    expect([...codes].sort()).toEqual([...expected].sort());
  });
});

describe.each(LAYOUTS)('no overlap in the %s layout', (layout) => {
  it.each(FAMILIES)('%s labels', (family) => {
    const boxes = computePadBoxes(layout, family, labelFor(family));
    for (const b of boxes) {
      expect(boxContains(VIEW, b.shape), `${b.code} inside the viewBox`).toBe(true);
      if (b.label) expect(boxContains(b.shape, b.label), `${b.code} label "${b.text}" inside its shape`).toBe(true);
      if (b.value) expect(boxContains(b.shape, b.value), `${b.code} value inside its shape`).toBe(true);
      if (b.label && b.value) expect(boxesOverlap(b.label, b.value), `${b.code} label vs value`).toBe(false);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const c = boxes[j];
        expect(boxesOverlap(a.shape, c.shape), `${a.code} vs ${c.code}`).toBe(false);
      }
    }
  });
});

describe('optional nodes', () => {
  it('shows GP_B17..GP_B23 only when labelled', () => {
    expect(shouldShowPadNode('GP_B17', 'GP_B17')).toBe(false);
    expect(shouldShowPadNode('GP_B17', 'Touchpad')).toBe(true);
    expect(shouldShowPadNode('GP_B20', '')).toBe(false);
    expect(shouldShowPadNode('GP_B0', 'GP_B0')).toBe(true);
  });

  it.each(FAMILIES)('%s: extra row shows exactly the labelled keys', (family) => {
    const visible = computePadBoxes('offset', family, labelFor(family)).map((b) => b.code);
    for (const code of ['GP_B17', ...EXTRA_CODES]) {
      expect(visible.includes(code)).toBe(FAMILY_LABELS[family][code] != null);
    }
  });
});

describe('label shortening', () => {
  it('uses glyphs for PlayStation face buttons', () => {
    expect(shortenPadLabel('GP_B0', 'Cross', 'dualsense')).toBe('✕');
    expect(shortenPadLabel('GP_B1', 'Circle', 'dualshock4')).toBe('○');
    expect(shortenPadLabel('GP_B2', 'Square', 'dualsense')).toBe('□');
    expect(shortenPadLabel('GP_B3', 'Triangle', 'dualsense')).toBe('△');
    expect(shortenPadLabel('GP_B0', 'A', 'xbox')).toBe('A');
  });

  it('turns D-pad names into arrows, whatever the label says', () => {
    expect(shortenPadLabel('GP_B12', 'D-Pad Up', 'xbox')).toBe('↑');
    expect(shortenPadLabel('GP_B13', 'D-Down', 'dualsense')).toBe('↓');
    expect(shortenPadLabel('GP_B14', 'Btn 14', 'generic')).toBe('←');
    expect(shortenPadLabel('GP_B15', 'GP_B15', 'generic')).toBe('→');
  });

  it('prints nothing for stick directions', () => {
    expect(shortenPadLabel('GP_A0N', 'Left Stick Left', 'xbox')).toBe('');
    expect(shortenPadLabel('GP_A3P', 'RS-Down', 'dualsense')).toBe('');
  });

  it('shortens generic and per-family long names', () => {
    expect(shortenPadLabel('GP_B4', 'Btn 4', 'generic')).toBe('B4');
    expect(shortenPadLabel('GP_B17', 'Quick Access', 'steam')).toBe('···');
    expect(shortenPadLabel('GP_B18', 'Left pad click', 'steam')).toBe('L Pad');
    expect(shortenPadLabel('GP_B8', 'Minus', 'switch-pro')).toBe('−');
    expect(shortenPadLabel('GP_B9', 'Options', 'dualsense')).toBe('Options');
    expect(shortenPadLabel('GP_B9', '', 'generic')).toBe('GP_B9');
  });

  it('fits long text by truncating with an ellipsis, never by initials', () => {
    expect(fitPadLabel('Options', 200, 18)).toBe('Options');
    const long = fitPadLabel('Very Long Label For Game That Does Not Fit', 104, 18);
    expect(long.endsWith('\u2026')).toBe(true);
    expect(long.startsWith('Very Lo')).toBe(true);
    expect(estimateTextWidth(long, 18)).toBeLessThanOrEqual(104);
    expect(fitPadLabel('Very Long Name', 40, 18)).not.toBe('VLN');
    const cut = fitPadLabel('Supercalifragilistic', 60, 18);
    expect(cut.endsWith('…')).toBe(true);
    expect(estimateTextWidth(cut, 18)).toBeLessThanOrEqual(60);
  });

  it('keeps the full name out of the short text but not lost', () => {
    const el = buildPadLayout('symmetric').find((e) => e.code === 'GP_B0');
    expect(shapeBox(el.shape).w).toBeGreaterThan(0);
  });
});
