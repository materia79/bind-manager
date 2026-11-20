/**
 * Manages browser mouse event listeners and dispatches high-level action events.
 *
 * Key design decisions:
 * - Mouse button codes: MouseButton0 (left), MouseButton1 (middle), MouseButton2 (right),
 *   MouseButton3/4 for extra buttons
 * - Mouse wheel codes: MouseWheelUp, MouseWheelDown
 * - Modifier combos use KeyboardRuntime.getHeldModifiers() to build combo codes
 * - Gameplay dispatch mirrors KeyboardRuntime: mousedown → 'pressed', mouseup → 'released'
 * - Wheel events dispatch a pressed+released pulse (no held state), one pulse
 *   per notch: raw deltas are normalised by WheelNotchCounter (pixel/line/page
 *   deltaMode, high-resolution wheels and trackpads accumulate)
 * - The wheel listener is passive (the browser never waits for it before
 *   scrolling the page) and switches to non-passive only while a capture runs
 *   (capture cancels scrolling) or while a wheel code is bound and gameplay is
 *   active (so a host handler can still cancel via originalEvent). The runtime
 *   itself never cancels the wheel in gameplay; that is the browser guard's job.
 * - Capture fires on mouse release so modifier combos are captured correctly
 * - During capture, context menu is suppressed to avoid interference
 * - Bound non-primary buttons suppress the browser default action
 *   (back/forward navigation on thumb buttons, middle-click autoscroll):
 *   preventDefault fires on mousedown/mouseup (Firefox) and auxclick
 *   (Chrome), only when the button resolves to a bound action. The primary
 *   button is exempt so focus/selection semantics stay intact.
 * - During gameplay the context menu of a right click (button 2) is cancelled
 *   while the right button (bare, or as a combo with the held modifiers) is
 *   bound, so the menu cannot swallow its mouseup; text fields and the
 *   bind-manager UI keep their menu, and a right press there dispatches
 *   nothing (no 'pressed', so nothing can stay pressed)
 * - Window blur and the page becoming hidden release every held button
 *   (mouseups are lost then) and reset the wheel notch counter
 */
import { buildComboCode } from './key-names.js';
import { WheelNotchCounter } from './wheel-notches.js';
import { isExemptInputTarget } from './browser-shortcut-guard.js';

const WHEEL_CODE = /(^|\+)MouseWheel(Up|Down)$/;

export class MouseRuntime {
  /**
   * @param {import('../core/binding-store.js').BindingStore} bindingStore
   * @param {import('./keyboard-runtime.js').KeyboardRuntime} keyboardRuntime
   * @param {{ wheelPixelThreshold?: number }} [options]
   */
  constructor(bindingStore, keyboardRuntime, options = {}) {
    this._store = bindingStore;
    this._keyboardRuntime = keyboardRuntime;
    this._wheelNotches = new WheelNotchCounter({ pixelThreshold: options.wheelPixelThreshold });
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
    /** @type {boolean | null} passive flag of the registered wheel listener, null when none */
    this._wheelPassive = null;
    /** True while a wheel code (bare or combo) is bound to an action */
    this._hasWheelBinding = false;
    /** @type {Function | null} */
    this._unsubStore = null;

    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onGameplayContextMenu = this._onGameplayContextMenu.bind(this);
    this._onAuxClick = this._onAuxClick.bind(this);
    this._onBlur = this._onBlur.bind(this);
    this._onVisibilityChange = this._onVisibilityChange.bind(this);
  }

  start() {
    if (this._active) return;
    this._active = true;
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('auxclick', this._onAuxClick);
    window.addEventListener('contextmenu', this._onGameplayContextMenu);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    this._unsubStore = this._store.subscribe(() => this.refreshBindings());
    this.refreshBindings();
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
    this._syncWheelListener();
    window.removeEventListener('contextmenu', this._onGameplayContextMenu);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    this._unsubStore?.();
    this._unsubStore = null;
  }

  setGameplaySuppressed(suppressed) {
    this._suppressGameplay = suppressed;
    this._wheelNotches.reset();
    if (suppressed) this._releaseAll();
    this._syncWheelListener();
  }

  /**
   * Re-read whether any wheel code is bound. Binding changes are followed via
   * the store; call this after an action registers (registration emits no
   * change event). The manager does.
   */
  refreshBindings() {
    this._hasWheelBinding = Object.values(this._store.getAll())
      .some(({ keyboard }) => keyboard.some(code => typeof code === 'string' && WHEEL_CODE.test(code)));
    this._syncWheelListener();
  }

