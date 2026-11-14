import { describe, it, expect } from 'vitest';
import {
  detectGamepadProfile,
  parseGamepadId,
  GAMEPAD_DEVICE_FAMILIES,
} from '../../src/input/gamepad-profiles.js';
import {
  getGamepadIdentityKey,
  getGamepadIdentityKeys,
  getResolvedGamepadLabel,
  resolveGamepadProfile,
} from '../../src/input/gamepad-profile-resolver.js';

// [Gamepad.id, expected family]
const CHROME_FORM = [
  ['Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', 'xbox'],
  ['Xbox One S Controller (STANDARD GAMEPAD Vendor: 045e Product: 02ea)', 'xbox'],
  ['Xbox Elite Wireless Controller Series 2 (STANDARD GAMEPAD Vendor: 045e Product: 0b00)', 'xbox'],
  ['Xbox Adaptive Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b0a)', 'xbox'],
  ['Microsoft X-Box 360 pad (STANDARD GAMEPAD Vendor: 045e Product: 028e)', 'xbox360'],
  ['Xbox 360 Wireless Receiver (STANDARD GAMEPAD Vendor: 045e Product: 0719)', 'xbox360'],
  ['Logitech Gamepad F310 (STANDARD GAMEPAD Vendor: 046d Product: c21d)', 'xbox360'],
  ['Logitech Cordless Precision Gamepad F710 (STANDARD GAMEPAD Vendor: 046d Product: c21f)', 'xbox360'],
  ['Steam Virtual Gamepad (STANDARD GAMEPAD Vendor: 28de Product: 11ff)', 'xbox360'],
  ['Amazon Luna Controller (STANDARD GAMEPAD Vendor: 1949 Product: 041a)', 'xbox360'],
  ['Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', 'dualshock4'],
  ['Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 05c4)', 'dualshock4'],
  ['DUALSHOCK 4 USB Wireless Adaptor (STANDARD GAMEPAD Vendor: 054c Product: 0ba0)', 'dualshock4'],
  ['DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', 'dualsense'],
  ['DualSense Edge Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0df2)', 'dualsense'],
  ['Access Controller (STANDARD GAMEPAD Vendor: 054c Product: 0e5f)', 'dualsense'],
  ['Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)', 'switch-pro'],
  ['Joy-Con (L) (Vendor: 057e Product: 2006)', 'switch-pro'],
  ['Joy-Con (R) (Vendor: 057e Product: 2007)', 'switch-pro'],
  ['Steam Deck (Vendor: 28de Product: 1205)', 'steam'],
  ['Steam Controller (Vendor: 28de Product: 1102)', 'steam'],
  ['Steam Controller (Vendor: 28de Product: 1302)', 'steam'],
  ['Stadia Controller rev. A (STANDARD GAMEPAD Vendor: 18d1 Product: 9400)', 'stadia'],
  // Chrome without remap: no STANDARD GAMEPAD tag, ids still decide.
  ['DualSense Wireless Controller (Vendor: 054c Product: 0ce6)', 'dualsense'],
];

const FIREFOX_FORM = [
  ['045e-0b13-Xbox Wireless Controller', 'xbox'],
  ['045e-02ea-Microsoft X-Box One S pad', 'xbox'],
  ['045e-0b22-Xbox Elite Wireless Controller', 'xbox'],
  ['045e-028e-Microsoft X-Box 360 pad', 'xbox360'],
  ['046d-c21e-Logitech Gamepad F510', 'xbox360'],
  ['28de-11ff-Steam Virtual Gamepad', 'xbox360'],
  ['054c-09cc-Wireless Controller', 'dualshock4'],
  ['054c-05c4-Wireless Controller', 'dualshock4'],
  ['054c-0ce6-DualSense Wireless Controller', 'dualsense'],
  ['054c-0df2-DualSense Edge Wireless Controller', 'dualsense'],
  ['057e-2009-Pro Controller', 'switch-pro'],
  ['057e-200e-Joy-Con (L/R)', 'switch-pro'],
  ['28de-1205-Steam Deck', 'steam'],
  ['28de-1142-Wireless Steam Controller', 'steam'],
  ['18d1-9400-Stadia Controller rev. A', 'stadia'],
  // Firefox on some platforms drops the leading zeros.
  ['54c-ce6-DualSense Wireless Controller', 'dualsense'],
  ['45e-28e-Microsoft X-Box 360 pad', 'xbox360'],
];

