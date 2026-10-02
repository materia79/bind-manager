/**
 * Manages browser keyboard event listeners and dispatches high-level action events.
 *
 * Key design decisions:
 * - Uses KeyboardEvent.code for physical key matching (layout-independent)
 * - event.repeat=false on first keydown  → 'pressed'
 * - event.repeat=true  on held key       → 'held'
 * - keyup                                → 'released'
 * - Window blur clears all pressed state to avoid stuck keys
 * - Gameplay dispatch is suppressed while the bind modal is open
 * - Capture fires on key release so modifier combos can be recorded
 * - Escape cancels capture immediately on keydown (not release)
 */
import { MODIFIER_CODES, MODIFIER_ORDER, buildComboCode } from './key-names.js';

export class KeyboardRuntime {
  /** @param {import('../core/binding-store.js').BindingStore} bindingStore */
  constructor(bindingStore) {
    this._store = bindingStore;
    /** @type {Set<string>} currently held key codes */
    this._pressed = new Set();
    /** @type {Map<string, Set<Function>>} per-action listeners */
    this._actionListeners = new Map();
    /** @type {Set<Function>} listeners for any action event */
    this._anyListeners = new Set();
    this._active = false;
    this._suppressGameplay = false;
    /** @type {Function | null} called with (code | null) after capture completes */
    this._captureCallback = null;
    /** @type {{ code: string, modifiers: string[] } | null} pending capture waiting for keyup */
    this._capturePending = null;
    /** @type {Map<string, string>} rawCode → dispatched combo code for active gameplay bindings */
    this._activeBindings = new Map();

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = this._onBlur.bind(this);
  }

  /** Attach global keyboard listeners. Safe to call multiple times. */
  start() {
    if (this._active) return;
    this._active = true;
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  }

  /** Detach all keyboard listeners and clear pressed state. */
  stop() {
    if (!this._active) return;
    this._active = false;
    this._pressed.clear();
    this._captureCallback = null;
    this._capturePending = null;
    this._activeBindings.clear();
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
  }

  /**
   * Suppress or restore gameplay action dispatch.
   * Called by the modal controller when opening / closing.
   * Also clears pressed state to avoid stuck-key artefacts.
   * @param {boolean} suppressed
   */
  setGameplaySuppressed(suppressed) {
    this._suppressGameplay = suppressed;
    if (suppressed) {
      // Release everything currently held so nothing stays "pressed" in the game
      for (const [rawCode, comboCode] of this._activeBindings) {
        this._dispatch(comboCode, 'released', null);
      }
      this._activeBindings.clear();
      this._pressed.clear();
    }
  }

  /**
   * Begin key capture for rebinding.
   * Capture commits on key release so modifier combos can be detected.
   * Escape cancels immediately on keydown.
   * @param {(code: string | null) => void} callback
   */
  startCapture(callback) {
    this._captureCallback = callback;
    this._capturePending = null;
  }

  /** Cancel any active key capture without invoking its callback. */
  cancelCapture() {
    this._captureCallback = null;
    this._capturePending = null;
  }

  /**
   * Returns the currently held modifier codes in canonical MODIFIER_ORDER.
   * Used by MouseRuntime to build combo codes during capture/gameplay.
   * @returns {string[]}
   */
  getHeldModifiers() {
    return MODIFIER_ORDER.filter(m => this._pressed.has(m));
  }

  /**
   * Returns true if the given key code is currently held down.
   * For combo codes, checks the _activeBindings values.
   * @param {string} code
   */
  isPressed(code) {
    if (code.includes('+')) {
      for (const comboCode of this._activeBindings.values()) {
        if (comboCode === code) return true;
      }
      return false;
    }
    return this._pressed.has(code);
  }

  /**
   * Listen for action events on a specific action id.
   * @param {string} actionId
   * @param {(event: ActionEvent) => void} listener
   * @returns {() => void} unsubscribe
   */
  onAction(actionId, listener) {
    if (!this._actionListeners.has(actionId)) {
      this._actionListeners.set(actionId, new Set());
    }
    this._actionListeners.get(actionId).add(listener);
    return () => this._actionListeners.get(actionId)?.delete(listener);
  }

  /**
   * Listen for any action event regardless of action id.
   * @param {(event: ActionEvent) => void} listener
   * @returns {() => void} unsubscribe
   */
  onAnyAction(listener) {
    this._anyListeners.add(listener);
    return () => this._anyListeners.delete(listener);
  }

