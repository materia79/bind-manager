/**
 * Suppresses browser shortcuts and default actions while the game owns input.
 *
 * Key design decisions:
 * - Opt-in (`browserGuard` option); nothing is cancelled unless the guard is enabled
 *   AND engaged. Engaged means: the bind-manager UI is closed, focus is not in a text
 *   field, and the game owns input — by default pointer lock or fullscreen on the
 *   game target, focus inside the target, or the host saying so via setGameOwnsInput().
 * - Listeners run on window in the capture phase so a game's stopPropagation cannot
 *   bypass them; they never stop propagation themselves, gameplay dispatch is untouched.
 * - The wheel listener is non-passive and is only installed while the guard is
 *   enabled, so a disabled guard never delays page scrolling.
 * - Shortcut patterns use bind-manager code syntax with generic modifiers:
 *   `Mod+KeyR` (Ctrl or Meta), `Ctrl+Tab`, `Shift+MouseWheel`, `F5`, `Alt`.
 *   A pattern matches when its key is pressed with AT LEAST its modifiers, so `F5`
 *   also covers Ctrl+F5 and `Mod+KeyR` covers Ctrl+Shift+R. `allow` wins over block.
 * - Anything that resolves to a bound action (bare or combo) is cancelled too.
 * - Chromium reserves tab/window shortcuts (Ctrl+W/T/N, Ctrl+Tab, …) outside
 *   fullscreen; no page can cancel them there. In JS fullscreen the guard requests
 *   Keyboard Lock (navigator.keyboard.lock) where available so they reach the page.
 * - Optional beforeunload "leave site?" guard, armed after the first engagement.
 */
import { buildComboCode } from './key-names.js';

/**
 * Default shortcuts cancelled while the guard is engaged.
 * Entries are kept separate (even where one implies another) so a game can filter
 * individual ones out, e.g. `DEFAULT_BLOCKED_SHORTCUTS.filter(p => p !== 'MouseWheel')`.
 */
export const DEFAULT_BLOCKED_SHORTCUTS = Object.freeze([
  // Reload
  'F5', 'Mod+KeyR',
  // Save, print, find, find next, bookmark, history, downloads, view source, open file, address bar
  'Mod+KeyS', 'Mod+KeyP', 'Mod+KeyF', 'Mod+KeyG', 'Mod+KeyD', 'Mod+KeyH',
  'Mod+KeyJ', 'Mod+KeyU', 'Mod+KeyO', 'Mod+KeyL',
  // Help, find next, focus address bar / panes, caret browsing, menu bar, devtools
  'F1', 'F3', 'F6', 'F7', 'F10', 'F12',
  // Alt pressed alone focuses the menu bar (Firefox, Windows/Linux browsers)
  'Alt',
  // Firefox quick find
  'Slash', 'Quote',
  // Page zoom
  'Mod+Equal', 'Mod+Minus', 'Mod+Digit0', 'Mod+NumpadAdd', 'Mod+NumpadSubtract', 'Mod+Numpad0',
  // History navigation and page scrolling
  'Backspace', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'PageUp', 'PageDown', 'Home', 'End',
  // Tab / window management — Chromium only lets pages cancel these in fullscreen
  'Mod+KeyW', 'Mod+KeyT', 'Mod+KeyN', 'Mod+KeyQ', 'Ctrl+Tab', 'Ctrl+PageUp', 'Ctrl+PageDown', 'Ctrl+F4',
  // Wheel: page scroll, Ctrl+wheel zoom, Shift+wheel horizontal scroll
  'MouseWheel', 'Mod+MouseWheel', 'Shift+MouseWheel',
  // Middle-click autoscroll / paste, back / forward thumb buttons
  'MouseButton1', 'MouseButton3', 'MouseButton4',
]);

