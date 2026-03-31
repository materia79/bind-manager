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
 * - A single capture callback intercepts the next key for rebinding
 */
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
    /** @type {Function | null} called with (code | null) after next key capture */
    this._captureCallback = null;

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
      for (const code of this._pressed) {
        this._dispatch(code, 'released', null);
      }
      this._pressed.clear();
    }
  }

  /**
   * Begin key capture for rebinding.
   * The next keydown (that isn't Escape) calls callback(code).
   * Escape calls callback(null) to signal cancellation.
   * @param {(code: string | null) => void} callback
   */
  startCapture(callback) {
    this._captureCallback = callback;
  }

  /** Cancel any active key capture without invoking its callback. */
  cancelCapture() {
    this._captureCallback = null;
  }

  /**
   * Returns true if the given key code is currently held down.
   * @param {string} code
   */
  isPressed(code) {
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
      if (code === 'Escape') {
        const cb = this._captureCallback;
        this._captureCallback = null;
        cb(null);
      } else if (!event.repeat) {
        const cb = this._captureCallback;
        this._captureCallback = null;
        cb(code);
      }
      return;
    }

    if (this._suppressGameplay) return;

    if (!event.repeat) {
      this._pressed.add(code);
      this._dispatch(code, 'pressed', event);
    } else {
      this._dispatch(code, 'held', event);
    }
  }

  /** @private */
  _onKeyUp(event) {
    const code = event.code;
    // Don't dispatch releases during capture; the key was never "pressed" for gameplay.
    if (!this._captureCallback && !this._suppressGameplay) {
      this._dispatch(code, 'released', event);
    }
    this._pressed.delete(code);
  }

  /** @private */
  _onBlur() {
    // Window lost focus: release all held keys to avoid stuck inputs.
    if (!this._suppressGameplay) {
      for (const code of this._pressed) {
        this._dispatch(code, 'released', null);
      }
    }
    this._pressed.clear();
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
