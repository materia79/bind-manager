import { describe, it, expect } from 'vitest';
import {
  getStrongestSignal,
  toGpCode,
  resolveStrongestSignalToLogicalCode,
  getActiveCodes,
  getActiveLogicalCodes,
  createNeutralBaseline,
  getLogicalAxisValueFromMapping,
  getTriggerFillValue,
  toProfileMappingEntry,
  formatSignalFields,
  formatActiveCodes,
  formatRawButton,
  formatRawAxis,
  SIGNAL_FIELDS,
} from '../../../src/ui/tools/signals.js';

function pad({ buttons = {}, axes = {} } = {}, nb = 18, na = 4) {
  return {
    buttons: Array.from({ length: nb }, (_, i) => {
      const v = buttons[i] ?? 0;
      return { value: v, pressed: v > 0.5 };
    }),
    axes: Array.from({ length: na }, (_, i) => axes[i] ?? 0),
  };
}

const ZERO = createNeutralBaseline(pad());

describe('getStrongestSignal', () => {
  it('returns null below the threshold', () => {
    expect(getStrongestSignal(pad({ buttons: { 0: 0.1 }, axes: { 1: -0.1 } }), ZERO)).toBeNull();
  });

  it('picks the strongest button or axis direction relative to the baseline', () => {
    expect(getStrongestSignal(pad({ buttons: { 3: 0.6 }, axes: { 2: 0.4 } }), ZERO)).toMatchObject({ kind: 'button', index: 3, delta: 0.6 });
    expect(getStrongestSignal(pad({ buttons: { 3: 0.6 }, axes: { 1: -0.9 } }), ZERO)).toMatchObject({ kind: 'axis', index: 1, direction: 'negative' });
    const base = { buttons: ZERO.buttons, axes: [0.5, 0, 0, 0] };
    expect(getStrongestSignal(pad({ axes: { 0: 0.5 } }), base)).toBeNull();
    expect(getStrongestSignal(pad({ axes: { 0: 1 } }), base)).toMatchObject({ kind: 'axis', index: 0, direction: 'positive', delta: 0.5, rawValue: 1 });
  });
});

describe('codes', () => {
  it('maps signals to raw GP codes', () => {
    expect(toGpCode({ kind: 'button', index: 7 })).toBe('GP_B7');
    expect(toGpCode({ kind: 'axis', index: 3, direction: 'negative' })).toBe('GP_A3N');
    expect(toGpCode({ kind: 'axis', index: 0, direction: 'positive' })).toBe('GP_A0P');
    expect(toGpCode({ kind: 'hat' })).toBeNull();
  });

  it('resolves a raw signal through the profile mapping', () => {
    const mapping = { GP_B1: { kind: 'button', index: 0 }, GP_B12: { kind: 'hat', index: 9, value: -1, tolerance: 0.1 } };
    const signal = { kind: 'button', index: 0 };
    expect(resolveStrongestSignalToLogicalCode(signal, pad(), ZERO, mapping)).toBe('GP_B1');
    expect(resolveStrongestSignalToLogicalCode(signal, pad(), ZERO, null)).toBe('GP_B0');
    expect(resolveStrongestSignalToLogicalCode(null, pad(), ZERO, mapping)).toBeNull();
    const hatPad = pad({}, 18, 10);
    hatPad.axes[9] = -1;
    expect(resolveStrongestSignalToLogicalCode({ kind: 'axis', index: 9, direction: 'negative' }, hatPad, createNeutralBaseline(hatPad), mapping)).toBe('GP_B12');
  });

  it('lists active standard codes without a mapping', () => {
    expect(getActiveCodes(pad({ buttons: { 0: 1, 16: 1 }, axes: { 0: -0.9, 3: 0.5 } }), ZERO)).toEqual(['GP_B0', 'GP_B16', 'GP_A0N', 'GP_A3P']);
  });

  it('lists active logical codes through a mapping, plus analog triggers', () => {
    const mapping = { GP_B0: { kind: 'button', index: 1 }, GP_A1N: { kind: 'axis', index: 5, direction: 'negative' } };
    const p = pad({ buttons: { 1: 1, 6: 0.3 } }, 18, 6);
    p.axes[5] = -1;
    expect(getActiveLogicalCodes(p, createNeutralBaseline(p), mapping).sort()).toEqual(['GP_A1N', 'GP_B0', 'GP_B6A']);
  });

  it('converts captured signals to profile mapping entries', () => {
    expect(toProfileMappingEntry({ kind: 'button', index: 4 })).toEqual({ kind: 'button', index: 4 });
    expect(toProfileMappingEntry({ kind: 'axis', index: 2, direction: 'negative' })).toEqual({ kind: 'axis', index: 2, direction: 'negative' });
    expect(toProfileMappingEntry({ kind: 'axis', index: 2 })).toEqual({ kind: 'axis', index: 2, direction: 'positive' });
    expect(toProfileMappingEntry({ kind: 'button', index: 1.5 })).toBeNull();
    expect(toProfileMappingEntry(null)).toBeNull();
  });
});