/**
 * Keys requested from the Keyboard Lock API in fullscreen. Locking a key delivers
 * every modifier combination of it to the page (KeyW → Ctrl+W, Ctrl+Shift+W, …).
 * Escape is deliberately not locked so a single Esc still leaves fullscreen.
 * Note: locking Tab also captures Alt+Tab on Windows while fullscreen.
 */
export const DEFAULT_KEYBOARD_LOCK_KEYS = Object.freeze([
  'KeyW', 'KeyT', 'KeyN', 'KeyQ', 'Tab', 'PageUp', 'PageDown', 'F4',
]);

const MODIFIER_TOKENS = {
  Ctrl: 'ctrl', Control: 'ctrl', ControlLeft: 'ctrl', ControlRight: 'ctrl',
  Shift: 'shift', ShiftLeft: 'shift', ShiftRight: 'shift',
  Alt: 'alt', AltLeft: 'alt', AltRight: 'alt',
  Meta: 'meta', Cmd: 'meta', MetaLeft: 'meta', MetaRight: 'meta',
  Mod: 'mod',
};

const KEY_ALIASES = {
  Ctrl: ['ControlLeft', 'ControlRight'],
  Control: ['ControlLeft', 'ControlRight'],
  Shift: ['ShiftLeft', 'ShiftRight'],
  Alt: ['AltLeft', 'AltRight'],
  Meta: ['MetaLeft', 'MetaRight'],
  MouseWheel: ['MouseWheelUp', 'MouseWheelDown'],
};

const NON_TEXT_INPUT_TYPES = new Set([
  'button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file', 'image',
]);

const BM_UI_SELECTOR = '.bm-overlay, .bm-capture-overlay, .bm-built-in-tools-root';

/**
 * Parse a shortcut pattern such as `Mod+Shift+KeyR` or `MouseWheel`.
 * The last `+`-separated token is the key; the others are modifiers.
 * @param {string} pattern
 * @returns {{ keys: string[], mods: string[] } | null}
 */
export function parseShortcutPattern(pattern) {
  if (typeof pattern !== 'string' || !pattern) return null;
  const parts = pattern.split('+');
  const key = parts.pop();
  const mods = [];
  for (const part of parts) {
    const mod = MODIFIER_TOKENS[part];
    if (!mod) return null;
    if (!mods.includes(mod)) mods.push(mod);
  }
  if (!key) return null;
  return { keys: KEY_ALIASES[key] ?? [key], mods };
}

/**
 * True when `code` with the given modifier flags matches a parsed pattern.
 * @param {{ keys: string[], mods: string[] }} parsed
 * @param {string} code
 * @param {{ ctrlKey?: boolean, shiftKey?: boolean, altKey?: boolean, metaKey?: boolean }} flags
 */
export function matchesShortcutPattern(parsed, code, flags) {
  if (!parsed || !parsed.keys.includes(code)) return false;
  return parsed.mods.every((mod) => {
    if (mod === 'mod') return !!(flags.ctrlKey || flags.metaKey);
    return !!flags[`${mod}Key`];
  });
}

