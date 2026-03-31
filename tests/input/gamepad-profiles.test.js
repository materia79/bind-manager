import { describe, it, expect } from 'vitest';
import {
  detectGamepadProfile,
  getGamepadLabel,
  GAMEPAD_PROFILES,
} from '../../src/input/gamepad-profiles.js';
import {
  GP_B0, GP_B1, GP_B2, GP_B3, GP_B4, GP_B5, GP_B6, GP_B7,
  GP_B8, GP_B9, GP_B10, GP_B11, GP_B12, GP_B13, GP_B14, GP_B15, GP_B16,
  GP_A0N, GP_A0P, GP_A1N, GP_A1P, GP_A2N, GP_A2P, GP_A3N, GP_A3P,
} from '../../src/input/gamepad-codes.js';

describe('detectGamepadProfile', () => {
  it('detects Xbox controllers', () => {
    expect(detectGamepadProfile('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox');
    expect(detectGamepadProfile('Microsoft X-Box One S pad (STANDARD GAMEPAD Vendor: 045e)')).toBe('xbox');
    expect(detectGamepadProfile('045e-028e-Microsoft X-Box 360 pad')).toBe('xbox');
    expect(detectGamepadProfile('xinput gamepad')).toBe('xbox');
  });

  it('detects DualSense / PlayStation controllers', () => {
    expect(detectGamepadProfile('DualSense Wireless Controller Extended Gamepad')).toBe('dualsense');
    expect(detectGamepadProfile('Sony PLAYSTATION(R)3 Controller')).toBe('dualsense');
    expect(detectGamepadProfile('054c-0ce6-DualSense Wireless Controller')).toBe('dualsense');
    expect(detectGamepadProfile('Wireless Controller (STANDARD GAMEPAD Vendor: 054c)')).toBe('dualsense');
  });

  it('falls back to generic for unknown controllers', () => {
    expect(detectGamepadProfile('Unknown HID Gamepad')).toBe('generic');
    expect(detectGamepadProfile('')).toBe('generic');
    expect(detectGamepadProfile('ACME SPEEDSTER PRO')).toBe('generic');
  });
});

describe('GAMEPAD_PROFILES structure', () => {
  const allCodes = [
    GP_B0, GP_B1, GP_B2, GP_B3, GP_B4, GP_B5, GP_B6, GP_B7,
    GP_B8, GP_B9, GP_B10, GP_B11, GP_B12, GP_B13, GP_B14, GP_B15, GP_B16,
    GP_A0N, GP_A0P, GP_A1N, GP_A1P, GP_A2N, GP_A2P, GP_A3N, GP_A3P,
  ];

  for (const profile of ['xbox', 'dualsense', 'generic']) {
    it(`${profile} profile has a label for every GP code`, () => {
      for (const code of allCodes) {
        const label = GAMEPAD_PROFILES[profile][code];
        expect(typeof label, `Missing label for ${code} in ${profile}`).toBe('string');
        expect(label.length).toBeGreaterThan(0);
      }
    });
  }
});

describe('getGamepadLabel', () => {
  it('returns Xbox face button names', () => {
    expect(getGamepadLabel(GP_B0, 'xbox')).toBe('A');
    expect(getGamepadLabel(GP_B1, 'xbox')).toBe('B');
    expect(getGamepadLabel(GP_B2, 'xbox')).toBe('X');
    expect(getGamepadLabel(GP_B3, 'xbox')).toBe('Y');
  });

  it('returns DualSense face button names', () => {
    expect(getGamepadLabel(GP_B0, 'dualsense')).toBe('Cross');
    expect(getGamepadLabel(GP_B1, 'dualsense')).toBe('Circle');
    expect(getGamepadLabel(GP_B2, 'dualsense')).toBe('Square');
    expect(getGamepadLabel(GP_B3, 'dualsense')).toBe('Triangle');
  });

  it('returns shoulder button names', () => {
    expect(getGamepadLabel(GP_B4, 'xbox')).toBe('LB');
    expect(getGamepadLabel(GP_B5, 'xbox')).toBe('RB');
    expect(getGamepadLabel(GP_B6, 'xbox')).toBe('LT');
    expect(getGamepadLabel(GP_B7, 'xbox')).toBe('RT');
    expect(getGamepadLabel(GP_B4, 'dualsense')).toBe('L1');
    expect(getGamepadLabel(GP_B6, 'dualsense')).toBe('L2');
  });

  it('returns system button names', () => {
    expect(getGamepadLabel(GP_B8,  'xbox')).toBe('Back');
    expect(getGamepadLabel(GP_B9,  'xbox')).toBe('Start');
    expect(getGamepadLabel(GP_B16, 'xbox')).toBe('Xbox');
    expect(getGamepadLabel(GP_B8,  'dualsense')).toBe('Create');
    expect(getGamepadLabel(GP_B9,  'dualsense')).toBe('Options');
    expect(getGamepadLabel(GP_B16, 'dualsense')).toBe('PS');
  });

  it('returns D-Pad names', () => {
    expect(getGamepadLabel(GP_B12, 'xbox')).toBe('D-Up');
    expect(getGamepadLabel(GP_B13, 'xbox')).toBe('D-Down');
    expect(getGamepadLabel(GP_B14, 'xbox')).toBe('D-Left');
    expect(getGamepadLabel(GP_B15, 'xbox')).toBe('D-Right');
  });

  it('returns stick click names', () => {
    expect(getGamepadLabel(GP_B10, 'xbox')).toBe('L3');
    expect(getGamepadLabel(GP_B11, 'xbox')).toBe('R3');
    expect(getGamepadLabel(GP_B10, 'dualsense')).toBe('L3');
    expect(getGamepadLabel(GP_B11, 'dualsense')).toBe('R3');
  });

  it('returns axis direction names for Xbox', () => {
    expect(getGamepadLabel(GP_A0N, 'xbox')).toBe('LS-Left');
    expect(getGamepadLabel(GP_A0P, 'xbox')).toBe('LS-Right');
    expect(getGamepadLabel(GP_A1N, 'xbox')).toBe('LS-Up');
    expect(getGamepadLabel(GP_A1P, 'xbox')).toBe('LS-Down');
    expect(getGamepadLabel(GP_A2N, 'xbox')).toBe('RS-Left');
    expect(getGamepadLabel(GP_A2P, 'xbox')).toBe('RS-Right');
    expect(getGamepadLabel(GP_A3N, 'xbox')).toBe('RS-Up');
    expect(getGamepadLabel(GP_A3P, 'xbox')).toBe('RS-Down');
  });

  it('falls back to generic label for unknown profile', () => {
    const label = getGamepadLabel(GP_B0, 'unknown-profile');
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });

  it('returns generic labels for generic profile', () => {
    expect(getGamepadLabel(GP_B0,  'generic')).toBe('Btn 0');
    expect(getGamepadLabel(GP_B16, 'generic')).toBe('Btn 16');
    expect(getGamepadLabel(GP_A0N, 'generic')).toBe('Axis 0-');
    expect(getGamepadLabel(GP_A3P, 'generic')).toBe('Axis 3+');
  });
});
