/**
 * Label fixture per controller family, as the manager is expected to return
 * them once the profile lane lands. Codes without an entry fall back to the
 * code itself (manager.getGamepadLabel contract).
 */

const STICKS_LONG = {
  GP_A0N: 'Left Stick Left', GP_A0P: 'Left Stick Right', GP_A1N: 'Left Stick Up', GP_A1P: 'Left Stick Down',
  GP_A2N: 'Right Stick Left', GP_A2P: 'Right Stick Right', GP_A3N: 'Right Stick Up', GP_A3P: 'Right Stick Down',
};
const DPAD_LONG = { GP_B12: 'D-Pad Up', GP_B13: 'D-Pad Down', GP_B14: 'D-Pad Left', GP_B15: 'D-Pad Right' };
const CLICKS = { GP_B10: 'L3', GP_B11: 'R3' };

function family(face, shoulders, centre, home, extra = {}) {
  const [b0, b1, b2, b3] = face;
  const [b4, b5, b6, b7] = shoulders;
  const [b8, b9] = centre;
  return {
    GP_B0: b0, GP_B1: b1, GP_B2: b2, GP_B3: b3,
    GP_B4: b4, GP_B5: b5, GP_B6: b6, GP_B7: b7,
    GP_B8: b8, GP_B9: b9, GP_B16: home,
    ...CLICKS, ...DPAD_LONG, ...STICKS_LONG, ...extra,
  };
}

export const FAMILY_LABELS = {
  xbox: family(['A', 'B', 'X', 'Y'], ['LB', 'RB', 'LT', 'RT'], ['View', 'Menu'], 'Xbox', { GP_B17: 'Share' }),
  xbox360: family(['A', 'B', 'X', 'Y'], ['LB', 'RB', 'LT', 'RT'], ['Back', 'Start'], 'Guide'),
  dualshock4: family(['Cross', 'Circle', 'Square', 'Triangle'], ['L1', 'R1', 'L2', 'R2'], ['Share', 'Options'], 'PS', { GP_B17: 'Touchpad' }),
  dualsense: family(['Cross', 'Circle', 'Square', 'Triangle'], ['L1', 'R1', 'L2', 'R2'], ['Create', 'Options'], 'PS', { GP_B17: 'Touchpad' }),
  'switch-pro': family(['B', 'A', 'Y', 'X'], ['L', 'R', 'ZL', 'ZR'], ['Minus', 'Plus'], 'Home', { GP_B17: 'Capture' }),
  steam: family(['A', 'B', 'X', 'Y'], ['L1', 'R1', 'L2', 'R2'], ['View', 'Menu'], 'Steam', {
    GP_B17: 'Quick Access',
    GP_B18: 'Left Pad',
    GP_B19: 'Right Pad',
    GP_B20: 'L4',
    GP_B21: 'L5',
    GP_B22: 'R4',
    GP_B23: 'R5',
  }),
  stadia: family(['A', 'B', 'X', 'Y'], ['L1', 'R1', 'L2', 'R2'], ['Options', 'Menu'], 'Stadia', { GP_B17: 'Assistant', GP_B18: 'Capture' }),
  generic: Object.fromEntries([
    ...Array.from({ length: 17 }, (_, i) => [`GP_B${i}`, `Btn ${i}`]),
    ['GP_A0N', 'Axis 0-'], ['GP_A0P', 'Axis 0+'], ['GP_A1N', 'Axis 1-'], ['GP_A1P', 'Axis 1+'],
    ['GP_A2N', 'Axis 2-'], ['GP_A2P', 'Axis 2+'], ['GP_A3N', 'Axis 3-'], ['GP_A3P', 'Axis 3+'],
  ]),
};

export const FAMILIES = Object.keys(FAMILY_LABELS);

/** manager.getGamepadLabel semantics: the label, or the code itself when the family has none. */
export function labelFor(familyName) {
  const table = FAMILY_LABELS[familyName];
  return (code) => table[code] ?? code;
}
