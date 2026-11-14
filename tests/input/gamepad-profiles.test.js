import { describe, it, expect } from 'vitest';
import {
  detectGamepadProfile,
  getGamepadLabel,
  getGamepadFamilyName,
  getGamepadLabelVariant,
  isGamepadLabelUnverified,
  GAMEPAD_FAMILIES,
  GAMEPAD_PROFILES,
  GAMEPAD_UNVERIFIED_LABELS,
} from '../../src/input/gamepad-profiles.js';
import {
  GP_B0, GP_B1, GP_B2, GP_B3, GP_B16,
  GP_A0N, GP_A3P, GP_CODES,
} from '../../src/input/gamepad-codes.js';

describe('detectGamepadProfile', () => {
  it('detects Xbox controllers', () => {
    expect(detectGamepadProfile('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox');
    expect(detectGamepadProfile('xinput gamepad')).toBe('xbox');
  });

  it('falls back to generic for unknown controllers', () => {
    expect(detectGamepadProfile('Unknown HID Gamepad')).toBe('generic');
    expect(detectGamepadProfile('')).toBe('generic');
    expect(detectGamepadProfile('ACME SPEEDSTER PRO')).toBe('generic');
  });
});

// Button labels by standard index; 12-15 are the D-pad in every named family.
// `null` = the family has no such button (getGamepadLabel returns the code).
const EXPECTED_BUTTONS = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS',
    'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Xbox', 'Share', null, null, null, null, null, null],
  xbox360: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'LS', 'RS',
    'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Guide', null, null, null, null, null, null, null],
  dualshock4: ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3',
    'D-Up', 'D-Down', 'D-Left', 'D-Right', 'PS', 'Touchpad', null, null, null, null, null, null],
  dualsense: ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3',
    'D-Up', 'D-Down', 'D-Left', 'D-Right', 'PS', 'Touchpad', null, null, null, null, null, null],
  'switch-pro': ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', 'Minus', 'Plus', 'LS', 'RS',
    'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Home', 'Capture', null, null, null, null, null, null],
  steam: ['A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'View', 'Menu', 'L3', 'R3',
    'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Steam', 'Quick Access', 'Left Pad', 'Right Pad', 'L4', 'L5', 'R4', 'R5'],
  stadia: ['A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'Options', 'Menu', 'L3', 'R3',
    'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Stadia', 'Assistant', 'Capture', null, null, null, null, null],
  generic: Array.from({ length: 24 }, (_, i) => `Btn ${i}`),
};

const STICK_STYLE = {
  GP_A0N: 'LS-Left', GP_A0P: 'LS-Right', GP_A1N: 'LS-Up', GP_A1P: 'LS-Down',
  GP_A2N: 'RS-Left', GP_A2P: 'RS-Right', GP_A3N: 'RS-Up', GP_A3P: 'RS-Down',
};

describe('family label tables', () => {
  it('has exactly the eight families', () => {
    expect([...GAMEPAD_FAMILIES].sort()).toEqual(Object.keys(EXPECTED_BUTTONS).sort());
  });

  for (const [family, buttons] of Object.entries(EXPECTED_BUTTONS)) {
    it(`${family}: button labels by index`, () => {
      buttons.forEach((label, index) => {
        const code = `GP_B${index}`;
        expect(getGamepadLabel(code, family), `${family} ${code}`).toBe(label ?? code);
      });
    });

    it(`${family}: stick direction labels`, () => {
      for (const [code, label] of Object.entries(STICK_STYLE)) {
        const expected = family === 'generic'
          ? `Axis ${code[4]}${code[5] === 'N' ? '-' : '+'}`
          : label;
        expect(getGamepadLabel(code, family)).toBe(expected);
      }
    });
  }

  it('every family has a display name', () => {
    expect(getGamepadFamilyName('dualsense')).toBe('DualSense');
    expect(getGamepadFamilyName('switch-pro')).toBe('Switch Pro');
    expect(getGamepadFamilyName('xbox360')).toBe('Xbox 360');
    expect(getGamepadFamilyName('dualshock4')).toBe('DualShock 4');
    for (const family of GAMEPAD_FAMILIES) expect(getGamepadFamilyName(family)).toBeTruthy();
    expect(getGamepadFamilyName('unknown-family')).toBe('unknown-family');
  });

  it('generic has a label for every GP code', () => {
    for (const code of GP_CODES) expect(GAMEPAD_PROFILES.generic[code]).toBeTruthy();
  });
});

