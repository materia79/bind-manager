/**
 * Gamepad input code constants following the W3C Standard Gamepad Mapping.
 *
 * Buttons are numbered GP_B0–GP_B16 (17 buttons total).
 * Axes 0–3 are split into negative (N) and positive (P) direction codes.
 *
 * Standard button layout:
 *   GP_B0:  A (Xbox)       / Cross     (PS)
 *   GP_B1:  B (Xbox)       / Circle    (PS)
 *   GP_B2:  X (Xbox)       / Square    (PS)
 *   GP_B3:  Y (Xbox)       / Triangle  (PS)
 *   GP_B4:  LB (Xbox)      / L1        (PS)
 *   GP_B5:  RB (Xbox)      / R1        (PS)
 *   GP_B6:  LT (Xbox)      / L2        (PS) – analog value in [0, 1]
 *   GP_B7:  RT (Xbox)      / R2        (PS) – analog value in [0, 1]
 *   GP_B8:  Back (Xbox)    / Create    (PS)
 *   GP_B9:  Start (Xbox)   / Options   (PS)
 *   GP_B10: L3 (left stick click)
 *   GP_B11: R3 (right stick click)
 *   GP_B12: D-Pad Up
 *   GP_B13: D-Pad Down
 *   GP_B14: D-Pad Left
 *   GP_B15: D-Pad Right
 *   GP_B16: Xbox button    / PS button
 *
 * Standard axis layout (each split into two direction codes):
 *   GP_A0N / GP_A0P:  Left Stick X   (left / right)
 *   GP_A1N / GP_A1P:  Left Stick Y   (up   / down)
 *   GP_A2N / GP_A2P:  Right Stick X  (left / right)
 *   GP_A3N / GP_A3P:  Right Stick Y  (up   / down)
 */

// ── Buttons ─────────────────────────────────────────────────────────────────
export const GP_B0  = 'GP_B0';
export const GP_B1  = 'GP_B1';
export const GP_B2  = 'GP_B2';
export const GP_B3  = 'GP_B3';
export const GP_B4  = 'GP_B4';
export const GP_B5  = 'GP_B5';
export const GP_B6  = 'GP_B6';
export const GP_B7  = 'GP_B7';
export const GP_B8  = 'GP_B8';
export const GP_B9  = 'GP_B9';
export const GP_B10 = 'GP_B10';
export const GP_B11 = 'GP_B11';
export const GP_B12 = 'GP_B12';
export const GP_B13 = 'GP_B13';
export const GP_B14 = 'GP_B14';
export const GP_B15 = 'GP_B15';
export const GP_B16 = 'GP_B16';

// ── Axes (negative / positive direction) ────────────────────────────────────
export const GP_A0N = 'GP_A0N';   // Left Stick Left
export const GP_A0P = 'GP_A0P';   // Left Stick Right
export const GP_A1N = 'GP_A1N';   // Left Stick Up
export const GP_A1P = 'GP_A1P';   // Left Stick Down
export const GP_A2N = 'GP_A2N';   // Right Stick Left
export const GP_A2P = 'GP_A2P';   // Right Stick Right
export const GP_A3N = 'GP_A3N';   // Right Stick Up
export const GP_A3P = 'GP_A3P';   // Right Stick Down

/** All valid gamepad input codes (buttons first, then axis directions). */
export const GP_CODES = [
  GP_B0, GP_B1, GP_B2, GP_B3, GP_B4, GP_B5, GP_B6, GP_B7,
  GP_B8, GP_B9, GP_B10, GP_B11, GP_B12, GP_B13, GP_B14, GP_B15, GP_B16,
  GP_A0N, GP_A0P, GP_A1N, GP_A1P, GP_A2N, GP_A2P, GP_A3N, GP_A3P,
];

const _GP_CODE_SET = new Set(GP_CODES);

/**
 * Returns true if the string is a recognised gamepad input code.
 * @param {string} code
 * @returns {boolean}
 */
export function isGamepadCode(code) {
  return _GP_CODE_SET.has(code);
}

/**
 * Returns the type of a gamepad code.
 * @param {string} code
 * @returns {'button' | 'axis' | null}
 */
export function getGamepadCodeType(code) {
  if (!code || typeof code !== 'string') return null;
  if (/^GP_B\d+$/.test(code)) return 'button';
  if (/^GP_A\d+[NP]$/.test(code)) return 'axis';
  return null;
}
