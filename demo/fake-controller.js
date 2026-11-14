/**
 * Bind Manager Demo — simulated controller
 *
 * For visitors without a gamepad: picking a family installs a fake
 * navigator.getGamepads() that reports one pad with a realistic id (the form
 * Chrome on Windows reports), and on-screen buttons press a few of its inputs.
 * The library cannot tell it from a real pad, so the bindings modal, the hint
 * bar, the Controller Test and Input Remap all react to it.
 *
 * Off by default. While a simulated pad is on, real pads are hidden; turning
 * it off restores the browser's own getGamepads().
 */

/** Families offered in the select: label, Gamepad.id, raw button count. */
export const FAKE_CONTROLLERS = Object.freeze({
  xbox: {
    label: 'Xbox Wireless',
    id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
    buttons: 18,
  },
  'xbox-elite': {
    label: 'Xbox Elite Series 2',
    id: 'Xbox Elite Wireless Controller Series 2 (STANDARD GAMEPAD Vendor: 045e Product: 0b00)',
    buttons: 21,
  },
  xbox360: {
    label: 'Xbox 360',
    id: 'Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)',
    buttons: 17,
  },
  dualshock4: {
    label: 'DualShock 4',
    id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
    buttons: 18,
  },
  dualsense: {
    label: 'DualSense',
    id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
    buttons: 18,
  },
  'switch-pro': {
    label: 'Switch Pro',
    id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)',
    buttons: 18,
  },
  'steam-deck': {
    label: 'Steam Deck',
    id: 'Steam Deck Controller (STANDARD GAMEPAD Vendor: 28de Product: 1205)',
    buttons: 24,
  },
  stadia: {
    label: 'Stadia',
    id: 'Stadia Controller rev. A (STANDARD GAMEPAD Vendor: 18d1 Product: 9400)',
    buttons: 19,
  },
  unknown: {
    label: 'Unknown USB pad',
    id: 'USB Gamepad (STANDARD GAMEPAD Vendor: 0079 Product: 0011)',
    buttons: 17,
  },
});

/** On-screen inputs: data-fake-input value → button index or axis direction. */
const INPUTS = {
  b0: { code: 'GP_B0', button: 0 },
  b1: { code: 'GP_B1', button: 1 },
  b2: { code: 'GP_B2', button: 2 },
  b3: { code: 'GP_B3', button: 3 },
  b6: { code: 'GP_B6', button: 6 },
  b9: { code: 'GP_B9', button: 9 },
  b12: { code: 'GP_B12', button: 12 },
  b17: { code: 'GP_B17', button: 17 },
  'ls-up': { code: 'GP_A1N', axis: 1, value: -1 },
  'ls-left': { code: 'GP_A0N', axis: 0, value: -1 },
};

const AXIS_COUNT = 4;

/**
 * Wire the simulated controller panel.
 * @param {object} els
 * @param {HTMLSelectElement} els.select - family picker ('' = off)
 * @param {HTMLElement} els.pad - container of the [data-fake-input] buttons
 * @param {HTMLElement} els.status - one-line state text
 * @param {(code: string) => string} [els.labelFor] - button caption for a GP_* code
 * @param {(text: string, type?: string) => void} [els.log]
 */
