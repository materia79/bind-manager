import { ActionRegistry } from './action-registry.js';
import { BindingStore } from './binding-store.js';
import { KeyboardRuntime } from '../input/keyboard-runtime.js';
import { LocalStorageAdapter } from '../storage/local-storage-adapter.js';
import { ModalController } from '../ui/modal-controller.js';
import { CaptureModalController } from '../ui/capture-modal-controller.js';
import { HintsController } from '../ui/hints-controller.js';
import { GamepadRuntime } from '../input/gamepad-runtime.js';
import { createBuiltInToolsController } from '../ui/built-in-tools-controller.js';

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
    footerActions = [],
    builtInTools = null,
  } = options;
  const deadband        = options.deadband        ?? 0.12;
  const analogThreshold = options.analogThreshold ?? 0.50;

  // -- Core layer --
  const registry = new ActionRegistry();
  const storageAdapter = storage ?? new LocalStorageAdapter(namespace);
  const store = new BindingStore(registry);

  // Load persisted bindings before any actions are registered so initAction()
  // can merge them with defaults when each action registers.
  store.init(storageAdapter.load());
  const savedProfileOverrides = typeof storageAdapter.loadGamepadProfileOverrides === 'function'
    ? storageAdapter.loadGamepadProfileOverrides()
    : {};

  // -- Input layer --
  const runtime = new KeyboardRuntime(store);
  const gamepadRuntime = new GamepadRuntime(store, registry, {
    deadband,
    analogThreshold,
    profileOverrides: savedProfileOverrides,
    onProfileOverridesChange: (overrides) => {
      if (typeof storageAdapter.saveGamepadProfileOverrides === 'function') {
        storageAdapter.saveGamepadProfileOverrides(overrides);
      }
    },
  });

  let captureModal = null;
  let modal = null;
  let hints = null;
  let builtInToolsController = null;

  // Start global keyboard listeners
  runtime.start();
  gamepadRuntime.start();

  // Persist to storage on every binding change
  const unsubPersist = store.subscribe(() => {
    storageAdapter.save(store.getAll());
  });

  // Debug toggle: F5 opens/closes the modal (prevents browser refresh in debug mode)
  let _debugListener = null;

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
    /** Open the bundled Input Remap tool when enabled. */
    openInputRemap() { builtInToolsController?.openInputRemap(); },
    /** Open the bundled Controller Test tool when enabled. */
    openControllerTest() { builtInToolsController?.openControllerTest(); },

    // ── Binding queries ──────────────────────────────────────────────────────

    /**
     * Get current bindings for one action.
     * @param {string} actionId
     * @returns {(string|null)[]}
     */
    getBinding(actionId, device = 'keyboard') { return store.get(actionId, device); },

    /**
     * Get all current bindings as a plain serialisable object.
     * @returns {Record<string, (string|null)[]>}
     */
    getBindings() { return store.getAll(); },

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
    setGamepadProfileMappingEntry(gamepadIndex = 0, code, entry, options = {}) {
      return gamepadRuntime.setProfileMappingEntry(gamepadIndex, code, entry, options);
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
    exportBindings(options = {}) {
      const { includeMetadata = true } = options;
      const payload = {
        version: 2,
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
        const payloadVersion = parsed.value.version;
      const knownActions = registry.getAll();
      const incomingActionIds = new Set(Object.keys(bindingsObj));

      // Track unknown action ids present in import payload.
      for (const actionId of incomingActionIds) {
        if (!registry.has(actionId)) report.skippedUnknownActions.push(actionId);
      }

      for (const action of knownActions) {
        const incoming = bindingsObj[action.id];
        // Normalise to { keyboard: [...], gamepad: [...] }, handling v1 (array) and v2 ({keyboard, gamepad})
        const entry = _normaliseBindingEntry(incoming, payloadVersion);
        const hasEntry = entry != null;
        const shouldProcess = hasEntry || (mode === 'replace' && !incomingActionIds.has(action.id));
        if (!shouldProcess) continue;

        let actionChanged = false;

        // ── Keyboard slots ──────────────────────────────────────────────────
        const kbTarget = Array.from({ length: action.slots }, (_, slot) => {
          if (!hasEntry) return null;
          const raw = entry.keyboard[slot];
          if (raw === null || raw === undefined) return null;
          if (typeof raw === 'string') return raw;
          report.invalidEntries.push(`Action "${action.id}" keyboard slot ${slot} has invalid value type`);
          return null;
        });
        for (let slot = 0; slot < kbTarget.length; slot++) {
          const current = store.get(action.id, 'keyboard')?.[slot] ?? null;
          const next = kbTarget[slot] ?? null;
          if (current === next) continue;
          const result = store.set(action.id, slot, next, 'keyboard');
          actionChanged = true;
          report.appliedSlots += 1;
          report.conflictCount += result.conflicts.length;
        }

        // ── Gamepad slots (v2 only) ─────────────────────────────────────────
        if (payloadVersion >= 2 && hasEntry) {
          const gpTarget = Array.from({ length: action.gamepadSlots }, (_, slot) => {
            const raw = entry.gamepad[slot];
            if (raw === null || raw === undefined) return null;
            if (typeof raw === 'string') return raw;
            report.invalidEntries.push(`Action "${action.id}" gamepad slot ${slot} has invalid value type`);
            return null;
          });
          for (let slot = 0; slot < gpTarget.length; slot++) {
            const current = store.get(action.id, 'gamepad')?.[slot] ?? null;
            const next = gpTarget[slot] ?? null;
            if (current === next) continue;
            const result = store.set(action.id, slot, next, 'gamepad');
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
    setBinding(actionId, slot, code, device = 'keyboard') { return store.set(actionId, slot, code, device); },

    /**
     * Clear the binding for a specific slot (sets it to null).
     * @param {string} actionId
     * @param {number} slot
     */
    clearBinding(actionId, slot, device = 'keyboard') { return store.clear(actionId, slot, device); },

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
    onAnyAction(listener) {
      const unsubs = [
        runtime.onAnyAction(listener),
        gamepadRuntime.onAnyAction(listener),
      ];
      return () => unsubs.forEach(fn => fn());
    },

    /**
     * Check if the key(s) bound to an action are currently held down.
     * @param {string} actionId
     * @returns {boolean}
     */
    isActionPressed(actionId) {
        const kbBindings = store.get(actionId, 'keyboard') ?? [];
        const gpBindings = store.get(actionId, 'gamepad')  ?? [];
        return kbBindings.some(code => code && runtime.isPressed(code))
          || gpBindings.some(code => code && gamepadRuntime.isPressed(code));
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
      gamepadRuntime.stop();
      builtInToolsController?.unmount();
      captureModal.unmount();
      modal.unmount();
      hints.unmount();
    },
  };

  // -- UI layer --
  builtInToolsController = createBuiltInToolsController(manager, { builtInTools });
  const mergedFooterActions = [...footerActions, ...builtInToolsController.getFooterActions()];
  captureModal = new CaptureModalController();
  modal = new ModalController(store, registry, runtime, gamepadRuntime, captureModal, mergedFooterActions);
  hints = new HintsController(store, registry, gamepadRuntime);

  const mountTarget = container ?? (typeof document !== 'undefined' ? document.body : null);
  if (mountTarget) {
    captureModal.mount(mountTarget);
    modal.mount(mountTarget);
    hints.mount(mountTarget);
    builtInToolsController.mount(mountTarget);
  }

  if (debug && typeof window !== 'undefined') {
    _debugListener = (e) => {
      if (e.code === debugKey) {
        e.preventDefault();
        modal.toggle();
      }
    };
    window.addEventListener('keydown', _debugListener);
  }

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
        const unsubs = [
          runtime.onAction(actionId, (e) => { if (e.type === 'pressed') cb(e); }),
          gamepadRuntime.onAction(actionId, (e) => { if (e.type === 'pressed') cb(e); }),
        ];
        return () => unsubs.forEach(fn => fn());
      },
      /**
       * Listen for this action being released (key released).
       * @param {(e: import('../input/keyboard-runtime.js').ActionEvent) => void} cb
       * @returns {() => void} unsubscribe
       */
      onReleased(cb) {
        const unsubs = [
          runtime.onAction(actionId, (e) => { if (e.type === 'released') cb(e); }),
          gamepadRuntime.onAction(actionId, (e) => { if (e.type === 'released') cb(e); }),
        ];
        return () => unsubs.forEach(fn => fn());
      },
      /**
       * Listen for this action being held (key repeat events).
       * @param {(e: import('../input/keyboard-runtime.js').ActionEvent) => void} cb
       * @returns {() => void} unsubscribe
       */
      onHeld(cb) {
        const unsubs = [
          runtime.onAction(actionId, (e) => { if (e.type === 'held') cb(e); }),
          gamepadRuntime.onAction(actionId, (e) => { if (e.type === 'held') cb(e); }),
        ];
        return () => unsubs.forEach(fn => fn());
      },
      /**
       * Listen for continuous analog axis values (axes only, requires action.analog=true).
       * @param {(e: import('../input/gamepad-runtime.js').GamepadActionEvent) => void} cb
       * @returns {() => void} unsubscribe
       */
      onAnalog(cb) {
        return gamepadRuntime.onAction(actionId, (e) => { if (e.type === 'analog') cb(e); });
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
 * Normalise a raw binding entry from an import payload into { keyboard, gamepad }.
 * - v1 (array): treated as keyboard-only, gamepad gets empty array
 * - v2 (object with keyboard/gamepad): used directly
 * Returns null if the entry is missing or unrecognisable.
 * @param {unknown} incoming
 * @param {number} payloadVersion
 * @returns {{ keyboard: unknown[], gamepad: unknown[] } | null}
 */
function _normaliseBindingEntry(incoming, payloadVersion) {
  if (incoming == null) return null;
  if (Array.isArray(incoming)) {
    // v1 format — keyboard only
    return { keyboard: incoming, gamepad: [] };
  }
  if (typeof incoming === 'object' && payloadVersion >= 2) {
    return {
      keyboard: Array.isArray(incoming.keyboard) ? incoming.keyboard : [],
      gamepad:  Array.isArray(incoming.gamepad)  ? incoming.gamepad  : [],
    };
  }
  return null;
}

/**
 * @typedef {object} BindManagerOptions
 * @property {string} [namespace='default']         - Storage namespace (use your game name)
 * @property {boolean} [debug=false]                - Enable debug toggle key
 * @property {string} [debugKey='F5']               - KeyboardEvent.code for debug toggle
 * @property {HTMLElement | null} [container=null]  - Mount target (defaults to document.body)
 * @property {object | null} [storage=null]         - Custom storage adapter (load/save/clear)
 * @property {number} [deadband=0.12]              - Gamepad axis deadband (ignore drift below this)
 * @property {number} [analogThreshold=0.50]       - Axis value threshold for digital events
 *
 * @typedef {object} ActionDef
 * @property {string} id
 * @property {string} [label]
 * @property {string} [description]
 * @property {string} [group]
 * @property {number} [slots=2]
 * @property {string[]} [defaultBindings]
 * @property {number} [gamepadSlots=1]
 * @property {string[]} [defaultGamepadBindings]
 * @property {boolean} [analog=false]
 * @property {number | null} [playerIndex=null]
 *
 * @typedef {object} ActionHandle
 * @property {() => void} showHint
 * @property {() => void} hideHint
 * @property {(v: boolean) => void} setHintVisible
 * @property {(cb: Function) => (() => void)} onPressed
 * @property {(cb: Function) => (() => void)} onReleased
 * @property {(cb: Function) => (() => void)} onHeld
 * @property {(cb: Function) => (() => void)} onAnalog
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