const WITHOUT_IDS = [
  ['Xbox 360 Controller (XInput STANDARD GAMEPAD)', 'xbox'],
  ['xinput', 'xbox'],
  ['Xbox Wireless Controller (STANDARD GAMEPAD)', 'xbox'],
  ['Xbox Wireless Controller Extended Gamepad', 'xbox'],
  ['Xbox Series X Controller', 'xbox'],
  ['Xbox Elite Controller', 'xbox'],
  ['Microsoft X-Box One S pad (STANDARD GAMEPAD Vendor: 045e)', 'xbox'],
  ['Xbox 360 Wired Controller', 'xbox360'],
  ['Microsoft X-Box 360 pad', 'xbox360'],
  ['DualSense Wireless Controller Extended Gamepad', 'dualsense'],
  ['DualSense Wireless Controller (STANDARD GAMEPAD)', 'dualsense'],
  ['DUALSHOCK 4 Wireless Controller Extended Gamepad', 'dualshock4'],
  ['Wireless Controller', 'dualshock4'],
  ['Wireless Controller (STANDARD GAMEPAD)', 'dualshock4'],
  ['Wireless Controller Extended Gamepad', 'dualshock4'],
  ['Pro Controller Extended Gamepad', 'switch-pro'],
  ['Joy-Con (L/R) Extended Gamepad', 'switch-pro'],
  ['Steam Deck Controller', 'steam'],
  ['Steam Controller (STANDARD GAMEPAD)', 'steam'],
  ['Stadia Controller (STANDARD GAMEPAD)', 'stadia'],
];

const NEGATIVES = [
  ['1234-5678-ACME Speedster Pad', 'generic'],                               // unknown vendor
  ['ACME Pad (STANDARD GAMEPAD Vendor: 1234 Product: 5678)', 'generic'],
  ['054c-0268-PLAYSTATION(R)3 Controller', 'generic'],                       // Sony, not in the table
  ['054c-1234-DualSense Wireless Controller', 'generic'],                    // ids decide, not the name
  ['Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0202)', 'generic'],
  ['Sony PLAYSTATION(R)3 Controller', 'generic'],
  ['Wireless Controller for PC', 'generic'],                                 // not a bare name
  ['Unknown HID Gamepad', 'generic'],
  ['', 'generic'],
];

describe('detectGamepadProfile — real id strings', () => {
  for (const [group, table] of [
    ['Chrome form', CHROME_FORM],
    ['Firefox form', FIREFOX_FORM],
    ['id-less forms', WITHOUT_IDS],
    ['negatives', NEGATIVES],
  ]) {
    describe(group, () => {
      it.each(table)('%s -> %s', (id, family) => {
        expect(detectGamepadProfile(id)).toBe(family);
      });
    });
  }

  it('054c-09cc-Wireless Controller is a DualShock 4, not a DualSense', () => {
    expect(detectGamepadProfile('054c-09cc-Wireless Controller')).toBe('dualshock4');
  });

  it('covers every family in each id form', () => {
    const families = ['xbox', 'xbox360', 'dualshock4', 'dualsense', 'switch-pro', 'steam', 'stadia'];
    for (const table of [CHROME_FORM, FIREFOX_FORM, WITHOUT_IDS]) {
      const seen = new Set(table.map(([, family]) => family));
      for (const family of families) expect(seen.has(family), family).toBe(true);
    }
  });

  it('the device table holds the researched ids', () => {
    expect(Object.keys(GAMEPAD_DEVICE_FAMILIES)).toHaveLength(17 + 11 + 3 + 3 + 4 + 7 + 1);
    expect(GAMEPAD_DEVICE_FAMILIES['28de-11ff']).toBe('xbox360');
  });
});

