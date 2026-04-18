/**
 * Manages browser mouse event listeners and dispatches high-level action events.
 *
 * Key design decisions:
 * - Mouse button codes: MouseButton0 (left), MouseButton1 (middle), MouseButton2 (right),
 *   MouseButton3/4 for extra buttons
 * - Mouse wheel codes: MouseWheelUp, MouseWheelDown
 * - Modifier combos use KeyboardRuntime.getHeldModifiers() to build combo codes
 * - Gameplay dispatch mirrors KeyboardRuntime: mousedown → 'pressed', mouseup → 'released'
 * - Wheel events dispatch a pressed+released pulse (no held state)
 * - Capture fires on mouse release so modifier combos are captured correctly
 * - During capture, context menu is suppressed to avoid interference
 */
import { buildComboCode } from './key-names.js';

export class MouseRuntime {
  /**
   * @param {import('../core/binding-store.js').BindingStore} bindingStore
   * @param {import('./keyboard-runtime.js').KeyboardRuntime} keyboardRuntime
   */
  constructor(bindingStore, keyboardRuntime) {
    this._store = bindingStore;
    this._keyboardRuntime = keyboardRuntime;
    /** @type {Map<string, Set<Function>>} per-action listeners */
    this._actionListeners = new Map();
    /** @type {Set<Function>} listeners for any action event */
    this._anyListeners = new Set();
    this._active = false;
    this._suppressGameplay = false;
    /** @type {Function | null} */
    this._captureCallback = null;
    /** @type {{ code: string } | null} pending capture waiting for mouseup */
    this._capturePending = null;
    /** @type {Map<string, string>} rawCode → dispatched combo code */
    this._activeBindings = new Map();

    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
  }

  start() {
    if (this._active) return;
    this._active = true;
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('wheel', this._onWheel);
  }

  stop() {
    if (!this._active) return;
    this._active = false;
    this._captureCallback = null;
    this._capturePending = null;
    this._activeBindings.clear();
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('contextmenu', this._onContextMenu);
  }

  setGameplaySuppressed(suppressed) {
    this._suppressGameplay = suppressed;
    if (suppressed) {
      for (const [rawCode, comboCode] of this._activeBindings) {
        this._dispatch(comboCode, 'released', null);
      }
      this._activeBindings.clear();
    }
  }

  /**
   * Begin mouse capture for rebinding.
   * Buttons commit on mouseup; wheel commits immediately.
   * @param {(code: string | null) => void} callback
   */
  startCapture(callback) {
    this._captureCallback = callback;
    this._capturePending = null;
    // Suppress context menu during capture so right-click can be bound
    window.addEventListener('contextmenu', this._onContextMenu);
  }

  cancelCapture() {
    this._captureCallback = null;
    this._capturePending = null;
    window.removeEventListener('contextmenu', this._onContextMenu);
  }

  /**
   * Returns true if the given code is currently active (held down).
   * @param {string} code
   */
  isPressed(code) {
    if (code.includes('+')) {
      for (const comboCode of this._activeBindings.values()) {
        if (comboCode === code) return true;
      }
      return false;
    }
    return this._activeBindings.has(code);
  }

  onAction(actionId, listener) {
    if (!this._actionListeners.has(actionId)) {
      this._actionListeners.set(actionId, new Set());
    }
    this._actionListeners.get(actionId).add(listener);
    return () => this._actionListeners.get(actionId)?.delete(listener);
  }

  onAnyAction(listener) {
    this._anyListeners.add(listener);
    return () => this._anyListeners.delete(listener);
  }

  /** @private */
  _buttonCode(button) {
    return `MouseButton${button}`;
  }

  /** @private */
  _onMouseDown(event) {
    const rawCode = this._buttonCode(event.button);

    if (this._captureCallback) {
      event.preventDefault();
      this._capturePending = { code: rawCode };
      return;
    }

    if (this._suppressGameplay) return;

    const modifiers = this._keyboardRuntime.getHeldModifiers();
    const dispatchCode = this._resolveDispatchCode(rawCode, modifiers);
    this._activeBindings.set(rawCode, dispatchCode);
    this._dispatch(dispatchCode, 'pressed', event);
  }

  /** @private */
  _onMouseUp(event) {
    const rawCode = this._buttonCode(event.button);

    if (this._captureCallback && this._capturePending && this._capturePending.code === rawCode) {
      const cb = this._captureCallback;
      this._captureCallback = null;
      const pending = this._capturePending;
      this._capturePending = null;
      // Defer removal so the handler survives the mouseup → contextmenu gap
      const handler = this._onContextMenu;
      setTimeout(() => window.removeEventListener('contextmenu', handler), 0);
      const modifiers = this._keyboardRuntime.getHeldModifiers();
      const comboCode = buildComboCode(modifiers, pending.code);
      cb(comboCode);
      return;
    }

    if (this._suppressGameplay) return;

    const dispatchCode = this._activeBindings.get(rawCode) ?? rawCode;
    this._activeBindings.delete(rawCode);
    this._dispatch(dispatchCode, 'released', event);
  }

  /** @private */
  _onWheel(event) {
    const rawCode = event.deltaY < 0 ? 'MouseWheelUp' : 'MouseWheelDown';

    if (this._captureCallback) {
      event.preventDefault();
      const cb = this._captureCallback;
      this._captureCallback = null;
      this._capturePending = null;
      const handler = this._onContextMenu;
      setTimeout(() => window.removeEventListener('contextmenu', handler), 0);
      const modifiers = this._keyboardRuntime.getHeldModifiers();
      const comboCode = buildComboCode(modifiers, rawCode);
      cb(comboCode);
      return;
    }

    if (this._suppressGameplay) return;

    const modifiers = this._keyboardRuntime.getHeldModifiers();
    const dispatchCode = this._resolveDispatchCode(rawCode, modifiers);
    // Wheel is a pulse: pressed then immediately released
    this._dispatch(dispatchCode, 'pressed', event);
    this._dispatch(dispatchCode, 'released', event);
  }

  /** @private */
  _onContextMenu(event) {
    // Suppress context menu during capture so right-click can be bound
    event.preventDefault();
  }

  /** @private */
  _resolveDispatchCode(rawCode, modifiers) {
    if (modifiers.length > 0) {
      const comboCode = buildComboCode(modifiers, rawCode);
      const actions = this._store.getActionsByCode(comboCode);
      if (actions.length > 0) return comboCode;
    }
    return rawCode;
  }

  /** @private */
  _dispatch(code, type, originalEvent) {
    const actionIds = this._store.getActionsByCode(code);
    for (const actionId of actionIds) {
      const actionEvent = { type, actionId, code, originalEvent };
      const listeners = this._actionListeners.get(actionId);
      if (listeners) {
        for (const fn of listeners) {
          try { fn(actionEvent); } catch (err) {
            console.error('[BindManager] Mouse action listener threw:', err);
          }
        }
      }
      for (const fn of this._anyListeners) {
        try { fn(actionEvent); } catch (err) {
          console.error('[BindManager] Mouse onAnyAction listener threw:', err);
        }
      }
    }
  }
}
