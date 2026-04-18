import { describe, it, expect } from 'vitest';
import {
  getKeyLabel,
  isKnownCode,
  buildComboCode,
  MODIFIER_ORDER,
  MODIFIER_CODES,
} from '../../src/input/key-names.js';

describe('key names', () => {
  it('maps known codes to friendly labels', () => {
    expect(getKeyLabel('KeyW')).toBe('W');
    expect(getKeyLabel('ArrowUp')).toBe('Up');
    expect(getKeyLabel('Space')).toBe('Space');
  });

  it('falls back to raw code for unknown values', () => {
    expect(getKeyLabel('CustomCode')).toBe('CustomCode');
    expect(getKeyLabel(null)).toBe('—');
  });

  it('reports known code membership', () => {
    expect(isKnownCode('KeyW')).toBe(true);
    expect(isKnownCode('CustomCode')).toBe(false);
  });

  // ── Mouse labels ──────────────────────────────────────────────────────────

  it('maps mouse button codes to friendly labels', () => {
    expect(getKeyLabel('MouseButton0')).toBe('Mouse Left');
    expect(getKeyLabel('MouseButton1')).toBe('Mouse Middle');
    expect(getKeyLabel('MouseButton2')).toBe('Mouse Right');
    expect(getKeyLabel('MouseButton3')).toBe('Mouse 4');
    expect(getKeyLabel('MouseButton4')).toBe('Mouse 5');
  });

  it('maps mouse wheel codes to friendly labels', () => {
    expect(getKeyLabel('MouseWheelUp')).toBe('Wheel Up');
    expect(getKeyLabel('MouseWheelDown')).toBe('Wheel Down');
  });

  it('recognises mouse codes as known', () => {
    expect(isKnownCode('MouseButton0')).toBe(true);
    expect(isKnownCode('MouseButton2')).toBe(true);
    expect(isKnownCode('MouseWheelUp')).toBe(true);
    expect(isKnownCode('MouseWheelDown')).toBe(true);
  });

  // ── Combo labels ──────────────────────────────────────────────────────────

  it('renders combo codes as joined labels', () => {
    expect(getKeyLabel('ShiftLeft+KeyC')).toBe('Left Shift + C');
    expect(getKeyLabel('ControlLeft+ShiftLeft+KeyA')).toBe('Left Ctrl + Left Shift + A');
  });

  it('handles combo codes with mouse parts', () => {
    expect(getKeyLabel('ShiftLeft+MouseButton0')).toBe('Left Shift + Mouse Left');
  });

  it('recognises combo codes as known when all parts are known', () => {
    expect(isKnownCode('ShiftLeft+KeyC')).toBe(true);
    expect(isKnownCode('ShiftLeft+UnknownKey')).toBe(false);
  });

  // ── Modifier constants ────────────────────────────────────────────────────

  it('exports MODIFIER_ORDER with 8 entries in canonical order', () => {
    expect(MODIFIER_ORDER).toHaveLength(8);
    expect(MODIFIER_ORDER[0]).toBe('ControlLeft');
    expect(MODIFIER_ORDER[7]).toBe('MetaRight');
  });

  it('exports MODIFIER_CODES as a Set matching MODIFIER_ORDER', () => {
    expect(MODIFIER_CODES).toBeInstanceOf(Set);
    expect(MODIFIER_CODES.size).toBe(8);
    for (const m of MODIFIER_ORDER) {
      expect(MODIFIER_CODES.has(m)).toBe(true);
    }
  });

  // ── buildComboCode ────────────────────────────────────────────────────────

  it('returns primary code when no modifiers', () => {
    expect(buildComboCode([], 'KeyW')).toBe('KeyW');
    expect(buildComboCode(null, 'KeyW')).toBe('KeyW');
  });

  it('builds combo with modifiers in canonical order', () => {
    expect(buildComboCode(['ShiftLeft'], 'KeyC')).toBe('ShiftLeft+KeyC');
    // Out-of-order modifiers should still produce canonical order
    expect(buildComboCode(['ShiftLeft', 'ControlLeft'], 'KeyA')).toBe('ControlLeft+ShiftLeft+KeyA');
  });

  it('ignores unknown modifiers in buildComboCode', () => {
    expect(buildComboCode(['FakeModifier', 'ShiftLeft'], 'KeyC')).toBe('ShiftLeft+KeyC');
  });
});