describe('parseGamepadId', () => {
  it('parses the Firefox form', () => {
    expect(parseGamepadId('054c-0ce6-DualSense Wireless Controller')).toEqual({
      vendorId: '054c', productId: '0ce6', key: '054c-0ce6', name: 'DualSense Wireless Controller',
    });
  });

  it('pads Firefox ids without leading zeros', () => {
    expect(parseGamepadId('54c-ce6-DualSense Wireless Controller').key).toBe('054c-0ce6');
  });

  it('parses the Chrome form with and without the STANDARD GAMEPAD tag', () => {
    expect(parseGamepadId('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0CE6)')).toEqual({
      vendorId: '054c', productId: '0ce6', key: '054c-0ce6', name: 'DualSense Wireless Controller',
    });
    expect(parseGamepadId('Steam Deck (Vendor: 28de Product: 1205)')).toEqual({
      vendorId: '28de', productId: '1205', key: '28de-1205', name: 'Steam Deck',
    });
  });

  it('returns the bare name for id-less forms', () => {
    expect(parseGamepadId('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toEqual({
      vendorId: null, productId: null, key: null, name: 'Xbox 360 Controller',
    });
    expect(parseGamepadId('DualSense Wireless Controller Extended Gamepad').name).toBe('DualSense Wireless Controller');
    expect(parseGamepadId('Joy-Con (L/R) Extended Gamepad').name).toBe('Joy-Con (L/R)');
    expect(parseGamepadId('xinput').key).toBeNull();
  });

  it('handles empty and non-string input', () => {
    expect(parseGamepadId(null)).toEqual({ vendorId: null, productId: null, key: null, name: '' });
    expect(parseGamepadId('   ').key).toBeNull();
  });
});

describe('identity keys', () => {
  it('uses vendor-product for both id forms', () => {
    expect(getGamepadIdentityKey('054c-0ce6-DualSense Wireless Controller')).toBe('054c-0ce6');
    expect(getGamepadIdentityKey('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('054c-0ce6');
    expect(getGamepadIdentityKey('xinput')).toBe('id:xinput');
    expect(getGamepadIdentityKey('')).toBeNull();
  });

  it('keeps the legacy id: key as a fallback for persisted overrides', () => {
    const id = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
    expect(getGamepadIdentityKeys(id)).toEqual(['054c-0ce6', `id:${id.toLowerCase()}`]);
    expect(getGamepadIdentityKeys('xinput')).toEqual(['id:xinput']);
  });
});

describe('resolver device info and Elite labels', () => {
  it('a Chrome-form DualSense resolves the dualsense family', () => {
    const resolved = resolveGamepadProfile('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)');
    expect(resolved.family).toBe('dualsense');
    expect(resolved.vendorId).toBe('054c');
    expect(resolved.productId).toBe('0ce6');
  });

  it('an Elite pad gets paddle labels, a plain Xbox pad gets Share', () => {
    const elite = resolveGamepadProfile('Xbox Elite Wireless Controller Series 2 (STANDARD GAMEPAD Vendor: 045e Product: 0b00)');
    expect(elite.labelVariant).toBe('xbox-elite');
    expect(getResolvedGamepadLabel('GP_B17', elite)).toBe('Paddle 1');
    expect(getResolvedGamepadLabel('GP_B20', elite)).toBe('Paddle 4');

    const plain = resolveGamepadProfile('045e-0b13-Xbox Wireless Controller');
    expect(plain.labelVariant).toBeNull();
    expect(getResolvedGamepadLabel('GP_B17', plain)).toBe('Share');
    expect(getResolvedGamepadLabel('GP_B18', plain)).toBe('GP_B18');
  });
});