describe('Xbox Elite label variant', () => {
  it('is selected for the Elite product ids only', () => {
    for (const product of ['02e3', '0b00', '0b05', '0b22']) {
      expect(getGamepadLabelVariant('xbox', '045e', product)).toBe('xbox-elite');
    }
    expect(getGamepadLabelVariant('xbox', '045e', '0b12')).toBeNull();
    expect(getGamepadLabelVariant('xbox360', '045e', '0b00')).toBeNull();
    expect(getGamepadLabelVariant('xbox', null, null)).toBeNull();
  });

  it('labels 17-20 as paddles instead of Share', () => {
    expect(getGamepadLabel('GP_B17', 'xbox', 'xbox-elite')).toBe('Paddle 1');
    expect(getGamepadLabel('GP_B18', 'xbox', 'xbox-elite')).toBe('Paddle 2');
    expect(getGamepadLabel('GP_B19', 'xbox', 'xbox-elite')).toBe('Paddle 3');
    expect(getGamepadLabel('GP_B20', 'xbox', 'xbox-elite')).toBe('Paddle 4');
    expect(getGamepadLabel('GP_B21', 'xbox', 'xbox-elite')).toBe('GP_B21');
    expect(getGamepadLabel('GP_B0', 'xbox', 'xbox-elite')).toBe('A');
    expect(getGamepadLabel('GP_B17', 'xbox')).toBe('Share');
  });

  it('ignores a variant of another family', () => {
    expect(getGamepadLabel('GP_B17', 'dualsense', 'xbox-elite')).toBe('Touchpad');
  });
});

describe('unverified label entries', () => {
  it('flags the entries the research could not verify', () => {
    expect(isGamepadLabelUnverified('GP_B17', 'xbox')).toBe(true);
    for (let i = 17; i <= 23; i++) expect(isGamepadLabelUnverified(`GP_B${i}`, 'steam')).toBe(true);
    expect(isGamepadLabelUnverified('GP_B17', 'stadia')).toBe(true);
    expect(isGamepadLabelUnverified('GP_B18', 'stadia')).toBe(true);
    expect(isGamepadLabelUnverified('GP_B0', 'xbox')).toBe(false);
    expect(isGamepadLabelUnverified('GP_B17', 'dualsense')).toBe(false);
    // L4: the Elite paddles are listed under their label variant.
    expect(Object.keys(GAMEPAD_UNVERIFIED_LABELS).sort()).toEqual(['stadia', 'steam', 'xbox', 'xbox-elite']);
  });
});

describe('getGamepadLabel', () => {
  it('returns face button names', () => {
    expect([GP_B0, GP_B1, GP_B2, GP_B3].map((c) => getGamepadLabel(c, 'xbox'))).toEqual(['A', 'B', 'X', 'Y']);
    expect([GP_B0, GP_B1, GP_B2, GP_B3].map((c) => getGamepadLabel(c, 'dualsense')))
      .toEqual(['Cross', 'Circle', 'Square', 'Triangle']);
  });

  it('returns — for a null code', () => {
    expect(getGamepadLabel(null, 'xbox')).toBe('—');
  });

  it('falls back to generic labels for an unknown profile', () => {
    expect(getGamepadLabel(GP_B0, 'unknown-profile')).toBe('Btn 0');
  });

  it('returns generic labels for generic profile', () => {
    expect(getGamepadLabel(GP_B0,  'generic')).toBe('Btn 0');
    expect(getGamepadLabel(GP_B16, 'generic')).toBe('Btn 16');
    expect(getGamepadLabel('GP_B23', 'generic')).toBe('Btn 23');
    expect(getGamepadLabel(GP_A0N, 'generic')).toBe('Axis 0-');
    expect(getGamepadLabel(GP_A3P, 'generic')).toBe('Axis 3+');
  });
});

describe('extra button codes', () => {
  it('GP_B17..GP_B23 are valid gamepad codes', async () => {
    const { isGamepadCode, GP_BUTTON_COUNT } = await import('../../src/input/gamepad-codes.js');
    for (let i = 17; i <= 23; i++) expect(isGamepadCode(`GP_B${i}`)).toBe(true);
    expect(isGamepadCode('GP_B24')).toBe(false);
    expect(GP_BUTTON_COUNT).toBe(24);
    expect(GP_CODES).toHaveLength(32);
  });
});
