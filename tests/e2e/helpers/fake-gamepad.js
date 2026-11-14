/**
 * Controllable fake for navigator.getGamepads() in Playwright pages.
 *
 * installFakeGamepad() registers an init script, so the fake is in place before
 * any page script (and the library) runs. The returned controller drives the
 * fake from the test via page.evaluate:
 *
 *   const pad = await installFakeGamepad(page, DUALSENSE_CHROME);
 *   await page.goto('/demo/');
 *   await pad.connect();                       // fires gamepadconnected
 *   await pad.setAxes({ 0: -1, 1: -1 });       // left stick up-left
 *   await pad.setButton(0, 1);                 // pressed defaults to value > 0
 *   await pad.disconnect();                    // fires gamepaddisconnected
 *
 * Gamepad objects are plain objects shaped like the Gamepad API (id, index,
 * connected, mapping, timestamp, buttons[{ pressed, touched, value }], axes,
 * vibrationActuator: null). getGamepads() returns a 4-slot array like Chromium.
 * Connection events are plain Events carrying a `gamepad` property, because
 * the GamepadEvent constructor rejects non-native gamepads.
 */

/** DualSense as Chromium reports it on Windows. */
export const DUALSENSE_CHROME = Object.freeze({
  id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
  mapping: 'standard',
  buttonCount: 18,
  axisCount: 4,
});

/**
 * @typedef {object} FakeGamepadOptions
 * @property {string} [id]
 * @property {string} [mapping='standard']
 * @property {number} [buttonCount=17]
 * @property {number} [axisCount=4]
 * @property {number} [index=0]
 * @property {boolean} [connected=false] - Expose the pad from the start; gamepadconnected fires on window load
 */

/**
 * Install the fake before the page loads. Call before page.goto().
 * @param {import('@playwright/test').Page} page
 * @param {FakeGamepadOptions} [options]
 */
export async function installFakeGamepad(page, options = {}) {
  await page.addInitScript(fakeGamepadInitScript, {
    id: options.id ?? 'Fake Gamepad (STANDARD GAMEPAD)',
    mapping: options.mapping ?? 'standard',
    buttonCount: options.buttonCount ?? 17,
    axisCount: options.axisCount ?? 4,
    index: options.index ?? 0,
    connected: options.connected ?? false,
  });

  const call = (method, ...args) => page.evaluate(
    ([m, a]) => window.__bmFakeGamepad[m](...a),
    [method, args],
  );

  return {
    /** Connect (optionally changing id/mapping/counts first) and fire gamepadconnected. */
    connect: (overrides = {}) => call('connect', overrides),
    /** Fire gamepaddisconnected and stop exposing the pad. */
    disconnect: () => call('disconnect'),
    setId: (id) => call('configure', { id }),
    setMapping: (mapping) => call('configure', { mapping }),
    setButtonCount: (buttonCount) => call('configure', { buttonCount }),
    setAxisCount: (axisCount) => call('configure', { axisCount }),
    /** @param {number} index @param {number} value 0..1 @param {boolean} [pressed=value > 0] */
    setButton: (index, value, pressed) => call('setButton', index, value, pressed),
    /** @param {Record<number, number | { value: number, pressed?: boolean }>} buttons */
    setButtons: (buttons) => call('setButtons', buttons),
    /** @param {number} index @param {number} value -1..1 */
    setAxis: (index, value) => call('setAxis', index, value),
    /** @param {Record<number, number>} axes */
    setAxes: (axes) => call('setAxes', axes),
    /** Release every button and centre every axis. */
    reset: () => call('reset'),
    /** Snapshot of the current fake state. */
    getState: () => call('getState'),
  };
}

/**
 * Runs in the page (serialised by addInitScript): keep it self-contained.
 * @param {Required<FakeGamepadOptions>} initial
 */
function fakeGamepadInitScript(initial) {
  const state = {
    id: initial.id,
    mapping: initial.mapping,
    index: initial.index,
    connected: false,
    timestamp: 0,
    buttons: [],
    axes: [],
  };

  function resize(buttonCount, axisCount) {
    const buttons = [];
    for (let i = 0; i < buttonCount; i++) buttons.push(state.buttons[i] ?? { pressed: false, touched: false, value: 0 });
    const axes = [];
    for (let i = 0; i < axisCount; i++) axes.push(state.axes[i] ?? 0);
    state.buttons = buttons;
    state.axes = axes;
  }

  function touch() {
    state.timestamp = performance.now();
  }

  function snapshot() {
    return {
      id: state.id,
      index: state.index,
      connected: state.connected,
      mapping: state.mapping,
      timestamp: state.timestamp,
      buttons: state.buttons.map((b) => ({ pressed: b.pressed, touched: b.touched, value: b.value })),
      axes: state.axes.slice(),
      vibrationActuator: null,
      hapticActuators: [],
    };
  }

  function fire(type) {
    const event = new Event(type);
    Object.defineProperty(event, 'gamepad', { value: snapshot() });
    window.dispatchEvent(event);
  }

  function configure(opts = {}) {
    if (opts.id != null) state.id = String(opts.id);
    if (opts.mapping != null) state.mapping = String(opts.mapping);
    if (opts.index != null) state.index = opts.index;
    resize(opts.buttonCount ?? state.buttons.length, opts.axisCount ?? state.axes.length);
    touch();
  }

  function setButton(index, value, pressed) {
    const b = state.buttons[index];
    if (!b) throw new RangeError(`fake gamepad has no button ${index}`);
    b.value = Number(value) || 0;
    b.pressed = pressed ?? b.value > 0;
    b.touched = b.pressed || b.value > 0;
    touch();
  }

  function setAxis(index, value) {
    if (index < 0 || index >= state.axes.length) throw new RangeError(`fake gamepad has no axis ${index}`);
    state.axes[index] = Math.max(-1, Math.min(1, Number(value) || 0));
    touch();
  }

  resize(initial.buttonCount, initial.axisCount);

  window.__bmFakeGamepad = {
    connect(overrides = {}) {
      configure(overrides);
      state.connected = true;
      fire('gamepadconnected');
    },
    disconnect() {
      if (!state.connected) return;
      state.connected = false;
      fire('gamepaddisconnected');
    },
    configure,
    setButton,
    setButtons(buttons) {
      for (const [i, v] of Object.entries(buttons)) {
        if (typeof v === 'object' && v) setButton(Number(i), v.value, v.pressed);
        else setButton(Number(i), v);
      }
    },
    setAxis,
    setAxes(axes) {
      for (const [i, v] of Object.entries(axes)) setAxis(Number(i), v);
    },
    reset() {
      for (const b of state.buttons) { b.pressed = false; b.touched = false; b.value = 0; }
      state.axes = state.axes.map(() => 0);
      touch();
    },
    getState: snapshot,
  };

  Object.defineProperty(Navigator.prototype, 'getGamepads', {
    configurable: true,
    writable: true,
    value: function getGamepads() {
      const slots = [null, null, null, null];
      if (state.connected) slots[state.index] = snapshot();
      return slots;
    },
  });

  if (initial.connected) {
    state.connected = true;
    touch();
    window.addEventListener('load', () => fire('gamepadconnected'), { once: true });
  }
}
