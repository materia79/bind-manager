/**
 * L4: the Xbox Elite paddle labels (the xbox-elite variant, GP_B17..GP_B20)
 * come from research, not hardware, so they are listed as unverified, and
 * isGamepadLabelUnverified takes the label variant. The old two-argument
 * call keeps working.
 */
import { describe, it, expect } from 'vitest';
import { GAMEPAD_UNVERIFIED_LABELS, isGamepadLabelUnverified } from '../../src/input/gamepad-profiles.js';

describe('unverified labels with label variants (L4)', () => {
  it('lists the Elite paddles under the variant', () => {
    expect(GAMEPAD_UNVERIFIED_LABELS['xbox-elite']).toEqual(['GP_B17', 'GP_B18', 'GP_B19', 'GP_B20']);
  });

  it('judges a code the variant labels by the variant, others by the family', () => {
    for (let i = 17; i <= 20; i++) expect(isGamepadLabelUnverified(`GP_B${i}`, 'xbox', 'xbox-elite'), `GP_B${i}`).toBe(true);
    expect(isGamepadLabelUnverified('GP_B0', 'xbox', 'xbox-elite')).toBe(false);
    expect(isGamepadLabelUnverified('GP_B21', 'xbox', 'xbox-elite')).toBe(false);
    // A variant of another family does not apply.
    expect(isGamepadLabelUnverified('GP_B18', 'stadia', 'xbox-elite')).toBe(true); // stadia's own list
    expect(isGamepadLabelUnverified('GP_B19', 'stadia', 'xbox-elite')).toBe(false);
  });

  it('the two-argument call is unchanged', () => {
    expect(isGamepadLabelUnverified('GP_B17', 'xbox')).toBe(true);
    expect(isGamepadLabelUnverified('GP_B18', 'xbox')).toBe(false);
    expect(isGamepadLabelUnverified('GP_B17', 'stadia')).toBe(true);
    expect(isGamepadLabelUnverified('GP_B0', 'dualsense')).toBe(false);
  });
});