  /** @private */
  _onKeyDown(event) {
    const code = event.code;

    // --- Capture mode: intercept for rebinding ---
    if (this._captureCallback) {
      event.preventDefault();
      // Escape cancels immediately on press
      if (code === 'Escape') {
        const cb = this._captureCallback;
        this._captureCallback = null;
        this._capturePending = null;
        this._pressed.clear();  // modifiers held during capture must not stay stuck
        cb(null);
        return;
      }
      if (event.repeat) return;

      if (MODIFIER_CODES.has(code)) {
        // Modifier pressed: track it but don't commit yet
        this._pressed.add(code);
      } else {
        // Non-modifier pressed: snapshot held modifiers, wait for release
        this._pressed.add(code);
        this._capturePending = {
          code,
          modifiers: this.getHeldModifiers(),
        };
      }
      return;
    }

    if (this._suppressGameplay) return;

    if (!event.repeat) {
      this._pressed.add(code);
      if (MODIFIER_CODES.has(code)) {
        // Dispatch modifier as simple code
        this._activeBindings.set(code, code);
        this._dispatch(code, 'pressed', event);
      } else {
        const dispatchCode = this._resolveDispatchCode(code);
        this._activeBindings.set(code, dispatchCode);
        this._dispatch(dispatchCode, 'pressed', event);
      }
    } else {
      const dispatchCode = this._activeBindings.get(code) ?? code;
      this._dispatch(dispatchCode, 'held', event);
    }
  }

  /** @private */
  _onKeyUp(event) {
    const code = event.code;

    // --- Capture mode: commit on release ---
    if (this._captureCallback) {
      event.preventDefault();

      if (this._capturePending && this._capturePending.code === code) {
        // Primary (non-modifier) key released: commit combo
        const cb = this._captureCallback;
        this._captureCallback = null;
        const pending = this._capturePending;
        this._capturePending = null;
        this._pressed.delete(code);
        const comboCode = buildComboCode(pending.modifiers, pending.code);
        cb(comboCode);
        return;
      }

      if (MODIFIER_CODES.has(code) && !this._capturePending) {
        // Modifier released with no non-modifier pending: modifier-only bind
        const cb = this._captureCallback;
        this._captureCallback = null;
        this._capturePending = null;
        this._pressed.delete(code);
        cb(code);
        return;
      }

      // Other release during capture (e.g. releasing a modifier while primary is still held)
      this._pressed.delete(code);
      return;
    }

    if (this._suppressGameplay) {
      this._pressed.delete(code);
      return;
    }

    const dispatchCode = this._activeBindings.get(code) ?? code;
    this._activeBindings.delete(code);
    this._dispatch(dispatchCode, 'released', event);
    this._pressed.delete(code);
  }

  /** @private */
  _onBlur() {
    // Window lost focus: release all held keys to avoid stuck inputs.
    if (!this._suppressGameplay) {
      for (const [rawCode, comboCode] of this._activeBindings) {
        this._dispatch(comboCode, 'released', null);
      }
    }
    this._activeBindings.clear();
    this._pressed.clear();
    this._capturePending = null;
  }

  /**
   * Resolve the dispatch code for a non-modifier key press.
   * If modifiers are held and a combo binding exists, return the combo code.
   * Otherwise return the simple code.
   * @private
   * @param {string} code
   * @returns {string}
   */
  _resolveDispatchCode(code) {
    const modifiers = this.getHeldModifiers();
    if (modifiers.length > 0) {
      const comboCode = buildComboCode(modifiers, code);
      const actions = this._store.getActionsByCode(comboCode);
      if (actions.length > 0) return comboCode;
    }
    return code;
  }

  /** @private */
  _dispatch(code, type, originalEvent) {
    const actionIds = this._store.getActionsByCode(code);
    for (const actionId of actionIds) {
      /** @type {ActionEvent} */
      const actionEvent = { type, actionId, code, originalEvent };
      const listeners = this._actionListeners.get(actionId);
      if (listeners) {
        for (const fn of listeners) {
          try { fn(actionEvent); } catch (err) {
            console.error('[BindManager] Action listener threw:', err);
          }
        }
      }
      for (const fn of this._anyListeners) {
        try { fn(actionEvent); } catch (err) {
          console.error('[BindManager] onAnyAction listener threw:', err);
        }
      }
    }
  }
}

/**
 * @typedef {'pressed' | 'released' | 'held'} ActionEventType
 * @typedef {object} ActionEvent
 * @property {ActionEventType} type
 * @property {string} actionId
 * @property {string} code
 * @property {KeyboardEvent | null} originalEvent
 */
