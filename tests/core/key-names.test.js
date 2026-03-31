import { describe, it, expect } from 'vitest';
import { getKeyLabel, isKnownCode } from '../../src/input/key-names.js';

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
});
