/**
 * Holds and manages the current key binding state for all registered actions.
 * Emits change events to subscribers whenever a binding is modified.
 */
export class BindingStore {
  /** @param {import('./action-registry.js').ActionRegistry} registry */
  constructor(registry) {
    this._registry = registry;
    /** @type {Map<string, (string|null)[]>} actionId -> per-slot keyboard codes */
    this._keyboard = new Map();
    /** @type {Map<string, (string|null)[]>} actionId -> per-slot gamepad codes */
    this._gamepad = new Map();
    /** @type {object} raw saved data from storage */
    this._saved = {};
    /** @type {Set<Function>} */
    this._listeners = new Set();
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
    this._saved = savedBindings != null && typeof savedBindings === 'object' ? savedBindings : {};
  }

  /**
   * Called by the manager after each action is registered.
   * Merges saved data (if any) with the action's defaults for both devices.
   * @param {import('./action-registry.js').ActionDefinition} action
   */
  initAction(action) {
    const saved = this._saved[action.id];

    // ── Keyboard bindings ────────────────────────────────────────────────────
    // saved may be an array (v1 legacy) or { keyboard, gamepad } (v2)
    const savedKb = Array.isArray(saved)
      ? saved
      : (saved && Array.isArray(saved.keyboard) ? saved.keyboard : null);

    const kbBindings = Array.from({ length: action.slots }, (_, i) => {
      if (savedKb) return typeof savedKb[i] === 'string' ? savedKb[i] : null;
      return typeof action.defaultBindings[i] === 'string' ? action.defaultBindings[i] : null;
    });
    this._keyboard.set(action.id, kbBindings);

    // ── Gamepad bindings ─────────────────────────────────────────────────────
    const savedGp = saved && !Array.isArray(saved) && Array.isArray(saved.gamepad)
      ? saved.gamepad : null;

    const gpBindings = Array.from({ length: action.gamepadSlots }, (_, i) => {
      if (savedGp) return typeof savedGp[i] === 'string' ? savedGp[i] : null;
      return typeof action.defaultGamepadBindings[i] === 'string'
        ? action.defaultGamepadBindings[i] : null;
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
  get(actionId, device = 'keyboard') {
    const map = device === 'gamepad' ? this._gamepad : this._keyboard;
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
        keyboard: [...(this._keyboard.get(action.id) ?? [])],
        gamepad:  [...(this._gamepad.get(action.id)  ?? [])],
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
  set(actionId, slot, code, device = 'keyboard') {
    const action = this._registry.get(actionId);
    if (!action) throw new Error(`Unknown action: "${actionId}"`);

    const slotCount = device === 'gamepad' ? action.gamepadSlots : action.slots;
    if (slot < 0 || slot >= slotCount) {
      throw new Error(`Slot ${slot} is out of range for action "${actionId}" (${device} slots: ${slotCount})`);
    }

    const map = device === 'gamepad' ? this._gamepad : this._keyboard;
    const bindings = map.get(actionId);
    const oldCode = bindings[slot];
    const conflicts = code !== null ? this._findConflicts(code, actionId, slot, device) : [];

    bindings[slot] = code ?? null;
    this._emit({ type: 'binding-changed', device, actionId, slot, oldCode, newCode: code ?? null, conflicts });
    return { conflicts };
  }

  /**
   * Clear the binding in a specific slot (sets it to null).
   * @param {string} actionId
   * @param {number} slot
   * @param {'keyboard' | 'gamepad'} [device='keyboard']
   */
  clear(actionId, slot, device = 'keyboard') {
    return this.set(actionId, slot, null, device);
  }

  /**
   * Reset a single action's bindings to its defaults on BOTH devices.
   * @param {string} actionId
   */
  reset(actionId) {
    const action = this._registry.get(actionId);
    if (!action) throw new Error(`Unknown action: "${actionId}"`);

    const kbDefaults = Array.from({ length: action.slots }, (_, i) =>
      typeof action.defaultBindings[i] === 'string' ? action.defaultBindings[i] : null
    );
    this._keyboard.set(actionId, kbDefaults);

    const gpDefaults = Array.from({ length: action.gamepadSlots }, (_, i) =>
      typeof action.defaultGamepadBindings[i] === 'string'
        ? action.defaultGamepadBindings[i] : null
    );
    this._gamepad.set(actionId, gpDefaults);

    this._emit({ type: 'reset', actionId });
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
  getActionsByCode(code, device = 'keyboard') {
    const map = device === 'gamepad' ? this._gamepad : this._keyboard;
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
  _findConflicts(code, excludeActionId, excludeSlot, device = 'keyboard') {
    const map = device === 'gamepad' ? this._gamepad : this._keyboard;
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
      try { listener(event); } catch (err) {
        console.error('[BindManager] Subscriber threw an error:', err);
      }
    }
  }
}

/**
 * @typedef {object} ConflictRef
 * @property {string} actionId
 * @property {number} slot
 */
