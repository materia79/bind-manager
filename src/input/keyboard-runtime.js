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
 *
 * Modifier-only chords (e.g. "ControlLeft+ShiftLeft"), see _resolveModifierCode():
 * - A modifier keydown dispatches the chord of exactly the modifiers now held when
 *   an action is bound to it, else the modifier's own code (as in 0.2.2), the same
 *   way a key dispatches its combo when bound, else its own code
 * - The chord is released when the first of its keys goes up
 * - Capture: the first modifier released with no other key pressed records the
 *   chord of every modifier held at that moment (one modifier: that modifier)
 */
import { MODIFIER_CODES, MODIFIER_ORDER, buildComboCode, buildChordCode, isModifierChord } from './key-names.js';

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

  /** Detach all keyboard listeners, releasing held bindings and clearing pressed state. */
  stop() {
    if (!this._active) return;
    this._active = false;
    this._releaseAll();
    this._pressed.clear();
    this._captureCallback = null;
    this._capturePending = null;
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
      this._releaseAll();
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
      const dispatchCode = MODIFIER_CODES.has(code)
        ? this._resolveModifierCode(code)
        : this._resolveDispatchCode(code);
      this._activeBindings.set(code, dispatchCode);
      this._dispatch(dispatchCode, 'pressed', event);
    } else if (this._activeBindings.has(code)) {
      // 'held' only follows a dispatched 'pressed' (the record keyup releases from):
      // a key pressed while suppressed, during a capture or before a blur stays silent
      this._dispatch(this._activeBindings.get(code), 'held', event);
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
        // Modifier released with no non-modifier pending: modifier-only bind, the
        // chord of every modifier held now (just this one: the modifier alone)
        const cb = this._captureCallback;
        this._captureCallback = null;
        this._capturePending = null;
        const chord = buildChordCode([...this.getHeldModifiers(), code]);
        this._pressed.delete(code);
        cb(chord);
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

    this._pressed.delete(code);
    // A chord ends with the first of its keys that goes up (the key that
    // completed it may still be held)
    if (MODIFIER_CODES.has(code)) this._releaseChordsWith(code, event);
    // Only release what was pressed: a key pressed while suppressed or during
    // capture never dispatched 'pressed'
    if (!this._activeBindings.has(code)) return;
    const dispatchCode = this._activeBindings.get(code);
    this._activeBindings.delete(code);
    this._dispatch(dispatchCode, 'released', event);
  }

  /** @private */
  _onBlur() {
    // Window lost focus: release all held keys to avoid stuck inputs.
    if (!this._suppressGameplay) this._releaseAll();
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

  /**
   * Resolve the dispatch code for a modifier key press: the chord of exactly the
   * modifiers now held (this one included), in canonical order, when an action
   * is bound to it; otherwise the modifier's own code, as in 0.2.2. Keys other
   * than modifiers that are held do not count, like for a single modifier.
   * The one place that decides when a modifier-only chord fires.
   * @private
   * @param {string} code - the modifier going down
   * @returns {string}
   */
  _resolveModifierCode(code) {
    const modifiers = this.getHeldModifiers();
    if (modifiers.length > 1) {
      const chord = buildChordCode(modifiers);
      if (this._store.getActionsByCode(chord).length > 0) return chord;
    }
    return code;
  }

  /**
   * Release every active chord that contains `code` and was completed by
   * another key; the entry of `code` itself is released by the caller.
   * @private
   * @param {string} code - the modifier going up
   * @param {KeyboardEvent} event
   */
  _releaseChordsWith(code, event) {
    const ended = [];
    for (const [rawCode, dispatchCode] of this._activeBindings) {
      if (rawCode !== code && isModifierChord(dispatchCode) && dispatchCode.split('+').includes(code)) {
        ended.push([rawCode, dispatchCode]);
      }
    }
    for (const [rawCode, dispatchCode] of ended) {
      // A listener may have released it meanwhile (stop(), suppression)
      if (this._activeBindings.get(rawCode) !== dispatchCode) continue;
      this._activeBindings.delete(rawCode);
      this._dispatch(dispatchCode, 'released', event);
    }
  }

  /** Dispatch 'released' for every held binding and forget them. @private */
  _releaseAll() {
    for (const comboCode of this._activeBindings.values()) {
      this._dispatch(comboCode, 'released', null);
    }
    this._activeBindings.clear();
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
