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
    /** @type {Map<string, unknown>} raw saved data from storage, by action id (own keys only) */
    this._saved = new Map();
    /** @type {Set<Function>} */
    this._listeners = new Set();
    /** @type {Set<Function>} called once per committed mutation or batch (persistence) */
    this._commitListeners = new Set();
    this._batchDepth = 0;
    this._batchDirty = false;
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
    // A Map keyed by own properties only: ids like "constructor" or "__proto__"
    // must not resolve to Object.prototype members.
    this._saved = new Map(
      savedBindings != null && typeof savedBindings === 'object' ? Object.entries(savedBindings) : [],
    );
  }

  /**
   * Called by the manager after each action is registered.
   * Merges saved data (if any) with the action's defaults for both devices.
   * @param {import('./action-registry.js').ActionDefinition} action
   */
  initAction(action) {
    const saved = this._saved.get(action.id);

    // ── Keyboard bindings ────────────────────────────────────────────────────
    // saved may be an array (v1 legacy) or { keyboard, gamepad } (v2)
    const savedKb = Array.isArray(saved)
      ? saved
      : (saved && Array.isArray(saved.keyboard) ? saved.keyboard : null);

    this._keyboard.set(action.id, _mergeSlots(action.slots, savedKb, action.defaultBindings));

    // ── Gamepad bindings ─────────────────────────────────────────────────────
    const savedGp = saved && !Array.isArray(saved) && Array.isArray(saved.gamepad)
      ? saved.gamepad : null;

    this._gamepad.set(action.id, _mergeSlots(action.gamepadSlots, savedGp, action.defaultGamepadBindings));
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
   * Returns a plain-object snapshot with both keyboard and gamepad bindings per
   * registered action, suitable for JSON serialisation and export.
   * @returns {Record<string, { keyboard: (string|null)[], gamepad: (string|null)[] }>}
   */
  getAll() {
    const result = {};
    for (const action of this._registry.getAll()) {
      _defineOwn(result, action.id, {
        keyboard: [...(this._keyboard.get(action.id) ?? [])],
        gamepad:  [...(this._gamepad.get(action.id)  ?? [])],
      });
    }
    return result;
  }

  /**
   * The snapshot to persist: getAll() plus the raw saved entries of actions that
   * are not registered (yet), carried through unchanged so a save made before
   * a lazily registered action exists does not wipe its saved bindings.
   * @returns {Record<string, unknown>}
   */
  getAllForStorage() {
    const result = this.getAll();
    for (const [id, saved] of this._saved) {
      if (!this._registry.has(id)) _defineOwn(result, id, saved);
    }
    return result;
  }

  /** Forget the saved data loaded by init() (after the storage was cleared). */
  clearSaved() {
    this._saved = new Map();
  }

  /**
   * The raw saved entry loaded for an action id (own keys only), or undefined.
   * @param {string} actionId
   * @returns {unknown}
   */
  getSavedEntry(actionId) {
    return this._saved.get(actionId);
  }

  /**
   * Replace the saved entries of all actions that are not registered with
   * `entries` (replace-mode import) and commit, so storage reflects them even
   * when no live binding changed. Entries for registered ids are ignored.
   * @param {Map<string, unknown>} entries
   */
  replaceUnregisteredSaved(entries) {
    for (const id of [...this._saved.keys()]) {
      if (!this._registry.has(id)) this._saved.delete(id);
    }
    for (const [id, entry] of entries) {
      if (!this._registry.has(id)) this._saved.set(id, entry);
    }
    this._requestCommit();
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
    this.batch(() => {
      for (const action of this._registry.getAll()) {
        this.reset(action.id);
      }
    });
  }

  /**
   * Run several mutations as one commit: change events are still emitted per
   * mutation, but commit listeners (persistence) run once at the end.
   * @param {() => void} fn
   */
  batch(fn) {
    this._batchDepth += 1;
    try {
      fn();
    } finally {
      this._batchDepth -= 1;
      if (this._batchDepth === 0 && this._batchDirty) {
        this._batchDirty = false;
        this._commit();
      }
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

  /**
   * Subscribe to commits: called once after each mutation outside a batch,
   * and once at the end of a batch that changed something.
   * @param {() => void} listener
   * @returns {Function} unsubscribe
   */
  onCommit(listener) {
    this._commitListeners.add(listener);
    return () => this._commitListeners.delete(listener);
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
    this._requestCommit();
  }

  /** Commit now, or at the end of the running batch. @private */
  _requestCommit() {
    if (this._batchDepth > 0) this._batchDirty = true;
    else this._commit();
  }

  /** @private */
  _commit() {
    for (const listener of this._commitListeners) {
      try { listener(); } catch (err) {
        console.error('[BindManager] Commit listener threw an error:', err);
      }
    }
  }
}

/** defineProperty, not assignment: an id of "__proto__" would hit the prototype setter. */
function _defineOwn(obj, key, value) {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

/**
 * Per-slot bindings from saved data, falling back to the defaults. Slots the saved array does
 * not cover (the action gained slots since it was saved) take their default, unless that code
 * is already saved in another slot; saved slots, including explicitly cleared (null) ones, win.
 * An empty saved array keeps every slot cleared.
 * @param {number} count
 * @param {(string|null)[] | null} saved
 * @param {(string|null)[]} defaults
 * @returns {(string|null)[]}
 */
function _mergeSlots(count, saved, defaults) {
  const def = (i) => (typeof defaults[i] === 'string' ? defaults[i] : null);
  if (!saved) return Array.from({ length: count }, (_, i) => def(i));
  const out = Array.from({ length: count }, (_, i) => (typeof saved[i] === 'string' ? saved[i] : null));
  // An empty saved array is a device cleared on purpose (a replace-mode import of
  // `gamepad: []` or of an entry without that device): no defaults come back.
  if (saved.length === 0) return out;
  for (let i = saved.length; i < count; i++) {
    const d = def(i);
    if (d !== null && !out.includes(d)) out[i] = d;
  }
  return out;
}

/**
 * @typedef {object} ConflictRef
 * @property {string} actionId
 * @property {number} slot
 */
