import { describe, it, expect } from 'vitest';

import {
  getAvailableGamepadProfileOptions,
  getControllerFamily,
  getResolvedGamepadLabel,
  isControllerProfileApplicable,
  resolveGamepadProfile,
} from '../../src/input/gamepad-profile-resolver.js';
import {
  findControllerProfile,
  findControllerProfileByGamepadId,
} from '../../src/input/controller_definitions/index.js';

const FIREFOX_DUALSENSE = '054c-0ce6-DualSense Wireless Controller';
const CHROME_DUALSENSE = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';

function pad(id, { mapping = '', buttons = 14, axes = 12 } = {}) {
  return {
    id,
    index: 0,
    connected: true,
    mapping,
    buttons: Array.from({ length: buttons }, () => ({ pressed: false, value: 0 })),
    axes: new Array(axes).fill(0),
  };
}

describe('gamepad-profile-resolver', () => {
  it('falls back to heuristic family resolution for known controller families', () => {
    const resolved = resolveGamepadProfile('Xbox 360 Controller (XInput STANDARD GAMEPAD)');

    expect(resolved.source).toBe('family');
    expect(resolved.family).toBe('xbox');
    expect(resolved.definition).toBeNull();
    expect(resolved.displayName).toBe('Xbox');
  });

  it('prefers exact generated labels over family fallback labels', () => {
    const label = getResolvedGamepadLabel('GP_B12', {
      family: 'dualsense',
      definition: {
        labels: {
          GP_B12: 'D-Pad Up',
        },
      },
    });

    expect(label).toBe('D-Pad Up');
  });

  it('uses generic fallback labels when no definition is available', () => {
    const resolved = resolveGamepadProfile('Unknown HID Gamepad');
    expect(getResolvedGamepadLabel('GP_B0', resolved)).toBe('Btn 0');
    expect(resolved.source).toBe('generic');
    expect(resolved.displayName).toBe('Generic');
  });

  it('derives controller family from explicit family metadata first', () => {
    expect(getControllerFamily({ family: 'DualSense', profileHint: 'generic' })).toBe('dualsense');
  });
});

describe('exact profile gating', () => {
  it('a Firefox-form DualSense with raw mapping, 14 buttons and 12 axes resolves exact', () => {
    const resolved = resolveGamepadProfile(pad(FIREFOX_DUALSENSE));
    expect(resolved.source).toBe('exact');
    expect(resolved.family).toBe('dualsense');
    expect(resolved.profileKey).toBe('054c-0ce6');
    expect(resolved.definition?.labels?.GP_B12).toBe('D-Pad Up');
    expect(resolved.displayName).toBe('DualSense Wireless Controller');
  });

  it('the same id with the standard mapping resolves the dualsense family', () => {
    const resolved = resolveGamepadProfile(pad(FIREFOX_DUALSENSE, { mapping: 'standard', buttons: 17, axes: 4 }));
    expect(resolved.source).toBe('family');
    expect(resolved.family).toBe('dualsense');
    expect(resolved.definition).toBeNull();
    expect(resolved.displayName).toBe('DualSense');
  });

  it('a raw pad whose counts differ from the profile does not get it', () => {
    expect(resolveGamepadProfile(pad(FIREFOX_DUALSENSE, { buttons: 18, axes: 12 })).source).toBe('family');
    expect(resolveGamepadProfile(pad(FIREFOX_DUALSENSE, { buttons: 14, axes: 10 })).source).toBe('family');
  });

  it('a Chrome-form DualSense resolves the dualsense family with the standard layout', () => {
    const resolved = resolveGamepadProfile(pad(CHROME_DUALSENSE, { mapping: 'standard', buttons: 18, axes: 4 }));
    expect(resolved.source).toBe('family');
    expect(resolved.family).toBe('dualsense');
    expect(resolved.definition).toBeNull();
  });

  it('a bare id string never gets an exact profile (layout unknown)', () => {
    expect(resolveGamepadProfile(FIREFOX_DUALSENSE).source).toBe('family');
    expect(resolveGamepadProfile(FIREFOX_DUALSENSE, { gamepad: pad(FIREFOX_DUALSENSE) }).source).toBe('exact');
  });

  it('054c-09cc never gets the DualSense profile', () => {
    const ds4 = '054c-09cc-Wireless Controller';
    expect(findControllerProfileByGamepadId(ds4)).toBeNull();
    expect(findControllerProfile('054c', '09cc')).toBeNull();
    const resolved = resolveGamepadProfile(pad(ds4));
    expect(resolved.source).toBe('family');
    expect(resolved.family).toBe('dualshock4');
    expect(resolved.definition).toBeNull();
  });

  it('the registry matches Chrome-form ids exactly', () => {
    expect(findControllerProfileByGamepadId(CHROME_DUALSENSE)?.key).toBe('054c-0ce6');
    expect(findControllerProfile('054c', null)).toBeNull();
  });

  it('isControllerProfileApplicable checks mapping and both counts', () => {
    const profile = { sourceButtons: 14, sourceAxes: 12 };
    expect(isControllerProfileApplicable(profile, pad('x'))).toBe(true);
    expect(isControllerProfileApplicable(profile, { ...pad('x'), mapping: undefined })).toBe(true);
    expect(isControllerProfileApplicable(profile, pad('x', { mapping: 'standard' }))).toBe(false);
    expect(isControllerProfileApplicable({ sourceButtons: null, sourceAxes: 12 }, pad('x'))).toBe(false);
    expect(isControllerProfileApplicable(profile, null)).toBe(false);
  });
});

