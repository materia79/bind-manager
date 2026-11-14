/** Real-manager fixtures for the tool tests: realistic pad ids and a mounted Controller Tester. */
import { createBindManager } from '../../../src/core/bind-manager.js';
import { installManualRaf } from './helpers.js';

export const PADS = Object.freeze({
  dualsenseRaw: { id: '054c-0ce6-DualSense Wireless Controller', mapping: '', buttons: 14, axes: 12, rest: { 9: 9 / 7 } },
  dualsense: { id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', mapping: 'standard', buttons: 18, axes: 4 },
  xboxSeries: { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)', mapping: 'standard', buttons: 18, axes: 4 },
  xboxOne: { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02ea)', mapping: 'standard', buttons: 17, axes: 4 },
  xboxElite: { id: 'Xbox Elite Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b00)', mapping: 'standard', buttons: 21, axes: 4 },
  steamDeck: { id: 'Steam Deck Controller (STANDARD GAMEPAD Vendor: 28de Product: 1205)', mapping: 'standard', buttons: 24, axes: 4 },
  generic: { id: 'USB Gamepad (STANDARD GAMEPAD Vendor: 0079 Product: 0011)', mapping: 'standard', buttons: 17, axes: 4 },
});

/** A controllable pad shaped like the Gamepad API, exposed through navigator.getGamepads(). */
export function installPad(spec, index = 0) {
  const pad = {
    id: spec.id,
    index,
    connected: true,
    mapping: spec.mapping,
    timestamp: 0,
    buttons: Array.from({ length: spec.buttons }, () => ({ pressed: false, touched: false, value: 0 })),
    axes: Array.from({ length: spec.axes }, (_, i) => spec.rest?.[i] ?? 0),
  };
  const slots = [null, null, null, null];
  slots[index] = pad;
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => slots });
  return {
    pad,
    setButton(i, value) { pad.buttons[i] = { pressed: value > 0, touched: value > 0, value }; },
    setAxis(i, value) { pad.axes[i] = value; },
  };
}

export function mountRealTester(spec) {
  const raf = installManualRaf();
  const control = installPad(spec);
  const manager = createBindManager({ namespace: `tester-real-${Math.random()}`, builtInTools: true, storage: { load: () => null, save() {} } });
  manager.openControllerTest();
  raf.step(2);
  const node = (code) => document.querySelector(`.bm-tester-pad [data-code="${code}"]`);
  return {
    manager,
    raf,
    ...control,
    node,
    shown: (code) => node(code)?.getAttribute('display') !== 'none',
    lit: (code) => node(code)?.classList.contains('bm-active') ?? false,
    q: (s) => document.querySelector(`.bm-built-in-tools-root ${s}`),
  };
}
