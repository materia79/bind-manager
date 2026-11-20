/**
 * J12: hat entries are decoded on the 2/7 grid only when a profile's four
 * hat entries lie on it; any other entry uses its own value and tolerance.
 * A raw value off the eight grid positions decodes to neutral.
 */
import { describe, it, expect } from 'vitest';
import {
  GamepadRuntime,
  decodeHatValue,
  isHatEntryActive,
  isHatGridLayout,
  readMappingEntryMagnitude,
} from '../../src/input/gamepad-runtime.js';
import { ActionRegistry } from '../../src/core/action-registry.js';
import { BindingStore } from '../../src/core/binding-store.js';
import dualsense from '../../src/input/controller_definitions/profiles/054c-0ce6.js';

const step = 2 / 7;
const none = { up: false, right: false, down: false, left: false };
const DPAD = ['GP_B12', 'GP_B13', 'GP_B14', 'GP_B15'];

/** A hand-written profile whose hat values are not the generator's layout. */
const QUARTER_MAPPING = {
  GP_B12: { kind: 'hat', index: 9, value: 0, tolerance: 0.1 },
  GP_B15: { kind: 'hat', index: 9, value: 0.25, tolerance: 0.1 },
  GP_B13: { kind: 'hat', index: 9, value: 0.5, tolerance: 0.1 },
  GP_B14: { kind: 'hat', index: 9, value: 0.75, tolerance: 0.1 },
};

function activeDpad(raw, mapping) {
  return DPAD.filter((code) => isHatEntryActive(raw, mapping[code], mapping));
}

describe('decodeHatValue neutral band', () => {
  it('values between two grid positions are neutral', () => {
    expect(decodeHatValue(0)).toEqual(none);
    expect(decodeHatValue(-0.0001)).toEqual(none);
    expect(decodeHatValue(-1 + step / 2)).toEqual(none);
  });

  it('grid positions still decode', () => {
    expect(decodeHatValue(-1 + 4 * step)).toEqual({ ...none, down: true });
    expect(decodeHatValue(-1 + 3 * step)).toEqual({ ...none, down: true, right: true });
  });
});

describe('profile with off-grid hat entries', () => {
  it('is not a grid layout', () => {
    expect(isHatGridLayout(QUARTER_MAPPING, 9)).toBe(false);
    expect(isHatGridLayout(dualsense.mapping, 9)).toBe(true);
  });

  it('uses each entry value and tolerance: raw 0.5 lights only its own direction', () => {
    expect(activeDpad(0.5, QUARTER_MAPPING)).toEqual(['GP_B13']);
    expect(activeDpad(0, QUARTER_MAPPING)).toEqual(['GP_B12']);
    expect(activeDpad(0.25, QUARTER_MAPPING)).toEqual(['GP_B15']);
    expect(activeDpad(0.75, QUARTER_MAPPING)).toEqual(['GP_B14']);
    expect(activeDpad(0.38, QUARTER_MAPPING)).toEqual([]);
    expect(readMappingEntryMagnitude({ axes: Object.assign(new Array(10).fill(0), { 9: 0.5 }) }, QUARTER_MAPPING.GP_B12, QUARTER_MAPPING)).toBe(0);
  });

  it('the runtime lights one direction at raw 0.5', () => {
    const registry = new ActionRegistry();
    const store = new BindingStore(registry);
    store.init({});
    const runtime = new GamepadRuntime(store, registry);
    const definition = { ...dualsense, mapping: { ...dualsense.mapping, ...QUARTER_MAPPING } };
    const compiled = runtime._compileControllerMapping(definition);
    const pad = { buttons: [], axes: Object.assign(new Array(12).fill(0), { 9: 0.5 }) };
    const lit = DPAD.filter((code) => {
      const entry = compiled.buttons[Number(code.slice(4))];
      return runtime._isHatDirectionActive(pad, entry);
    });
    expect(lit).toEqual(['GP_B13']);
  });
});

describe('shipped DualSense profile', () => {
  const CASES = [
    [-1, ['GP_B12']],
    [-1 + step, ['GP_B12', 'GP_B15']],
    [-1 + 2 * step, ['GP_B15']],
    [-1 + 3 * step, ['GP_B13', 'GP_B15']],
    [-1 + 4 * step, ['GP_B13']],
    [-1 + 5 * step, ['GP_B13', 'GP_B14']],
    [-1 + 6 * step, ['GP_B14']],
    [1, ['GP_B12', 'GP_B14']],
    [9 / 7, []],
    [0, []],
  ];

  it.each(CASES)('raw %d lights %j', (raw, expected) => {
    expect(activeDpad(raw, dualsense.mapping)).toEqual(expected);
  });
});
