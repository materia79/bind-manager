/**
 * Gamepad label families: Xbox, Xbox 360, DualShock 4, DualSense, Switch Pro,
 * Steam, Stadia and a Generic fallback.
 *
 * Each family maps GP_B* and GP_A* codes to human-readable display labels. A
 * family without an entry for a code makes getGamepadLabel() return the code
 * itself, which is how the UI knows the button does not exist on that pad.
 * detectGamepadProfile() inspects the browser's Gamepad.id string to pick a family.
 */
import {
  GP_B12, GP_B13, GP_B14, GP_B15,
  GP_B17, GP_B18, GP_B19, GP_B20, GP_B21, GP_B22, GP_B23,
  GP_A0N, GP_A0P, GP_A1N, GP_A1P, GP_A2N, GP_A2P, GP_A3N, GP_A3P,
} from './gamepad-codes.js';

/** @typedef {'xbox' | 'xbox360' | 'dualshock4' | 'dualsense' | 'switch-pro' | 'steam' | 'stadia' | 'generic'} GamepadProfileName */

const DPAD_LABELS = {
  [GP_B12]: 'D-Up',
  [GP_B13]: 'D-Down',
  [GP_B14]: 'D-Left',
  [GP_B15]: 'D-Right',
};

const STICK_LABELS = {
  [GP_A0N]: 'LS-Left',
  [GP_A0P]: 'LS-Right',
  [GP_A1N]: 'LS-Up',
  [GP_A1P]: 'LS-Down',
  [GP_A2N]: 'RS-Left',
  [GP_A2P]: 'RS-Right',
  [GP_A3N]: 'RS-Up',
  [GP_A3P]: 'RS-Down',
};

/**
 * Build a family label map from button labels keyed by standard button index.
 * The D-pad (12-15) and the stick directions are shared by every named family.
 * @param {Record<number, string>} buttons
 * @returns {Record<string, string>}
 */
function familyLabels(buttons) {
  const labels = {};
  for (const [index, label] of Object.entries(buttons)) labels[`GP_B${index}`] = label;
  return { ...labels, ...DPAD_LABELS, ...STICK_LABELS };
}

function genericLabels() {
  const labels = {};
  for (let i = 0; i <= 23; i++) labels[`GP_B${i}`] = `Btn ${i}`;
  for (let a = 0; a <= 3; a++) {
    labels[`GP_A${a}N`] = `Axis ${a}-`;
    labels[`GP_A${a}P`] = `Axis ${a}+`;
  }
  return labels;
}

/** @type {Record<GamepadProfileName, Record<string, string>>} */
export const GAMEPAD_PROFILES = {
  xbox: familyLabels({
    0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
    8: 'View', 9: 'Menu', 10: 'LS', 11: 'RS', 16: 'Xbox', 17: 'Share',
  }),

  xbox360: familyLabels({
    0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
    8: 'Back', 9: 'Start', 10: 'LS', 11: 'RS', 16: 'Guide',
  }),

  dualshock4: familyLabels({
    0: 'Cross', 1: 'Circle', 2: 'Square', 3: 'Triangle', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2',
    8: 'Share', 9: 'Options', 10: 'L3', 11: 'R3', 16: 'PS', 17: 'Touchpad',
  }),

  dualsense: familyLabels({
    0: 'Cross', 1: 'Circle', 2: 'Square', 3: 'Triangle', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2',
    8: 'Create', 9: 'Options', 10: 'L3', 11: 'R3', 16: 'PS', 17: 'Touchpad',
  }),

  // Positional: index 0 is the bottom face button, which Nintendo labels B.
  'switch-pro': familyLabels({
    0: 'B', 1: 'A', 2: 'Y', 3: 'X', 4: 'L', 5: 'R', 6: 'ZL', 7: 'ZR',
    8: 'Minus', 9: 'Plus', 10: 'LS', 11: 'RS', 16: 'Home', 17: 'Capture',
  }),

  steam: familyLabels({
    0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2',
    8: 'View', 9: 'Menu', 10: 'L3', 11: 'R3', 16: 'Steam', 17: 'Quick Access',
    18: 'Left Pad', 19: 'Right Pad', 20: 'L4', 21: 'L5', 22: 'R4', 23: 'R5',
  }),

  stadia: familyLabels({
    0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2',
    8: 'Options', 9: 'Menu', 10: 'L3', 11: 'R3', 16: 'Stadia', 17: 'Assistant', 18: 'Capture',
  }),

  generic: genericLabels(),
};