describe('manual exact overrides', () => {
  const override = { type: 'profile', key: '054c-0ce6' };

  it('apply when the profile is applicable to the pad', () => {
    const resolved = resolveGamepadProfile(pad(FIREFOX_DUALSENSE), { override });
    expect(resolved.source).toBe('manual');
    expect(resolved.profileKey).toBe('054c-0ce6');
    expect(resolved.ignoredOverride).toBeNull();
  });

  it('resolve as if absent when not applicable, and report the ignored override', () => {
    const resolved = resolveGamepadProfile(pad(CHROME_DUALSENSE, { mapping: 'standard', buttons: 18, axes: 4 }), { override });
    expect(resolved.source).toBe('family');
    expect(resolved.family).toBe('dualsense');
    expect(resolved.definition).toBeNull();
    expect(resolved.ignoredOverride).toEqual(override);
  });

  it('an unknown profile key is ignored the same way', () => {
    const resolved = resolveGamepadProfile(pad('045e-0b13-Xbox Wireless Controller'), { override: { type: 'profile', key: 'nope' } });
    expect(resolved.source).toBe('family');
    expect(resolved.family).toBe('xbox');
    expect(resolved.ignoredOverride).toEqual({ type: 'profile', key: 'nope' });
  });

  it('family overrides keep working with the persisted family keys', () => {
    for (const family of ['xbox', 'dualsense']) {
      const resolved = resolveGamepadProfile(pad(FIREFOX_DUALSENSE), { override: { type: 'family', family } });
      expect(resolved.source).toBe('manual');
      expect(resolved.family).toBe(family);
      expect(resolved.displayName).toBe(family === 'xbox' ? 'Xbox' : 'DualSense');
    }
  });
});

describe('getAvailableGamepadProfileOptions', () => {
  it('offers the exact profile only to a pad it applies to', () => {
    expect(getAvailableGamepadProfileOptions(pad(FIREFOX_DUALSENSE)).exactProfiles.map((p) => p.key)).toEqual(['054c-0ce6']);
    expect(getAvailableGamepadProfileOptions(pad(CHROME_DUALSENSE, { mapping: 'standard', buttons: 18, axes: 4 })).exactProfiles).toEqual([]);
    expect(getAvailableGamepadProfileOptions(pad('054c-09cc-Wireless Controller', { mapping: 'standard', buttons: 18, axes: 4 })).exactProfiles).toEqual([]);
    expect(getAvailableGamepadProfileOptions(FIREFOX_DUALSENSE).exactProfiles).toEqual([]);
  });

  it('lists every named family with its display name', () => {
    const { families, autoResolved } = getAvailableGamepadProfileOptions(pad(CHROME_DUALSENSE, { mapping: 'standard', buttons: 18, axes: 4 }));
    expect(families.map((f) => f.family)).toEqual(['xbox', 'xbox360', 'dualshock4', 'dualsense', 'switch-pro', 'steam', 'stadia']);
    expect(families.find((f) => f.family === 'switch-pro').label).toBe('Switch Pro');
    expect(autoResolved.family).toBe('dualsense');
  });
});
