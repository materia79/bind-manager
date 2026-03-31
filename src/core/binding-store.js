/**
 * Holds and manages the current key binding state for all registered actions.
 * Emits change events to subscribers whenever a binding is modified.
 */
export class BindingStore {
  /** @param {import('./action-registry.js').ActionRegistry} registry */
  constructor(registry) {
    this._registry = registry;
    /** @type {Map<string, (string|null)[]>} actionId -> per-slot codes */
    this._current = new Map();
    /** @type {Record<string, (string|null)[]>} raw saved data from storage */
    this._saved = {};
    /** @type {Set<Function>} */
    this._listeners = new Set();
  }

  /**
   * Provide saved bindings loaded from storage before actions are registered.
   * Called once at startup. Subsequent registerAction calls will pick up this data.
   * @param {Record<string, (string|null)[]> | null} savedBindings
   */
  init(savedBindings) {
    this._saved = savedBindings != null && typeof savedBindings === 'object' ? savedBindings : {};
  }

  /**
   * Called by the manager after each action is registered.
   * Merges saved data (if any) with the action's defaults.
   * @param {import('./action-registry.js').ActionDefinition} action
   */
  initAction(action) {
    const saved = this._saved[action.id];
    let bindings;
    if (Array.isArray(saved)) {
      // Pad or trim saved data to match the action's slot count
      bindings = Array.from({ length: action.slots }, (_, i) =>
        typeof saved[i] === 'string' ? saved[i] : null
      );
    } else {
      bindings = Array.from({ length: action.slots }, (_, i) =>
        typeof action.defaultBindings[i] === 'string' ? action.defaultBindings[i] : null
      );
    }
    this._current.set(action.id, bindings);
  }

  /**
   * @param {string} actionId
   * @returns {(string|null)[] | null}
   */
  get(actionId) {
    const b = this._current.get(actionId);
    return b ? [...b] : null;
  }

  /**
   * Returns a plain object snapshot suitable for JSON serialization and persistence.
   * @returns {Record<string, (string|null)[]>}
   */
  getAll() {
    const result = {};
    for (const [id, bindings] of this._current) {
      result[id] = [...bindings];
    }
    return result;
  }

  /**
   * Assign a key code to a specific slot of an action.
   * Returns a list of conflict warnings (other actions that already use this code).
   * Conflicts are reported but never block the assignment.
   *
   * @param {string} actionId
   * @param {number} slot
   * @param {string | null} code  - KeyboardEvent.code, or null to clear
   * @returns {{ conflicts: ConflictRef[] }}
   */
  set(actionId, slot, code) {
    const action = this._registry.get(actionId);
    if (!action) throw new Error(`Unknown action: "${actionId}"`);
    if (slot < 0 || slot >= action.slots) {
      throw new Error(`Slot ${slot} is out of range for action "${actionId}" (slots: ${action.slots})`);
    }

    const bindings = this._current.get(actionId);
    const oldCode = bindings[slot];
    const conflicts = code !== null ? this._findConflicts(code, actionId, slot) : [];

    bindings[slot] = code ?? null;
    this._emit({ type: 'binding-changed', actionId, slot, oldCode, newCode: code ?? null, conflicts });
    return { conflicts };
  }

  /**
   * Clear the binding in a specific slot (sets it to null).
   * @param {string} actionId
   * @param {number} slot
   */
  clear(actionId, slot) {
    return this.set(actionId, slot, null);
  }

  /**
   * Reset a single action's bindings to its defaults.
   * @param {string} actionId
   */
  reset(actionId) {
    const action = this._registry.get(actionId);
    if (!action) throw new Error(`Unknown action: "${actionId}"`);
    const defaults = Array.from({ length: action.slots }, (_, i) =>
      typeof action.defaultBindings[i] === 'string' ? action.defaultBindings[i] : null
    );
    this._current.set(actionId, defaults);
    this._emit({ type: 'reset', actionId });
  }

  /** Reset all registered actions to their defaults. */
  resetAll() {
    for (const action of this._registry.getAll()) {
      this.reset(action.id);
    }
  }

  /**
   * Returns all action IDs that have the given code bound in any slot.
   * Used by the keyboard runtime to resolve which actions a key triggers.
   * @param {string} code
   * @returns {string[]}
   */
  getActionsByCode(code) {
    const results = [];
    for (const [id, bindings] of this._current) {
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
  _findConflicts(code, excludeActionId, excludeSlot) {
    const conflicts = [];
    for (const [id, bindings] of this._current) {
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
