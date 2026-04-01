import { describe, it, expect } from 'vitest';

import {
  getControllerFamily,
  getResolvedGamepadLabel,
  resolveGamepadProfile,
} from '../../src/input/gamepad-profile-resolver.js';

describe('gamepad-profile-resolver', () => {
  it('resolves an exact generated controller profile when VID/PID matches', () => {
    const resolved = resolveGamepadProfile('054c-0ce6-DualSense Wireless Controller');

    expect(resolved.source).toBe('exact');
    expect(resolved.family).toBe('dualsense');
    expect(resolved.profileKey).toBe('054c-0ce6');
    expect(resolved.definition?.labels?.GP_B12).toBe('D-Pad Up');
  });

  it('falls back to heuristic family resolution for known controller families', () => {
    const resolved = resolveGamepadProfile('Xbox 360 Controller (XInput STANDARD GAMEPAD)');

    expect(resolved.source).toBe('family');
    expect(resolved.family).toBe('xbox');
    expect(resolved.definition).toBeNull();
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
    const label = getResolvedGamepadLabel('GP_B0', resolveGamepadProfile('Unknown HID Gamepad'));
    expect(label).toBe('Btn 0');
  });

  it('derives controller family from explicit family metadata first', () => {
    expect(getControllerFamily({ family: 'DualSense', profileHint: 'generic' })).toBe('dualsense');
  });
});
