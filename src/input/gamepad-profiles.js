/**
 * Gamepad profile definitions for Xbox, DualSense (PlayStation), and a Generic fallback.
 *
 * Each profile maps GP_B* and GP_A* codes to human-readable display labels.
 * detectGamepadProfile() inspects the browser's Gamepad.id string to pick a profile.
 */
import {
  GP_B0, GP_B1, GP_B2, GP_B3, GP_B4, GP_B5, GP_B6, GP_B7,
  GP_B8, GP_B9, GP_B10, GP_B11, GP_B12, GP_B13, GP_B14, GP_B15, GP_B16,
  GP_A0N, GP_A0P, GP_A1N, GP_A1P, GP_A2N, GP_A2P, GP_A3N, GP_A3P,
} from './gamepad-codes.js';

/** @typedef {'xbox' | 'dualsense' | 'generic'} GamepadProfileName */

/** @type {Record<GamepadProfileName, Record<string, string>>} */
export const GAMEPAD_PROFILES = {
  xbox: {
    // Face buttons
    [GP_B0]:  'A',
    [GP_B1]:  'B',
    [GP_B2]:  'X',
    [GP_B3]:  'Y',
    // Shoulder / trigger
    [GP_B4]:  'LB',
    [GP_B5]:  'RB',
    [GP_B6]:  'LT',
    [GP_B7]:  'RT',
    // System
    [GP_B8]:  'Back',
    [GP_B9]:  'Start',
    // Stick clicks
    [GP_B10]: 'L3',
    [GP_B11]: 'R3',
    // D-Pad
    [GP_B12]: 'D-Up',
    [GP_B13]: 'D-Down',
    [GP_B14]: 'D-Left',
    [GP_B15]: 'D-Right',
    // Guide
    [GP_B16]: 'Xbox',
    // Left stick
    [GP_A0N]: 'LS-Left',
    [GP_A0P]: 'LS-Right',
    [GP_A1N]: 'LS-Up',
    [GP_A1P]: 'LS-Down',
    // Right stick
    [GP_A2N]: 'RS-Left',
    [GP_A2P]: 'RS-Right',
    [GP_A3N]: 'RS-Up',
    [GP_A3P]: 'RS-Down',
  },

  dualsense: {
    // Face buttons
    [GP_B0]:  'Cross',
    [GP_B1]:  'Circle',
    [GP_B2]:  'Square',
    [GP_B3]:  'Triangle',
    // Shoulder / trigger
    [GP_B4]:  'L1',
    [GP_B5]:  'R1',
    [GP_B6]:  'L2',
    [GP_B7]:  'R2',
    // System
    [GP_B8]:  'Create',
    [GP_B9]:  'Options',
    // Stick clicks
    [GP_B10]: 'L3',
    [GP_B11]: 'R3',
    // D-Pad
    [GP_B12]: 'D-Up',
    [GP_B13]: 'D-Down',
    [GP_B14]: 'D-Left',
    [GP_B15]: 'D-Right',
    // Guide
    [GP_B16]: 'PS',
    // Left stick
    [GP_A0N]: 'LS-Left',
    [GP_A0P]: 'LS-Right',
    [GP_A1N]: 'LS-Up',
    [GP_A1P]: 'LS-Down',
    // Right stick
    [GP_A2N]: 'RS-Left',
    [GP_A2P]: 'RS-Right',
    [GP_A3N]: 'RS-Up',
    [GP_A3P]: 'RS-Down',
  },

  generic: {
    [GP_B0]:  'Btn 0',
    [GP_B1]:  'Btn 1',
    [GP_B2]:  'Btn 2',
    [GP_B3]:  'Btn 3',
    [GP_B4]:  'Btn 4',
    [GP_B5]:  'Btn 5',
    [GP_B6]:  'Btn 6',
    [GP_B7]:  'Btn 7',
    [GP_B8]:  'Btn 8',
    [GP_B9]:  'Btn 9',
    [GP_B10]: 'Btn 10',
    [GP_B11]: 'Btn 11',
    [GP_B12]: 'Btn 12',
    [GP_B13]: 'Btn 13',
    [GP_B14]: 'Btn 14',
    [GP_B15]: 'Btn 15',
    [GP_B16]: 'Btn 16',
    [GP_A0N]: 'Axis 0-',
    [GP_A0P]: 'Axis 0+',
    [GP_A1N]: 'Axis 1-',
    [GP_A1P]: 'Axis 1+',
    [GP_A2N]: 'Axis 2-',
    [GP_A2P]: 'Axis 2+',
    [GP_A3N]: 'Axis 3-',
    [GP_A3P]: 'Axis 3+',
  },
};

/**
 * Detect the best matching profile name from a browser Gamepad.id string.
 *
 * @param {string} gamepadId - The raw Gamepad.id string from the browser API
 * @returns {GamepadProfileName}
 */
export function detectGamepadProfile(gamepadId) {
  if (!gamepadId || typeof gamepadId !== 'string') return 'generic';
  const id = gamepadId.toLowerCase();

  // Xbox detection – covers Xbox 360, Xbox One, Xbox Series, and Microsoft virtual adapters
  if (/xinput|xbox|microsoft|045e/.test(id)) return 'xbox';

  // PlayStation detection – covers DualShock 4 (054c:09cc), DualSense (054c:0ce6),
  // and plain "Wireless Controller" gamepad.id often reported on Chrome
  if (/054c|playstation|dualshock|dualsense|wireless controller/.test(id)) return 'dualsense';

  return 'generic';
}

/**
 * Get a human-readable label for a GP code in a specific profile.
 *
 * @param {string | null} code       - A GP_B* or GP_A* code, or null
 * @param {GamepadProfileName} [profile='generic']
 * @returns {string}  Display label, or '—' for null/unknown
 */
export function getGamepadLabel(code, profile = 'generic') {
  if (!code) return '—';
  const map = GAMEPAD_PROFILES[profile] ?? GAMEPAD_PROFILES.generic;
  return map[code] ?? code;
}