/** Family keys in display order (generic last). */
export const GAMEPAD_FAMILIES = Object.freeze(Object.keys(GAMEPAD_PROFILES));

/** Human-readable family names for the UI. */
export const GAMEPAD_FAMILY_NAMES = Object.freeze({
  xbox: 'Xbox',
  xbox360: 'Xbox 360',
  dualshock4: 'DualShock 4',
  dualsense: 'DualSense',
  'switch-pro': 'Switch Pro',
  steam: 'Steam',
  stadia: 'Stadia',
  generic: 'Generic',
});

/**
 * Get the display name of a family ('dualsense' -> 'DualSense'). Unknown
 * families return the key itself.
 * @param {string | null | undefined} family
 * @returns {string}
 */
export function getGamepadFamilyName(family) {
  if (typeof family !== 'string' || !family) return GAMEPAD_FAMILY_NAMES.generic;
  return GAMEPAD_FAMILY_NAMES[family] ?? family;
}

/**
 * Label variants keyed by vendor/product id: a variant replaces some labels of
 * its family for specific products. Per research, the Elite paddles are only
 * reported by Chrome on Windows.
 */
export const GAMEPAD_LABEL_VARIANTS = Object.freeze({
  'xbox-elite': Object.freeze({
    family: 'xbox',
    ids: Object.freeze(['045e-02e3', '045e-0b00', '045e-0b05', '045e-0b22']),
    labels: Object.freeze({
      [GP_B17]: 'Paddle 1',
      [GP_B18]: 'Paddle 2',
      [GP_B19]: 'Paddle 3',
      [GP_B20]: 'Paddle 4',
    }),
  }),
});

/**
 * Find the label variant for a family and vendor/product pair.
 * @param {string | null | undefined} family
 * @param {string | null | undefined} vendorId
 * @param {string | null | undefined} productId
 * @returns {string | null} variant key, e.g. 'xbox-elite'
 */
export function getGamepadLabelVariant(family, vendorId, productId) {
  if (!family || !vendorId || !productId) return null;
  const key = `${vendorId}-${productId}`.toLowerCase();
  for (const [variant, def] of Object.entries(GAMEPAD_LABEL_VARIANTS)) {
    if (def.family === family && def.ids.includes(key)) return variant;
  }
  return null;
}

/**
 * Label entries not verified on hardware (no device was available):
 * - xbox GP_B17: Share is confirmed only for Chrome on Windows, not for
 *   other browsers on Linux/macOS.
 * - steam GP_B17..GP_B23: the order of the back buttons (20-23) and the
 *   layout of the 2026 Steam Controller (28de:1302-1305).
 * - stadia GP_B17 / GP_B18: Assistant and Capture may be swapped.
 */
export const GAMEPAD_UNVERIFIED_LABELS = Object.freeze({
  xbox: Object.freeze([GP_B17]),
  steam: Object.freeze([GP_B17, GP_B18, GP_B19, GP_B20, GP_B21, GP_B22, GP_B23]),
  stadia: Object.freeze([GP_B17, GP_B18]),
});

/**
 * True when the label of `code` in `family` is not verified on hardware.
 * @param {string} code
 * @param {string} family
 * @returns {boolean}
 */
export function isGamepadLabelUnverified(code, family) {
  return GAMEPAD_UNVERIFIED_LABELS[family]?.includes(code) ?? false;
}

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
 * @param {string | null} [variant=null] - label variant key, e.g. 'xbox-elite'
 * @returns {string}  Display label, '—' for null, or the code itself when the
 *                    family has no such button
 */
export function getGamepadLabel(code, profile = 'generic', variant = null) {
  if (!code) return '—';
  const variantDef = variant ? GAMEPAD_LABEL_VARIANTS[variant] : null;
  if (variantDef && variantDef.family === profile && variantDef.labels[code]) {
    return variantDef.labels[code];
  }
  const map = GAMEPAD_PROFILES[profile] ?? GAMEPAD_PROFILES.generic;
  return map[code] ?? code;
}
