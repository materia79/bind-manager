/**
 * GamepadRuntime — polls the Web Gamepad API every animation frame and
 * translates raw button/axis state into action events that mirror the
 * KeyboardRuntime contract (pressed / held / released + analog).
 *
 * Axes are debounced with a configurable deadband and threshold:
 *   deadband        (default 0.12) — ignore tiny resting drift; no events below this
 *   analogThreshold (default 0.50) — minimum value to trigger a digital pressed/held/released
 *
 * Capture mode: startCapture(callback) → next meaningful input → callback(code) + haptic.
 * Cancel with cancelCapture() or pressing nothing (escaped from modal via Escape key).
 *
 * Custom DOM events dispatched to window for UI re-renders:
 *   'bm-gamepad-connected'    { detail: Gamepad }
 *   'bm-gamepad-disconnected' { detail: Gamepad }
 */
import { isGamepadCode } from './gamepad-codes.js';
import { detectGamepadProfile } from './gamepad-profiles.js';

const GP_BUTTON_COUNT = 17;
const GP_AXIS_COUNT   = 4;

export class GamepadRuntime {
  /**
   * @param {import('../core/binding-store.js').BindingStore} bindingStore
   * @param {import('../core/action-registry.js').ActionRegistry} registry
   * @param {{ deadband?: number, analogThreshold?: number }} [options]
   */
  constructor(bindingStore, registry, options = {}) {
    this._store           = bindingStore;
    this._registry        = registry;
    this._deadband        = options.deadband        ?? 0.12;
    this._analogThreshold = options.analogThreshold ?? 0.50;

    /** @type {Map<number, { buttons: boolean[], axes: number[] }>} */
    this._curState = new Map();

    /** @type {Map<string, Set<Function>>} per-action listeners */
    this._listeners    = new Map();
    /** @type {Set<Function>} all-action listeners */
    this._anyListeners = new Set();

    this._gameplaySuppressed = false;
    /** @type {((code: string | null) => void) | null} */
    this._captureCallback = null;
    this._rafId = null;

    this._boundPoll   = this._poll.bind(this);
    this._onConnect   = this._handleConnect.bind(this);
    this._onDisconnect = this._handleDisconnect.bind(this);
  }

  /** Begin polling and listening for gamepad connect/disconnect events. */
  start() {
    if (typeof window === 'undefined') return;
    window.addEventListener('gamepadconnected',    this._onConnect);
    window.addEventListener('gamepaddisconnected', this._onDisconnect);
    this._rafId = requestAnimationFrame(this._boundPoll);
  }