export class BrowserShortcutGuard {
  /**
   * @param {import('../core/binding-store.js').BindingStore} bindingStore
   * @param {import('./keyboard-runtime.js').KeyboardRuntime} keyboardRuntime
   * @param {BrowserGuardOptions & { isUiActive?: () => boolean }} [options]
   */
  constructor(bindingStore, keyboardRuntime, options = {}) {
    this._store = bindingStore;
    this._keyboardRuntime = keyboardRuntime;
    this._isUiActive = options.isUiActive ?? (() => false);

    this._enabled = options.enabled ?? false;
    this._target = options.target ?? null;
    this._when = options.when ?? 'auto';
    this._blockBound = options.blockBound ?? true;
    this._contextMenu = options.contextMenu ?? true;
    this._keyboardLock = options.keyboardLock ?? true;
    this._keyboardLockKeys = options.keyboardLockKeys === undefined
      ? [...DEFAULT_KEYBOARD_LOCK_KEYS]
      : (options.keyboardLockKeys === null ? null : [...options.keyboardLockKeys]);
    this._leaveGuard = options.leaveGuard ?? false;

    /** @type {string[]} */
    this._shortcuts = [...(options.shortcuts ?? DEFAULT_BLOCKED_SHORTCUTS)];
    /** @type {Set<string>} */
    this._extraBlock = new Set(options.block ?? []);
    /** @type {Set<string>} */
    this._allow = new Set(options.allow ?? []);
    this._compile();

    this._gameOwnsInput = false;
    this._leaveArmed = false;
    this._keyboardLocked = false;
    /** @type {Promise<boolean> | null} */
    this._keyboardLockPending = null;
    /** Bumped on unlock so a lock request that resolves late is released again. */
    this._keyboardLockGeneration = 0;
    this._active = false;
    this._wheelAttached = false;

    this._onKey = this._onKey.bind(this);
    this._onMouseButton = this._onMouseButton.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onFullscreenChange = this._onFullscreenChange.bind(this);
    this._onEngagementHint = this._onEngagementHint.bind(this);
    this._onBeforeUnload = this._onBeforeUnload.bind(this);
  }

