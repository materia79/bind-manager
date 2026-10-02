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
 * - Bound non-primary buttons suppress the browser default action
 *   (back/forward navigation on thumb buttons, middle-click autoscroll):
 *   preventDefault fires on mousedown/mouseup (Firefox) and auxclick
 *   (Chrome), only when the button resolves to a bound action. The primary
 *   button is exempt so focus/selection semantics stay intact.
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
    /** @type {Set<string>} buttons pressed during a cancelled capture whose mouseup must be swallowed */
    this._swallowRelease = new Set();
    /** @type {ReturnType<typeof setTimeout> | null} pending deferred contextmenu-listener removal */
    this._contextMenuTimer = null;

    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onAuxClick = this._onAuxClick.bind(this);
  }

  start() {
    if (this._active) return;
    this._active = true;
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('auxclick', this._onAuxClick);
    window.addEventListener('wheel', this._onWheel);
  }

  stop() {
    // Capture state is torn down even when not started: startCapture() does not require start().
    this._captureCallback = null;
    this._capturePending = null;
    this._swallowRelease.clear();
    this._detachContextMenu(false);
    if (!this._active) return;
    this._active = false;
    this._releaseAll();
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('auxclick', this._onAuxClick);
    window.removeEventListener('wheel', this._onWheel);
  }

  setGameplaySuppressed(suppressed) {
    this._suppressGameplay = suppressed;
    if (suppressed) this._releaseAll();
  }

  /**
   * Begin mouse capture for rebinding.
   * Buttons commit on mouseup; wheel commits immediately.
   * @param {(code: string | null) => void} callback
   */
  startCapture(callback) {
    this._captureCallback = callback;
    this._capturePending = null;
    // A removal deferred by the previous capture must not strip this capture's listener
    this._clearContextMenuTimer();
    // Suppress context menu during capture so right-click can be bound
    window.addEventListener('contextmenu', this._onContextMenu);
  }

  cancelCapture() {
    const pending = this._capturePending;
    this._captureCallback = null;
    this._capturePending = null;
    if (pending) {
      // The button is still held: swallow its mouseup (it never dispatched 'pressed')
      // and keep the context menu suppressed until that release has happened.
      this._swallowRelease.add(pending.code);
    } else {
      this._detachContextMenu(false);
    }
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
    if (this._isBoundNonPrimary(event.button, dispatchCode)) {
      event.preventDefault();
    }
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
      this._detachContextMenu(true);
      const modifiers = this._keyboardRuntime.getHeldModifiers();
      const comboCode = buildComboCode(modifiers, pending.code);
      cb(comboCode);
      return;
    }

    if (this._swallowRelease.delete(rawCode)) {
      event.preventDefault();
      if (!this._captureCallback && this._swallowRelease.size === 0) this._detachContextMenu(true);
      return;
    }

    if (this._suppressGameplay) return;

    const dispatchCode = this._activeBindings.get(rawCode) ?? rawCode;
    if (this._isBoundNonPrimary(event.button, dispatchCode)) {
      event.preventDefault();
    }
    // Only release what was pressed: a button pressed while suppressed never dispatched 'pressed'
    if (!this._activeBindings.has(rawCode)) return;
    this._activeBindings.delete(rawCode);
    this._dispatch(dispatchCode, 'released', event);
  }

  /**
   * Chrome triggers thumb-button back/forward navigation via the auxclick
   * default action (after mouseup, when the press is already released), so
   * bound non-primary buttons must be cancelled here as well.
   * @private
   */
  _onAuxClick(event) {
    if (this._suppressGameplay) return;
    const rawCode = this._buttonCode(event.button);
    const modifiers = this._keyboardRuntime.getHeldModifiers();
    const dispatchCode = this._resolveDispatchCode(rawCode, modifiers);
    if (this._isBoundNonPrimary(event.button, dispatchCode)) {
      event.preventDefault();
    }
  }

  /** @private */
  _onWheel(event) {
    const rawCode = event.deltaY < 0 ? 'MouseWheelUp' : 'MouseWheelDown';

    if (this._captureCallback) {
      event.preventDefault();
      const cb = this._captureCallback;
      this._captureCallback = null;
      this._capturePending = null;
      this._detachContextMenu(true);
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

  /**
   * Remove the capture contextmenu listener, either now or on the next tick
   * (so it survives the mouseup → contextmenu gap). Only one removal is ever
   * pending, and startCapture() cancels it.
   * @private
   */
  _detachContextMenu(deferred) {
    this._clearContextMenuTimer();
    if (!deferred) {
      window.removeEventListener('contextmenu', this._onContextMenu);
      return;
    }
    this._contextMenuTimer = setTimeout(() => {
      this._contextMenuTimer = null;
      window.removeEventListener('contextmenu', this._onContextMenu);
    }, 0);
  }

  /** @private */
  _clearContextMenuTimer() {
    if (this._contextMenuTimer !== null) {
      clearTimeout(this._contextMenuTimer);
      this._contextMenuTimer = null;
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
  _onContextMenu(event) {
    // Suppress context menu during capture so right-click can be bound
    event.preventDefault();
  }

  /**
   * True when the event's button is non-primary and its dispatch code
   * resolves to at least one bound action — the gate for suppressing the
   * browser default (navigation/autoscroll) without touching the primary
   * button's focus/selection semantics.
   * @private
   */
  _isBoundNonPrimary(button, dispatchCode) {
    if (button === 0) return false;
    return this._store.getActionsByCode(dispatchCode).length > 0;
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