  /**
   * Begin mouse capture for rebinding.
   * Buttons commit on mouseup; wheel commits on the first full notch.
   * @param {(code: string | null) => void} callback
   */
  startCapture(callback) {
    this._captureCallback = callback;
    this._capturePending = null;
    // A removal deferred by the previous capture must not strip this capture's listener
    this._clearContextMenuTimer();
    this._wheelNotches.reset();
    this._syncWheelListener();
    // Suppress context menu during capture so right-click can be bound
    window.addEventListener('contextmenu', this._onContextMenu);
  }

  cancelCapture() {
    const pending = this._capturePending;
    this._captureCallback = null;
    this._capturePending = null;
    this._syncWheelListener();
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
    // Text fields and the bind-manager UI keep their context menu, which opens
    // on mousedown on Linux/macOS and swallows the mouseup: a right press there
    // is not gameplay input, so it never becomes 'pressed' (and cannot stick).
    if (event.button === 2 && isExemptInputTarget(event.target)) return;

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
      this._syncWheelListener();
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
    if (this._captureCallback) {
      // Keep the page/modal from scrolling while waiting for a notch
      event.preventDefault();
      const rawCode = this._wheelNotches.push(event);
      if (!rawCode) return;
      const cb = this._captureCallback;
      this._captureCallback = null;
      this._capturePending = null;
      this._syncWheelListener();
      this._detachContextMenu(true);
      const modifiers = this._keyboardRuntime.getHeldModifiers();
      const comboCode = buildComboCode(modifiers, rawCode);
      cb(comboCode);
      return;
    }

    if (this._suppressGameplay) return;

    const rawCode = this._wheelNotches.push(event);
    if (!rawCode) return;
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

  /**
   * A non-passive window wheel listener makes the browser wait for JS before
   * scrolling the host page, so the listener is passive unless something may
   * cancel the wheel: a capture (cancels scrolling itself), or gameplay with a
   * wheel code bound (a host action handler may call
   * originalEvent.preventDefault()). Chromium treats an unspecified window
   * wheel listener as passive, so the flag is always explicit. Removed while
   * the runtime is stopped.
   * @private
   */
  _syncWheelListener() {
    const mayCancel = !!this._captureCallback || (!this._suppressGameplay && this._hasWheelBinding);
    const passive = this._active ? !mayCancel : null;
    if (passive === this._wheelPassive) return;
    // The passive flag of a registered listener cannot change: remove, then re-add
    if (this._wheelPassive !== null) window.removeEventListener('wheel', this._onWheel);
    this._wheelPassive = passive;
    if (passive !== null) window.addEventListener('wheel', this._onWheel, { passive });
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
   * During gameplay a bound right button must not open the context menu: on
   * Linux/macOS it opens on mousedown and swallows the mouseup, leaving
   * MouseButton2 stuck. Capture has its own listener (_onContextMenu).
   * Only a real right click (button 2) is cancelled: keyboard-opened menus
   * (Shift+F10, ContextMenu key: button -1) and macOS Ctrl+click (may report
   * button 0) are left alone, as are text fields and the bind-manager UI.
   * @private
   */
  _onGameplayContextMenu(event) {
    if (this._suppressGameplay || event.button !== 2) return;
    if (isExemptInputTarget(event.target)) return;
    const modifiers = this._keyboardRuntime.getHeldModifiers();
    const dispatchCode = this._resolveDispatchCode(this._buttonCode(2), modifiers);
    if (this._isBoundNonPrimary(2, dispatchCode)) event.preventDefault();
  }

  /**
   * Focus loss (alt-tab, a context menu, another window) swallows mouseups:
   * release everything so no button stays active.
   * @private
   */
  _onBlur() {
    this._releaseAll();
    this._wheelNotches.reset();
    // Releases still owed by a cancelled capture are lost too; a stale entry
    // would swallow the release of the next gameplay press.
    if (this._swallowRelease.size > 0) {
      this._swallowRelease.clear();
      if (!this._captureCallback) this._detachContextMenu(false);
    }
  }

  /** @private */
  _onVisibilityChange() {
    if (document.visibilityState === 'hidden') this._onBlur();
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