  start() {
    if (this._active || typeof window === 'undefined') return;
    this._active = true;
    const capture = { capture: true };
    window.addEventListener('keydown', this._onKey, capture);
    window.addEventListener('keyup', this._onKey, capture);
    window.addEventListener('mousedown', this._onMouseButton, capture);
    window.addEventListener('mouseup', this._onMouseButton, capture);
    window.addEventListener('auxclick', this._onMouseButton, capture);
    this._syncWheelListener();
    window.addEventListener('contextmenu', this._onContextMenu, capture);
    window.addEventListener('focusin', this._onEngagementHint, capture);
    document.addEventListener('pointerlockchange', this._onEngagementHint);
    document.addEventListener('fullscreenchange', this._onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', this._onFullscreenChange);
  }

  stop() {
    if (!this._active) return;
    this._active = false;
    const capture = { capture: true };
    window.removeEventListener('keydown', this._onKey, capture);
    window.removeEventListener('keyup', this._onKey, capture);
    window.removeEventListener('mousedown', this._onMouseButton, capture);
    window.removeEventListener('mouseup', this._onMouseButton, capture);
    window.removeEventListener('auxclick', this._onMouseButton, capture);
    this._syncWheelListener();
    window.removeEventListener('contextmenu', this._onContextMenu, capture);
    window.removeEventListener('focusin', this._onEngagementHint, capture);
    document.removeEventListener('pointerlockchange', this._onEngagementHint);
    document.removeEventListener('fullscreenchange', this._onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', this._onFullscreenChange);
    this._unlockKeyboard();
    this.disarmLeaveGuard();
  }

  // ── Configuration ─────────────────────────────────────────────────────────

  get enabled() { return this._enabled; }

  /** @param {boolean} enabled */
  setEnabled(enabled) {
    this._enabled = !!enabled;
    this._syncWheelListener();
    if (!this._enabled) this._unlockKeyboard();
  }

  /** @param {HTMLElement | null} target */
  setTarget(target) { this._target = target ?? null; }

  /**
   * Tell the guard whether the game currently owns input (for games that capture
   * the cursor without pointer lock). Counts as engagement in `when: 'auto'`.
   * @param {boolean} owned
   */
  setGameOwnsInput(owned) {
    this._gameOwnsInput = !!owned;
    this._onEngagementHint();
  }

  /**
   * Opt extra patterns in (cancelled while engaged). Removes them from the allow list.
   * @param {string | string[]} patterns
   */
  block(patterns) {
    for (const p of _toArray(patterns)) {
      this._allow.delete(p);
      this._extraBlock.add(p);
    }
    this._compile();
  }

  /**
   * Opt patterns out (never cancelled, wins over the default list and bound actions).
   * @param {string | string[]} patterns
   */
  allow(patterns) {
    for (const p of _toArray(patterns)) {
      this._extraBlock.delete(p);
      this._allow.add(p);
    }
    this._compile();
  }

  /** @returns {{ shortcuts: string[], block: string[], allow: string[] }} */
  getShortcutPolicy() {
    return {
      shortcuts: [...this._shortcuts],
      block: [...this._extraBlock],
      allow: [...this._allow],
    };
  }

  // ── State ─────────────────────────────────────────────────────────────────

  /**
   * True when the guard is enabled, the bind-manager UI is closed and the game
   * owns input according to `when`.
   */
  isEngaged() {
    if (!this._enabled) return false;
    if (this._isUiActive()) return false;
    if (_isEditable(typeof document !== 'undefined' ? document.activeElement : null)) return false;
    return this._gameHasInput();
  }

  // ── Fullscreen + Keyboard Lock ────────────────────────────────────────────

  /** True when navigator.keyboard.lock exists (Chromium-based browsers). */
  get keyboardLockSupported() {
    return typeof navigator !== 'undefined'
      && !!navigator.keyboard
      && typeof navigator.keyboard.lock === 'function';
  }

  isKeyboardLocked() { return this._keyboardLocked; }

  /**
   * Enter fullscreen on `element` (default: the guard target, else the document)
   * and request Keyboard Lock. Call from a user gesture (click / key handler).
   * @param {HTMLElement} [element]
   * @returns {Promise<{ fullscreen: boolean, keyboardLocked: boolean, error?: unknown }>}
   */
  async enterFullscreen(element) {
    const el = element ?? this._target ?? document.documentElement;
    // Request the lock before fullscreen, in the same task, so the user gesture
    // is still live for both; Chromium activates the lock once fullscreen is on.
    const lockPromise = this._keyboardLock ? this._lockKeyboard() : Promise.resolve(false);
    try {
      await _requestFullscreen(el);
    } catch (error) {
      this._unlockKeyboard();
      return { fullscreen: false, keyboardLocked: false, error };
    }
    const keyboardLocked = await lockPromise;
    return { fullscreen: true, keyboardLocked };
  }

  /** Release Keyboard Lock and leave fullscreen. */
  async exitFullscreen() {
    this._unlockKeyboard();
    if (_fullscreenElement()) await _exitFullscreen();
  }

  // ── Leave-site guard ──────────────────────────────────────────────────────

  /** Prompt "leave site?" on unload until disarmed. */
  armLeaveGuard() {
    if (this._leaveArmed || typeof window === 'undefined') return;
    this._leaveArmed = true;
    window.addEventListener('beforeunload', this._onBeforeUnload);
  }

  /**
   * Stop prompting, e.g. right before the app's own navigation.
   * With `leaveGuard: true` it re-arms on the next engagement.
   */
  disarmLeaveGuard() {
    if (!this._leaveArmed) return;
    this._leaveArmed = false;
    window.removeEventListener('beforeunload', this._onBeforeUnload);
  }

  isLeaveGuardArmed() { return this._leaveArmed; }

  // ── Private ───────────────────────────────────────────────────────────────

  /**
   * The non-passive wheel listener exists only while started AND enabled: on
   * window it makes the browser wait for JS before every page scroll.
   * @private
   */
  _syncWheelListener() {
    const want = this._active && this._enabled;
    if (want === this._wheelAttached) return;
    this._wheelAttached = want;
    if (want) window.addEventListener('wheel', this._onWheel, { capture: true, passive: false });
    else window.removeEventListener('wheel', this._onWheel, { capture: true });
  }

  /** @private */
  _compile() {
    const compile = (list) => list.map(parseShortcutPattern).filter(Boolean);
    this._blockParsed = compile([...this._shortcuts, ...this._extraBlock]);
    this._allowParsed = compile([...this._allow]);
  }

  /** @private */
  _gameHasInput() {
    if (typeof this._when === 'function') return !!this._when();
    if (this._when === 'always') return true;
    if (this._gameOwnsInput) return true;
    if (typeof document === 'undefined') return false;
    const target = this._target;
    const lockEl = document.pointerLockElement;
    if (lockEl && _related(target, lockEl)) return true;
    const fsEl = _fullscreenElement();
    if (fsEl && _related(target, fsEl)) return true;
    return !!(target && document.activeElement && target.contains(document.activeElement));
  }

  /**
   * Shared gate for every event: engaged and not aimed at a text field / bm UI.
   * @private
   */
  _shouldHandle(event) {
    if (!this.isEngaged()) return false;
    if (isExemptInputTarget(event.target)) return false;
    this._maybeArmLeaveGuard();
    return true;
  }

  /**
   * @private
   * @param {string} rawCode
   * @param {{ ctrlKey?: boolean, shiftKey?: boolean, altKey?: boolean, metaKey?: boolean }} flags
   */
  _shouldBlock(rawCode, flags) {
    if (this._allowParsed.some((p) => matchesShortcutPattern(p, rawCode, flags))) return false;
    if (this._blockParsed.some((p) => matchesShortcutPattern(p, rawCode, flags))) return true;
    return this._blockBound && this._isBound(rawCode);
  }

  /**
   * Bound bare, or bound as a combo with the currently held modifiers.
   * @private
   */
  _isBound(rawCode) {
    if (this._store.getActionsByCode(rawCode).length > 0) return true;
    const modifiers = this._keyboardRuntime?.getHeldModifiers?.() ?? [];
    if (modifiers.length === 0) return false;
    return this._store.getActionsByCode(buildComboCode(modifiers, rawCode)).length > 0;
  }

  /** @private */
  _onKey(event) {
    if (!this._shouldHandle(event)) return;
    if (this._shouldBlock(event.code, event)) event.preventDefault();
  }

  /** @private */
  _onMouseButton(event) {
    // The primary button keeps its focus / pointer-lock-request semantics.
    if (event.button === 0) return;
    if (!this._shouldHandle(event)) return;
    if (this._shouldBlock(`MouseButton${event.button}`, event)) event.preventDefault();
  }

  /** @private */
  _onWheel(event) {
    if (!this._shouldHandle(event)) return;
    // Any wheel motion counts here (horizontal too); notch accumulation is only
    // relevant for dispatch, every partial delta must be cancelled.
    const delta = event.deltaY || event.deltaX || 0;
    if (!delta) return;
    const code = delta < 0 ? 'MouseWheelUp' : 'MouseWheelDown';
    if (this._shouldBlock(code, event)) event.preventDefault();
  }

  /** @private */
  _onContextMenu(event) {
    if (!this._contextMenu) return;
    if (!this._shouldHandle(event)) return;
    event.preventDefault();
  }

  /** @private */
  _onEngagementHint() {
    if (this.isEngaged()) this._maybeArmLeaveGuard();
  }

  /** @private */
  _maybeArmLeaveGuard() {
    if (this._leaveGuard && !this._leaveArmed) this.armLeaveGuard();
  }

  /** @private */
  _onFullscreenChange() {
    const fsEl = _fullscreenElement();
    if (!fsEl) {
      this._unlockKeyboard();
      return;
    }
    if (this._enabled && this._keyboardLock && _related(this._target, fsEl)) {
      this._lockKeyboard();
    }
    this._onEngagementHint();
  }

  /**
   * @private
   * @returns {Promise<boolean>}
   */
  _lockKeyboard() {
    if (!this.keyboardLockSupported) return Promise.resolve(false);
    if (this._keyboardLocked) return Promise.resolve(true);
    if (this._keyboardLockPending) return this._keyboardLockPending;
    let request;
    try {
      request = this._keyboardLockKeys
        ? navigator.keyboard.lock(this._keyboardLockKeys)
        : navigator.keyboard.lock();
    } catch {
      return Promise.resolve(false);
    }
    const generation = this._keyboardLockGeneration;
    this._keyboardLockPending = Promise.resolve(request).then(
      () => {
        if (generation !== this._keyboardLockGeneration) {
          try { navigator.keyboard.unlock?.(); } catch { /* ignore */ }
          return false;
        }
        this._keyboardLocked = true;
        return true;
      },
      () => false,
    ).finally(() => { this._keyboardLockPending = null; });
    return this._keyboardLockPending;
  }

  /** @private */
  _unlockKeyboard() {
    if (!this._keyboardLocked && !this._keyboardLockPending) return;
    this._keyboardLocked = false;
    this._keyboardLockGeneration += 1;
    if (this.keyboardLockSupported && typeof navigator.keyboard.unlock === 'function') {
      try { navigator.keyboard.unlock(); } catch { /* ignore */ }
    }
  }

  /** @private */
  _onBeforeUnload(event) {
    event.preventDefault();
    // Legacy browsers need returnValue set to show the prompt
    event.returnValue = '';
    return '';
  }
}

function _toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * True for event targets that keep their browser defaults even while the game
 * owns input: text fields and anything inside the bind-manager UI. Shared with
 * MouseRuntime's gameplay context-menu handling (not part of the public API).
 * @param {EventTarget | null} el
 */
export function isExemptInputTarget(el) {
  if (_isEditable(el)) return true;
  return !!(el && typeof el.closest === 'function' && el.closest(BM_UI_SELECTOR));
}

/** Text fields keep every browser default (typing, editing shortcuts, context menu). */
function _isEditable(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !NON_TEXT_INPUT_TYPES.has((el.type || 'text').toLowerCase());
  return false;
}

/** With no target, any element counts; otherwise one must contain the other. */
function _related(target, el) {
  if (!target) return true;
  return target === el || el.contains(target) || target.contains(el);
}

function _fullscreenElement() {
  if (typeof document === 'undefined') return null;
  return document.fullscreenElement ?? document.webkitFullscreenElement ?? null;
}

function _requestFullscreen(el) {
  if (typeof el.requestFullscreen === 'function') {
    return el.requestFullscreen({ navigationUI: 'hide' });
  }
  if (typeof el.webkitRequestFullscreen === 'function') {
    return Promise.resolve(el.webkitRequestFullscreen());
  }
  return Promise.reject(new Error('Fullscreen API not available'));
}

function _exitFullscreen() {
  if (typeof document.exitFullscreen === 'function') return document.exitFullscreen();
  if (typeof document.webkitExitFullscreen === 'function') return Promise.resolve(document.webkitExitFullscreen());
  return Promise.resolve();
}

/**
 * @typedef {object} BrowserGuardOptions
 * @property {boolean} [enabled=true]                 - (object form) start enabled
 * @property {HTMLElement | null} [target=null]       - game element; scopes pointer-lock / fullscreen / focus detection
 * @property {'auto' | 'always' | (() => boolean)} [when='auto'] - when the game owns input
 * @property {string[]} [shortcuts]                   - replaces DEFAULT_BLOCKED_SHORTCUTS
 * @property {string[]} [block]                       - extra patterns to cancel
 * @property {string[]} [allow]                       - patterns never cancelled (wins)
 * @property {boolean} [blockBound=true]              - cancel anything resolving to a bound action
 * @property {boolean} [contextMenu=true]             - cancel the context menu
 * @property {boolean} [keyboardLock=true]            - request Keyboard Lock in fullscreen
 * @property {string[] | null} [keyboardLockKeys]     - keys to lock (default DEFAULT_KEYBOARD_LOCK_KEYS, null = all keys)
 * @property {boolean} [leaveGuard=false]             - arm a beforeunload prompt after the first engagement
 */