  /** Stop polling and unregister all window listeners. */
  stop() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('gamepadconnected',    this._onConnect);
    window.removeEventListener('gamepaddisconnected', this._onDisconnect);
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._captureCallback) {
      const cb = this._captureCallback;
      this._captureCallback = null;
      cb(null);
    }
  }

  /**
   * Suppress / restore normal gameplay dispatching (used by modal while open).
   * Capture mode is NOT affected — capture still works when suppressed.
   * @param {boolean} suppressed
   */
  setGameplaySuppressed(suppressed) {
    this._gameplaySuppressed = suppressed;
  }

  /**
   * Enter capture mode: next meaningful gamepad input calls cb(code).
   * Also fires a haptic pulse on the supplying gamepad.
   * If another capture is in progress it is cancelled first (cb called with null).
   * @param {(code: string | null) => void} callback
   */
  startCapture(callback) {
    if (this._captureCallback) {
      const old = this._captureCallback;
      this._captureCallback = null;
      old(null);
    }
    this._captureCallback = callback;
  }

  /**
   * Cancel an in-progress capture, calling the pending callback with null.
   */
  cancelCapture() {
    if (this._captureCallback) {
      const cb = this._captureCallback;
      this._captureCallback = null;
      cb(null);
    }
  }

  /**
   * Subscribe to action events for a specific registered action.
   * Event types: 'pressed' | 'held' | 'released' | 'analog'
   * @param {string} actionId
   * @param {(event: GamepadActionEvent) => void} listener
   * @returns {() => void} unsubscribe
   */
  onAction(actionId, listener) {
    if (!this._listeners.has(actionId)) this._listeners.set(actionId, new Set());
    this._listeners.get(actionId).add(listener);
    return () => this._listeners.get(actionId)?.delete(listener);
  }

  /**
   * Subscribe to ALL action events across all registered actions.
   * @param {(event: GamepadActionEvent) => void} listener
   * @returns {() => void} unsubscribe
   */
  onAnyAction(listener) {
    this._anyListeners.add(listener);
    return () => this._anyListeners.delete(listener);
  }

  /**
   * Check if a gamepad code is currently in the "pressed" state based on the
   * last polled frame. Returns false for unknown codes.
   * @param {string} code
   * @returns {boolean}
   */
  isPressed(code) {
    if (!code || !isGamepadCode(code)) return false;
    if (code.startsWith('GP_B')) {
      const idx = parseInt(code.slice(4), 10);
      for (const [, state] of this._curState) {
        if (state.buttons[idx] === true) return true;
      }
    } else {
      const match = code.match(/^GP_A(\d)(N|P)$/);
      if (!match) return false;
      const axisIdx = parseInt(match[1], 10);
      const neg     = match[2] === 'N';
      for (const [, state] of this._curState) {
        const val = state.axes[axisIdx] ?? 0;
        if (neg ? val < -this._analogThreshold : val > this._analogThreshold) return true;
      }
    }
    return false;
  }

  /**
   * Returns info about all currently connected gamepads.
   * @returns {{ index: number, id: string, profile: string }[]}
   */
  getConnectedGamepads() {
    if (typeof navigator === 'undefined') return [];
    return [...navigator.getGamepads()]
      .filter(Boolean)
      .map(g => ({ index: g.index, id: g.id, profile: detectGamepadProfile(g.id) }));
  }

  /**
   * Get the detected profile name ('xbox' | 'dualsense' | 'generic') for a gamepad.
   * @param {number} [gamepadIndex=0]
   * @returns {string}
   */
  getActiveProfile(gamepadIndex = 0) {
    if (typeof navigator === 'undefined') return 'generic';
    const gp = [...navigator.getGamepads()].find(g => g && g.index === gamepadIndex);
    return gp ? detectGamepadProfile(gp.id) : 'generic';
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _handleConnect(e) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bm-gamepad-connected', { detail: e.gamepad }));
    }
  }

  _handleDisconnect(e) {
    this._curState.delete(e.gamepad.index);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bm-gamepad-disconnected', { detail: e.gamepad }));
    }
  }

  _poll() {
    this._rafId = requestAnimationFrame(this._boundPoll);
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    const gamepads = navigator.getGamepads();
    for (const gamepad of gamepads) {
      if (gamepad && gamepad.connected) this._processGamepad(gamepad);
    }
  }

  _processGamepad(gamepad) {
    const prev = this._curState.get(gamepad.index) ?? {
      buttons: new Array(GP_BUTTON_COUNT).fill(false),
      axes:    new Array(GP_AXIS_COUNT).fill(0),
    };

    // Snapshot current hardware state
    // Pad buttons array to GP_BUTTON_COUNT to ensure D-Pad and guide buttons are always available
    const buttonStates = new Array(GP_BUTTON_COUNT).fill(false);
    for (let i = 0; i < gamepad.buttons.length && i < GP_BUTTON_COUNT; i++) {
      buttonStates[i] = gamepad.buttons[i].pressed;
    }

    const cur = {
      buttons: buttonStates,
      axes:    [...gamepad.axes].slice(0, GP_AXIS_COUNT),
    };

    this._curState.set(gamepad.index, cur);

    // ── Capture mode ─────────────────────────────────────────────────────────
    if (this._captureCallback) {
      const detected = this._detectCapture(gamepad, prev, cur);
      if (detected != null) {
        const cb = this._captureCallback;
        this._captureCallback = null;
        this._triggerHaptic(gamepad);
        // Restore prev state so this press doesn't also fire normal events next frame
        this._curState.set(gamepad.index, prev);
        cb(detected);
      }
      return; // Never fire action events during capture
    }

    if (this._gameplaySuppressed) return;

    // ── Button events ─────────────────────────────────────────────────────────
    const btnLen = Math.min(cur.buttons.length, GP_BUTTON_COUNT);
    for (let i = 0; i < btnLen; i++) {
      const wasPressed = prev.buttons[i] ?? false;
      const isNowPressed  = cur.buttons[i]  ?? false;
      const code = `GP_B${i}`;
      if      (!wasPressed && isNowPressed)  this._dispatch(gamepad.index, code, 'pressed',  1);
      else if ( wasPressed && isNowPressed)  this._dispatch(gamepad.index, code, 'held',     1);
      else if ( wasPressed && !isNowPressed) this._dispatch(gamepad.index, code, 'released', 0);
    }

    // ── Axis events ───────────────────────────────────────────────────────────
    const axisLen = Math.min(cur.axes.length, GP_AXIS_COUNT);
    for (let a = 0; a < axisLen; a++) {
      const prevVal = prev.axes[a] ?? 0;
      const curVal  = cur.axes[a]  ?? 0;
      const thr = this._analogThreshold;

      // Continuous analog event (above deadband, direction-agnostic)
      if (Math.abs(curVal) > this._deadband) {
        this._dispatchAnalog(gamepad.index, a, curVal);
      }

      // Negative direction (e.g. stick left or stick up)
      const codeN  = `GP_A${a}N`;
      const prevN  = prevVal < -thr;
      const curN   = curVal  < -thr;
      if      (!prevN && curN)  this._dispatch(gamepad.index, codeN, 'pressed',  Math.abs(curVal));
      else if ( prevN && curN)  this._dispatch(gamepad.index, codeN, 'held',     Math.abs(curVal));
      else if ( prevN && !curN) this._dispatch(gamepad.index, codeN, 'released', 0);

      // Positive direction (e.g. stick right or stick down)
      const codeP  = `GP_A${a}P`;
      const prevP  = prevVal > thr;
      const curP   = curVal  > thr;
      if      (!prevP && curP)  this._dispatch(gamepad.index, codeP, 'pressed',  curVal);
      else if ( prevP && curP)  this._dispatch(gamepad.index, codeP, 'held',     curVal);
      else if ( prevP && !curP) this._dispatch(gamepad.index, codeP, 'released', 0);
    }
  }

  /**
   * Scan current vs previous state for the first new input above threshold.
   * Buttons take priority over axes. Returns a GP code or null.
   * @private
   */
  _detectCapture(gamepad, prev, cur) {
    const btnLen = Math.min(cur.buttons.length, GP_BUTTON_COUNT);
    for (let i = 0; i < btnLen; i++) {
      if (!prev.buttons[i] && cur.buttons[i]) return `GP_B${i}`;
    }
    const axisLen = Math.min(cur.axes.length, GP_AXIS_COUNT);
    for (let a = 0; a < axisLen; a++) {
      const val = cur.axes[a];
      if (Math.abs(val) > this._analogThreshold) {
        // Only trigger if it crossed the threshold this frame
        if (Math.abs(prev.axes[a] ?? 0) <= this._analogThreshold) {
          return val < 0 ? `GP_A${a}N` : `GP_A${a}P`;
        }
      }
    }
    return null;
  }

  /**
   * Resolve the code to bound actions and fire digital events.
   * Respects action.playerIndex (null = any controller).
   * @private
   */
  _dispatch(gamepadIndex, code, type, value) {
    const actionIds = this._store.getActionsByCode(code, 'gamepad');
    for (const actionId of actionIds) {
      const action = this._registry.get(actionId);
      if (!action) continue;
      if (action.playerIndex !== null && action.playerIndex !== gamepadIndex) continue;
      const event = { type, actionId, code, value, device: 'gamepad', gamepadIndex };
      this._fire(actionId, event);
    }
  }

  /**
   * Resolve both axis-direction codes to bound actions and fire analog events.
   * Only fires if action.analog is true.
   * @private
   */
  _dispatchAnalog(gamepadIndex, axisIndex, value) {
    const codes = [`GP_A${axisIndex}N`, `GP_A${axisIndex}P`];
    const seenActions = new Set();
    for (const code of codes) {
      for (const actionId of this._store.getActionsByCode(code, 'gamepad')) {
        if (seenActions.has(actionId)) continue;
        seenActions.add(actionId);
        const action = this._registry.get(actionId);
        if (!action || !action.analog) continue;
        if (action.playerIndex !== null && action.playerIndex !== gamepadIndex) continue;
        const event = { type: 'analog', actionId, axisIndex, value, device: 'gamepad', gamepadIndex };
        this._fire(actionId, event);
      }
    }
  }

  /** @private */
  _fire(actionId, event) {
    for (const fn of (this._listeners.get(actionId) ?? [])) {
      try { fn(event); } catch (err) {
        console.error('[BindManager] GamepadRuntime listener threw:', err);
      }
    }
    for (const fn of this._anyListeners) {
      try { fn(event); } catch (err) {
        console.error('[BindManager] GamepadRuntime anyListener threw:', err);
      }
    }
  }

  /**
   * Fire a brief dual-rumble haptic pulse on the gamepad (best-effort).
   * @param {Gamepad} gamepad
   * @private
   */
  _triggerHaptic(gamepad) {
    try {
      if (typeof gamepad.vibrationActuator?.playEffect === 'function') {
        gamepad.vibrationActuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: 80,
          weakMagnitude: 0.3,
          strongMagnitude: 0.3,
        }).catch(() => {}); // user-gesture restrictions may block this
      }
    } catch { /* haptics are best-effort */ }
  }
}

/**
 * @typedef {object} GamepadActionEvent
 * @property {'pressed' | 'held' | 'released' | 'analog'} type
 * @property {string} actionId
 * @property {string} [code]       — for digital events
 * @property {number} [axisIndex]  — for analog events
 * @property {number} value        — button value or axis value
 * @property {'gamepad'} device
 * @property {number} gamepadIndex
 */