export function createFakeController({ select, pad, status, labelFor = (code) => code, log = () => {} }) {
  const nativeDescriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'getGamepads');
  const state = { key: null, id: '', buttons: [], axes: [], timestamp: 0 };

  select.innerHTML = '<option value="">Off (no simulated pad)</option>'
    + Object.entries(FAKE_CONTROLLERS).map(([key, def]) => `<option value="${key}">${def.label}</option>`).join('');
  select.value = '';

  function snapshot() {
    return {
      id: state.id,
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: state.timestamp,
      buttons: state.buttons.map((b) => ({ ...b })),
      axes: state.axes.slice(),
      vibrationActuator: null,
      hapticActuators: [],
    };
  }

  function fire(type, gamepad) {
    // GamepadEvent rejects non-native pads, so a plain Event carries `gamepad`.
    const event = new Event(type);
    Object.defineProperty(event, 'gamepad', { value: gamepad });
    window.dispatchEvent(event);
  }

  function install() {
    Object.defineProperty(Navigator.prototype, 'getGamepads', {
      configurable: true,
      writable: true,
      value: function getGamepads() {
        return [state.key ? snapshot() : null, null, null, null];
      },
    });
  }

  function uninstall() {
    if (nativeDescriptor) Object.defineProperty(Navigator.prototype, 'getGamepads', nativeDescriptor);
    else delete Navigator.prototype.getGamepads;
  }

  function disconnect() {
    if (!state.key) return;
    const last = snapshot();
    state.key = null;
    fire('gamepaddisconnected', { ...last, connected: false });
  }

  function connect(key) {
    const def = FAKE_CONTROLLERS[key];
    if (!def) return;
    install();
    state.key = key;
    state.id = def.id;
    state.buttons = Array.from({ length: def.buttons }, () => ({ pressed: false, touched: false, value: 0 }));
    state.axes = new Array(AXIS_COUNT).fill(0);
    state.timestamp = performance.now();
    fire('gamepadconnected', snapshot());
  }

  function setInput(name, down) {
    const input = INPUTS[name];
    if (!state.key || !input) return;
    if (input.button != null) {
      const b = state.buttons[input.button];
      if (!b) return;
      b.value = down ? 1 : 0;
      b.pressed = down;
      b.touched = down;
    } else {
      state.axes[input.axis] = down ? input.value : 0;
    }
    state.timestamp = performance.now();
  }

  function releaseAll() {
    for (const btn of pad.querySelectorAll('.is-down')) btn.classList.remove('is-down');
    for (const b of state.buttons) Object.assign(b, { pressed: false, touched: false, value: 0 });
    state.axes.fill(0);
    state.timestamp = performance.now();
  }

  function render() {
    const def = state.key ? FAKE_CONTROLLERS[state.key] : null;
    pad.hidden = !def;
    status.textContent = def ? `Simulated: ${def.label}` : 'No simulated pad';
    status.title = def ? def.id : '';
    for (const btn of pad.querySelectorAll('[data-fake-input]')) {
      const input = INPUTS[btn.dataset.fakeInput];
      btn.disabled = !def || (input.button != null && input.button >= def.buttons);
      btn.textContent = def ? labelFor(input.code) : input.code;
      btn.title = input.code;
    }
  }

  select.addEventListener('change', () => {
    // An on-screen button held while switching must not stay highlighted or pressed.
    releaseAll();
    disconnect();
    if (select.value) {
      connect(select.value);
      log(`Simulated controller on: ${FAKE_CONTROLLERS[select.value].label}`, 'info');
    } else {
      uninstall();
      log('Simulated controller off', 'info');
    }
    render();
  });

  // Hold to press: pointer down presses, pointer up / leave / cancel releases.
  pad.addEventListener('pointerdown', (ev) => {
    const btn = ev.target.closest('[data-fake-input]');
    if (!btn || btn.disabled) return;
    ev.preventDefault();
    // Keep receiving the release when the pointer slides off the button.
    try { btn.setPointerCapture(ev.pointerId); } catch { /* synthetic events have no active pointer */ }
    btn.classList.add('is-down');
    setInput(btn.dataset.fakeInput, true);
  });
  const release = (ev) => {
    const btn = ev.target.closest?.('[data-fake-input]');
    if (!btn || !btn.classList.contains('is-down')) return;
    btn.classList.remove('is-down');
    setInput(btn.dataset.fakeInput, false);
  };
  pad.addEventListener('pointerup', release);
  pad.addEventListener('pointercancel', release);
  pad.addEventListener('lostpointercapture', release);
  window.addEventListener('blur', releaseAll);

  render();

  return {
    connect: (key) => { select.value = key; select.dispatchEvent(new Event('change')); },
    disconnect: () => { select.value = ''; select.dispatchEvent(new Event('change')); },
    setInput,
    releaseAll,
    get active() { return state.key; },
  };
}
