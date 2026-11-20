import { describe, it, expect } from 'vitest';
import * as pkg from '../../src/index.js';

describe('package entry exports the gamepad codes and helpers', () => {
  it('extra button codes and counts', () => {
    for (let i = 17; i <= 23; i++) expect(pkg[`GP_B${i}`]).toBe(`GP_B${i}`);
    expect(pkg.GP_BUTTON_COUNT).toBe(24);
    expect(pkg.GP_AXIS_COUNT).toBe(4);
  });

  it('family tables and label helpers', () => {
    expect(pkg.GAMEPAD_FAMILIES).toContain('steam');
    expect(pkg.GAMEPAD_FAMILY_NAMES.dualsense).toBe('DualSense');
    expect(pkg.GAMEPAD_DEVICE_FAMILIES['054c-0ce6']).toBe('dualsense');
    expect(pkg.GAMEPAD_LABEL_VARIANTS['xbox-elite'].family).toBe('xbox');
    expect(pkg.GAMEPAD_UNVERIFIED_LABELS.steam).toContain('GP_B20');
    expect(pkg.getGamepadFamilyName('switch-pro')).toBe('Switch Pro');
    expect(pkg.getGamepadLabelVariant('xbox', '045e', '0b00')).toBe('xbox-elite');
    expect(pkg.isGamepadLabelUnverified('GP_B17', 'xbox')).toBe(true);
    expect(pkg.parseGamepadId('054c-0ce6-DualSense Wireless Controller').key).toBe('054c-0ce6');
  });

  it('resolver and runtime helpers', () => {
    expect(typeof pkg.isControllerProfileApplicable).toBe('function');
    expect(pkg.decodeHatValue(-1).up).toBe(true);
    expect(typeof pkg.isHatEntryActive).toBe('function');
    expect(typeof pkg.isHatGridLayout).toBe('function');
    expect(pkg.readMappingEntryMagnitude({ buttons: [{ value: 1 }] }, { kind: 'button', index: 0 })).toBe(1);
  });
});
