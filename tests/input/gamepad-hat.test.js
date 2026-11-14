import { describe, it, expect } from 'vitest';
import {
  decodeHatValue,
  isHatEntryActive,
  readMappingEntryMagnitude,
} from '../../src/input/gamepad-runtime.js';

const step = 2 / 7;
const none = { up: false, right: false, down: false, left: false };

describe('decodeHatValue', () => {
  it('decodes the eight positions clockwise from up', () => {
    expect(decodeHatValue(-1)).toEqual({ ...none, up: true });
    expect(decodeHatValue(-1 + step)).toEqual({ ...none, up: true, right: true });
    expect(decodeHatValue(-1 + 2 * step)).toEqual({ ...none, right: true });
    expect(decodeHatValue(-1 + 3 * step)).toEqual({ ...none, down: true, right: true });
    expect(decodeHatValue(-1 + 4 * step)).toEqual({ ...none, down: true });
    expect(decodeHatValue(-1 + 5 * step)).toEqual({ ...none, down: true, left: true });
    expect(decodeHatValue(-1 + 6 * step)).toEqual({ ...none, left: true });
    expect(decodeHatValue(1)).toEqual({ ...none, up: true, left: true });
  });

  it('tolerates noise within half a step', () => {
    expect(decodeHatValue(-0.71)).toEqual({ ...none, up: true, right: true });
    expect(decodeHatValue(0.15)).toEqual({ ...none, down: true });
  });

  it('decodes neutral and invalid values to nothing', () => {
    expect(decodeHatValue(9 / 7)).toEqual(none);
    expect(decodeHatValue(1.5)).toEqual(none);
    expect(decodeHatValue(-2)).toEqual(none);
    expect(decodeHatValue(NaN)).toEqual(none);
    expect(decodeHatValue(undefined)).toEqual(none);
  });
});

describe('isHatEntryActive', () => {
  const up = { value: -1, tolerance: 0.2 };
  const right = { value: -0.428571, tolerance: 0.2 };

  it('a cardinal entry is active on its position and both neighbouring diagonals', () => {
    expect(isHatEntryActive(-1, up)).toBe(true);
    expect(isHatEntryActive(-1 + step, up)).toBe(true);
    expect(isHatEntryActive(1, up)).toBe(true);
    expect(isHatEntryActive(-1 + 2 * step, up)).toBe(false);
    expect(isHatEntryActive(-1 + step, right)).toBe(true);
    expect(isHatEntryActive(-1 + 3 * step, right)).toBe(true);
    expect(isHatEntryActive(9 / 7, right)).toBe(false);
  });

  it('a diagonal entry is active only on its own position', () => {
    const upRight = { value: -1 + step };
    expect(isHatEntryActive(-1 + step, upRight)).toBe(true);
    expect(isHatEntryActive(-1, upRight)).toBe(false);
  });

  it('a value off the eight positions uses the tolerance', () => {
    expect(isHatEntryActive(3.1, { value: 3, tolerance: 0.2 })).toBe(true);
    expect(isHatEntryActive(3.3, { value: 3, tolerance: 0.2 })).toBe(false);
  });
});

describe('readMappingEntryMagnitude', () => {
  const pad = {
    buttons: [{ pressed: false, value: 0 }, { pressed: true, value: 0.75 }],
    axes: [-0.6, 0.4, 0, 0, 0, 0, 0, 0, 0, -1 + step],
  };

  it('reads buttons, axis directions and hat entries', () => {
    expect(readMappingEntryMagnitude(pad, { kind: 'button', index: 1 })).toBe(0.75);
    expect(readMappingEntryMagnitude(pad, { kind: 'axis', index: 0, direction: 'negative' })).toBeCloseTo(0.6);
    expect(readMappingEntryMagnitude(pad, { kind: 'axis', index: 0, direction: 'positive' })).toBe(0);
    expect(readMappingEntryMagnitude(pad, { kind: 'axis', index: 1 })).toBeCloseTo(0.4);
    expect(readMappingEntryMagnitude(pad, { kind: 'hat', index: 9, value: -1 })).toBe(1);
    expect(readMappingEntryMagnitude(pad, { kind: 'hat', index: 9, value: 0.142857 })).toBe(0);
    expect(readMappingEntryMagnitude(pad, null)).toBe(0);
    expect(readMappingEntryMagnitude(pad, { kind: 'button', index: 7 })).toBe(0);
  });
});