describe('analog values', () => {
  it('reads logical stick axes from the mapping or the raw axis', () => {
    expect(getLogicalAxisValueFromMapping(pad({ axes: { 0: -0.7 } }), ZERO, null, 0, 0)).toBeCloseTo(-0.7);
    const mapping = { GP_A0N: { kind: 'button', index: 14 }, GP_A0P: { kind: 'button', index: 15 } };
    expect(getLogicalAxisValueFromMapping(pad({ buttons: { 15: 1 } }), ZERO, mapping, 0, 0)).toBe(1);
    expect(getLogicalAxisValueFromMapping(pad({ buttons: { 14: 1 } }), ZERO, mapping, 0, 0)).toBe(-1);
  });

  it('reads trigger fill from the analog mapping or the button', () => {
    expect(getTriggerFillValue(pad({ buttons: { 6: 0.42 } }), ZERO, null, 'GP_B6A', 6)).toBeCloseTo(0.42);
    const mapping = { GP_B7A: { kind: 'axis', index: 3, direction: 'positive' } };
    expect(getTriggerFillValue(pad({ axes: { 3: 0.8 } }), ZERO, mapping, 'GP_B7A', 7)).toBeCloseTo(0.8);
    expect(getTriggerFillValue(pad({ buttons: { 6: 2 } }), ZERO, null, 'GP_B6A', 6)).toBe(1);
  });
});

describe('formatting', () => {
  it('always yields every signal field', () => {
    const empty = formatSignalFields(null);
    expect(Object.keys(empty)).toEqual([...SIGNAL_FIELDS]);
    expect(formatSignalFields({ kind: 'axis', index: 1, direction: 'negative', delta: 0.98765, rawValue: -0.98765 })).toEqual({
      kind: 'axis', index: '1', direction: 'negative', delta: '0.9877', raw: '-0.9877', code: 'GP_A1N',
    });
    expect(formatSignalFields({ kind: 'button', index: 0, delta: 1, rawValue: 1 }).direction).toBe('n/a');
  });

  it('formats active codes on one line', () => {
    expect(formatActiveCodes([], (c) => c)).toBe('(none)');
    expect(formatActiveCodes(['GP_B0', 'GP_B5'], (c) => ({ GP_B0: 'Cross', GP_B5: 'R1' })[c])).toBe('GP_B0=Cross, GP_B5=R1');
  });

  it('formats raw cells with a fixed width', () => {
    const p = pad({ buttons: { 0: 1 }, axes: { 1: -0.5 } });
    expect(formatRawButton(p, ZERO, 0)).toBe('●B00:1.00');
    expect(formatRawButton(p, ZERO, 12)).toBe('○B12:0.00');
    expect(formatRawAxis(p, ZERO, 1)).toMatch(/^→A01: -0\.500  Δ-0\.500  \[.{15}\]$/);
    expect(formatRawAxis(p, ZERO, 0).length).toBe(formatRawAxis(p, ZERO, 1).length);
  });
});
