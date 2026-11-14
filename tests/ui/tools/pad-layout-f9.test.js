/**
 * F9 (a-c): readable Steam labels, the extra-key row centred on the keys
 * shown, and all four Elite paddles together in that row.
 */
import { describe, it, expect } from 'vitest';
import {
  PAD_VIEWBOX,
  buildPadLayout,
  computePadBoxes,
  boxesOverlap,
  shortenPadLabel,
} from '../../../src/ui/tools/pad-layout.js';
import { getGamepadLabel } from '../../../src/input/gamepad-profiles.js';

const real = (family, variant = null) => (code) => getGamepadLabel(code, family, variant);
const centreX = (b) => b.shape.x + b.shape.w / 2;

describe('F9a: Steam short labels', () => {
  it('Quick Access reads QAM; the pad clicks shorten from their real labels', () => {
    expect(shortenPadLabel('GP_B17', 'Quick Access', 'steam')).toBe('QAM');
    expect(shortenPadLabel('GP_B18', 'Left Pad', 'steam')).toBe('L Pad');
    expect(shortenPadLabel('GP_B19', 'Right Pad', 'steam')).toBe('R Pad');
  });
});

describe('F9b: the extra-key row is centred on the keys shown', () => {
  it('a single extra key (Stadia Capture) sits in the middle', () => {
    const boxes = computePadBoxes('offset', 'stadia', real('stadia'));
    const extras = boxes.filter((b) => b.kind === 'extra');
    expect(extras.map((b) => b.code)).toEqual(['GP_B18']);
    expect(Math.abs(centreX(extras[0]) - PAD_VIEWBOX.width / 2)).toBeLessThan(0.5);
    const label = extras[0].label;
    expect(Math.abs(label.x + label.w / 2 - PAD_VIEWBOX.width / 2)).toBeLessThan(0.5);
  });

  it('six keys (Steam) keep their spacing and are centred as a group', () => {
    const extras = computePadBoxes('offset', 'steam', real('steam')).filter((b) => b.kind === 'extra');
    expect(extras).toHaveLength(6);
    const left = extras[0].shape.x;
    const right = extras[5].shape.x + extras[5].shape.w;
    expect(Math.abs((left + right) / 2 - PAD_VIEWBOX.width / 2)).toBeLessThan(0.5);
  });
});

describe('F9c: Xbox Elite paddles all in the extra-key row', () => {
  const opts = { b17InRow: true };

  it('the layout moves GP_B17 into the row', () => {
    const els = buildPadLayout('offset', opts);
    expect(els.find((e) => e.code === 'GP_B17').kind).toBe('extra');
    expect(buildPadLayout('offset').find((e) => e.code === 'GP_B17').kind).toBe('center');
  });

  it('Paddle 1..4 sit together in the row, centred, nothing overlaps', () => {
    const boxes = computePadBoxes('offset', 'xbox', real('xbox', 'xbox-elite'), opts);
    const extras = boxes.filter((b) => b.kind === 'extra');
    expect(extras.map((b) => b.text)).toEqual(['Paddle 1', 'Paddle 2', 'Paddle 3', 'Paddle 4']);
    expect(new Set(extras.map((b) => b.shape.y)).size).toBe(1);
    const mid = (extras[0].shape.x + extras[3].shape.x + extras[3].shape.w) / 2;
    expect(Math.abs(mid - PAD_VIEWBOX.width / 2)).toBeLessThan(0.5);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(boxesOverlap(boxes[i].shape, boxes[j].shape), `${boxes[i].code} vs ${boxes[j].code}`).toBe(false);
    }
  });

  it('Share stays on the face for a non-Elite Xbox', () => {
    const b17 = computePadBoxes('offset', 'xbox', real('xbox')).find((b) => b.code === 'GP_B17');
    expect(b17.kind).toBe('center');
    expect(b17.text).toBe('Share');
  });
});
