/**
 * J4: the pad layout with the REAL family labels (GAMEPAD_PROFILES and the
 * xbox-elite variant), not the lane's fixture: nothing overlaps and every
 * printed label fits its element without being cut.
 */
import { describe, it, expect } from 'vitest';
import {
  PAD_VIEWBOX,
  computePadBoxes,
  boxesOverlap,
  boxContains,
  getStickLayoutForFamily,
  shortenPadLabel,
} from '../../../src/ui/tools/pad-layout.js';
import { GAMEPAD_PROFILES, GAMEPAD_LABEL_VARIANTS, getGamepadLabel } from '../../../src/input/gamepad-profiles.js';

const VIEW = { x: 0, y: 0, w: PAD_VIEWBOX.width, h: PAD_VIEWBOX.height };

const CASES = [
  ...Object.keys(GAMEPAD_PROFILES).map((family) => ({ name: family, family, variant: null })),
  ...Object.entries(GAMEPAD_LABEL_VARIANTS).map(([variant, def]) => ({ name: variant, family: def.family, variant })),
];

describe('pad layout with the real family labels', () => {
  it('covers the eight families and the xbox-elite variant', () => {
    expect(CASES.map((c) => c.name)).toEqual(['xbox', 'xbox360', 'dualshock4', 'dualsense', 'switch-pro', 'steam', 'stadia', 'generic', 'xbox-elite']);
  });

  describe.each(CASES)('$name', ({ family, variant }) => {
    const labelFor = (code) => getGamepadLabel(code, family, variant);
    const layout = getStickLayoutForFamily(family);
    const boxes = computePadBoxes(layout, family, labelFor);

    it('every element and label stays inside its box, no two elements overlap', () => {
      for (const b of boxes) {
        expect(boxContains(VIEW, b.shape), `${b.code} inside the viewBox`).toBe(true);
        if (b.label) expect(boxContains(b.shape, b.label), `${b.code} label "${b.text}" inside its shape`).toBe(true);
        if (b.value) expect(boxContains(b.shape, b.value), `${b.code} value inside its shape`).toBe(true);
        if (b.label && b.value) expect(boxesOverlap(b.label, b.value), `${b.code} label vs value`).toBe(false);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(boxesOverlap(boxes[i].shape, boxes[j].shape), `${boxes[i].code} vs ${boxes[j].code}`).toBe(false);
        }
      }
    });

    it('every label fits without an ellipsis', () => {
      for (const b of boxes) {
        const full = shortenPadLabel(b.code, labelFor(b.code), family);
        expect(b.text, `${b.code} "${labelFor(b.code)}"`).toBe(full);
      }
    });
  });

  it('the Elite variant names the paddles', () => {
    const labels = ['GP_B17', 'GP_B18', 'GP_B19', 'GP_B20'].map((c) => getGamepadLabel(c, 'xbox', 'xbox-elite'));
    expect(labels).toEqual(['Paddle 1', 'Paddle 2', 'Paddle 3', 'Paddle 4']);
    const visible = computePadBoxes('offset', 'xbox', (c) => getGamepadLabel(c, 'xbox', 'xbox-elite')).map((b) => b.code);
    expect(visible).toEqual(expect.arrayContaining(['GP_B17', 'GP_B18', 'GP_B19', 'GP_B20']));
    expect(visible).not.toContain('GP_B21');
  });
});
