import { getReservedInfo } from '../input/reserved-codes.js';
import { ActionRegistry } from './action-registry.js';
import { BindingStore } from './binding-store.js';
import { KeyboardRuntime } from '../input/keyboard-runtime.js';
import { MouseRuntime } from '../input/mouse-runtime.js';
import { LocalStorageAdapter } from '../storage/local-storage-adapter.js';
import { ModalController } from '../ui/modal-controller.js';
import { CaptureModalController } from '../ui/capture-modal-controller.js';
import { HintsController } from '../ui/hints-controller.js';
import { GamepadRuntime } from '../input/gamepad-runtime.js';
import { BrowserShortcutGuard } from '../input/browser-shortcut-guard.js';
import { createBuiltInToolsController } from '../ui/built-in-tools-controller.js';
import { isKnownCode } from '../input/key-names.js';
import { isGamepadCode } from '../input/gamepad-codes.js';

/** Sentinel: leave the current slot value untouched during import. */
const KEEP_SLOT = Symbol('keep-slot');

// Bounds for what a replace-mode import may store for actions not registered:
// their slot counts are unknown, so without caps a payload could fill the storage.
/** Slots kept per device of a stored entry; longer arrays are cut. */
const MAX_SAVED_SLOTS = 16;
/** Longest action id that is stored. */
const MAX_SAVED_ID_LENGTH = 128;
/** Unregistered ids stored per import. */
const MAX_UNREGISTERED_IDS = 512;

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
    browserGuard = false,
    wheelPixelThreshold,
    reservedKeyWarnings = true,
    isKeyboardLocked = null,
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

  // -- Mouse input layer --
  const mouseRuntime = new MouseRuntime(store, runtime, { wheelPixelThreshold });

  // -- Browser shortcut guard (opt-in) --
  const guard = new BrowserShortcutGuard(store, runtime, {
    ..._normaliseBrowserGuardOption(browserGuard),
    isUiActive: () => manager.active || !!builtInToolsController?.isAnyOpen?.(),
  });
  const guardApi = _makeBrowserGuardApi(guard);

  // -- Active state + cursor persistence --
  let _keepCursorAfterClose = false;
  /** @type {Set<Function>} */
  const _activeChangeListeners = new Set();

  // Start global input listeners
  runtime.start();
  gamepadRuntime.start();
  mouseRuntime.start();
  guard.start();

  // Persist to storage once per committed change (resetAll() is a single commit).
  // Saved entries of actions not registered yet are carried through. A failed
  // save (quota, storage unavailable) never stops later saves: every commit
  // tries again; the failure is warned once and readable via getStorageStatus().
  const storageStatus = { ok: true, failedSaves: 0, lastError: null, lastFailure: null };
  let warnedSaveFailure = false;
  let warnedIgnoredOverride = false;
  const unsubPersist = store.onCommit(() => {
    let ok;
    let error = null;
    try {
      ok = storageAdapter.save(store.getAllForStorage()) !== false;
    } catch (err) {
      ok = false;
      error = err;
    }
    if (ok) {
      storageStatus.ok = true;
      storageStatus.lastError = null;
      return;
    }
    storageStatus.ok = false;
    storageStatus.failedSaves += 1;
    storageStatus.lastError = error ?? storageAdapter.lastSaveError ?? null;
    storageStatus.lastFailure = { error: storageStatus.lastError, at: Date.now() };
    if (!warnedSaveFailure) {
      warnedSaveFailure = true;
      console.warn('[BindManager] Saving bindings failed; later changes will be saved again. See manager.getStorageStatus().', storageStatus.lastError);
    }
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
      // Registration emits no change event; a wheel default needs a non-passive listener
      mouseRuntime.refreshBindings();
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

    // ── Active state + cursor persistence ────────────────────────────────────

    /**
     * True when the bind-manager UI or a capture session is active.
     * Host apps can read this to decide whether to show/hide their own cursor.
     * @type {boolean}
     */
    get active() { return modal?.isOpen() || captureModal?.isOpen() || false; },

    /**
     * When true, bind-manager will not force cursor teardown on close.
     * Host apps set this to preserve their cursor state across bind-manager sessions.
     * @type {boolean}
     */
    get keepCursorAfterClose() { return _keepCursorAfterClose; },
    set keepCursorAfterClose(value) { _keepCursorAfterClose = !!value; },

    /**
     * Subscribe to active-state transitions.
     * Callback receives (active: boolean) whenever the active state changes.
     * @param {(active: boolean) => void} callback
     * @returns {() => void} unsubscribe
     */
    onActiveChange(callback) {
      _activeChangeListeners.add(callback);
      return () => _activeChangeListeners.delete(callback);
    },

    // ── Browser shortcut guard ───────────────────────────────────────────────

    /**
     * Browser shortcut guard: cancels browser shortcuts / defaults while the game
     * owns input, Keyboard Lock in fullscreen, optional leave-site prompt.
     * Always present; inert until enabled via the `browserGuard` option or setEnabled(true).
     * @type {BrowserGuardApi}
     */
    get browserGuard() { return guardApi; },

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
     * Get the resolved family ('xbox' | 'xbox360' | 'dualshock4' | 'dualsense' |
     * 'switch-pro' | 'steam' | 'stadia' | 'generic') for a connected gamepad.
     * @param {number} [gamepadIndex=0]
     * @returns {string}
     */
    getActiveGamepadProfile(gamepadIndex = 0) {
      return gamepadRuntime.getActiveProfile(gamepadIndex);
    },

    /**
     * Get the resolved profile of a connected gamepad (or the generic one when
     * no pad is at that index). `source` is 'manual', 'exact', 'family',
     * 'generic' or 'memory-edit'; `ignoredOverride` names a stored exact
     * override that does not fit the pad; `labelVariant` is e.g. 'xbox-elite'.
     * @param {number} [gamepadIndex=0]
     * @returns {import('../input/gamepad-profile-resolver.js').ResolvedGamepadProfile}
     */
    getResolvedGamepadProfile(gamepadIndex = 0) {
      return gamepadRuntime.getResolvedProfile(gamepadIndex);
    },

    /**
     * Resolve a human-readable label for a gamepad code using the active profile.
     * @param {string | null} code
     * @param {number | null} [gamepadIndex=null] - null = the first connected gamepad
     * @returns {string}
     */
    getGamepadLabel(code, gamepadIndex = null) {
      return gamepadRuntime.getLabelForCode(code, gamepadIndex);
    },

    /**
     * The thresholds gamepad input is dispatched with (read-only copy).
     * @returns {{ deadband: number, analogThreshold: number, buttonThreshold: number }}
     */
    getGamepadThresholds() {
      return gamepadRuntime.getThresholds();
    },

    /**
     * The logical state of a connected gamepad right now, as the runtime reads
     * it for dispatch: `buttons` (GP_B0..GP_B23, pressed or not) and `axes`
     * (GP_A0..GP_A3 values; a direction is pressed past analogThreshold).
     * @param {number} [gamepadIndex=0]
     * @returns {{ buttons: boolean[], axes: number[] } | null}
     */
    getGamepadLogicalState(gamepadIndex = 0) {
      return gamepadRuntime.getLogicalState(gamepadIndex);
    },

    /**
     * Get info about all currently connected gamepads: index, raw `Gamepad.id`,
     * the resolved family (`profile`) and the full resolved profile.
     * @returns {{ index: number, id: string, profile: string, resolvedProfile: import('../input/gamepad-profile-resolver.js').ResolvedGamepadProfile }[]}
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
     * An exact profile that does not fit the pad's layout is stored anyway (the
     * pad may report a raw layout later) but not applied: the resolved profile
     * reports it in `ignoredOverride`, and the first such case warns once.
     * @param {number} [gamepadIndex=0]
     * @param {{ type: 'profile', key: string } | { type: 'family', family: string } | null} override
     * @returns {boolean} true when stored
     */
    setGamepadProfileOverride(gamepadIndex = 0, override = null) {
      const stored = gamepadRuntime.setProfileOverride(gamepadIndex, override);
      const ignored = stored ? gamepadRuntime.getResolvedProfile(gamepadIndex).ignoredOverride : null;
      if (ignored && !warnedIgnoredOverride) {
        warnedIgnoredOverride = true;
        console.warn(`[BindManager] The exact profile "${ignored.key}" does not fit the layout of the controller in slot ${gamepadIndex}; it is saved but not applied (see getResolvedGamepadProfile().ignoredOverride).`);
      }
      return stored;
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
     * Remove a logical mapping entry from the active gamepad profile in memory:
     * the code gets its base entry back (the exact profile's, or the standard
     * layout's on a pad without one). A mapping back to its base is no edit.
     * @param {number} [gamepadIndex=0]
     * @param {string} code
     * @returns {boolean}
     */
    removeGamepadProfileMappingEntry(gamepadIndex = 0, code) {
      return gamepadRuntime.removeProfileMappingEntry(gamepadIndex, code);
    },

    /**
     * Discard every in-memory mapping edit of a connected gamepad; it maps by
     * its exact profile, or its standard layout, again.
     * @param {number} [gamepadIndex=0]
     * @returns {boolean} true when there were edits
     */
    resetGamepadProfileMapping(gamepadIndex = 0) {
      return gamepadRuntime.resetProfileMapping(gamepadIndex);
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
     * - replace: apply payload actions and clear missing known actions (keyboard
     *   and, for v2 payloads, gamepad slots); in v2 a device field missing from
     *   an entry clears that device too. v1 payloads leave gamepad slots alone.
     *   Saved bindings of actions not registered yet are replaced by the
     *   payload's (validated) entries for them, or dropped when it has none.
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
        storedUnregisteredActions: [],
        droppedUnregisteredActions: [],
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
      const unknownActionIds = [...incomingActionIds].filter(id => !registry.has(id));

      for (const action of knownActions) {
        const incoming = _hasOwn(bindingsObj, action.id) ? bindingsObj[action.id] : undefined;
        // Normalise to { keyboard: [...] | null, gamepad: [...] | null }, handling v1 (array) and v2 ({keyboard, gamepad})
        // A null device array means "not provided / invalid" → that device's slots are left unchanged.
        const entry = _normaliseBindingEntry(incoming, payloadVersion, action.id, report.invalidEntries);
        const hasEntry = entry != null;
        const shouldProcess = hasEntry || (mode === 'replace' && !incomingActionIds.has(action.id));
        if (!shouldProcess) continue;

        // Per device: the slot values to apply, or null to leave the device untouched.
        // Replace mode clears (empty source) a missing action and, in v2, a missing
        // device field. v1 payloads and legacy array entries cannot express gamepad
        // bindings, so those are kept.
        const replace = mode === 'replace';
        const kbSource = hasEntry
          ? (entry.keyboard ?? (replace && entry.keyboardMissing ? [] : null))
          : [];
        const gpSource = payloadVersion < 2 ? null
          : hasEntry
            ? (entry.gamepad ?? (replace && entry.gamepadMissing ? [] : null))
            : [];

        let actionChanged = false;

        // ── Keyboard slots ──────────────────────────────────────────────────
        if (kbSource) {
          const kbTarget = Array.from({ length: action.slots }, (_, slot) => {
            const raw = kbSource[slot];
            if (raw === null || raw === undefined) return null;
            if (typeof raw === 'string') {
              if (isKnownCode(raw)) return raw;
              report.invalidEntries.push(`Action "${action.id}" keyboard slot ${slot} has unknown code "${raw}"`);
              return KEEP_SLOT;
            }
            report.invalidEntries.push(`Action "${action.id}" keyboard slot ${slot} has invalid value type`);
            return null;
          });
          for (let slot = 0; slot < kbTarget.length; slot++) {
            if (kbTarget[slot] === KEEP_SLOT) continue;
            const current = store.get(action.id, 'keyboard')?.[slot] ?? null;
            const next = kbTarget[slot] ?? null;
            if (current === next) continue;
            const result = store.set(action.id, slot, next, 'keyboard');
            actionChanged = true;
            report.appliedSlots += 1;
            report.conflictCount += result.conflicts.length;
          }
        }

        // ── Gamepad slots (v2 only) ─────────────────────────────────────────
        if (gpSource) {
          const gpTarget = Array.from({ length: action.gamepadSlots }, (_, slot) => {
            const raw = gpSource[slot];
            if (raw === null || raw === undefined) return null;
            if (typeof raw === 'string') {
              if (isGamepadCode(raw)) return raw;
              report.invalidEntries.push(`Action "${action.id}" gamepad slot ${slot} has unknown code "${raw}"`);
              return KEEP_SLOT;
            }
            report.invalidEntries.push(`Action "${action.id}" gamepad slot ${slot} has invalid value type`);
            return null;
          });
          for (let slot = 0; slot < gpTarget.length; slot++) {
            if (gpTarget[slot] === KEEP_SLOT) continue;
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

      // ── Actions not registered (yet) ─────────────────────────────────────
      // Merge mode ignores them. Replace mode makes the saved entries of all
      // unregistered actions match the payload: valid entries are stored (and
      // apply when the action registers), saved ids missing from the payload
      // are dropped, and an unrecognisable entry keeps the saved one.
      // Bounded: ids up to MAX_SAVED_ID_LENGTH characters, at most
      // MAX_UNREGISTERED_IDS entries, MAX_SAVED_SLOTS slots per device; what is
      // cut or dropped is reported (invalidEntries, droppedUnregisteredActions).
      const stored = new Set();
      const dropped = new Set();
      if (mode === 'replace') {
        const entries = new Map();
        let overLimit = 0;
        for (const actionId of unknownActionIds) {
          if (actionId.length > MAX_SAVED_ID_LENGTH) {
            dropped.add(actionId);
            report.invalidEntries.push(`Action id "${_reportId(actionId)}" is longer than ${MAX_SAVED_ID_LENGTH} characters and was not stored`);
            continue;
          }
          if (entries.size >= MAX_UNREGISTERED_IDS) {
            dropped.add(actionId);
            overLimit += 1;
            continue;
          }
          const saved = store.getSavedEntry(actionId);
          const entry = _normaliseBindingEntry(bindingsObj[actionId], payloadVersion, actionId, report.invalidEntries);
          if (!entry) {
            if (saved !== undefined) entries.set(actionId, saved);
            continue;
          }
          entries.set(actionId, _sanitiseSavedEntry(entry, saved, payloadVersion, actionId, report.invalidEntries));
          stored.add(actionId);
        }
        if (overLimit > 0) {
          report.invalidEntries.push(`${overLimit} unregistered action ids beyond the first ${MAX_UNREGISTERED_IDS} were not stored`);
        }
        store.replaceUnregisteredSaved(entries);
      }
      for (const actionId of unknownActionIds) {
        const list = stored.has(actionId) ? report.storedUnregisteredActions
          : dropped.has(actionId) ? report.droppedUnregisteredActions
            : report.skippedUnknownActions;
        list.push(_reportId(actionId));
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

    /**
     * Result of the most recent save. `ok` is false and `lastError` holds the
     * error while the last save failed (quota exceeded, storage unavailable,
     * or a custom adapter's save() threw or returned false); a successful
     * save clears `lastError`. `lastFailure` keeps the most recent failure
     * (`{ error, at }`, `at` a Date.now() timestamp). Every later change is
     * saved again regardless.
     * @returns {{ ok: boolean, failedSaves: number, lastError: unknown, lastFailure: { error: unknown, at: number } | null }}
     */
    getStorageStatus() {
      return { ...storageStatus };
    },

    /**
     * Delete everything persisted for this namespace (bindings and gamepad
     * profile overrides) via the storage adapter's clear(). In-memory
     * bindings are untouched; the next binding change is persisted again.
     * Saved bindings of actions not registered yet are dropped as well, so
     * those actions get their defaults when they register.
     * Call resetAll() first to also return the live bindings to defaults.
     * @returns {boolean} false when the storage adapter has no clear()
     */
    clearStorage() {
      if (typeof storageAdapter.clear !== 'function') return false;
      storageAdapter.clear();
      store.clearSaved();
      return true;
    },

    /**
     * Lists current keyboard/mouse bindings the browser or OS may keep for itself.
     * Use it to check defaults at startup or to show a summary to the player.
     * @param {{ keyboardLocked?: boolean }} [options] defaults to the isKeyboardLocked option
     * @returns {{ actionId: string, slot: number, code: string, level: 'blocked' | 'unreliable', reason: string }[]}
     */
    getReservedBindings(options) {
      const opts = options ?? { keyboardLocked: typeof isKeyboardLocked === 'function' ? isKeyboardLocked() : false };
      const found = [];
      for (const [actionId, bindings] of Object.entries(store.getAll())) {
        bindings.keyboard.forEach((code, slot) => {
          const info = getReservedInfo(code, opts);
          if (info) found.push({ actionId, slot, code, level: info.level, reason: info.reason });
        });
      }
      return found;
    },

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
     * Listen for any action event across all actions and devices: `pressed`,
     * `held` and `released`, and the gamepad's `analog` events (analog actions;
     * an action bound to one half of an axis gets `code` set to that half). A
     * handler that tracks up/down state should skip `type === 'analog'` and read
     * analog values with the action handle's `onAnalog()`.
     * @param {(event: import('../input/keyboard-runtime.js').ActionEvent) => void} listener
     * @returns {() => void} unsubscribe
     */
    onAnyAction(listener) {
      const unsubs = [
        runtime.onAnyAction(listener),
        gamepadRuntime.onAnyAction(listener),
        mouseRuntime.onAnyAction(listener),
      ];
      return () => unsubs.forEach(fn => fn());
    },

    /**
     * Check if the key(s) bound to an action are currently held down.
     * Gamepad bindings honour the action's playerIndex, like action events do.
     * Mouse wheel bindings are never "held": the wheel only emits a
     * pressed+released pulse, so use onPressed() for wheel actions.
     * @param {string} actionId
     * @returns {boolean}
     */
    isActionPressed(actionId) {
        const kbBindings = store.get(actionId, 'keyboard') ?? [];
        const gpBindings = store.get(actionId, 'gamepad')  ?? [];
        const playerIndex = registry.get(actionId)?.playerIndex ?? null;
        return kbBindings.some(code => code && (runtime.isPressed(code) || mouseRuntime.isPressed(code)))
          || gpBindings.some(code => code && gamepadRuntime.isPressed(code, playerIndex));
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Tear down all DOM elements, event listeners, and subscriptions.
     * Call this if you need to remove the Bind Manager from a running page.
     */
    destroy() {
      // Close first so `active` drops to false and onActiveChange listeners hear it
      modal.close();
      unsubPersist();
      if (_debugListener) window.removeEventListener('keydown', _debugListener);
      runtime.stop();
      gamepadRuntime.stop();
      mouseRuntime.stop();
      guard.stop();
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
  modal = new ModalController(store, registry, runtime, gamepadRuntime, captureModal, mergedFooterActions, mouseRuntime, {
    reservedKeyWarnings,
    isKeyboardLocked,
  });
  hints = new HintsController(store, registry, gamepadRuntime);

  // Wire active-change notifications around modal open/close
  let _prevActive = false;
  const _emitActiveChange = () => {
    const nowActive = manager.active;
    if (nowActive !== _prevActive) {
      _prevActive = nowActive;
      for (const cb of _activeChangeListeners) {
        try { cb(nowActive); } catch (err) {
          console.error('[BindManager] onActiveChange listener threw:', err);
        }
      }
    }
  };
  const _origOpen = modal.open.bind(modal);
  const _origClose = modal.close.bind(modal);
  modal.open = () => { _origOpen(); _emitActiveChange(); };
  modal.close = () => { _origClose(); _emitActiveChange(); };

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
        e.preventDefault();  // also on auto-repeat, so a held F5 never reloads the page
        if (!e.repeat) modal.toggle();
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
          mouseRuntime.onAction(actionId, (e) => { if (e.type === 'pressed') cb(e); }),
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
          mouseRuntime.onAction(actionId, (e) => { if (e.type === 'released') cb(e); }),
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
          mouseRuntime.onAction(actionId, (e) => { if (e.type === 'held') cb(e); }),
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
 * `browserGuard: true` → enabled with defaults; object → enabled unless `enabled: false`.
 * @param {boolean | import('../input/browser-shortcut-guard.js').BrowserGuardOptions | null | undefined} value
 */
function _normaliseBrowserGuardOption(value) {
  if (value === true) return { enabled: true };
  if (value && typeof value === 'object') return { ...value, enabled: value.enabled ?? true };
  return { enabled: false };
}

/**
 * Public facade over BrowserShortcutGuard (keeps private state off the manager).
 * @param {BrowserShortcutGuard} guard
 * @returns {BrowserGuardApi}
 */
function _makeBrowserGuardApi(guard) {
  return {
    get enabled() { return guard.enabled; },
    setEnabled(enabled) { guard.setEnabled(enabled); },
    setTarget(target) { guard.setTarget(target); },
    isEngaged() { return guard.isEngaged(); },
    setGameOwnsInput(owned) { guard.setGameOwnsInput(owned); },
    block(patterns) { guard.block(patterns); },
    allow(patterns) { guard.allow(patterns); },
    getShortcutPolicy() { return guard.getShortcutPolicy(); },
    get keyboardLockSupported() { return guard.keyboardLockSupported; },
    isKeyboardLocked() { return guard.isKeyboardLocked(); },
    enterFullscreen(element) { return guard.enterFullscreen(element); },
    exitFullscreen() { return guard.exitFullscreen(); },
    armLeaveGuard() { guard.armLeaveGuard(); },
    disarmLeaveGuard() { guard.disarmLeaveGuard(); },
    isLeaveGuardArmed() { return guard.isLeaveGuardArmed(); },
  };
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
  if (!Number.isInteger(parsed.version) || parsed.version < 1 || parsed.version > 2) {
    return { ok: false, reason: `Unsupported payload version: ${parsed.version} (expected 1 or 2)` };
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
 * - v1 (array): treated as keyboard-only, gamepad is not provided (null)
 * - v2 (object with keyboard/gamepad): used directly; a missing device field
 *   is treated as not provided (null, flagged `<device>Missing` so replace mode
 *   can clear it) and a present non-array field is reported in `invalidEntries`
 *   and also treated as not provided (but not flagged missing)
 * Returns null if the entry is missing or unrecognisable.
 * @param {unknown} incoming
 * @param {number} payloadVersion
 * @param {string} actionId
 * @param {string[]} invalidEntries
 * @returns {{ keyboard: unknown[] | null, gamepad: unknown[] | null, keyboardMissing: boolean, gamepadMissing: boolean } | null}
 */
function _normaliseBindingEntry(incoming, payloadVersion, actionId, invalidEntries) {
  if (incoming == null) return null;
  if (Array.isArray(incoming)) {
    // v1 format — keyboard only
    return { keyboard: incoming, gamepad: null, keyboardMissing: false, gamepadMissing: false };
  }
  if (typeof incoming === 'object' && payloadVersion >= 2) {
    const pickDevice = (device) => {
      const value = _hasOwn(incoming, device) ? incoming[device] : undefined;
      if (value === undefined) return null;
      if (Array.isArray(value)) return value;
      invalidEntries.push(`Action "${actionId}" ${device} must be an array`);
      return null;
    };
    return {
      keyboard: pickDevice('keyboard'),
      gamepad:  pickDevice('gamepad'),
      keyboardMissing: !_hasOwn(incoming, 'keyboard') || incoming.keyboard === undefined,
      gamepadMissing:  !_hasOwn(incoming, 'gamepad')  || incoming.gamepad  === undefined,
    };
  }
  return null;
}

/**
 * Validate a normalised import entry of an action that is not registered into
 * a saved entry ({ keyboard?, gamepad? }), with the checks used for registered
 * actions. Slot counts are unknown, so the payload's array length is kept.
 * Per device: a provided array is validated (an unknown code keeps the saved
 * slot, a non-string value becomes null); a v2 field that is missing clears
 * the device ([]); otherwise (invalid field, v1 payload, legacy array entry)
 * the saved device array is kept, or left out so defaults apply.
 * @param {{ keyboard: unknown[] | null, gamepad: unknown[] | null, keyboardMissing: boolean, gamepadMissing: boolean }} entry
 * @param {unknown} saved
 * @param {number} payloadVersion
 * @param {string} actionId
 * @param {string[]} invalidEntries
 * @returns {{ keyboard?: (string|null)[], gamepad?: (string|null)[] }}
 */
function _sanitiseSavedEntry(entry, saved, payloadVersion, actionId, invalidEntries) {
  const savedKb = Array.isArray(saved) ? saved : (saved && Array.isArray(saved.keyboard) ? saved.keyboard : null);
  const savedGp = saved && !Array.isArray(saved) && Array.isArray(saved.gamepad) ? saved.gamepad : null;

  const device = (name, source, missing, savedSlots, isValid) => {
    if (source) {
      if (source.length > MAX_SAVED_SLOTS) {
        invalidEntries.push(`Action "${actionId}" ${name} has ${source.length} slots; only the first ${MAX_SAVED_SLOTS} are stored`);
        source = source.slice(0, MAX_SAVED_SLOTS);
      }
      return Array.from(source, (raw, slot) => {
        if (raw === null || raw === undefined) return null;
        if (typeof raw === 'string') {
          if (isValid(raw)) return raw;
          invalidEntries.push(`Action "${actionId}" ${name} slot ${slot} has unknown code "${raw}"`);
          return typeof savedSlots?.[slot] === 'string' ? savedSlots[slot] : null;
        }
        invalidEntries.push(`Action "${actionId}" ${name} slot ${slot} has invalid value type`);
        return null;
      });
    }
    if (missing) return [];
    return savedSlots ? savedSlots.slice(0, MAX_SAVED_SLOTS) : undefined;
  };

  const result = {};
  const keyboard = device('keyboard', entry.keyboard, entry.keyboardMissing, savedKb, isKnownCode);
  const gamepad = payloadVersion >= 2
    ? device('gamepad', entry.gamepad, entry.gamepadMissing, savedGp, isGamepadCode)
    : (savedGp ? savedGp.slice(0, MAX_SAVED_SLOTS) : undefined);
  if (keyboard) result.keyboard = keyboard;
  if (gamepad) result.gamepad = gamepad;
  return result;
}

/** An action id as listed in an import report: cut to MAX_SAVED_ID_LENGTH characters plus an ellipsis. */
function _reportId(actionId) {
  return actionId.length > MAX_SAVED_ID_LENGTH ? `${actionId.slice(0, MAX_SAVED_ID_LENGTH)}…` : actionId;
}

/** Own-property check (ids like "constructor" must not match Object.prototype members). */
function _hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
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
 * @property {boolean | import('../input/browser-shortcut-guard.js').BrowserGuardOptions} [browserGuard=false]
 *           - Cancel browser shortcuts while the game owns input (opt-in)
 * @property {number} [wheelPixelThreshold=30]     - Pixel delta that counts as one wheel notch
 * @property {boolean} [reservedKeyWarnings=true]  - Warn in the rebind dialog about keys the browser or OS keeps
 * @property {(() => boolean) | null} [isKeyboardLocked=null] - Return true while Keyboard Lock is active (fullscreen, Chromium)
 *
 * @typedef {object} BrowserGuardApi
 * @property {boolean} enabled
 * @property {(enabled: boolean) => void} setEnabled
 * @property {(target: HTMLElement | null) => void} setTarget
 * @property {() => boolean} isEngaged
 * @property {(owned: boolean) => void} setGameOwnsInput
 * @property {(patterns: string | string[]) => void} block
 * @property {(patterns: string | string[]) => void} allow
 * @property {() => { shortcuts: string[], block: string[], allow: string[] }} getShortcutPolicy
 * @property {boolean} keyboardLockSupported
 * @property {() => boolean} isKeyboardLocked
 * @property {(element?: HTMLElement) => Promise<{ fullscreen: boolean, keyboardLocked: boolean, error?: unknown }>} enterFullscreen
 * @property {() => Promise<void>} exitFullscreen
 * @property {() => void} armLeaveGuard
 * @property {() => void} disarmLeaveGuard
 * @property {() => boolean} isLeaveGuardArmed
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
 * @property {string[]} skippedUnknownActions     - ids not registered whose payload entry was ignored
 * @property {string[]} storedUnregisteredActions - replace mode: ids not registered whose entry was
 *           stored and applies when the action registers
 * @property {string[]} droppedUnregisteredActions - replace mode: ids not registered that were not
 *           stored because of a cap (id longer than 128 characters, cut in this list; or beyond the
 *           first 512 stored ids of the import)
 * @property {string[]} invalidEntries
 * @property {number} conflictCount
 */
