import { ActionRegistry } from './action-registry.js';
import { BindingStore } from './binding-store.js';
import { KeyboardRuntime } from '../input/keyboard-runtime.js';
import { LocalStorageAdapter } from '../storage/local-storage-adapter.js';
import { ModalController } from '../ui/modal-controller.js';
import { HintsController } from '../ui/hints-controller.js';

/**
 * Creates and returns a Bind Manager instance.
 *
 * @param {BindManagerOptions} [options]
 * @returns {BindManager}
 *
 * @example
 * const manager = createBindManager({ namespace: 'my-game', debug: true });
 *
 * const moveHandle = manager.registerAction({
 *   id: 'move-forward',
 *   label: 'Move Forward',
 *   group: 'Movement',
 *   defaultBindings: ['KeyW', 'ArrowUp'],
 * });
 *
 * moveHandle.showHint();
 * moveHandle.onPressed(() => playerMoveForward());
 *
 * manager.subscribe(event => console.log('Binding changed:', event));
 */
export function createBindManager(options = {}) {
  const {
    namespace = 'default',
    debug = false,
    debugKey = 'F5',
    container = null,
    storage = null,
  } = options;

  // -- Core layer --
  const registry = new ActionRegistry();
  const storageAdapter = storage ?? new LocalStorageAdapter(namespace);
  const store = new BindingStore(registry);

  // Load persisted bindings before any actions are registered so initAction()
  // can merge them with defaults when each action registers.
  store.init(storageAdapter.load());

  // -- Input layer --
  const runtime = new KeyboardRuntime(store);

  // -- UI layer --
  const modal = new ModalController(store, registry, runtime);
  const hints = new HintsController(store, registry);

  // Determine mount target (explicit container or document.body)
  const mountTarget = container ?? (typeof document !== 'undefined' ? document.body : null);
  if (mountTarget) {
    modal.mount(mountTarget);
    hints.mount(mountTarget);
  }

  // Start global keyboard listeners
  runtime.start();

  // Persist to storage on every binding change
  const unsubPersist = store.subscribe(() => {
    storageAdapter.save(store.getAll());
  });

  // Debug toggle: F5 opens/closes the modal (prevents browser refresh in debug mode)
  let _debugListener = null;
  if (debug && typeof window !== 'undefined') {
    _debugListener = (e) => {
      if (e.code === debugKey) {
        e.preventDefault();
        modal.toggle();
      }
    };
    window.addEventListener('keydown', _debugListener);
  }

  // -- Public API --

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
      // Refresh UI to include the newly registered action
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
      return defs.map(def => manager.registerAction(def));
    },

    // ── Modal lifecycle ──────────────────────────────────────────────────────

    /** Open the key binding modal. */
    open() { modal.open(); },
    /** Close the key binding modal. */
    close() { modal.close(); },
    /** Toggle the key binding modal open/closed. */
    toggle() { modal.toggle(); },
    /** @returns {boolean} */
    isOpen() { return modal.isOpen(); },

    // ── Binding queries ──────────────────────────────────────────────────────

    /**
     * Get current bindings for one action.
     * @param {string} actionId
     * @returns {(string|null)[]}
     */
    getBinding(actionId) { return store.get(actionId); },

    /**
     * Get all current bindings as a plain serialisable object.
     * @returns {Record<string, (string|null)[]>}
     */
    getBindings() { return store.getAll(); },

    /**
     * Export current bindings in a versioned payload.
     * @param {{ includeMetadata?: boolean }} [options]
     * @returns {{ version: number, namespace: string, bindings: Record<string, (string|null)[]>, metadata?: { exportedAt: string } }}
     */
    exportBindings(options = {}) {
      const { includeMetadata = true } = options;
      const payload = {
        version: 1,
        namespace,
        bindings: store.getAll(),
      };
      if (includeMetadata) {
        payload.metadata = {
          exportedAt: new Date().toISOString(),
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
    importBindings(payload, options = {}) {
      const { mode = 'merge' } = options;
      if (mode !== 'merge' && mode !== 'replace') {
        throw new Error(`Invalid import mode: "${mode}". Expected "merge" or "replace".`);
      }

      const report = {
        mode,
        appliedActions: 0,
        appliedSlots: 0,
        skippedUnknownActions: [],
        invalidEntries: [],
        conflictCount: 0,
      };

      const parsed = _parseImportPayload(payload);
      if (!parsed.ok) {
        report.invalidEntries.push(parsed.reason);
        return report;
      }

      const bindingsObj = parsed.value.bindings;
      const knownActions = registry.getAll();
      const incomingActionIds = new Set(Object.keys(bindingsObj));

      // Track unknown action ids present in import payload.
      for (const actionId of incomingActionIds) {
        if (!registry.has(actionId)) report.skippedUnknownActions.push(actionId);
      }

      for (const action of knownActions) {
        const incoming = bindingsObj[action.id];
        const shouldApply = Array.isArray(incoming) || (mode === 'replace' && !incomingActionIds.has(action.id));
        if (!shouldApply) continue;

        const targetSlots = Array.from({ length: action.slots }, (_, slot) => {
          if (!Array.isArray(incoming)) return null;
          const raw = incoming[slot];
          if (raw === null || typeof raw === 'string') return raw;
          if (typeof raw === 'undefined') return null;
          report.invalidEntries.push(`Action "${action.id}" slot ${slot} has invalid value type`);
          return null;
        });

        let actionChanged = false;
        for (let slot = 0; slot < targetSlots.length; slot++) {
          const current = store.get(action.id)?.[slot] ?? null;
          const next = targetSlots[slot] ?? null;
          if (current === next) continue;
          const result = store.set(action.id, slot, next);
          actionChanged = true;
          report.appliedSlots += 1;
          report.conflictCount += result.conflicts.length;
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
    setBinding(actionId, slot, code) { return store.set(actionId, slot, code); },

    /**
     * Clear the binding for a specific slot (sets it to null).
     * @param {string} actionId
     * @param {number} slot
     */
    clearBinding(actionId, slot) { return store.clear(actionId, slot); },

    /**
     * Reset a single action to its registered defaults.
     * @param {string} actionId
     */
    resetAction(actionId) { store.reset(actionId); },

    /** Reset all actions to their registered defaults. */
    resetAll() { store.resetAll(); },

    // ── Change subscriptions ─────────────────────────────────────────────────

    /**
     * Subscribe to binding change events.
     * Called whenever a binding is set, cleared, or reset.
     * @param {(event: BindingChangeEvent) => void} listener
     * @returns {() => void} unsubscribe
     */
    subscribe(listener) { return store.subscribe(listener); },

    // ── Hint visibility (bulk) ───────────────────────────────────────────────

    /** Show the hint for a specific action. @param {string} actionId */
    showHint(actionId) { hints.show(actionId); },
    /** Hide the hint for a specific action. @param {string} actionId */
    hideHint(actionId) { hints.hide(actionId); },
    /** Show hints for all registered actions. */
    showAllHints() { hints.showAll(); },
    /** Hide all hints. */
    hideAllHints() { hints.hideAll(); },

    // ── Runtime input events ──────────────────────────────────────────────────

    /**
     * Listen for any action event (pressed / held / released) across all actions.
     * @param {(event: import('../input/keyboard-runtime.js').ActionEvent) => void} listener
     * @returns {() => void} unsubscribe
     */
    onAnyAction(listener) { return runtime.onAnyAction(listener); },

    /**
     * Check if the key(s) bound to an action are currently held down.
     * @param {string} actionId
     * @returns {boolean}
     */
    isActionPressed(actionId) {
      const bindings = store.get(actionId) ?? [];
      return bindings.some(code => code && runtime.isPressed(code));
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Tear down all DOM elements, event listeners, and subscriptions.
     * Call this if you need to remove the Bind Manager from a running page.
     */
    destroy() {
      unsubPersist();
      if (_debugListener) window.removeEventListener('keydown', _debugListener);
      runtime.stop();
      modal.unmount();
      hints.unmount();
    },
  };

  return manager;

  // ── Private helpers ────────────────────────────────────────────────────────

  function _makeHandle(actionId) {
    return {
      /** Show the bottom hint for this action. */
      showHint() { hints.show(actionId); },
      /** Hide the bottom hint for this action. */
      hideHint() { hints.hide(actionId); },
      /**
       * Set hint visibility.
       * @param {boolean} visible
       */
      setHintVisible(visible) { hints.setVisible(actionId, visible); },

      /**
       * Listen for this action being triggered (key pressed).
       * @param {(e: import('../input/keyboard-runtime.js').ActionEvent) => void} cb
       * @returns {() => void} unsubscribe
       */
      onPressed(cb) {
        return runtime.onAction(actionId, (e) => { if (e.type === 'pressed') cb(e); });
      },
      /**
       * Listen for this action being released (key released).
       * @param {(e: import('../input/keyboard-runtime.js').ActionEvent) => void} cb
       * @returns {() => void} unsubscribe
       */
      onReleased(cb) {
        return runtime.onAction(actionId, (e) => { if (e.type === 'released') cb(e); });
      },
      /**
       * Listen for this action being held (key repeat events).
       * @param {(e: import('../input/keyboard-runtime.js').ActionEvent) => void} cb
       * @returns {() => void} unsubscribe
       */
      onHeld(cb) {
        return runtime.onAction(actionId, (e) => { if (e.type === 'held') cb(e); });
      },
    };
  }
}

/**
 * @param {object | string} payload
 * @returns {{ ok: true, value: { version: number, bindings: Record<string, unknown> } } | { ok: false, reason: string }}
 */
function _parseImportPayload(payload) {
  let parsed = payload;
  if (typeof payload === 'string') {
    try {
      parsed = JSON.parse(payload);
    } catch {
      return { ok: false, reason: 'Payload is not valid JSON' };
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'Payload must be an object or JSON string' };
  }
  if (typeof parsed.version !== 'number') {
    return { ok: false, reason: 'Payload is missing numeric version' };
  }
  if (!parsed.bindings || typeof parsed.bindings !== 'object') {
    return { ok: false, reason: 'Payload is missing bindings object' };
  }

  return {
    ok: true,
    value: {
      version: parsed.version,
      bindings: parsed.bindings,
    },
  };
}

/**
 * @typedef {object} BindManagerOptions
 * @property {string} [namespace='default']         - Storage namespace (use your game name)
 * @property {boolean} [debug=false]                - Enable debug toggle key
 * @property {string} [debugKey='F5']               - KeyboardEvent.code for debug toggle
 * @property {HTMLElement | null} [container=null]  - Mount target (defaults to document.body)
 * @property {object | null} [storage=null]         - Custom storage adapter (load/save/clear)
 *
 * @typedef {object} ActionDef
 * @property {string} id
 * @property {string} [label]
 * @property {string} [description]
 * @property {string} [group]
 * @property {number} [slots=2]
 * @property {string[]} [defaultBindings]
 *
 * @typedef {object} ActionHandle
 * @property {() => void} showHint
 * @property {() => void} hideHint
 * @property {(v: boolean) => void} setHintVisible
 * @property {(cb: Function) => (() => void)} onPressed
 * @property {(cb: Function) => (() => void)} onReleased
 * @property {(cb: Function) => (() => void)} onHeld
 *
 * @typedef {object} BindingChangeEvent
 * @property {'binding-changed' | 'reset'} type
 * @property {string} actionId
 * @property {number} [slot]
 * @property {string | null} [oldCode]
 * @property {string | null} [newCode]
 * @property {import('./binding-store.js').ConflictRef[]} [conflicts]
 *
 * @typedef {object} ImportReport
 * @property {'merge' | 'replace'} mode
 * @property {number} appliedActions
 * @property {number} appliedSlots
 * @property {string[]} skippedUnknownActions
 * @property {string[]} invalidEntries
 * @property {number} conflictCount
 */
