var BindManager = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.js
  var index_exports = {};
  __export(index_exports, {
    GAMEPAD_PROFILES: () => GAMEPAD_PROFILES,
    GP_A0N: () => GP_A0N,
    GP_A0P: () => GP_A0P,
    GP_A1N: () => GP_A1N,
    GP_A1P: () => GP_A1P,
    GP_A2N: () => GP_A2N,
    GP_A2P: () => GP_A2P,
    GP_A3N: () => GP_A3N,
    GP_A3P: () => GP_A3P,
    GP_B0: () => GP_B0,
    GP_B1: () => GP_B1,
    GP_B10: () => GP_B10,
    GP_B11: () => GP_B11,
    GP_B12: () => GP_B12,
    GP_B13: () => GP_B13,
    GP_B14: () => GP_B14,
    GP_B15: () => GP_B15,
    GP_B16: () => GP_B16,
    GP_B2: () => GP_B2,
    GP_B3: () => GP_B3,
    GP_B4: () => GP_B4,
    GP_B5: () => GP_B5,
    GP_B6: () => GP_B6,
    GP_B7: () => GP_B7,
    GP_B8: () => GP_B8,
    GP_B9: () => GP_B9,
    GP_CODES: () => GP_CODES,
    KEY_DISPLAY_NAMES: () => KEY_DISPLAY_NAMES,
    createBindManager: () => createBindManager,
    detectGamepadProfile: () => detectGamepadProfile,
    getControllerFamily: () => getControllerFamily,
    getGamepadCodeType: () => getGamepadCodeType,
    getGamepadLabel: () => getGamepadLabel,
    getKeyLabel: () => getKeyLabel,
    getResolvedGamepadLabel: () => getResolvedGamepadLabel,
    isGamepadCode: () => isGamepadCode,
    isKnownCode: () => isKnownCode,
    resolveGamepadProfile: () => resolveGamepadProfile
  });

  // src/core/action-registry.js
  var ActionRegistry = class {
    constructor() {
      this._actions = /* @__PURE__ */ new Map();
    }
    /**
     * Register a new action. Throws if the id is already taken.
     * @param {object} def
     * @param {string} def.id           - Unique stable identifier
     * @param {string} [def.label]      - Display name (defaults to id)
     * @param {string} [def.description]
     * @param {string} [def.group]      - Group name, e.g. "Movement" (defaults to "General")
     * @param {number} [def.slots]      - Max bindings per action (defaults to 2)
     * @param {string[]} [def.defaultBindings] - KeyboardEvent.code values for each slot
     * @returns {ActionDefinition}
     */
    register(def) {
      if (!def || typeof def.id !== "string" || def.id.trim() === "") {
        throw new Error("Action registration requires a non-empty string id");
      }
      if (this._actions.has(def.id)) {
        throw new Error(`Action "${def.id}" is already registered`);
      }
      const action = {
        id: def.id,
        label: typeof def.label === "string" ? def.label : def.id,
        description: typeof def.description === "string" ? def.description : "",
        group: typeof def.group === "string" && def.group.trim() !== "" ? def.group : "General",
        // Keyboard slots / defaults
        slots: typeof def.slots === "number" && def.slots >= 1 ? Math.floor(def.slots) : 2,
        defaultBindings: Array.isArray(def.defaultBindings) ? def.defaultBindings.slice() : [],
        // Gamepad slots / defaults
        gamepadSlots: typeof def.gamepadSlots === "number" && def.gamepadSlots >= 1 ? Math.floor(def.gamepadSlots) : 1,
        defaultGamepadBindings: Array.isArray(def.defaultGamepadBindings) ? def.defaultGamepadBindings.slice() : [],
        // Whether this action accepts continuous analog float events (e.g. move speed from a stick)
        analog: def.analog === true,
        // null = fires for any connected controller; integer = only fires for that gamepad.index
        playerIndex: Number.isInteger(def.playerIndex) ? def.playerIndex : null
      };
      this._actions.set(action.id, action);
      return action;
    }
    /** @param {string} id @returns {ActionDefinition | null} */
    get(id) {
      return this._actions.get(id) ?? null;
    }
    /** @param {string} id @returns {boolean} */
    has(id) {
      return this._actions.has(id);
    }
    /** @returns {ActionDefinition[]} */
    getAll() {
      return [...this._actions.values()];
    }
    /**
     * Returns actions grouped by their group name, preserving registration order.
     * @returns {Map<string, ActionDefinition[]>}
     */
    getGroups() {
      const groups = /* @__PURE__ */ new Map();
      for (const action of this._actions.values()) {
        if (!groups.has(action.group)) groups.set(action.group, []);
        groups.get(action.group).push(action);
      }
      return groups;
    }
  };

  // src/core/binding-store.js
  var BindingStore = class {
    /** @param {import('./action-registry.js').ActionRegistry} registry */
    constructor(registry) {
      this._registry = registry;
      this._keyboard = /* @__PURE__ */ new Map();
      this._gamepad = /* @__PURE__ */ new Map();
      this._saved = {};
      this._listeners = /* @__PURE__ */ new Set();
    }
    /**
     * Provide saved bindings loaded from storage before actions are registered.
     * Called once at startup. Subsequent registerAction calls will pick up this data.
     *
     * Accepts both legacy v1 format (actionId → array, treated as keyboard-only) and
     * v2 format (actionId → { keyboard: [], gamepad: [] }).
     *
     * @param {object | null} savedBindings
     */
    init(savedBindings) {
      this._saved = savedBindings != null && typeof savedBindings === "object" ? savedBindings : {};
    }
    /**
     * Called by the manager after each action is registered.
     * Merges saved data (if any) with the action's defaults for both devices.
     * @param {import('./action-registry.js').ActionDefinition} action
     */
    initAction(action) {
      const saved = this._saved[action.id];
      const savedKb = Array.isArray(saved) ? saved : saved && Array.isArray(saved.keyboard) ? saved.keyboard : null;
      const kbBindings = Array.from({ length: action.slots }, (_, i) => {
        if (savedKb) return typeof savedKb[i] === "string" ? savedKb[i] : null;
        return typeof action.defaultBindings[i] === "string" ? action.defaultBindings[i] : null;
      });
      this._keyboard.set(action.id, kbBindings);
      const savedGp = saved && !Array.isArray(saved) && Array.isArray(saved.gamepad) ? saved.gamepad : null;
      const gpBindings = Array.from({ length: action.gamepadSlots }, (_, i) => {
        if (savedGp) return typeof savedGp[i] === "string" ? savedGp[i] : null;
        return typeof action.defaultGamepadBindings[i] === "string" ? action.defaultGamepadBindings[i] : null;
      });
      this._gamepad.set(action.id, gpBindings);
    }
    /**
     * Get bindings for an action on the given device.
     * Defaults to 'keyboard' for backward compatibility with existing callers.
     * @param {string} actionId
     * @param {'keyboard' | 'gamepad'} [device='keyboard']
     * @returns {(string|null)[] | null}
     */
    get(actionId, device = "keyboard") {
      const map = device === "gamepad" ? this._gamepad : this._keyboard;
      const b = map.get(actionId);
      return b ? [...b] : null;
    }
    /**
     * Returns a plain-object snapshot with both keyboard and gamepad bindings per action,
     * suitable for JSON serialisation and persistence.
     * @returns {Record<string, { keyboard: (string|null)[], gamepad: (string|null)[] }>}
     */
    getAll() {
      const result = {};
      for (const action of this._registry.getAll()) {
        result[action.id] = {
          keyboard: [...this._keyboard.get(action.id) ?? []],
          gamepad: [...this._gamepad.get(action.id) ?? []]
        };
      }
      return result;
    }
    /**
     * Assign a code to a specific slot of an action on the given device.
     * Returns conflict warnings (other actions that already use this code on the same device).
     * Conflicts are reported but never block the assignment.
     *
     * @param {string} actionId
     * @param {number} slot
     * @param {string | null} code
     * @param {'keyboard' | 'gamepad'} [device='keyboard']
     * @returns {{ conflicts: ConflictRef[] }}
     */
    set(actionId, slot, code, device = "keyboard") {
      const action = this._registry.get(actionId);
      if (!action) throw new Error(`Unknown action: "${actionId}"`);
      const slotCount = device === "gamepad" ? action.gamepadSlots : action.slots;
      if (slot < 0 || slot >= slotCount) {
        throw new Error(`Slot ${slot} is out of range for action "${actionId}" (${device} slots: ${slotCount})`);
      }
      const map = device === "gamepad" ? this._gamepad : this._keyboard;
      const bindings = map.get(actionId);
      const oldCode = bindings[slot];
      const conflicts = code !== null ? this._findConflicts(code, actionId, slot, device) : [];
      bindings[slot] = code ?? null;
      this._emit({ type: "binding-changed", device, actionId, slot, oldCode, newCode: code ?? null, conflicts });
      return { conflicts };
    }
    /**
     * Clear the binding in a specific slot (sets it to null).
     * @param {string} actionId
     * @param {number} slot
     * @param {'keyboard' | 'gamepad'} [device='keyboard']
     */
    clear(actionId, slot, device = "keyboard") {
      return this.set(actionId, slot, null, device);
    }
    /**
     * Reset a single action's bindings to its defaults on BOTH devices.
     * @param {string} actionId
     */
    reset(actionId) {
      const action = this._registry.get(actionId);
      if (!action) throw new Error(`Unknown action: "${actionId}"`);
      const kbDefaults = Array.from(
        { length: action.slots },
        (_, i) => typeof action.defaultBindings[i] === "string" ? action.defaultBindings[i] : null
      );
      this._keyboard.set(actionId, kbDefaults);
      const gpDefaults = Array.from(
        { length: action.gamepadSlots },
        (_, i) => typeof action.defaultGamepadBindings[i] === "string" ? action.defaultGamepadBindings[i] : null
      );
      this._gamepad.set(actionId, gpDefaults);
      this._emit({ type: "reset", actionId });
    }
    /** Reset all registered actions to their defaults on both devices. */
    resetAll() {
      for (const action of this._registry.getAll()) {
        this.reset(action.id);
      }
    }
    /**
     * Returns all action IDs that have the given code bound in any slot of the given device.
     * Used by input runtimes to resolve which actions a code triggers.
     * @param {string} code
     * @param {'keyboard' | 'gamepad'} [device='keyboard']
     * @returns {string[]}
     */
    getActionsByCode(code, device = "keyboard") {
      const map = device === "gamepad" ? this._gamepad : this._keyboard;
      const results = [];
      for (const [id, bindings] of map) {
        if (bindings.includes(code)) results.push(id);
      }
      return results;
    }
    /**
     * Subscribe to binding change events.
     * @param {Function} listener
     * @returns {Function} unsubscribe
     */
    subscribe(listener) {
      this._listeners.add(listener);
      return () => this._listeners.delete(listener);
    }
    /** @private */
    _findConflicts(code, excludeActionId, excludeSlot, device = "keyboard") {
      const map = device === "gamepad" ? this._gamepad : this._keyboard;
      const conflicts = [];
      for (const [id, bindings] of map) {
        for (let s = 0; s < bindings.length; s++) {
          if (bindings[s] === code && !(id === excludeActionId && s === excludeSlot)) {
            conflicts.push({ actionId: id, slot: s });
          }
        }
      }
      return conflicts;
    }
    /** @private */
    _emit(event) {
      for (const listener of this._listeners) {
        try {
          listener(event);
        } catch (err) {
          console.error("[BindManager] Subscriber threw an error:", err);
        }
      }
    }
  };

  // src/input/keyboard-runtime.js
  var KeyboardRuntime = class {
    /** @param {import('../core/binding-store.js').BindingStore} bindingStore */
    constructor(bindingStore) {
      this._store = bindingStore;
      this._pressed = /* @__PURE__ */ new Set();
      this._actionListeners = /* @__PURE__ */ new Map();
      this._anyListeners = /* @__PURE__ */ new Set();
      this._active = false;
      this._suppressGameplay = false;
      this._captureCallback = null;
      this._onKeyDown = this._onKeyDown.bind(this);
      this._onKeyUp = this._onKeyUp.bind(this);
      this._onBlur = this._onBlur.bind(this);
    }
    /** Attach global keyboard listeners. Safe to call multiple times. */
    start() {
      if (this._active) return;
      this._active = true;
      window.addEventListener("keydown", this._onKeyDown);
      window.addEventListener("keyup", this._onKeyUp);
      window.addEventListener("blur", this._onBlur);
    }
    /** Detach all keyboard listeners and clear pressed state. */
    stop() {
      if (!this._active) return;
      this._active = false;
      this._pressed.clear();
      this._captureCallback = null;
      window.removeEventListener("keydown", this._onKeyDown);
      window.removeEventListener("keyup", this._onKeyUp);
      window.removeEventListener("blur", this._onBlur);
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
        for (const code of this._pressed) {
          this._dispatch(code, "released", null);
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
        this._actionListeners.set(actionId, /* @__PURE__ */ new Set());
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
      if (this._captureCallback) {
        event.preventDefault();
        if (code === "Escape") {
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
        this._dispatch(code, "pressed", event);
      } else {
        this._dispatch(code, "held", event);
      }
    }
    /** @private */
    _onKeyUp(event) {
      const code = event.code;
      if (!this._captureCallback && !this._suppressGameplay) {
        this._dispatch(code, "released", event);
      }
      this._pressed.delete(code);
    }
    /** @private */
    _onBlur() {
      if (!this._suppressGameplay) {
        for (const code of this._pressed) {
          this._dispatch(code, "released", null);
        }
      }
      this._pressed.clear();
    }
    /** @private */
    _dispatch(code, type, originalEvent) {
      const actionIds = this._store.getActionsByCode(code);
      for (const actionId of actionIds) {
        const actionEvent = { type, actionId, code, originalEvent };
        const listeners = this._actionListeners.get(actionId);
        if (listeners) {
          for (const fn of listeners) {
            try {
              fn(actionEvent);
            } catch (err) {
              console.error("[BindManager] Action listener threw:", err);
            }
          }
        }
        for (const fn of this._anyListeners) {
          try {
            fn(actionEvent);
          } catch (err) {
            console.error("[BindManager] onAnyAction listener threw:", err);
          }
        }
      }
    }
  };

  // src/storage/local-storage-adapter.js
  var STORAGE_VERSION = 1;
  var PROFILE_OVERRIDE_STORAGE_VERSION = 1;
  var LocalStorageAdapter = class {
    /** @param {string} namespace - used as part of the storage key */
    constructor(namespace) {
      this._key = `bind-manager:${namespace}`;
      this._profileOverrideKey = `bind-manager:${namespace}:gamepad-profile-overrides`;
    }
    /**
     * Load saved bindings for this namespace.
     * Returns null on first run, parse error, or version mismatch.
     * @returns {Record<string, (string|null)[]> | null}
     */
    load() {
      try {
        const raw = window.localStorage.getItem(this._key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== STORAGE_VERSION) return null;
        return parsed.bindings ?? null;
      } catch {
        return null;
      }
    }
    /**
     * Persist the current binding state.
     * Silently swallows storage quota errors so games never crash on save.
     * @param {Record<string, (string|null)[]>} bindings
     */
    save(bindings) {
      try {
        window.localStorage.setItem(
          this._key,
          JSON.stringify({ version: STORAGE_VERSION, bindings })
        );
      } catch {
      }
    }
    /** Remove all saved bindings for this namespace. */
    clear() {
      try {
        window.localStorage.removeItem(this._key);
        window.localStorage.removeItem(this._profileOverrideKey);
      } catch {
      }
    }
    /**
     * Load persisted gamepad profile overrides.
     * @returns {Record<string, { type: 'profile', key: string } | { type: 'family', family: string }>}
     */
    loadGamepadProfileOverrides() {
      try {
        const raw = window.localStorage.getItem(this._profileOverrideKey);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== PROFILE_OVERRIDE_STORAGE_VERSION || typeof parsed.overrides !== "object") {
          return {};
        }
        return parsed.overrides ?? {};
      } catch {
        return {};
      }
    }
    /**
     * Persist gamepad profile overrides.
     * @param {Record<string, { type: 'profile', key: string } | { type: 'family', family: string }>} overrides
     */
    saveGamepadProfileOverrides(overrides) {
      try {
        window.localStorage.setItem(
          this._profileOverrideKey,
          JSON.stringify({ version: PROFILE_OVERRIDE_STORAGE_VERSION, overrides })
        );
      } catch {
      }
    }
  };

  // src/input/key-names.js
  var KEY_DISPLAY_NAMES = {
    // Letters
    KeyA: "A",
    KeyB: "B",
    KeyC: "C",
    KeyD: "D",
    KeyE: "E",
    KeyF: "F",
    KeyG: "G",
    KeyH: "H",
    KeyI: "I",
    KeyJ: "J",
    KeyK: "K",
    KeyL: "L",
    KeyM: "M",
    KeyN: "N",
    KeyO: "O",
    KeyP: "P",
    KeyQ: "Q",
    KeyR: "R",
    KeyS: "S",
    KeyT: "T",
    KeyU: "U",
    KeyV: "V",
    KeyW: "W",
    KeyX: "X",
    KeyY: "Y",
    KeyZ: "Z",
    // Digits (top row)
    Digit0: "0",
    Digit1: "1",
    Digit2: "2",
    Digit3: "3",
    Digit4: "4",
    Digit5: "5",
    Digit6: "6",
    Digit7: "7",
    Digit8: "8",
    Digit9: "9",
    // Function keys
    F1: "F1",
    F2: "F2",
    F3: "F3",
    F4: "F4",
    F5: "F5",
    F6: "F6",
    F7: "F7",
    F8: "F8",
    F9: "F9",
    F10: "F10",
    F11: "F11",
    F12: "F12",
    // Arrow keys
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    // Navigation cluster
    Home: "Home",
    End: "End",
    PageUp: "Page Up",
    PageDown: "Page Down",
    Insert: "Insert",
    Delete: "Delete",
    // Editing / whitespace
    Space: "Space",
    Enter: "Enter",
    Backspace: "Backspace",
    Tab: "Tab",
    Escape: "Escape",
    CapsLock: "Caps Lock",
    // Modifiers
    ShiftLeft: "Left Shift",
    ShiftRight: "Right Shift",
    ControlLeft: "Left Ctrl",
    ControlRight: "Right Ctrl",
    AltLeft: "Left Alt",
    AltRight: "Right Alt",
    MetaLeft: "Left Meta",
    MetaRight: "Right Meta",
    // Numpad
    Numpad0: "Num 0",
    Numpad1: "Num 1",
    Numpad2: "Num 2",
    Numpad3: "Num 3",
    Numpad4: "Num 4",
    Numpad5: "Num 5",
    Numpad6: "Num 6",
    Numpad7: "Num 7",
    Numpad8: "Num 8",
    Numpad9: "Num 9",
    NumpadAdd: "Num +",
    NumpadSubtract: "Num -",
    NumpadMultiply: "Num *",
    NumpadDivide: "Num /",
    NumpadDecimal: "Num .",
    NumpadEnter: "Num Enter",
    NumLock: "Num Lock",
    // Punctuation / symbols
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Backquote: "`",
    Comma: ",",
    Period: ".",
    Slash: "/",
    // System / misc
    PrintScreen: "Print Screen",
    ScrollLock: "Scroll Lock",
    Pause: "Pause",
    ContextMenu: "Menu"
  };
  function getKeyLabel(code) {
    if (!code) return "\u2014";
    return KEY_DISPLAY_NAMES[code] ?? code;
  }
  function isKnownCode(code) {
    return typeof code === "string" && Object.prototype.hasOwnProperty.call(KEY_DISPLAY_NAMES, code);
  }

  // src/ui/styles.js
  var CSS2 = `
/* ================================================================
   Bind Manager \u2014 base styles
   Customise via CSS custom properties on any ancestor element or :root
   ================================================================ */

:root {
  --bm-z-modal:  9000;
  --bm-z-capture:  9010;
  --bm-z-hints:  8000;

  --bm-overlay-bg:   rgba(0, 0, 0, 0.75);
  --bm-modal-bg:     #1e1e2e;
  --bm-modal-border: #3a3a5c;
  --bm-modal-radius: 10px;
  --bm-modal-width:  660px;
  --bm-modal-max-h:  80vh;

  --bm-text-primary:   #e0e0f0;
  --bm-text-secondary: #9090b0;
  --bm-text-desc:      #6a6a90;

  --bm-group-bg:     #16162a;
  --bm-group-border: #2a2a44;
  --bm-row-hover:    #252540;

  --bm-accent:         #5c7cfa;
  --bm-accent-hover:   #748cfb;
  --bm-accent-active:  #4a6ae8;

  --bm-btn-bg:         #2a2a44;
  --bm-btn-hover:      #343460;
  --bm-btn-border:     #3a3a60;

  --bm-capture-bg:     #3a2a00;
  --bm-capture-border: #c89000;
  --bm-capture-text:   #ffd060;

  --bm-reset-color:    #e06060;
  --bm-reset-hover:    #f07070;

  --bm-warn-bg:        #2e1e00;
  --bm-warn-border:    #a06000;
  --bm-warn-text:      #ffa040;

  --bm-hints-bg:       rgba(10, 10, 25, 0.85);
  --bm-hints-border:   rgba(255, 255, 255, 0.08);
  --bm-hint-key-bg:    rgba(255, 255, 255, 0.12);
  --bm-hint-key-border:rgba(255, 255, 255, 0.22);
}

/* ---- Overlay ---- */
.bm-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--bm-z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bm-overlay-bg);
  /* Use pointer-events so the canvas behind is clickable when overlay is hidden */
  pointer-events: all;
}

/* ---- Modal container ---- */
.bm-modal {
  background: var(--bm-modal-bg);
  border: 1px solid var(--bm-modal-border);
  border-radius: var(--bm-modal-radius);
  width: var(--bm-modal-width);
  max-width: calc(100vw - 32px);
  max-height: var(--bm-modal-max-h);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 14px;
  color: var(--bm-text-primary);
}

/* ---- Header ---- */
.bm-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--bm-modal-border);
  flex-shrink: 0;
}

.bm-modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--bm-text-primary);
}

.bm-close-btn {
  background: none;
  border: none;
  color: var(--bm-text-secondary);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  transition: color 0.15s, background 0.15s;
}
.bm-close-btn:hover {
  color: var(--bm-text-primary);
  background: var(--bm-btn-hover);
}

/* ---- Scrollable body ---- */
.bm-modal-body {
  overflow-y: auto;
  flex: 1;
  padding: 12px 0;
}

.bm-profile-panel {
  margin: 0 20px 12px;
  padding: 12px;
  border: 1px solid var(--bm-group-border);
  border-radius: 8px;
  background: var(--bm-group-bg);
}

.bm-profile-panel-empty {
  color: var(--bm-text-desc);
}

.bm-profile-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--bm-text-primary);
}

.bm-profile-meta,
.bm-profile-subtitle {
  color: var(--bm-text-secondary);
  font-size: 12px;
}

.bm-profile-subtitle {
  margin-top: 4px;
  word-break: break-word;
}

.bm-profile-controls {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.bm-profile-select {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  background: var(--bm-btn-bg);
  border: 1px solid var(--bm-btn-border);
  border-radius: 6px;
  color: var(--bm-text-primary);
}

.bm-profile-auto-btn {
  height: 32px;
  padding: 0 12px;
  background: var(--bm-btn-bg);
  border: 1px solid var(--bm-btn-border);
  border-radius: 6px;
  color: var(--bm-text-primary);
  cursor: pointer;
}

.bm-profile-auto-btn:hover,
.bm-profile-select:hover {
  border-color: var(--bm-accent);
}

/* ---- Group ---- */
.bm-group {
  margin-bottom: 4px;
}

.bm-group-title {
  padding: 8px 20px 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--bm-text-secondary);
}

/* ---- Action row ---- */
.bm-action-row {
  display: flex;
  align-items: center;
  padding: 8px 20px;
  gap: 12px;
  transition: background 0.1s;
}
.bm-action-row:hover {
  background: var(--bm-row-hover);
}

.bm-action-info {
  flex: 1;
  min-width: 0;
}

.bm-action-label {
  font-weight: 500;
  color: var(--bm-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bm-action-desc {
  font-size: 12px;
  color: var(--bm-text-desc);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bm-action-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bm-action-controls.bm-with-gamepad {
  align-items: flex-start;
}

.bm-device-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bm-device-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bm-device-badge {
  width: 18px;
  font-size: 13px;
  text-align: center;
  flex-shrink: 0;
  color: var(--bm-text-desc);
  user-select: none;
  line-height: 32px;
}

.bm-device-badge.bm-device-gp {
  color: var(--bm-accent);
  opacity: 0.8;
}

.bm-bind-slots {
  display: flex;
  gap: 6px;
}

.bm-slot {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* ---- Bind button ---- */
.bm-bind-btn {
  min-width: 72px;
  height: 32px;
  padding: 0 10px;
  background: var(--bm-btn-bg);
  border: 1px solid var(--bm-btn-border);
  border-radius: 6px;
  color: var(--bm-text-primary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.bm-bind-btn:hover {
  background: var(--bm-btn-hover);
  border-color: var(--bm-accent);
}
.bm-bind-btn.bm-unbound {
  color: var(--bm-text-desc);
}

/* Capture state: waiting for user to press a key */
.bm-bind-btn.bm-capturing {
  background: var(--bm-capture-bg);
  border-color: var(--bm-capture-border);
  color: var(--bm-capture-text);
  animation: bm-pulse 1s ease-in-out infinite;
}

.bm-bind-btn:disabled,
.bm-clear-slot-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.bm-action-reset-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ---- "No controller" placeholder ---- */
.bm-no-controller {
  font-size: 11px;
  color: var(--bm-text-desc);
  font-style: italic;
  padding: 2px 4px;
  line-height: 32px;
}

.bm-clear-slot-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 4px;
  border: 1px solid var(--bm-btn-border);
  background: var(--bm-btn-bg);
  color: var(--bm-text-secondary);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.bm-clear-slot-btn:hover {
  background: var(--bm-btn-hover);
  border-color: var(--bm-reset-color);
  color: var(--bm-reset-hover);
}

@keyframes bm-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.6; }
}

/* ---- Per-action reset button ---- */
.bm-action-reset-btn {
  background: none;
  border: none;
  color: var(--bm-text-desc);
  font-size: 16px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  transition: color 0.15s, background 0.15s;
  line-height: 1;
}
.bm-action-reset-btn:hover {
  color: var(--bm-reset-color);
  background: var(--bm-btn-hover);
}

/* ---- Footer ---- */
.bm-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid var(--bm-modal-border);
  flex-shrink: 0;
  gap: 12px;
}

.bm-footer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

/* ---- Conflict warning ---- */
.bm-conflict-warning {
  flex: 1;
  font-size: 12px;
  color: var(--bm-warn-text);
  background: var(--bm-warn-bg);
  border: 1px solid var(--bm-warn-border);
  border-radius: 5px;
  padding: 6px 10px;
  transition: opacity 0.2s;
}
.bm-conflict-warning.bm-hidden {
  display: none;
}

/* ---- Reset All button ---- */
.bm-reset-all-btn {
  background: none;
  border: 1px solid var(--bm-btn-border);
  border-radius: 6px;
  color: var(--bm-reset-color);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  padding: 6px 14px;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  flex-shrink: 0;
}
.bm-footer-action-btn {
  background: var(--bm-btn-bg);
  border: 1px solid var(--bm-btn-border);
  border-radius: 6px;
  color: var(--bm-text-primary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  padding: 6px 14px;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.bm-footer-action-btn:hover {
  background: var(--bm-btn-hover);
  border-color: var(--bm-accent);
}
.bm-footer-action-btn--debug {
  color: #ffd3a4;
  border-color: rgba(250, 170, 90, 0.55);
  background: rgba(250, 170, 90, 0.12);
}
.bm-footer-action-btn--debug:hover {
  background: rgba(250, 170, 90, 0.22);
  border-color: rgba(255, 192, 120, 0.95);
}
.bm-footer-action-btn--test {
  color: #b8f2ff;
  border-color: rgba(100, 210, 235, 0.5);
  background: rgba(100, 210, 235, 0.12);
}
.bm-footer-action-btn--test:hover {
  background: rgba(100, 210, 235, 0.22);
  border-color: rgba(130, 235, 255, 0.95);
}
.bm-reset-all-btn:hover {
  background: var(--bm-btn-hover);
  border-color: var(--bm-reset-color);
  color: var(--bm-reset-hover);
}

/* ---- Capture modal ---- */
.bm-capture-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--bm-z-capture);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
}

.bm-capture-modal {
  width: min(420px, calc(100vw - 32px));
  padding: 18px;
  border-radius: 10px;
  border: 1px solid var(--bm-capture-border);
  background: linear-gradient(180deg, rgba(58, 42, 0, 0.98), rgba(27, 20, 0, 0.98));
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.45);
  color: var(--bm-text-primary);
  font-family: system-ui, -apple-system, sans-serif;
}

.bm-capture-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.bm-capture-title {
  margin: 0;
  font-size: 16px;
  color: var(--bm-capture-text);
}

.bm-capture-cancel-btn {
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--bm-capture-border);
  background: rgba(255, 208, 96, 0.08);
  color: var(--bm-capture-text);
  cursor: pointer;
}

.bm-capture-cancel-btn:hover {
  background: rgba(255, 208, 96, 0.14);
}

.bm-capture-message {
  margin-top: 14px;
  font-size: 14px;
}

.bm-capture-detail {
  margin-top: 8px;
  font-size: 12px;
  color: var(--bm-text-secondary);
  white-space: pre-wrap;
}

/* ====== Action Hints Bar (bottom of screen) ====== */

.bm-hints {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: var(--bm-z-hints);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 4px 16px;
  padding: 8px 20px;
  background: var(--bm-hints-bg);
  border-top: 1px solid var(--bm-hints-border);
  pointer-events: none;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 12px;
  color: var(--bm-text-secondary);
  /* backdrop-filter: blur(6px); jsdom doesn't support this, but it's still nice for browsers */
}

.bm-hint-item {
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.bm-hint-keys {
  display: flex;
  align-items: center;
  gap: 3px;
}

.bm-hint-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 20px;
  padding: 0 5px;
  background: var(--bm-hint-key-bg);
  border: 1px solid var(--bm-hint-key-border);
  border-radius: 3px;
  font-size: 11px;
  font-family: inherit;
  font-style: normal;
  color: var(--bm-text-primary);
  line-height: 1;
}

.bm-hint-sep {
  color: var(--bm-text-desc);
  font-size: 10px;
}

.bm-hint-label {
  color: var(--bm-text-secondary);
}

/* ---- Gamepad hint key (distinct colour) ---- */
.bm-hint-gp-key {
  color: var(--bm-accent-hover);
  background: rgba(92, 124, 250, 0.12);
  border-color: rgba(92, 124, 250, 0.35);
}
`;
  var _injected = false;
  function injectStyles() {
    if (_injected || typeof document === "undefined") return;
    _injected = true;
    const style = document.createElement("style");
    style.dataset.bindManager = "styles";
    style.textContent = CSS2;
    document.head.appendChild(style);
  }

  // src/input/gamepad-codes.js
  var GP_B0 = "GP_B0";
  var GP_B1 = "GP_B1";
  var GP_B2 = "GP_B2";
  var GP_B3 = "GP_B3";
  var GP_B4 = "GP_B4";
  var GP_B5 = "GP_B5";
  var GP_B6 = "GP_B6";
  var GP_B7 = "GP_B7";
  var GP_B8 = "GP_B8";
  var GP_B9 = "GP_B9";
  var GP_B10 = "GP_B10";
  var GP_B11 = "GP_B11";
  var GP_B12 = "GP_B12";
  var GP_B13 = "GP_B13";
  var GP_B14 = "GP_B14";
  var GP_B15 = "GP_B15";
  var GP_B16 = "GP_B16";
  var GP_A0N = "GP_A0N";
  var GP_A0P = "GP_A0P";
  var GP_A1N = "GP_A1N";
  var GP_A1P = "GP_A1P";
  var GP_A2N = "GP_A2N";
  var GP_A2P = "GP_A2P";
  var GP_A3N = "GP_A3N";
  var GP_A3P = "GP_A3P";
  var GP_CODES = [
    GP_B0,
    GP_B1,
    GP_B2,
    GP_B3,
    GP_B4,
    GP_B5,
    GP_B6,
    GP_B7,
    GP_B8,
    GP_B9,
    GP_B10,
    GP_B11,
    GP_B12,
    GP_B13,
    GP_B14,
    GP_B15,
    GP_B16,
    GP_A0N,
    GP_A0P,
    GP_A1N,
    GP_A1P,
    GP_A2N,
    GP_A2P,
    GP_A3N,
    GP_A3P
  ];
  var _GP_CODE_SET = new Set(GP_CODES);
  function isGamepadCode(code) {
    return _GP_CODE_SET.has(code);
  }
  function getGamepadCodeType(code) {
    if (!code || typeof code !== "string") return null;
    if (/^GP_B\d+$/.test(code)) return "button";
    if (/^GP_A\d+[NP]$/.test(code)) return "axis";
    return null;
  }

  // src/input/gamepad-profiles.js
  var GAMEPAD_PROFILES = {
    xbox: {
      // Face buttons
      [GP_B0]: "A",
      [GP_B1]: "B",
      [GP_B2]: "X",
      [GP_B3]: "Y",
      // Shoulder / trigger
      [GP_B4]: "LB",
      [GP_B5]: "RB",
      [GP_B6]: "LT",
      [GP_B7]: "RT",
      // System
      [GP_B8]: "Back",
      [GP_B9]: "Start",
      // Stick clicks
      [GP_B10]: "L3",
      [GP_B11]: "R3",
      // D-Pad
      [GP_B12]: "D-Up",
      [GP_B13]: "D-Down",
      [GP_B14]: "D-Left",
      [GP_B15]: "D-Right",
      // Guide
      [GP_B16]: "Xbox",
      // Left stick
      [GP_A0N]: "LS-Left",
      [GP_A0P]: "LS-Right",
      [GP_A1N]: "LS-Up",
      [GP_A1P]: "LS-Down",
      // Right stick
      [GP_A2N]: "RS-Left",
      [GP_A2P]: "RS-Right",
      [GP_A3N]: "RS-Up",
      [GP_A3P]: "RS-Down"
    },
    dualsense: {
      // Face buttons
      [GP_B0]: "Cross",
      [GP_B1]: "Circle",
      [GP_B2]: "Square",
      [GP_B3]: "Triangle",
      // Shoulder / trigger
      [GP_B4]: "L1",
      [GP_B5]: "R1",
      [GP_B6]: "L2",
      [GP_B7]: "R2",
      // System
      [GP_B8]: "Create",
      [GP_B9]: "Options",
      // Stick clicks
      [GP_B10]: "L3",
      [GP_B11]: "R3",
      // D-Pad
      [GP_B12]: "D-Up",
      [GP_B13]: "D-Down",
      [GP_B14]: "D-Left",
      [GP_B15]: "D-Right",
      // Guide
      [GP_B16]: "PS",
      // Left stick
      [GP_A0N]: "LS-Left",
      [GP_A0P]: "LS-Right",
      [GP_A1N]: "LS-Up",
      [GP_A1P]: "LS-Down",
      // Right stick
      [GP_A2N]: "RS-Left",
      [GP_A2P]: "RS-Right",
      [GP_A3N]: "RS-Up",
      [GP_A3P]: "RS-Down"
    },
    generic: {
      [GP_B0]: "Btn 0",
      [GP_B1]: "Btn 1",
      [GP_B2]: "Btn 2",
      [GP_B3]: "Btn 3",
      [GP_B4]: "Btn 4",
      [GP_B5]: "Btn 5",
      [GP_B6]: "Btn 6",
      [GP_B7]: "Btn 7",
      [GP_B8]: "Btn 8",
      [GP_B9]: "Btn 9",
      [GP_B10]: "Btn 10",
      [GP_B11]: "Btn 11",
      [GP_B12]: "Btn 12",
      [GP_B13]: "Btn 13",
      [GP_B14]: "Btn 14",
      [GP_B15]: "Btn 15",
      [GP_B16]: "Btn 16",
      [GP_A0N]: "Axis 0-",
      [GP_A0P]: "Axis 0+",
      [GP_A1N]: "Axis 1-",
      [GP_A1P]: "Axis 1+",
      [GP_A2N]: "Axis 2-",
      [GP_A2P]: "Axis 2+",
      [GP_A3N]: "Axis 3-",
      [GP_A3P]: "Axis 3+"
    }
  };
  function detectGamepadProfile(gamepadId) {
    if (!gamepadId || typeof gamepadId !== "string") return "generic";
    const id = gamepadId.toLowerCase();
    if (/xinput|xbox|microsoft|045e/.test(id)) return "xbox";
    if (/054c|playstation|dualshock|dualsense|wireless controller/.test(id)) return "dualsense";
    return "generic";
  }
  function getGamepadLabel(code, profile = "generic") {
    if (!code) return "\u2014";
    const map = GAMEPAD_PROFILES[profile] ?? GAMEPAD_PROFILES.generic;
    return map[code] ?? code;
  }

  // src/ui/modal-controller.js
  var ModalController = class {
    /**
     * @param {import('../core/binding-store.js').BindingStore} bindingStore
     * @param {import('../core/action-registry.js').ActionRegistry} registry
     * @param {import('../input/keyboard-runtime.js').KeyboardRuntime} keyboardRuntime
     */
    constructor(bindingStore, registry, keyboardRuntime, gamepadRuntime = null, captureModal = null, footerActions = []) {
      this._store = bindingStore;
      this._registry = registry;
      this._runtime = keyboardRuntime;
      this._gamepadRuntime = gamepadRuntime;
      this._captureModal = captureModal;
      this._footerActions = Array.isArray(footerActions) ? footerActions : [];
      this._container = null;
      this._overlay = null;
      this._open = false;
      this._captureTarget = null;
      this._warningTimeout = null;
      this._unsubscribeStore = null;
      this._onGamepadChange = null;
    }
    /** @param {HTMLElement} container */
    mount(container) {
      injectStyles();
      this._container = container;
      this._overlay = document.createElement("div");
      this._overlay.className = "bm-overlay";
      this._overlay.setAttribute("role", "dialog");
      this._overlay.setAttribute("aria-modal", "true");
      this._overlay.setAttribute("aria-label", "Key Bindings");
      this._overlay.style.display = "none";
      this._overlay.addEventListener("click", (e) => {
        if (e.target === this._overlay) this.close();
      });
      this._overlay.addEventListener("keydown", (e) => {
        if (e.code === "Escape") {
          if (this._captureTarget) {
            e.preventDefault();
            e.stopPropagation();
            this._cancelCapture();
          } else {
            this.close();
          }
        }
      });
      container.appendChild(this._overlay);
      this._render();
      this._unsubscribeStore = this._store.subscribe(() => {
        if (this._open) this._updateBindButtons();
        this._onGamepadChange = () => {
          if (this._open) this._updateBindButtons();
        };
        if (typeof window !== "undefined") {
          window.addEventListener("bm-gamepad-connected", this._onGamepadChange);
          window.addEventListener("bm-gamepad-disconnected", this._onGamepadChange);
          window.addEventListener("bm-gamepad-profile-changed", this._onGamepadChange);
        }
      });
    }
    unmount() {
      this._unsubscribeStore?.();
      clearTimeout(this._warningTimeout);
      this._overlay?.remove();
      if (this._onGamepadChange && typeof window !== "undefined") {
        window.removeEventListener("bm-gamepad-connected", this._onGamepadChange);
        window.removeEventListener("bm-gamepad-disconnected", this._onGamepadChange);
        window.removeEventListener("bm-gamepad-profile-changed", this._onGamepadChange);
      }
      this._overlay = null;
      this._container = null;
    }
    open() {
      if (!this._overlay) return;
      this._render();
      this._overlay.style.display = "flex";
      this._open = true;
      this._runtime.setGameplaySuppressed(true);
      this._gamepadRuntime?.setGameplaySuppressed(true);
      this._overlay.querySelector(".bm-modal")?.focus();
    }
    close() {
      if (!this._overlay) return;
      this._cancelCapture();
      this._overlay.style.display = "none";
      this._open = false;
      this._runtime.setGameplaySuppressed(false);
      this._gamepadRuntime?.setGameplaySuppressed(false);
    }
    toggle() {
      if (this._open) this.close();
      else this.open();
    }
    isOpen() {
      return this._open;
    }
    /**
     * Full re-render of modal content (called on open, action registration, reset).
     * @public - intentionally accessible from bind-manager.js
     */
    refresh() {
      this._render();
    }
    // ── Private ──────────────────────────────────────────────────────────────────
    _render() {
      if (!this._overlay) return;
      const groups = this._registry.getGroups();
      this._overlay.innerHTML = `
      <div class="bm-modal" tabindex="-1">
        <div class="bm-modal-header">
          <h2 class="bm-modal-title">Key Bindings</h2>
          <button class="bm-close-btn" aria-label="Close">\u2715</button>
        </div>
        <div class="bm-modal-body">
          ${this._renderGamepadProfilePanel()}
          ${this._renderGroups(groups)}
        </div>
        <div class="bm-modal-footer">
          <div class="bm-conflict-warning bm-hidden" role="alert"></div>
          <div class="bm-footer-actions">
            ${this._renderFooterActions()}
            <button class="bm-reset-all-btn">Reset All</button>
          </div>
        </div>
      </div>
    `;
      this._overlay.querySelector(".bm-close-btn").addEventListener("click", () => this.close());
      this._overlay.querySelector(".bm-reset-all-btn").addEventListener("click", () => {
        if (this._captureTarget) return;
        this._store.resetAll();
        this._render();
      });
      for (const btn of this._overlay.querySelectorAll(".bm-footer-action-btn")) {
        btn.addEventListener("click", () => {
          if (this._captureTarget) return;
          const id = btn.dataset.footerActionId;
          const action = this._footerActions.find((entry) => entry?.id === id);
          action?.onClick?.();
        });
      }
      const profileSelect = this._overlay.querySelector(".bm-profile-select");
      if (profileSelect) {
        profileSelect.addEventListener("change", () => {
          const gamepadIndex = parseInt(profileSelect.dataset.gamepadIndex || "0", 10);
          const value = profileSelect.value;
          if (value === "__auto__") {
            this._gamepadRuntime?.clearProfileOverride(gamepadIndex);
          } else {
            this._gamepadRuntime?.setProfileOverride(gamepadIndex, _parseProfileOverrideValue(value));
          }
          this._render();
        });
      }
      const profileAutoBtn = this._overlay.querySelector(".bm-profile-auto-btn");
      if (profileAutoBtn) {
        profileAutoBtn.addEventListener("click", () => {
          const gamepadIndex = parseInt(profileAutoBtn.dataset.gamepadIndex || "0", 10);
          this._gamepadRuntime?.clearProfileOverride(gamepadIndex);
          this._render();
        });
      }
      for (const btn of this._overlay.querySelectorAll(".bm-bind-btn")) {
        btn.addEventListener("click", () => {
          if (this._captureTarget) return;
          const { actionId, slot, device } = btn.dataset;
          this._startCapture(actionId, parseInt(slot, 10), btn, device || "keyboard");
        });
      }
      for (const btn of this._overlay.querySelectorAll(".bm-clear-slot-btn")) {
        btn.addEventListener("click", () => {
          if (this._captureTarget) return;
          const { actionId, slot, device } = btn.dataset;
          this._store.clear(actionId, parseInt(slot, 10), device || "keyboard");
          this._updateBindButtons();
        });
      }
      for (const btn of this._overlay.querySelectorAll(".bm-action-reset-btn")) {
        btn.addEventListener("click", () => {
          if (this._captureTarget) return;
          this._store.reset(btn.dataset.actionId);
          this._render();
        });
      }
      if (this._captureTarget) {
        const { actionId, slot, device } = this._captureTarget;
        const btn = this._overlay.querySelector(
          `.bm-bind-btn[data-action-id="${CSS.escape(actionId)}"][data-slot="${slot}"][data-device="${device || "keyboard"}"]`
        );
        if (btn) {
          btn.classList.add("bm-capturing");
          btn.textContent = device === "gamepad" ? "Press a button\u2026" : "Press a key\u2026";
          this._captureTarget.buttonEl = btn;
        }
        this._setCaptureUiState(true, btn);
      }
    }
    /** Lightweight update that only rewrites button labels — avoids full DOM teardown. */
    _updateBindButtons() {
      if (!this._overlay) return;
      for (const btn of this._overlay.querySelectorAll(".bm-bind-btn")) {
        const { actionId, slot, device } = btn.dataset;
        if (this._captureTarget?.actionId === actionId && this._captureTarget?.slot === parseInt(slot, 10) && this._captureTarget?.device === device) continue;
        const bindings = this._store.get(actionId, device || "keyboard");
        const code = bindings?.[parseInt(slot, 10)] ?? null;
        btn.textContent = code ? device === "gamepad" ? this._getGamepadLabel(code) : getKeyLabel(code) : "\u2014";
        btn.classList.toggle("bm-unbound", !code);
      }
    }
    _renderGroups(groups) {
      if (groups.size === 0) {
        return '<p style="padding:20px;color:var(--bm-text-desc);text-align:center">No actions registered yet.</p>';
      }
      return [...groups.entries()].map(([name, actions]) => `
        <div class="bm-group">
          <div class="bm-group-title">${_esc(name)}</div>
          ${actions.map((a) => this._renderAction(a)).join("")}
        </div>
      `).join("");
    }
    _renderAction(action) {
      const kbBindings = this._store.get(action.id, "keyboard") ?? [];
      const gpBindings = this._store.get(action.id, "gamepad") ?? [];
      const kbSlots = Array.from({ length: action.slots }, (_, i) => {
        const code = kbBindings[i] ?? null;
        const label = code ? getKeyLabel(code) : "\u2014";
        const cls = code ? "bm-bind-btn" : "bm-bind-btn bm-unbound";
        return `
        <div class="bm-slot">
          <button class="${cls}" data-action-id="${_esc(action.id)}" data-slot="${i}" data-device="keyboard" title="Click to rebind">${_esc(label)}</button>
          <button class="bm-clear-slot-btn" data-action-id="${_esc(action.id)}" data-slot="${i}" data-device="keyboard" title="Clear" aria-label="Clear keyboard binding">\xD7</button>
        </div>`;
      });
      const gpSlots = Array.from({ length: action.gamepadSlots }, (_, i) => {
        const code = gpBindings[i] ?? null;
        const label = code ? this._getGamepadLabel(code) : "\u2014";
        const cls = code ? "bm-bind-btn" : "bm-bind-btn bm-unbound";
        return `
        <div class="bm-slot">
          <button class="${cls}" data-action-id="${_esc(action.id)}" data-slot="${i}" data-device="gamepad" title="Click to rebind">${_esc(label)}</button>
          <button class="bm-clear-slot-btn" data-action-id="${_esc(action.id)}" data-slot="${i}" data-device="gamepad" title="Clear" aria-label="Clear gamepad binding">\xD7</button>
        </div>`;
      });
      return `
      <div class="bm-action-row">
        <div class="bm-action-info">
          <div class="bm-action-label">${_esc(action.label)}</div>
          ${action.description ? `<div class="bm-action-desc">${_esc(action.description)}</div>` : ""}
        </div>
        <div class="bm-action-controls">
          <div class="bm-device-rows">
            <div class="bm-device-row">
              <span class="bm-device-badge bm-device-kbd" title="Keyboard">\u2328</span>
              <div class="bm-bind-slots">${kbSlots.join("")}</div>
            </div>
            <div class="bm-device-row">
              <span class="bm-device-badge bm-device-gp" title="Gamepad">\u2295</span>
              <div class="bm-bind-slots">${gpSlots.join("")}</div>
            </div>
          </div>
          <button class="bm-action-reset-btn" data-action-id="${_esc(action.id)}" title="Reset to default">\u21BA</button>
        </div>
      </div>`;
    }
    _renderGamepadProfilePanel() {
      const connected = this._gamepadRuntime?.getConnectedGamepads?.() ?? [];
      if (connected.length === 0) {
        return `
        <div class="bm-profile-panel bm-profile-panel-empty">
          <div class="bm-profile-summary">Gamepad profile: no controller connected.</div>
        </div>
      `;
      }
      const primaryGamepad = connected[0];
      const resolved = this._gamepadRuntime.getResolvedProfile(primaryGamepad.index);
      const override = this._gamepadRuntime.getProfileOverride(primaryGamepad.index);
      const options = this._gamepadRuntime.getAvailableProfileOptions(primaryGamepad.index);
      const selectedValue = override ? _serialiseProfileOverrideValue(override) : "__auto__";
      const sourceLabel = {
        manual: "Manual override",
        exact: "Exact match",
        family: "Family fallback",
        generic: "Generic fallback"
      }[resolved.source] ?? resolved.source;
      const exactOptions = options.exactProfiles.map((option) => `<option value="${_esc(_serialiseProfileOverrideValue(option))}" ${selectedValue === _serialiseProfileOverrideValue(option) ? "selected" : ""}>Exact: ${_esc(option.label)}</option>`).join("");
      const familyOptions = options.families.map((option) => `<option value="${_esc(_serialiseProfileOverrideValue(option))}" ${selectedValue === _serialiseProfileOverrideValue(option) ? "selected" : ""}>Family: ${_esc(option.label)}</option>`).join("");
      return `
      <div class="bm-profile-panel">
        <div class="bm-profile-summary">
          <strong>Gamepad profile:</strong> ${_esc(sourceLabel)}
          <span class="bm-profile-meta">${_esc(resolved.definition?.sourceName ?? resolved.family)}</span>
        </div>
        <div class="bm-profile-subtitle">${_esc(primaryGamepad.id)}</div>
        <div class="bm-profile-controls">
          <select class="bm-profile-select" data-gamepad-index="${primaryGamepad.index}">
            <option value="__auto__" ${selectedValue === "__auto__" ? "selected" : ""}>Auto detect</option>
            ${exactOptions}
            ${familyOptions}
          </select>
          <button class="bm-profile-auto-btn" data-gamepad-index="${primaryGamepad.index}" type="button">Auto</button>
        </div>
      </div>
    `;
    }
    _renderFooterActions() {
      if (!this._footerActions.length) return "";
      return this._footerActions.filter((action) => action && typeof action.id === "string" && typeof action.label === "string").map((action) => {
        const className = action.className ? ` bm-footer-action-btn--${_esc(action.className)}` : "";
        const title = action.title ? ` title="${_esc(action.title)}"` : "";
        return `<button class="bm-footer-action-btn${className}" data-footer-action-id="${_esc(action.id)}" type="button"${title}>${_esc(action.label)}</button>`;
      }).join("");
    }
    _startCapture(actionId, slot, buttonEl, device = "keyboard") {
      if (this._captureTarget) return;
      this._captureTarget = { actionId, slot, device, buttonEl };
      this._setCaptureUiState(true, buttonEl);
      buttonEl.classList.add("bm-capturing");
      if (device === "gamepad") {
        buttonEl.textContent = "Press a button\u2026";
        const connected = this._gamepadRuntime?.getConnectedGamepads() ?? [];
        if (!this._gamepadRuntime || connected.length === 0) {
          this._captureTarget = null;
          this._setCaptureUiState(false, null);
          buttonEl.classList.remove("bm-capturing");
          this._captureModal?.close();
          this._updateBindButtons();
          this._showWarning("No controller detected. Plug in a gamepad and try again.");
          return;
        }
        this._captureModal?.open({
          title: "Capture Gamepad Input",
          message: "Press the gamepad input to bind now.",
          detail: "This capture stays open until input is detected or Escape cancels it.",
          onCancel: () => this._cancelCapture()
        });
        this._gamepadRuntime.startCapture((code) => {
          this._captureModal?.close();
          this._captureTarget = null;
          this._setCaptureUiState(false, null);
          if (code === null) {
            this._updateBindButtons();
            return;
          }
          const result = this._store.set(actionId, slot, code, "gamepad");
          if (result.conflicts.length > 0) {
            this._showConflictWarning(result.conflicts, code, "gamepad");
          } else {
            this._hideConflictWarning();
          }
          this._updateBindButtons();
        });
      } else {
        buttonEl.textContent = "Press a key\u2026";
        this._captureModal?.open({
          title: "Capture Keyboard Input",
          message: "Press the key to bind now.",
          detail: "This capture stays open until a key is detected or Escape cancels it.",
          onCancel: () => this._cancelCapture()
        });
        this._runtime.startCapture((code) => {
          this._captureModal?.close();
          this._captureTarget = null;
          this._setCaptureUiState(false, null);
          if (code === null) {
            this._updateBindButtons();
            return;
          }
          const result = this._store.set(actionId, slot, code, "keyboard");
          if (result.conflicts.length > 0) {
            this._showConflictWarning(result.conflicts, code, "keyboard");
          } else {
            this._hideConflictWarning();
          }
          this._updateBindButtons();
        });
      }
    }
    _cancelCapture() {
      if (this._captureTarget) {
        if (this._captureTarget.device === "gamepad") {
          this._gamepadRuntime?.cancelCapture();
        } else {
          this._runtime.cancelCapture();
        }
        this._captureModal?.close();
        this._captureTarget = null;
        this._setCaptureUiState(false, null);
        this._updateBindButtons();
      }
    }
    _setCaptureUiState(capturing, activeButton) {
      if (!this._overlay) return;
      for (const btn of this._overlay.querySelectorAll(".bm-bind-btn")) {
        const isActive = activeButton != null && btn === activeButton;
        btn.disabled = capturing && !isActive;
        if (!capturing) btn.classList.remove("bm-capturing");
      }
      for (const btn of this._overlay.querySelectorAll(".bm-clear-slot-btn")) {
        btn.disabled = capturing;
      }
      for (const btn of this._overlay.querySelectorAll(".bm-action-reset-btn")) {
        btn.disabled = capturing;
      }
      const resetAllBtn = this._overlay.querySelector(".bm-reset-all-btn");
      if (resetAllBtn) resetAllBtn.disabled = capturing;
      for (const btn of this._overlay.querySelectorAll(".bm-footer-action-btn")) {
        btn.disabled = capturing;
      }
    }
    _showConflictWarning(conflicts, code, device = "keyboard") {
      const warningEl = this._overlay?.querySelector(".bm-conflict-warning");
      if (!warningEl) return;
      const names = conflicts.map((c) => {
        const action = this._registry.get(c.actionId);
        return action ? `"${action.label}"` : c.actionId;
      });
      const label = device === "gamepad" ? this._getGamepadLabel(code) : getKeyLabel(code);
      warningEl.textContent = `${label} is also bound to ${names.join(", ")} \u2014 both will be active.`;
      warningEl.classList.remove("bm-hidden");
      clearTimeout(this._warningTimeout);
      this._warningTimeout = setTimeout(() => warningEl.classList.add("bm-hidden"), 5e3);
    }
    _showWarning(message) {
      const warningEl = this._overlay?.querySelector(".bm-conflict-warning");
      if (!warningEl) return;
      warningEl.textContent = message;
      warningEl.classList.remove("bm-hidden");
      clearTimeout(this._warningTimeout);
      this._warningTimeout = setTimeout(() => warningEl.classList.add("bm-hidden"), 4e3);
    }
    _getGamepadLabel(code) {
      if (this._gamepadRuntime?.getLabelForCode) {
        return this._gamepadRuntime.getLabelForCode(code);
      }
      return getGamepadLabel(code, "generic");
    }
    _hideConflictWarning() {
      clearTimeout(this._warningTimeout);
      this._overlay?.querySelector(".bm-conflict-warning")?.classList.add("bm-hidden");
    }
  };
  function _esc(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function _serialiseProfileOverrideValue(override) {
    if (!override || typeof override !== "object") return "__auto__";
    if (override.type === "profile") return `profile:${override.key}`;
    if (override.type === "family") return `family:${override.family}`;
    return "__auto__";
  }
  function _parseProfileOverrideValue(value) {
    if (typeof value !== "string") return null;
    if (value.startsWith("profile:")) {
      return { type: "profile", key: value.slice("profile:".length) };
    }
    if (value.startsWith("family:")) {
      return { type: "family", family: value.slice("family:".length) };
    }
    return null;
  }

  // src/ui/capture-modal-controller.js
  var CaptureModalController = class {
    constructor() {
      this._container = null;
      this._overlay = null;
      this._titleEl = null;
      this._messageEl = null;
      this._detailEl = null;
      this._cancelBtn = null;
      this._open = false;
      this._onCancel = null;
      this._returnFocusEl = null;
      this._handleOverlayKeydown = this._handleOverlayKeydown.bind(this);
      this._handleCancelClick = this._handleCancelClick.bind(this);
    }
    /** @param {HTMLElement} container */
    mount(container) {
      if (this._overlay) return;
      injectStyles();
      this._container = container;
      this._overlay = document.createElement("div");
      this._overlay.className = "bm-capture-overlay";
      this._overlay.setAttribute("aria-hidden", "true");
      this._overlay.style.display = "none";
      this._overlay.innerHTML = `
      <div class="bm-capture-modal" role="dialog" aria-modal="true" aria-label="Capture Input" tabindex="-1">
        <div class="bm-capture-header">
          <h3 class="bm-capture-title">Capture Input</h3>
          <button class="bm-capture-cancel-btn" type="button">Cancel</button>
        </div>
        <div class="bm-capture-message">Press the input to bind now.</div>
        <div class="bm-capture-detail">Press Escape to cancel.</div>
      </div>
    `;
      this._titleEl = this._overlay.querySelector(".bm-capture-title");
      this._messageEl = this._overlay.querySelector(".bm-capture-message");
      this._detailEl = this._overlay.querySelector(".bm-capture-detail");
      this._cancelBtn = this._overlay.querySelector(".bm-capture-cancel-btn");
      this._overlay.addEventListener("keydown", this._handleOverlayKeydown);
      this._cancelBtn?.addEventListener("click", this._handleCancelClick);
      container.appendChild(this._overlay);
    }
    unmount() {
      this.close({ restoreFocus: false });
      this._cancelBtn?.removeEventListener("click", this._handleCancelClick);
      this._overlay?.removeEventListener("keydown", this._handleOverlayKeydown);
      this._overlay?.remove();
      this._overlay = null;
      this._container = null;
      this._titleEl = null;
      this._messageEl = null;
      this._detailEl = null;
      this._cancelBtn = null;
    }
    open(options = {}) {
      if (!this._overlay) return;
      this._returnFocusEl = /** @type {HTMLElement | null} */
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this._open = true;
      this._onCancel = typeof options.onCancel === "function" ? options.onCancel : null;
      this.update(options);
      this._overlay.style.display = "flex";
      this._overlay.setAttribute("aria-hidden", "false");
      this._overlay.querySelector(".bm-capture-modal")?.focus();
    }
    update(options = {}) {
      if (!this._overlay) return;
      if (typeof options.title === "string" && this._titleEl) this._titleEl.textContent = options.title;
      if (typeof options.message === "string" && this._messageEl) this._messageEl.textContent = options.message;
      if (this._detailEl) {
        const detail = typeof options.detail === "string" ? options.detail.trim() : "";
        this._detailEl.textContent = detail || "Press Escape to cancel.";
        this._detailEl.hidden = detail.length === 0;
      }
      if (typeof options.cancelLabel === "string" && this._cancelBtn) {
        this._cancelBtn.textContent = options.cancelLabel;
      }
    }
    close(options = {}) {
      if (!this._overlay) return;
      this._open = false;
      this._onCancel = null;
      this._overlay.style.display = "none";
      this._overlay.setAttribute("aria-hidden", "true");
      if (options.restoreFocus !== false && this._returnFocusEl?.isConnected) {
        this._returnFocusEl.focus();
      }
      this._returnFocusEl = null;
    }
    isOpen() {
      return this._open;
    }
    _handleOverlayKeydown(event) {
      if (event.code !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      this._onCancel?.();
    }
    _handleCancelClick() {
      this._onCancel?.();
    }
  };

  // src/ui/hints-controller.js
  var HintsController = class {
    /**
     * @param {import('../core/binding-store.js').BindingStore} bindingStore
     * @param {import('../core/action-registry.js').ActionRegistry} registry
     */
    constructor(bindingStore, registry, gamepadRuntime = null) {
      this._store = bindingStore;
      this._registry = registry;
      this._gamepadRuntime = gamepadRuntime;
      this._bar = null;
      this._visible = /* @__PURE__ */ new Set();
      this._unsubscribeStore = null;
      this._onGamepadChange = null;
    }
    /** @param {HTMLElement} container */
    mount(container) {
      injectStyles();
      this._bar = document.createElement("div");
      this._bar.className = "bm-hints";
      this._bar.style.display = "none";
      container.appendChild(this._bar);
      this._unsubscribeStore = this._store.subscribe(() => this._render());
      this._onGamepadChange = () => this._render();
      if (typeof window !== "undefined") {
        window.addEventListener("bm-gamepad-connected", this._onGamepadChange);
        window.addEventListener("bm-gamepad-disconnected", this._onGamepadChange);
        window.addEventListener("bm-gamepad-profile-changed", this._onGamepadChange);
      }
    }
    unmount() {
      this._unsubscribeStore?.();
      this._bar?.remove();
      if (this._onGamepadChange && typeof window !== "undefined") {
        window.removeEventListener("bm-gamepad-connected", this._onGamepadChange);
        window.removeEventListener("bm-gamepad-disconnected", this._onGamepadChange);
        window.removeEventListener("bm-gamepad-profile-changed", this._onGamepadChange);
      }
      this._bar = null;
    }
    /** Make a single action's hint visible. */
    show(actionId) {
      this._visible.add(actionId);
      this._render();
    }
    /** Hide a single action's hint. */
    hide(actionId) {
      this._visible.delete(actionId);
      this._render();
    }
    /**
     * Set visibility of a single action's hint.
     * @param {string} actionId
     * @param {boolean} visible
     */
    setVisible(actionId, visible) {
      if (visible) this.show(actionId);
      else this.hide(actionId);
    }
    /** Show hints for all registered actions. */
    showAll() {
      for (const action of this._registry.getAll()) {
        this._visible.add(action.id);
      }
      this._render();
    }
    /** Hide all hints. */
    hideAll() {
      this._visible.clear();
      this._render();
    }
    /**
     * Force a full re-render (called after new actions are registered).
     * @public
     */
    refresh() {
      this._render();
    }
    // ── Private ──────────────────────────────────────────────────────────────────
    _render() {
      if (!this._bar) return;
      const items = [];
      for (const actionId of this._visible) {
        const action = this._registry.get(actionId);
        if (!action) continue;
        const kbBindings = this._store.get(actionId, "keyboard") ?? [];
        const gpBindings = this._store.get(actionId, "gamepad") ?? [];
        const kbKeys = kbBindings.filter(Boolean).map(getKeyLabel);
        const gpKeys = gpBindings.filter(Boolean).map((code) => {
          if (this._gamepadRuntime?.getLabelForCode) {
            return this._gamepadRuntime.getLabelForCode(code);
          }
          return getGamepadLabel(code, "generic");
        });
        if (kbKeys.length === 0 && gpKeys.length === 0) continue;
        const kbHtml = kbKeys.map((k) => `<kbd class="bm-hint-key">${_esc2(k)}</kbd>`).join('<span class="bm-hint-sep">/</span>');
        const gpHtml = gpKeys.map((k) => `<kbd class="bm-hint-key bm-hint-gp-key">${_esc2(k)}</kbd>`).join('<span class="bm-hint-sep">/</span>');
        const keysHtml = [kbHtml, gpHtml].filter(Boolean).join('<span class="bm-hint-sep">\xB7</span>');
        items.push(`
        <div class="bm-hint-item">
          <span class="bm-hint-keys">${keysHtml}</span>
          <span class="bm-hint-label">${_esc2(action.label)}</span>
        </div>
      `);
      }
      this._bar.innerHTML = items.join("");
      this._bar.style.display = items.length > 0 ? "flex" : "none";
    }
  };
  function _esc2(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // src/input/controller_definitions/profiles/054c-0ce6.js
  var controllerDefinition = {
    "key": "054c-0ce6",
    "vendorId": "054c",
    "productId": "0ce6",
    "sourceName": "DualSense Wireless Controller",
    "sourceId": "054c-0ce6-DualSense Wireless Controller",
    "sourceButtons": 14,
    "sourceAxes": 12,
    "capturedAt": "2026-04-01T14:18:25.098Z",
    "profileHint": "dualsense",
    "family": "dualsense",
    "labels": {
      "GP_B1": "Circle",
      "GP_B2": "Square",
      "GP_B0": "Cross",
      "GP_B3": "Triangle",
      "GP_B4": "L1",
      "GP_B5": "R1",
      "GP_B6": "L2 (digital)",
      "GP_B7": "R2 (digital)",
      "GP_B8": "Create",
      "GP_B9": "Options",
      "GP_B10": "L3",
      "GP_B11": "R3",
      "GP_B12": "D-Pad Up",
      "GP_B13": "D-Pad Down",
      "GP_B14": "D-Pad Left",
      "GP_B15": "D-Pad Right",
      "GP_B16": "PS",
      "GP_A0N": "Left Stick Left",
      "GP_A0P": "Left Stick Right",
      "GP_A1N": "Left Stick Up",
      "GP_A1P": "Left Stick Down",
      "GP_A2N": "Right Stick Left",
      "GP_A2P": "Right Stick Right",
      "GP_A3N": "Right Stick Up",
      "GP_A3P": "Right Stick Down",
      "GP_B6A": "L2 (analog)",
      "GP_B7A": "R2 (analog)"
    },
    "mapping": {
      "GP_B1": {
        "kind": "button",
        "index": 2
      },
      "GP_B2": {
        "kind": "button",
        "index": 0
      },
      "GP_B0": {
        "kind": "button",
        "index": 1
      },
      "GP_B3": {
        "kind": "button",
        "index": 3
      },
      "GP_B4": {
        "kind": "button",
        "index": 4
      },
      "GP_B5": {
        "kind": "button",
        "index": 5
      },
      "GP_B6": {
        "kind": "button",
        "index": 6
      },
      "GP_B7": {
        "kind": "button",
        "index": 7
      },
      "GP_B8": {
        "kind": "button",
        "index": 8
      },
      "GP_B9": {
        "kind": "button",
        "index": 9
      },
      "GP_B10": {
        "kind": "button",
        "index": 10
      },
      "GP_B11": {
        "kind": "button",
        "index": 11
      },
      "GP_B12": {
        "kind": "hat",
        "index": 9,
        "value": -1,
        "tolerance": 0.2
      },
      "GP_B13": {
        "kind": "hat",
        "index": 9,
        "value": 0.142857,
        "tolerance": 0.2
      },
      "GP_B14": {
        "kind": "hat",
        "index": 9,
        "value": 0.714286,
        "tolerance": 0.2
      },
      "GP_B15": {
        "kind": "hat",
        "index": 9,
        "value": -0.428571,
        "tolerance": 0.2
      },
      "GP_B16": {
        "kind": "button",
        "index": 12
      },
      "GP_A0N": {
        "kind": "axis",
        "index": 0,
        "direction": "negative"
      },
      "GP_A0P": {
        "kind": "axis",
        "index": 0,
        "direction": "positive"
      },
      "GP_A1N": {
        "kind": "axis",
        "index": 1,
        "direction": "negative"
      },
      "GP_A1P": {
        "kind": "axis",
        "index": 1,
        "direction": "positive"
      },
      "GP_A2N": {
        "kind": "axis",
        "index": 2,
        "direction": "negative"
      },
      "GP_A2P": {
        "kind": "axis",
        "index": 2,
        "direction": "positive"
      },
      "GP_A3N": {
        "kind": "axis",
        "index": 5,
        "direction": "negative"
      },
      "GP_A3P": {
        "kind": "axis",
        "index": 5,
        "direction": "positive"
      },
      "GP_B6A": {
        "kind": "axis",
        "index": 3,
        "direction": "positive"
      },
      "GP_B7A": {
        "kind": "axis",
        "index": 4,
        "direction": "positive"
      }
    }
  };
  var c_0ce6_default = controllerDefinition;

  // src/input/controller_definitions/index.js
  var controllerProfiles = {
    "054c-0ce6": c_0ce6_default
  };
  function getControllerProfiles() {
    return controllerProfiles;
  }
  function getControllerProfile(key) {
    if (typeof key !== "string") return null;
    return controllerProfiles[key.toLowerCase()] ?? null;
  }
  function findControllerProfilesByFamily(family) {
    const f = typeof family === "string" ? family.toLowerCase() : null;
    if (!f) return [];
    return Object.values(controllerProfiles).filter((profile) => {
      if (!profile) return false;
      const candidate = typeof profile.family === "string" ? profile.family : profile.profileHint;
      return typeof candidate === "string" && candidate.toLowerCase() === f;
    });
  }
  function findControllerProfile(vendorId, productId) {
    const v = typeof vendorId === "string" ? vendorId.toLowerCase() : null;
    const p = typeof productId === "string" ? productId.toLowerCase() : null;
    if (!v) return null;
    const exactKey = p ? `${v}-${p}` : null;
    if (exactKey && controllerProfiles[exactKey]) return controllerProfiles[exactKey];
    let vendorFallback = null;
    for (const profile of Object.values(controllerProfiles)) {
      if (!profile || profile.vendorId !== v) continue;
      if (!vendorFallback) vendorFallback = profile;
      if (p && profile.productId === p) return profile;
    }
    return vendorFallback;
  }
  function findControllerProfileByGamepadId(gamepadId) {
    if (!gamepadId || typeof gamepadId !== "string") return null;
    const m = gamepadId.match(/^([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-/);
    if (!m) return null;
    return findControllerProfile(m[1], m[2]);
  }

  // src/input/gamepad-profile-resolver.js
  function normaliseFamily(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim().toLowerCase();
    return trimmed || null;
  }
  function getGamepadIdentityKey(gamepadId) {
    if (typeof gamepadId !== "string") return null;
    const trimmed = gamepadId.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-/);
    if (match) {
      return `${match[1].toLowerCase()}-${match[2].toLowerCase()}`;
    }
    return `id:${trimmed.toLowerCase()}`;
  }
  function normaliseGamepadProfileOverride(override) {
    if (!override || typeof override !== "object") return null;
    if (override.type === "profile" && typeof override.key === "string" && override.key.trim()) {
      return {
        type: "profile",
        key: override.key.trim().toLowerCase()
      };
    }
    if (override.type === "family") {
      const family = normaliseFamily(override.family);
      if (!family) return null;
      return {
        type: "family",
        family
      };
    }
    return null;
  }
  function getControllerFamily(profile, gamepadId = null) {
    return normaliseFamily(profile?.family) ?? normaliseFamily(profile?.profileHint) ?? detectGamepadProfile(gamepadId) ?? "generic";
  }
  function resolveGamepadProfile(gamepadId, options = {}) {
    const override = normaliseGamepadProfileOverride(options.override ?? null);
    if (override?.type === "profile") {
      const definition = getControllerProfile(override.key);
      if (definition) {
        const family = getControllerFamily(definition, gamepadId);
        return {
          source: "manual",
          family,
          profileHint: definition.profileHint ?? family,
          profileKey: definition.key ?? null,
          definition,
          override,
          gamepadId: typeof gamepadId === "string" ? gamepadId : null
        };
      }
    }
    if (override?.type === "family") {
      return {
        source: "manual",
        family: override.family,
        profileHint: override.family,
        profileKey: null,
        definition: null,
        override,
        gamepadId: typeof gamepadId === "string" ? gamepadId : null
      };
    }
    if (typeof gamepadId === "string" && gamepadId.trim()) {
      const definition = findControllerProfileByGamepadId(gamepadId);
      if (definition) {
        const family2 = getControllerFamily(definition, gamepadId);
        return {
          source: "exact",
          family: family2,
          profileHint: definition.profileHint ?? family2,
          profileKey: definition.key ?? null,
          definition,
          override: null,
          gamepadId
        };
      }
      const family = detectGamepadProfile(gamepadId);
      if (family !== "generic") {
        return {
          source: "family",
          family,
          profileHint: family,
          profileKey: null,
          definition: null,
          override: null,
          gamepadId
        };
      }
    }
    return {
      source: "generic",
      family: "generic",
      profileHint: "generic",
      profileKey: null,
      definition: null,
      override: null,
      gamepadId: typeof gamepadId === "string" ? gamepadId : null
    };
  }
  function getAvailableGamepadProfileOptions(gamepadId) {
    const allProfiles = Object.values(getControllerProfiles());
    const autoResolved = resolveGamepadProfile(gamepadId);
    const detectedFamily = autoResolved.family !== "generic" ? autoResolved.family : null;
    const familyProfiles = detectedFamily ? findControllerProfilesByFamily(detectedFamily) : [];
    const exactProfiles = (familyProfiles.length > 0 ? familyProfiles : allProfiles).map((profile) => ({
      type: "profile",
      key: profile.key,
      label: profile.sourceName ?? profile.key,
      family: getControllerFamily(profile, gamepadId)
    })).sort((a, b) => a.label.localeCompare(b.label));
    const familySet = /* @__PURE__ */ new Set(["generic", ...Object.keys(GAMEPAD_PROFILES)]);
    for (const profile of allProfiles) {
      const family = getControllerFamily(profile, gamepadId);
      if (family) familySet.add(family);
    }
    const families = [...familySet].filter((family) => family !== "generic").sort((a, b) => a.localeCompare(b)).map((family) => ({
      type: "family",
      family,
      label: family
    }));
    return {
      exactProfiles,
      families,
      autoResolved
    };
  }
  function getResolvedGamepadLabel(code, resolvedProfile) {
    if (!code) return "\u2014";
    const exactLabel = resolvedProfile?.definition?.labels?.[code];
    if (typeof exactLabel === "string" && exactLabel.trim()) {
      return exactLabel;
    }
    const family = normaliseFamily(resolvedProfile?.family) ?? "generic";
    const fallbackFamily = GAMEPAD_PROFILES[family] ? family : "generic";
    return getGamepadLabel(code, fallbackFamily);
  }

  // src/input/gamepad-runtime.js
  var GP_BUTTON_COUNT = 17;
  var GP_AXIS_COUNT = 4;
  function deepClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }
  var GamepadRuntime = class {
    /**
     * @param {import('../core/binding-store.js').BindingStore} bindingStore
     * @param {import('../core/action-registry.js').ActionRegistry} registry
     * @param {{ deadband?: number, analogThreshold?: number }} [options]
     */
    constructor(bindingStore, registry, options = {}) {
      this._store = bindingStore;
      this._registry = registry;
      this._deadband = options.deadband ?? 0.12;
      this._analogThreshold = options.analogThreshold ?? 0.5;
      this._onProfileOverridesChange = typeof options.onProfileOverridesChange === "function" ? options.onProfileOverridesChange : null;
      this._curState = /* @__PURE__ */ new Map();
      this._resolvedProfileByGamepadIndex = /* @__PURE__ */ new Map();
      this._profileOverrides = new Map(Object.entries(options.profileOverrides ?? {}));
      this._profileDefinitionOverrides = /* @__PURE__ */ new Map();
      this._compiledProfileCache = /* @__PURE__ */ new Map();
      this._listeners = /* @__PURE__ */ new Map();
      this._anyListeners = /* @__PURE__ */ new Set();
      this._gameplaySuppressed = false;
      this._captureCallback = null;
      this._rafId = null;
      this._boundPoll = this._poll.bind(this);
      this._onConnect = this._handleConnect.bind(this);
      this._onDisconnect = this._handleDisconnect.bind(this);
    }
    /** Begin polling and listening for gamepad connect/disconnect events. */
    start() {
      if (typeof window === "undefined") return;
      window.addEventListener("gamepadconnected", this._onConnect);
      window.addEventListener("gamepaddisconnected", this._onDisconnect);
      this._rafId = requestAnimationFrame(this._boundPoll);
    }
    /** Stop polling and unregister all window listeners. */
    stop() {
      if (typeof window === "undefined") return;
      window.removeEventListener("gamepadconnected", this._onConnect);
      window.removeEventListener("gamepaddisconnected", this._onDisconnect);
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
      if (!this._listeners.has(actionId)) this._listeners.set(actionId, /* @__PURE__ */ new Set());
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
      if (code.startsWith("GP_B")) {
        const idx = parseInt(code.slice(4), 10);
        for (const [, state] of this._curState) {
          if (state.buttons[idx] === true) return true;
        }
      } else {
        const match = code.match(/^GP_A(\d)(N|P)$/);
        if (!match) return false;
        const axisIdx = parseInt(match[1], 10);
        const neg = match[2] === "N";
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
      if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return [];
      return [...navigator.getGamepads()].filter(Boolean).map((g) => {
        const resolvedProfile = this._getResolvedProfileForGamepad(g);
        return {
          index: g.index,
          id: g.id,
          profile: resolvedProfile.family,
          resolvedProfile
        };
      });
    }
    /**
     * Get the detected profile name ('xbox' | 'dualsense' | 'generic') for a gamepad.
     * @param {number} [gamepadIndex=0]
     * @returns {string}
     */
    getActiveProfile(gamepadIndex = 0) {
      return this.getResolvedProfile(gamepadIndex).family;
    }
    /**
     * Get the resolved profile state for a connected gamepad.
     * @param {number} [gamepadIndex=0]
     * @returns {{ source: string, family: string, profileHint: string, profileKey: string | null, definition: any | null, gamepadId: string | null }}
     */
    getResolvedProfile(gamepadIndex = 0) {
      if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return resolveGamepadProfile(null);
      const gp = [...navigator.getGamepads()].find((g) => g && g.index === gamepadIndex);
      if (!gp) return resolveGamepadProfile(null);
      return this._getResolvedProfileForGamepad(gp);
    }
    /**
     * Resolve a display label for a GP_* code based on the active gamepad profile.
     * @param {string | null} code
     * @param {number} [gamepadIndex=0]
     * @returns {string}
     */
    getLabelForCode(code, gamepadIndex = 0) {
      return getResolvedGamepadLabel(code, this.getResolvedProfile(gamepadIndex));
    }
    /**
     * Get available profile override options for the connected gamepad.
     * @param {number} [gamepadIndex=0]
     * @returns {{ exactProfiles: Array<{ type: string, key: string, label: string, family: string }>, families: Array<{ type: string, family: string, label: string }>, autoResolved: any }}
     */
    getAvailableProfileOptions(gamepadIndex = 0) {
      if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return getAvailableGamepadProfileOptions(null);
      const gp = [...navigator.getGamepads()].find((g) => g && g.index === gamepadIndex);
      return getAvailableGamepadProfileOptions(gp?.id ?? null);
    }
    /**
     * @param {number} [gamepadIndex=0]
     * @returns {{ type: 'profile', key: string } | { type: 'family', family: string } | null}
     */
    getProfileOverride(gamepadIndex = 0) {
      if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return null;
      const gp = [...navigator.getGamepads()].find((g) => g && g.index === gamepadIndex);
      const identityKey = getGamepadIdentityKey(gp?.id ?? null);
      return identityKey ? this._profileOverrides.get(identityKey) ?? null : null;
    }
    /**
     * @param {number} [gamepadIndex=0]
     * @param {{ type: 'profile', key: string } | { type: 'family', family: string } | null} override
     * @returns {boolean}
     */
    setProfileOverride(gamepadIndex = 0, override = null) {
      if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return false;
      const gp = [...navigator.getGamepads()].find((g) => g && g.index === gamepadIndex);
      const identityKey = getGamepadIdentityKey(gp?.id ?? null);
      if (!gp || !identityKey) return false;
      const normalised = normaliseGamepadProfileOverride(override);
      if (!normalised) {
        return this.clearProfileOverride(gamepadIndex);
      }
      this._profileOverrides.set(identityKey, normalised);
      this._resolvedProfileByGamepadIndex.delete(gp.index);
      this._emitProfileChange(gp.index, gp.id);
      return true;
    }
    /**
     * @param {number} [gamepadIndex=0]
     * @returns {boolean}
     */
    clearProfileOverride(gamepadIndex = 0) {
      if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return false;
      const gp = [...navigator.getGamepads()].find((g) => g && g.index === gamepadIndex);
      const identityKey = getGamepadIdentityKey(gp?.id ?? null);
      if (!gp || !identityKey) return false;
      const deleted = this._profileOverrides.delete(identityKey);
      this._resolvedProfileByGamepadIndex.delete(gp.index);
      this._emitProfileChange(gp.index, gp.id);
      return deleted;
    }
    /**
     * Set or replace a single logical mapping entry for the active gamepad profile in memory.
     * @param {number} [gamepadIndex=0]
     * @param {string} code
     * @param {{ kind: 'button' | 'axis' | 'hat', index: number, direction?: 'negative' | 'positive', value?: number, tolerance?: number } | null} entry
     * @param {{ label?: string | null }} [options]
     * @returns {boolean}
     */
    setProfileMappingEntry(gamepadIndex = 0, code, entry, options = {}) {
      if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return false;
      const gp = [...navigator.getGamepads()].find((g) => g && g.index === gamepadIndex);
      const identityKey = getGamepadIdentityKey(gp?.id ?? null);
      if (!gp || !identityKey || typeof code !== "string" || !code.trim()) return false;
      const resolved = this._getResolvedProfileForGamepad(gp);
      const editable = this._createEditableDefinition(gp, resolved);
      if (!editable.mapping || typeof editable.mapping !== "object") editable.mapping = {};
      if (!editable.labels || typeof editable.labels !== "object") editable.labels = {};
      if (!entry || typeof entry !== "object") {
        delete editable.mapping[code];
      } else {
        const normalised = this._normaliseMappingEntry(entry);
        if (!normalised) return false;
        if (normalised.kind === "hat") {
          editable.mapping[code] = {
            kind: "hat",
            index: normalised.index,
            value: normalised.value,
            tolerance: normalised.tolerance
          };
        } else {
          editable.mapping[code] = {
            kind: normalised.kind,
            index: normalised.index,
            direction: normalised.direction
          };
        }
      }
      if (typeof options.label === "string" && options.label.trim()) {
        editable.labels[code] = options.label.trim();
      }
      editable.capturedAt = (/* @__PURE__ */ new Date()).toISOString();
      this._profileDefinitionOverrides.set(identityKey, editable);
      this._resolvedProfileByGamepadIndex.delete(gp.index);
      this._compiledProfileCache.clear();
      this._emitProfileChange(gp.index, gp.id);
      return true;
    }
    /**
     * Remove a logical mapping entry from the active gamepad profile in memory.
     * @param {number} [gamepadIndex=0]
     * @param {string} code
     * @returns {boolean}
     */
    removeProfileMappingEntry(gamepadIndex = 0, code) {
      return this.setProfileMappingEntry(gamepadIndex, code, null);
    }
    /**
     * Get the current in-memory profile definition for a connected gamepad.
     * @param {number} [gamepadIndex=0]
     * @returns {any | null}
     */
    getProfileDefinition(gamepadIndex = 0) {
      if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return null;
      const gp = [...navigator.getGamepads()].find((g) => g && g.index === gamepadIndex);
      if (!gp) return null;
      const resolved = this._getResolvedProfileForGamepad(gp);
      return resolved?.definition ? deepClone(resolved.definition) : null;
    }
    // ── Private ───────────────────────────────────────────────────────────────
    _handleConnect(e) {
      this._resolvedProfileByGamepadIndex.set(
        e.gamepad.index,
        resolveGamepadProfile(e.gamepad.id, { override: this._getOverrideForGamepadId(e.gamepad.id) })
      );
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("bm-gamepad-connected", { detail: e.gamepad }));
      }
    }
    _handleDisconnect(e) {
      this._curState.delete(e.gamepad.index);
      this._resolvedProfileByGamepadIndex.delete(e.gamepad.index);
      if (this._captureCallback) {
        const cb = this._captureCallback;
        this._captureCallback = null;
        cb(null);
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("bm-gamepad-disconnected", { detail: e.gamepad }));
      }
    }
    _poll() {
      this._rafId = requestAnimationFrame(this._boundPoll);
      if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return;
      const gamepads = navigator.getGamepads();
      for (const gamepad of gamepads) {
        if (gamepad && gamepad.connected) this._processGamepad(gamepad);
      }
    }
    _processGamepad(gamepad) {
      const prev = this._curState.get(gamepad.index) ?? {
        buttons: new Array(GP_BUTTON_COUNT).fill(false),
        axes: new Array(GP_AXIS_COUNT).fill(0)
      };
      const cur = this._snapshotLogicalState(gamepad);
      this._curState.set(gamepad.index, cur);
      if (this._captureCallback) {
        const detected = this._detectCapture(gamepad, prev, cur);
        if (detected != null) {
          const cb = this._captureCallback;
          this._captureCallback = null;
          this._triggerHaptic(gamepad);
          this._curState.set(gamepad.index, prev);
          cb(detected);
        }
        return;
      }
      if (this._gameplaySuppressed) return;
      const btnLen = Math.min(cur.buttons.length, GP_BUTTON_COUNT);
      for (let i = 0; i < btnLen; i++) {
        const wasPressed = prev.buttons[i] ?? false;
        const isNowPressed = cur.buttons[i] ?? false;
        const code = `GP_B${i}`;
        if (!wasPressed && isNowPressed) this._dispatch(gamepad.index, code, "pressed", 1);
        else if (wasPressed && isNowPressed) this._dispatch(gamepad.index, code, "held", 1);
        else if (wasPressed && !isNowPressed) this._dispatch(gamepad.index, code, "released", 0);
      }
      const axisLen = Math.min(cur.axes.length, GP_AXIS_COUNT);
      for (let a = 0; a < axisLen; a++) {
        const prevVal = prev.axes[a] ?? 0;
        const curVal = cur.axes[a] ?? 0;
        const thr = this._analogThreshold;
        if (Math.abs(curVal) > this._deadband) {
          this._dispatchAnalog(gamepad.index, a, curVal);
        }
        const codeN = `GP_A${a}N`;
        const prevN = prevVal < -thr;
        const curN = curVal < -thr;
        if (!prevN && curN) this._dispatch(gamepad.index, codeN, "pressed", Math.abs(curVal));
        else if (prevN && curN) this._dispatch(gamepad.index, codeN, "held", Math.abs(curVal));
        else if (prevN && !curN) this._dispatch(gamepad.index, codeN, "released", 0);
        const codeP = `GP_A${a}P`;
        const prevP = prevVal > thr;
        const curP = curVal > thr;
        if (!prevP && curP) this._dispatch(gamepad.index, codeP, "pressed", curVal);
        else if (prevP && curP) this._dispatch(gamepad.index, codeP, "held", curVal);
        else if (prevP && !curP) this._dispatch(gamepad.index, codeP, "released", 0);
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
          if (Math.abs(prev.axes[a] ?? 0) <= this._analogThreshold) {
            return val < 0 ? `GP_A${a}N` : `GP_A${a}P`;
          }
        }
      }
      return null;
    }
    /**
     * Build a canonical logical state (GP_B0..GP_B16 + GP_A0..GP_A3) from raw
     * physical gamepad hardware state, using a vendor/product mapping when known.
     * @param {Gamepad} gamepad
     * @returns {{ buttons: boolean[], axes: number[] }}
     * @private
     */
    _snapshotLogicalState(gamepad) {
      const resolvedProfile = this._getResolvedProfileForGamepad(gamepad);
      const compiled = this._compileControllerMapping(resolvedProfile?.definition ?? null);
      if (!compiled) {
        const buttons = new Array(GP_BUTTON_COUNT).fill(false);
        for (let i = 0; i < gamepad.buttons.length && i < GP_BUTTON_COUNT; i++) {
          const btn = gamepad.buttons[i];
          const value = typeof btn?.value === "number" ? btn.value : btn?.pressed ? 1 : 0;
          buttons[i] = btn?.pressed === true || value > 0.5;
        }
        return {
          buttons,
          axes: [...gamepad.axes].slice(0, GP_AXIS_COUNT)
        };
      }
      const logicalButtons = new Array(GP_BUTTON_COUNT).fill(false);
      const logicalAxes = new Array(GP_AXIS_COUNT).fill(0);
      for (let i = 0; i < GP_BUTTON_COUNT; i++) {
        const entry = compiled.buttons[i];
        if (!entry) continue;
        if (entry.kind === "hat") {
          logicalButtons[i] = this._isHatDirectionActive(gamepad, entry);
          continue;
        }
        const magnitude = this._readDirectionalMagnitude(gamepad, entry);
        logicalButtons[i] = magnitude > this._analogThreshold;
      }
      for (let a = 0; a < GP_AXIS_COUNT; a++) {
        const nEntry = compiled.axesNeg[a];
        const pEntry = compiled.axesPos[a];
        const neg = nEntry ? this._readDirectionalMagnitude(gamepad, nEntry) : 0;
        const pos = pEntry ? this._readDirectionalMagnitude(gamepad, pEntry) : 0;
        logicalAxes[a] = Math.max(-1, Math.min(1, pos - neg));
      }
      return {
        buttons: logicalButtons,
        axes: logicalAxes
      };
    }
    /**
     * @param {Gamepad} gamepad
     * @returns {any | null}
     * @private
     */
    _getResolvedProfileForGamepad(gamepad) {
      if (this._resolvedProfileByGamepadIndex.has(gamepad.index)) {
        return this._resolvedProfileByGamepadIndex.get(gamepad.index);
      }
      const resolvedProfile = resolveGamepadProfile(gamepad.id, {
        override: this._getOverrideForGamepadId(gamepad.id)
      });
      const identityKey = getGamepadIdentityKey(gamepad.id);
      const editedDefinition = identityKey ? this._profileDefinitionOverrides.get(identityKey) : null;
      const finalResolved = editedDefinition ? {
        ...resolvedProfile,
        source: "memory-edit",
        definition: deepClone(editedDefinition),
        profileKey: editedDefinition.key ?? resolvedProfile.profileKey ?? null,
        profileHint: editedDefinition.profileHint ?? resolvedProfile.profileHint,
        family: editedDefinition.family ?? resolvedProfile.family
      } : resolvedProfile;
      this._resolvedProfileByGamepadIndex.set(gamepad.index, finalResolved);
      return finalResolved;
    }
    _getOverrideForGamepadId(gamepadId) {
      const identityKey = getGamepadIdentityKey(gamepadId);
      return identityKey ? this._profileOverrides.get(identityKey) ?? null : null;
    }
    _emitProfileChange(gamepadIndex, gamepadId) {
      const payload = Object.fromEntries(this._profileOverrides);
      this._onProfileOverridesChange?.(payload);
      if (typeof window !== "undefined") {
        const identityKey = getGamepadIdentityKey(gamepadId);
        const editedDefinition = identityKey ? this._profileDefinitionOverrides.get(identityKey) : null;
        const resolved = resolveGamepadProfile(gamepadId, {
          override: this._getOverrideForGamepadId(gamepadId)
        });
        const resolvedProfile = editedDefinition ? {
          ...resolved,
          source: "memory-edit",
          definition: deepClone(editedDefinition),
          profileKey: editedDefinition.key ?? resolved.profileKey ?? null,
          profileHint: editedDefinition.profileHint ?? resolved.profileHint,
          family: editedDefinition.family ?? resolved.family
        } : resolved;
        window.dispatchEvent(new CustomEvent("bm-gamepad-profile-changed", {
          detail: {
            gamepadIndex,
            gamepadId,
            resolvedProfile
          }
        }));
      }
    }
    _createEditableDefinition(gamepad, resolvedProfile) {
      const identityKey = getGamepadIdentityKey(gamepad?.id ?? null);
      const existing = identityKey ? this._profileDefinitionOverrides.get(identityKey) : null;
      if (existing) return deepClone(existing);
      const base = deepClone(resolvedProfile?.definition) || {};
      const idMatch = typeof gamepad?.id === "string" ? gamepad.id.match(/^([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-(.+)$/) : null;
      const vendorId = idMatch?.[1]?.toLowerCase() ?? null;
      const productId = idMatch?.[2]?.toLowerCase() ?? null;
      return {
        key: base.key ?? (vendorId && productId ? `${vendorId}-${productId}` : identityKey ?? "custom-profile"),
        vendorId: base.vendorId ?? vendorId,
        productId: base.productId ?? productId,
        sourceName: base.sourceName ?? (typeof gamepad?.id === "string" ? gamepad.id : "Unknown Controller"),
        sourceId: base.sourceId ?? (typeof gamepad?.id === "string" ? gamepad.id : null),
        sourceButtons: base.sourceButtons ?? (gamepad?.buttons?.length ?? null),
        sourceAxes: base.sourceAxes ?? (gamepad?.axes?.length ?? null),
        capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
        profileHint: base.profileHint ?? resolvedProfile?.profileHint ?? resolvedProfile?.family ?? "generic",
        family: base.family ?? resolvedProfile?.family ?? "generic",
        labels: base.labels && typeof base.labels === "object" ? base.labels : {},
        mapping: base.mapping && typeof base.mapping === "object" ? base.mapping : {}
      };
    }
    /**
     * @param {Gamepad} gamepad
     * @returns {any | null}
     * @private
     */
    _getControllerProfile(gamepad) {
      return this._getResolvedProfileForGamepad(gamepad)?.definition ?? null;
    }
    /**
     * Convert a controller definition mapping object into fast lookup arrays.
     * @param {any | null} profile
     * @returns {CompiledControllerMapping | null}
     * @private
     */
    _compileControllerMapping(profile) {
      if (!profile || typeof profile !== "object" || !profile.mapping) return null;
      const key = `${profile.vendorId ?? "unknown"}-${profile.productId ?? "unknown"}:${JSON.stringify(profile.mapping)}`;
      if (this._compiledProfileCache.has(key)) {
        return this._compiledProfileCache.get(key);
      }
      const compiled = {
        buttons: new Array(GP_BUTTON_COUNT).fill(null),
        axesNeg: new Array(GP_AXIS_COUNT).fill(null),
        axesPos: new Array(GP_AXIS_COUNT).fill(null)
      };
      for (let i = 0; i < GP_BUTTON_COUNT; i++) {
        const code = `GP_B${i}`;
        const entry = this._normaliseMappingEntry(profile.mapping[code]);
        if (entry) compiled.buttons[i] = entry;
      }
      for (let a = 0; a < GP_AXIS_COUNT; a++) {
        const codeN = `GP_A${a}N`;
        const codeP = `GP_A${a}P`;
        const entryN = this._normaliseMappingEntry(profile.mapping[codeN]);
        const entryP = this._normaliseMappingEntry(profile.mapping[codeP]);
        if (entryN) compiled.axesNeg[a] = entryN;
        if (entryP) compiled.axesPos[a] = entryP;
      }
      this._compiledProfileCache.set(key, compiled);
      return compiled;
    }
    /**
     * @param {any} entry
     * @returns {CompiledInputMappingEntry | null}
     * @private
     */
    _normaliseMappingEntry(entry) {
      if (!entry || typeof entry !== "object") return null;
      if (entry.kind !== "button" && entry.kind !== "axis" && entry.kind !== "hat" || !Number.isInteger(entry.index)) return null;
      if (entry.index < 0) return null;
      if (entry.kind === "hat") {
        if (typeof entry.value !== "number" || !Number.isFinite(entry.value)) return null;
        const tolerance = typeof entry.tolerance === "number" && Number.isFinite(entry.tolerance) && entry.tolerance > 0 ? entry.tolerance : 0.2;
        return {
          kind: "hat",
          index: entry.index,
          direction: "positive",
          value: entry.value,
          tolerance
        };
      }
      return {
        kind: entry.kind,
        index: entry.index,
        direction: entry.direction === "negative" ? "negative" : "positive"
      };
    }
    /**
     * Read activation magnitude [0, 1+] for a mapped physical input entry.
     * @param {Gamepad} gamepad
     * @param {CompiledInputMappingEntry} entry
     * @returns {number}
     * @private
     */
    _readDirectionalMagnitude(gamepad, entry) {
      if (entry.kind === "hat") {
        return this._isHatDirectionActive(gamepad, entry) ? 1 : 0;
      }
      if (entry.kind === "button") {
        const btn = gamepad.buttons?.[entry.index];
        if (!btn) return 0;
        const value = typeof btn.value === "number" ? btn.value : btn.pressed ? 1 : 0;
        return Math.max(0, value);
      }
      const raw = gamepad.axes?.[entry.index] ?? 0;
      if (entry.direction === "negative") return Math.max(0, -raw);
      return Math.max(0, raw);
    }
    /**
     * @param {Gamepad} gamepad
     * @param {CompiledInputMappingEntry} entry
     * @returns {boolean}
     * @private
     */
    _isHatDirectionActive(gamepad, entry) {
      const raw = gamepad.axes?.[entry.index];
      if (typeof raw !== "number" || !Number.isFinite(raw)) return false;
      const tolerance = typeof entry.tolerance === "number" ? entry.tolerance : 0.2;
      return Math.abs(raw - entry.value) <= tolerance;
    }
    /**
     * Resolve the code to bound actions and fire digital events.
     * Respects action.playerIndex (null = any controller).
     * @private
     */
    _dispatch(gamepadIndex, code, type, value) {
      const actionIds = this._store.getActionsByCode(code, "gamepad");
      for (const actionId of actionIds) {
        const action = this._registry.get(actionId);
        if (!action) continue;
        if (action.playerIndex !== null && action.playerIndex !== gamepadIndex) continue;
        const event = { type, actionId, code, value, device: "gamepad", gamepadIndex };
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
      const seenActions = /* @__PURE__ */ new Set();
      for (const code of codes) {
        for (const actionId of this._store.getActionsByCode(code, "gamepad")) {
          if (seenActions.has(actionId)) continue;
          seenActions.add(actionId);
          const action = this._registry.get(actionId);
          if (!action || !action.analog) continue;
          if (action.playerIndex !== null && action.playerIndex !== gamepadIndex) continue;
          const event = { type: "analog", actionId, axisIndex, value, device: "gamepad", gamepadIndex };
          this._fire(actionId, event);
        }
      }
    }
    /** @private */
    _fire(actionId, event) {
      for (const fn of this._listeners.get(actionId) ?? []) {
        try {
          fn(event);
        } catch (err) {
          console.error("[BindManager] GamepadRuntime listener threw:", err);
        }
      }
      for (const fn of this._anyListeners) {
        try {
          fn(event);
        } catch (err) {
          console.error("[BindManager] GamepadRuntime anyListener threw:", err);
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
        if (typeof gamepad.vibrationActuator?.playEffect === "function") {
          gamepad.vibrationActuator.playEffect("dual-rumble", {
            startDelay: 0,
            duration: 80,
            weakMagnitude: 0.3,
            strongMagnitude: 0.3
          }).catch(() => {
          });
        }
      } catch {
      }
    }
  };

  // src/core/bind-manager.js
  function createBindManager(options = {}) {
    const {
      namespace = "default",
      debug = false,
      debugKey = "F5",
      container = null,
      storage = null,
      footerActions = []
    } = options;
    const deadband = options.deadband ?? 0.12;
    const analogThreshold = options.analogThreshold ?? 0.5;
    const registry = new ActionRegistry();
    const storageAdapter = storage ?? new LocalStorageAdapter(namespace);
    const store = new BindingStore(registry);
    store.init(storageAdapter.load());
    const savedProfileOverrides = typeof storageAdapter.loadGamepadProfileOverrides === "function" ? storageAdapter.loadGamepadProfileOverrides() : {};
    const runtime = new KeyboardRuntime(store);
    const gamepadRuntime = new GamepadRuntime(store, registry, {
      deadband,
      analogThreshold,
      profileOverrides: savedProfileOverrides,
      onProfileOverridesChange: (overrides) => {
        if (typeof storageAdapter.saveGamepadProfileOverrides === "function") {
          storageAdapter.saveGamepadProfileOverrides(overrides);
        }
      }
    });
    const captureModal = new CaptureModalController();
    const modal = new ModalController(store, registry, runtime, gamepadRuntime, captureModal, footerActions);
    const hints = new HintsController(store, registry, gamepadRuntime);
    const mountTarget = container ?? (typeof document !== "undefined" ? document.body : null);
    if (mountTarget) {
      captureModal.mount(mountTarget);
      modal.mount(mountTarget);
      hints.mount(mountTarget);
    }
    runtime.start();
    gamepadRuntime.start();
    const unsubPersist = store.subscribe(() => {
      storageAdapter.save(store.getAll());
    });
    let _debugListener = null;
    if (debug && typeof window !== "undefined") {
      _debugListener = (e) => {
        if (e.code === debugKey) {
          e.preventDefault();
          modal.toggle();
        }
      };
      window.addEventListener("keydown", _debugListener);
    }
    const manager = {
      /**
       * Register a single action.
       * Returns a handle with per-action helpers for events and hint visibility.
       * @param {ActionDef} def
       * @returns {ActionHandle}
       */
      registerAction(def) {
        const action = registry.register(def);
        store.initAction(action);
        if (modal.isOpen()) modal.refresh();
        hints.refresh();
        return _makeHandle(def.id);
      },
      /**
       * Register multiple actions in one call.
       * @param {ActionDef[]} defs
       * @returns {ActionHandle[]}
       */
      registerActions(defs) {
        return defs.map((def) => manager.registerAction(def));
      },
      // ── Modal lifecycle ──────────────────────────────────────────────────────
      /** Open the key binding modal. */
      open() {
        modal.open();
      },
      /** Close the key binding modal. */
      close() {
        modal.close();
      },
      /** Toggle the key binding modal open/closed. */
      toggle() {
        modal.toggle();
      },
      /** @returns {boolean} */
      isOpen() {
        return modal.isOpen();
      },
      // ── Binding queries ──────────────────────────────────────────────────────
      /**
       * Get current bindings for one action.
       * @param {string} actionId
       * @returns {(string|null)[]}
       */
      getBinding(actionId, device = "keyboard") {
        return store.get(actionId, device);
      },
      /**
       * Get all current bindings as a plain serialisable object.
       * @returns {Record<string, (string|null)[]>}
       */
      getBindings() {
        return store.getAll();
      },
      /**
       * Get the detected profile ('xbox' | 'dualsense' | 'generic') for a connected gamepad.
       * @param {number} [gamepadIndex=0]
       * @returns {string}
       */
      getActiveGamepadProfile(gamepadIndex = 0) {
        return gamepadRuntime.getActiveProfile(gamepadIndex);
      },
      /**
       * Get the resolved profile object for a connected gamepad.
       * @param {number} [gamepadIndex=0]
       * @returns {{ source: string, family: string, profileHint: string, profileKey: string | null, definition: any | null, gamepadId: string | null }}
       */
      getResolvedGamepadProfile(gamepadIndex = 0) {
        return gamepadRuntime.getResolvedProfile(gamepadIndex);
      },
      /**
       * Resolve a human-readable label for a gamepad code using the active profile.
       * @param {string | null} code
       * @param {number} [gamepadIndex=0]
       * @returns {string}
       */
      getGamepadLabel(code, gamepadIndex = 0) {
        return gamepadRuntime.getLabelForCode(code, gamepadIndex);
      },
      /**
       * Get info about all currently connected gamepads.
       * @returns {{ index: number, id: string, profile: string }[]}
       */
      getConnectedGamepads() {
        return gamepadRuntime.getConnectedGamepads();
      },
      /**
       * Get available exact/family profile options for a connected gamepad.
       * @param {number} [gamepadIndex=0]
       * @returns {{ exactProfiles: Array<{ type: string, key: string, label: string, family: string }>, families: Array<{ type: string, family: string, label: string }>, autoResolved: any }}
       */
      getAvailableGamepadProfileOptions(gamepadIndex = 0) {
        return gamepadRuntime.getAvailableProfileOptions(gamepadIndex);
      },
      /**
       * Persist a manual profile override for a connected gamepad.
       * @param {number} [gamepadIndex=0]
       * @param {{ type: 'profile', key: string } | { type: 'family', family: string } | null} override
       * @returns {boolean}
       */
      setGamepadProfileOverride(gamepadIndex = 0, override = null) {
        return gamepadRuntime.setProfileOverride(gamepadIndex, override);
      },
      /**
       * Clear a manual profile override for a connected gamepad.
       * @param {number} [gamepadIndex=0]
       * @returns {boolean}
       */
      clearGamepadProfileOverride(gamepadIndex = 0) {
        return gamepadRuntime.clearProfileOverride(gamepadIndex);
      },
      /**
       * Set/replace a logical mapping entry for the active gamepad profile in memory.
       * @param {number} [gamepadIndex=0]
       * @param {string} code
       * @param {{ kind: 'button' | 'axis' | 'hat', index: number, direction?: 'negative' | 'positive', value?: number, tolerance?: number } | null} entry
       * @param {{ label?: string | null }} [options]
       * @returns {boolean}
       */
      setGamepadProfileMappingEntry(gamepadIndex = 0, code, entry, options2 = {}) {
        return gamepadRuntime.setProfileMappingEntry(gamepadIndex, code, entry, options2);
      },
      /**
       * Remove a logical mapping entry from the active gamepad profile in memory.
       * @param {number} [gamepadIndex=0]
       * @param {string} code
       * @returns {boolean}
       */
      removeGamepadProfileMappingEntry(gamepadIndex = 0, code) {
        return gamepadRuntime.removeProfileMappingEntry(gamepadIndex, code);
      },
      /**
       * Get the current in-memory resolved gamepad profile definition.
       * @param {number} [gamepadIndex=0]
       * @returns {any | null}
       */
      getGamepadProfileDefinition(gamepadIndex = 0) {
        return gamepadRuntime.getProfileDefinition(gamepadIndex);
      },
      /**
       * Export current bindings in a versioned payload.
       * @param {{ includeMetadata?: boolean }} [options]
       * @returns {{ version: number, namespace: string, bindings: Record<string, (string|null)[]>, metadata?: { exportedAt: string } }}
       */
      exportBindings(options2 = {}) {
        const { includeMetadata = true } = options2;
        const payload = {
          version: 2,
          namespace,
          bindings: store.getAll()
        };
        if (includeMetadata) {
          payload.metadata = {
            exportedAt: (/* @__PURE__ */ new Date()).toISOString()
          };
        }
        return payload;
      },
      /**
       * Import bindings from an object or JSON string.
       *
       * Modes:
       * - merge   (default): apply only actions present in payload
       * - replace: apply payload actions and clear missing known actions
       *
       * @param {object | string} payload
       * @param {{ mode?: 'merge' | 'replace' }} [options]
       * @returns {ImportReport}
       */
      importBindings(payload, options2 = {}) {
        const { mode = "merge" } = options2;
        if (mode !== "merge" && mode !== "replace") {
          throw new Error(`Invalid import mode: "${mode}". Expected "merge" or "replace".`);
        }
        const report = {
          mode,
          appliedActions: 0,
          appliedSlots: 0,
          skippedUnknownActions: [],
          invalidEntries: [],
          conflictCount: 0
        };
        const parsed = _parseImportPayload(payload);
        if (!parsed.ok) {
          report.invalidEntries.push(parsed.reason);
          return report;
        }
        const bindingsObj = parsed.value.bindings;
        const payloadVersion = parsed.value.version;
        const knownActions = registry.getAll();
        const incomingActionIds = new Set(Object.keys(bindingsObj));
        for (const actionId of incomingActionIds) {
          if (!registry.has(actionId)) report.skippedUnknownActions.push(actionId);
        }
        for (const action of knownActions) {
          const incoming = bindingsObj[action.id];
          const entry = _normaliseBindingEntry(incoming, payloadVersion);
          const hasEntry = entry != null;
          const shouldProcess = hasEntry || mode === "replace" && !incomingActionIds.has(action.id);
          if (!shouldProcess) continue;
          let actionChanged = false;
          const kbTarget = Array.from({ length: action.slots }, (_, slot) => {
            if (!hasEntry) return null;
            const raw = entry.keyboard[slot];
            if (raw === null || raw === void 0) return null;
            if (typeof raw === "string") return raw;
            report.invalidEntries.push(`Action "${action.id}" keyboard slot ${slot} has invalid value type`);
            return null;
          });
          for (let slot = 0; slot < kbTarget.length; slot++) {
            const current = store.get(action.id, "keyboard")?.[slot] ?? null;
            const next = kbTarget[slot] ?? null;
            if (current === next) continue;
            const result = store.set(action.id, slot, next, "keyboard");
            actionChanged = true;
            report.appliedSlots += 1;
            report.conflictCount += result.conflicts.length;
          }
          if (payloadVersion >= 2 && hasEntry) {
            const gpTarget = Array.from({ length: action.gamepadSlots }, (_, slot) => {
              const raw = entry.gamepad[slot];
              if (raw === null || raw === void 0) return null;
              if (typeof raw === "string") return raw;
              report.invalidEntries.push(`Action "${action.id}" gamepad slot ${slot} has invalid value type`);
              return null;
            });
            for (let slot = 0; slot < gpTarget.length; slot++) {
              const current = store.get(action.id, "gamepad")?.[slot] ?? null;
              const next = gpTarget[slot] ?? null;
              if (current === next) continue;
              const result = store.set(action.id, slot, next, "gamepad");
              actionChanged = true;
              report.appliedSlots += 1;
              report.conflictCount += result.conflicts.length;
            }
          }
          if (actionChanged) report.appliedActions += 1;
        }
        return report;
      },
      // ── Binding mutations ────────────────────────────────────────────────────
      /**
       * Programmatically assign a key to a specific slot.
       * Returns conflict information without blocking the assignment.
       * @param {string} actionId
       * @param {number} slot
       * @param {string | null} code - KeyboardEvent.code or null to clear
       */
      setBinding(actionId, slot, code, device = "keyboard") {
        return store.set(actionId, slot, code, device);
      },
      /**
       * Clear the binding for a specific slot (sets it to null).
       * @param {string} actionId
       * @param {number} slot
       */
      clearBinding(actionId, slot, device = "keyboard") {
        return store.clear(actionId, slot, device);
      },
      /**
       * Reset a single action to its registered defaults.
       * @param {string} actionId
       */
      resetAction(actionId) {
        store.reset(actionId);
      },
      /** Reset all actions to their registered defaults. */
      resetAll() {
        store.resetAll();
      },
      // ── Change subscriptions ─────────────────────────────────────────────────
      /**
       * Subscribe to binding change events.
       * Called whenever a binding is set, cleared, or reset.
       * @param {(event: BindingChangeEvent) => void} listener
       * @returns {() => void} unsubscribe
       */
      subscribe(listener) {
        return store.subscribe(listener);
      },
      // ── Hint visibility (bulk) ───────────────────────────────────────────────
      /** Show the hint for a specific action. @param {string} actionId */
      showHint(actionId) {
        hints.show(actionId);
      },
      /** Hide the hint for a specific action. @param {string} actionId */
      hideHint(actionId) {
        hints.hide(actionId);
      },
      /** Show hints for all registered actions. */
      showAllHints() {
        hints.showAll();
      },
      /** Hide all hints. */
      hideAllHints() {
        hints.hideAll();
      },
      // ── Runtime input events ──────────────────────────────────────────────────
      /**
       * Listen for any action event (pressed / held / released) across all actions.
       * @param {(event: import('../input/keyboard-runtime.js').ActionEvent) => void} listener
       * @returns {() => void} unsubscribe
       */
      onAnyAction(listener) {
        const unsubs = [
          runtime.onAnyAction(listener),
          gamepadRuntime.onAnyAction(listener)
        ];
        return () => unsubs.forEach((fn) => fn());
      },
      /**
       * Check if the key(s) bound to an action are currently held down.
       * @param {string} actionId
       * @returns {boolean}
       */
      isActionPressed(actionId) {
        const kbBindings = store.get(actionId, "keyboard") ?? [];
        const gpBindings = store.get(actionId, "gamepad") ?? [];
        return kbBindings.some((code) => code && runtime.isPressed(code)) || gpBindings.some((code) => code && gamepadRuntime.isPressed(code));
      },
      // ── Lifecycle ─────────────────────────────────────────────────────────────
      /**
       * Tear down all DOM elements, event listeners, and subscriptions.
       * Call this if you need to remove the Bind Manager from a running page.
       */
      destroy() {
        unsubPersist();
        if (_debugListener) window.removeEventListener("keydown", _debugListener);
        runtime.stop();
        gamepadRuntime.stop();
        captureModal.unmount();
        modal.unmount();
        hints.unmount();
      }
    };
    return manager;
    function _makeHandle(actionId) {
      return {
        /** Show the bottom hint for this action. */
        showHint() {
          hints.show(actionId);
        },
        /** Hide the bottom hint for this action. */
        hideHint() {
          hints.hide(actionId);
        },
        /**
         * Set hint visibility.
         * @param {boolean} visible
         */
        setHintVisible(visible) {
          hints.setVisible(actionId, visible);
        },
        /**
         * Listen for this action being triggered (key pressed).
         * @param {(e: import('../input/keyboard-runtime.js').ActionEvent) => void} cb
         * @returns {() => void} unsubscribe
         */
        onPressed(cb) {
          const unsubs = [
            runtime.onAction(actionId, (e) => {
              if (e.type === "pressed") cb(e);
            }),
            gamepadRuntime.onAction(actionId, (e) => {
              if (e.type === "pressed") cb(e);
            })
          ];
          return () => unsubs.forEach((fn) => fn());
        },
        /**
         * Listen for this action being released (key released).
         * @param {(e: import('../input/keyboard-runtime.js').ActionEvent) => void} cb
         * @returns {() => void} unsubscribe
         */
        onReleased(cb) {
          const unsubs = [
            runtime.onAction(actionId, (e) => {
              if (e.type === "released") cb(e);
            }),
            gamepadRuntime.onAction(actionId, (e) => {
              if (e.type === "released") cb(e);
            })
          ];
          return () => unsubs.forEach((fn) => fn());
        },
        /**
         * Listen for this action being held (key repeat events).
         * @param {(e: import('../input/keyboard-runtime.js').ActionEvent) => void} cb
         * @returns {() => void} unsubscribe
         */
        onHeld(cb) {
          const unsubs = [
            runtime.onAction(actionId, (e) => {
              if (e.type === "held") cb(e);
            }),
            gamepadRuntime.onAction(actionId, (e) => {
              if (e.type === "held") cb(e);
            })
          ];
          return () => unsubs.forEach((fn) => fn());
        },
        /**
         * Listen for continuous analog axis values (axes only, requires action.analog=true).
         * @param {(e: import('../input/gamepad-runtime.js').GamepadActionEvent) => void} cb
         * @returns {() => void} unsubscribe
         */
        onAnalog(cb) {
          return gamepadRuntime.onAction(actionId, (e) => {
            if (e.type === "analog") cb(e);
          });
        }
      };
    }
  }
  function _parseImportPayload(payload) {
    let parsed = payload;
    if (typeof payload === "string") {
      try {
        parsed = JSON.parse(payload);
      } catch {
        return { ok: false, reason: "Payload is not valid JSON" };
      }
    }
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, reason: "Payload must be an object or JSON string" };
    }
    if (typeof parsed.version !== "number") {
      return { ok: false, reason: "Payload is missing numeric version" };
    }
    if (!parsed.bindings || typeof parsed.bindings !== "object") {
      return { ok: false, reason: "Payload is missing bindings object" };
    }
    return {
      ok: true,
      value: {
        version: parsed.version,
        bindings: parsed.bindings
      }
    };
  }
  function _normaliseBindingEntry(incoming, payloadVersion) {
    if (incoming == null) return null;
    if (Array.isArray(incoming)) {
      return { keyboard: incoming, gamepad: [] };
    }
    if (typeof incoming === "object" && payloadVersion >= 2) {
      return {
        keyboard: Array.isArray(incoming.keyboard) ? incoming.keyboard : [],
        gamepad: Array.isArray(incoming.gamepad) ? incoming.gamepad : []
      };
    }
    return null;
  }
  return __toCommonJS(index_exports);
})();
//# sourceMappingURL=bind-manager.js.map
