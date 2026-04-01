/**
 * GamepadRuntime — polls the Web Gamepad API every animation frame and
 * translates raw button/axis state into action events that mirror the
 * KeyboardRuntime contract (pressed / held / released + analog).
 *
 * Axes are debounced with a configurable deadband and threshold:
 *   deadband        (default 0.12) — ignore tiny resting drift; no events below this
 *   analogThreshold (default 0.50) — minimum value to trigger a digital pressed/held/released
 *
 * Capture mode: startCapture(callback) → next meaningful input → callback(code) + haptic.
 * Cancel with cancelCapture() or pressing nothing (escaped from modal via Escape key).
 *
 * Custom DOM events dispatched to window for UI re-renders:
 *   'bm-gamepad-connected'    { detail: Gamepad }
 *   'bm-gamepad-disconnected' { detail: Gamepad }
 */
import { isGamepadCode } from './gamepad-codes.js';
import {
  getAvailableGamepadProfileOptions,
  getGamepadIdentityKey,
  getResolvedGamepadLabel,
  normaliseGamepadProfileOverride,
  resolveGamepadProfile,
} from './gamepad-profile-resolver.js';

const GP_BUTTON_COUNT = 17;
const GP_AXIS_COUNT   = 4;

function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export class GamepadRuntime {
  /**
   * @param {import('../core/binding-store.js').BindingStore} bindingStore
   * @param {import('../core/action-registry.js').ActionRegistry} registry
   * @param {{ deadband?: number, analogThreshold?: number }} [options]
   */
  constructor(bindingStore, registry, options = {}) {
    this._store           = bindingStore;
    this._registry        = registry;
    this._deadband        = options.deadband        ?? 0.12;
    this._analogThreshold = options.analogThreshold ?? 0.50;
    this._onProfileOverridesChange = typeof options.onProfileOverridesChange === 'function'
      ? options.onProfileOverridesChange
      : null;

    /** @type {Map<number, { buttons: boolean[], axes: number[] }>} */
    this._curState = new Map();
    /** @type {Map<number, any>} */
    this._resolvedProfileByGamepadIndex = new Map();
    /** @type {Map<string, { type: 'profile', key: string } | { type: 'family', family: string }>} */
    this._profileOverrides = new Map(Object.entries(options.profileOverrides ?? {}));
    /** @type {Map<string, any>} */
    this._profileDefinitionOverrides = new Map();
    /** @type {Map<string, CompiledControllerMapping>} */
    this._compiledProfileCache = new Map();

    /** @type {Map<string, Set<Function>>} per-action listeners */
    this._listeners    = new Map();
    /** @type {Set<Function>} all-action listeners */
    this._anyListeners = new Set();

    this._gameplaySuppressed = false;
    /** @type {((code: string | null) => void) | null} */
    this._captureCallback = null;
    this._rafId = null;

    this._boundPoll   = this._poll.bind(this);
    this._onConnect   = this._handleConnect.bind(this);
    this._onDisconnect = this._handleDisconnect.bind(this);
  }

  /** Begin polling and listening for gamepad connect/disconnect events. */
  start() {
    if (typeof window === 'undefined') return;
    window.addEventListener('gamepadconnected',    this._onConnect);
    window.addEventListener('gamepaddisconnected', this._onDisconnect);
    this._rafId = requestAnimationFrame(this._boundPoll);
  }

  /** Stop polling and unregister all window listeners. */
  stop() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('gamepadconnected',    this._onConnect);
    window.removeEventListener('gamepaddisconnected', this._onDisconnect);
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
    if (!this._listeners.has(actionId)) this._listeners.set(actionId, new Set());
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
    if (code.startsWith('GP_B')) {
      const idx = parseInt(code.slice(4), 10);
      for (const [, state] of this._curState) {
        if (state.buttons[idx] === true) return true;
      }
    } else {
      const match = code.match(/^GP_A(\d)(N|P)$/);
      if (!match) return false;
      const axisIdx = parseInt(match[1], 10);
      const neg     = match[2] === 'N';
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
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return [];
    return [...navigator.getGamepads()]
      .filter(Boolean)
      .map((g) => {
        const resolvedProfile = this._getResolvedProfileForGamepad(g);
        return {
          index: g.index,
          id: g.id,
          profile: resolvedProfile.family,
          resolvedProfile,
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
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return resolveGamepadProfile(null);
    const gp = [...navigator.getGamepads()].find(g => g && g.index === gamepadIndex);
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
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return getAvailableGamepadProfileOptions(null);
    const gp = [...navigator.getGamepads()].find(g => g && g.index === gamepadIndex);
    return getAvailableGamepadProfileOptions(gp?.id ?? null);
  }

  /**
   * @param {number} [gamepadIndex=0]
   * @returns {{ type: 'profile', key: string } | { type: 'family', family: string } | null}
   */
  getProfileOverride(gamepadIndex = 0) {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
    const gp = [...navigator.getGamepads()].find(g => g && g.index === gamepadIndex);
    const identityKey = getGamepadIdentityKey(gp?.id ?? null);
    return identityKey ? this._profileOverrides.get(identityKey) ?? null : null;
  }

  /**
   * @param {number} [gamepadIndex=0]
   * @param {{ type: 'profile', key: string } | { type: 'family', family: string } | null} override
   * @returns {boolean}
   */
  setProfileOverride(gamepadIndex = 0, override = null) {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return false;
    const gp = [...navigator.getGamepads()].find(g => g && g.index === gamepadIndex);
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
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return false;
    const gp = [...navigator.getGamepads()].find(g => g && g.index === gamepadIndex);
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
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return false;
    const gp = [...navigator.getGamepads()].find(g => g && g.index === gamepadIndex);
    const identityKey = getGamepadIdentityKey(gp?.id ?? null);
    if (!gp || !identityKey || typeof code !== 'string' || !code.trim()) return false;

    const resolved = this._getResolvedProfileForGamepad(gp);
    const editable = this._createEditableDefinition(gp, resolved);
    if (!editable.mapping || typeof editable.mapping !== 'object') editable.mapping = {};
    if (!editable.labels || typeof editable.labels !== 'object') editable.labels = {};

    if (!entry || typeof entry !== 'object') {
      delete editable.mapping[code];
    } else {
      const normalised = this._normaliseMappingEntry(entry);
      if (!normalised) return false;
      if (normalised.kind === 'hat') {
        editable.mapping[code] = {
          kind: 'hat',
          index: normalised.index,
          value: normalised.value,
          tolerance: normalised.tolerance,
        };
      } else {
        editable.mapping[code] = {
          kind: normalised.kind,
          index: normalised.index,
          direction: normalised.direction,
        };
      }
    }

    if (typeof options.label === 'string' && options.label.trim()) {
      editable.labels[code] = options.label.trim();
    }

    editable.capturedAt = new Date().toISOString();
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
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
    const gp = [...navigator.getGamepads()].find(g => g && g.index === gamepadIndex);
    if (!gp) return null;
    const resolved = this._getResolvedProfileForGamepad(gp);
    return resolved?.definition ? deepClone(resolved.definition) : null;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _handleConnect(e) {
    this._resolvedProfileByGamepadIndex.set(
      e.gamepad.index,
      resolveGamepadProfile(e.gamepad.id, { override: this._getOverrideForGamepadId(e.gamepad.id) }),
    );
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bm-gamepad-connected', { detail: e.gamepad }));
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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bm-gamepad-disconnected', { detail: e.gamepad }));
    }
  }

  _poll() {
    this._rafId = requestAnimationFrame(this._boundPoll);
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    const gamepads = navigator.getGamepads();
    for (const gamepad of gamepads) {
      if (gamepad && gamepad.connected) this._processGamepad(gamepad);
    }
  }

  _processGamepad(gamepad) {
    const prev = this._curState.get(gamepad.index) ?? {
      buttons: new Array(GP_BUTTON_COUNT).fill(false),
      axes:    new Array(GP_AXIS_COUNT).fill(0),
    };

    // Snapshot current state as canonical logical GP buttons/axes.
    const cur = this._snapshotLogicalState(gamepad);

    this._curState.set(gamepad.index, cur);

    // ── Capture mode ─────────────────────────────────────────────────────────
    if (this._captureCallback) {
      const detected = this._detectCapture(gamepad, prev, cur);
      if (detected != null) {
        const cb = this._captureCallback;
        this._captureCallback = null;
        this._triggerHaptic(gamepad);
        // Restore prev state so this press doesn't also fire normal events next frame
        this._curState.set(gamepad.index, prev);
        cb(detected);
      }
      return; // Never fire action events during capture
    }

    if (this._gameplaySuppressed) return;

    // ── Button events ─────────────────────────────────────────────────────────
    const btnLen = Math.min(cur.buttons.length, GP_BUTTON_COUNT);
    for (let i = 0; i < btnLen; i++) {
      const wasPressed = prev.buttons[i] ?? false;
      const isNowPressed  = cur.buttons[i]  ?? false;
      const code = `GP_B${i}`;
      if      (!wasPressed && isNowPressed)  this._dispatch(gamepad.index, code, 'pressed',  1);
      else if ( wasPressed && isNowPressed)  this._dispatch(gamepad.index, code, 'held',     1);
      else if ( wasPressed && !isNowPressed) this._dispatch(gamepad.index, code, 'released', 0);
    }

    // ── Axis events ───────────────────────────────────────────────────────────
    const axisLen = Math.min(cur.axes.length, GP_AXIS_COUNT);
    for (let a = 0; a < axisLen; a++) {
      const prevVal = prev.axes[a] ?? 0;
      const curVal  = cur.axes[a]  ?? 0;
      const thr = this._analogThreshold;

      // Continuous analog event (above deadband, direction-agnostic)
      if (Math.abs(curVal) > this._deadband) {
        this._dispatchAnalog(gamepad.index, a, curVal);
      }

      // Negative direction (e.g. stick left or stick up)
      const codeN  = `GP_A${a}N`;
      const prevN  = prevVal < -thr;
      const curN   = curVal  < -thr;
      if      (!prevN && curN)  this._dispatch(gamepad.index, codeN, 'pressed',  Math.abs(curVal));
      else if ( prevN && curN)  this._dispatch(gamepad.index, codeN, 'held',     Math.abs(curVal));
      else if ( prevN && !curN) this._dispatch(gamepad.index, codeN, 'released', 0);

      // Positive direction (e.g. stick right or stick down)
      const codeP  = `GP_A${a}P`;
      const prevP  = prevVal > thr;
      const curP   = curVal  > thr;
      if      (!prevP && curP)  this._dispatch(gamepad.index, codeP, 'pressed',  curVal);
      else if ( prevP && curP)  this._dispatch(gamepad.index, codeP, 'held',     curVal);
      else if ( prevP && !curP) this._dispatch(gamepad.index, codeP, 'released', 0);
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
        // Only trigger if it crossed the threshold this frame
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
        const value = typeof btn?.value === 'number' ? btn.value : (btn?.pressed ? 1 : 0);
        buttons[i] = (btn?.pressed === true) || value > 0.5;
      }
      return {
        buttons,
        axes: [...gamepad.axes].slice(0, GP_AXIS_COUNT),
      };
    }

    const logicalButtons = new Array(GP_BUTTON_COUNT).fill(false);
    const logicalAxes = new Array(GP_AXIS_COUNT).fill(0);

    for (let i = 0; i < GP_BUTTON_COUNT; i++) {
      const entry = compiled.buttons[i];
      if (!entry) continue;
      if (entry.kind === 'hat') {
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
      axes: logicalAxes,
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
      override: this._getOverrideForGamepadId(gamepad.id),
    });
    const identityKey = getGamepadIdentityKey(gamepad.id);
    const editedDefinition = identityKey ? this._profileDefinitionOverrides.get(identityKey) : null;
    const finalResolved = editedDefinition
      ? {
          ...resolvedProfile,
          source: 'memory-edit',
          definition: deepClone(editedDefinition),
          profileKey: editedDefinition.key ?? resolvedProfile.profileKey ?? null,
          profileHint: editedDefinition.profileHint ?? resolvedProfile.profileHint,
          family: editedDefinition.family ?? resolvedProfile.family,
        }
      : resolvedProfile;
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
    if (typeof window !== 'undefined') {
      const identityKey = getGamepadIdentityKey(gamepadId);
      const editedDefinition = identityKey ? this._profileDefinitionOverrides.get(identityKey) : null;
      const resolved = resolveGamepadProfile(gamepadId, {
        override: this._getOverrideForGamepadId(gamepadId),
      });
      const resolvedProfile = editedDefinition
        ? {
            ...resolved,
            source: 'memory-edit',
            definition: deepClone(editedDefinition),
            profileKey: editedDefinition.key ?? resolved.profileKey ?? null,
            profileHint: editedDefinition.profileHint ?? resolved.profileHint,
            family: editedDefinition.family ?? resolved.family,
          }
        : resolved;
      window.dispatchEvent(new CustomEvent('bm-gamepad-profile-changed', {
        detail: {
          gamepadIndex,
          gamepadId,
          resolvedProfile,
        },
      }));
    }
  }

  _createEditableDefinition(gamepad, resolvedProfile) {
    const identityKey = getGamepadIdentityKey(gamepad?.id ?? null);
    const existing = identityKey ? this._profileDefinitionOverrides.get(identityKey) : null;
    if (existing) return deepClone(existing);

    const base = deepClone(resolvedProfile?.definition) || {};
    const idMatch = typeof gamepad?.id === 'string'
      ? gamepad.id.match(/^([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-(.+)$/)
      : null;
    const vendorId = idMatch?.[1]?.toLowerCase() ?? null;
    const productId = idMatch?.[2]?.toLowerCase() ?? null;

    return {
      key: base.key ?? (vendorId && productId ? `${vendorId}-${productId}` : identityKey ?? 'custom-profile'),
      vendorId: base.vendorId ?? vendorId,
      productId: base.productId ?? productId,
      sourceName: base.sourceName ?? (typeof gamepad?.id === 'string' ? gamepad.id : 'Unknown Controller'),
      sourceId: base.sourceId ?? (typeof gamepad?.id === 'string' ? gamepad.id : null),
      sourceButtons: base.sourceButtons ?? (gamepad?.buttons?.length ?? null),
      sourceAxes: base.sourceAxes ?? (gamepad?.axes?.length ?? null),
      capturedAt: new Date().toISOString(),
      profileHint: base.profileHint ?? resolvedProfile?.profileHint ?? resolvedProfile?.family ?? 'generic',
      family: base.family ?? resolvedProfile?.family ?? 'generic',
      labels: base.labels && typeof base.labels === 'object' ? base.labels : {},
      mapping: base.mapping && typeof base.mapping === 'object' ? base.mapping : {},
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
    if (!profile || typeof profile !== 'object' || !profile.mapping) return null;
    const key = `${profile.vendorId ?? 'unknown'}-${profile.productId ?? 'unknown'}:${JSON.stringify(profile.mapping)}`;
    if (this._compiledProfileCache.has(key)) {
      return this._compiledProfileCache.get(key);
    }

    /** @type {CompiledControllerMapping} */
    const compiled = {
      buttons: new Array(GP_BUTTON_COUNT).fill(null),
      axesNeg: new Array(GP_AXIS_COUNT).fill(null),
      axesPos: new Array(GP_AXIS_COUNT).fill(null),
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
    if (!entry || typeof entry !== 'object') return null;
    if ((entry.kind !== 'button' && entry.kind !== 'axis' && entry.kind !== 'hat') || !Number.isInteger(entry.index)) return null;
    if (entry.index < 0) return null;
    if (entry.kind === 'hat') {
      if (typeof entry.value !== 'number' || !Number.isFinite(entry.value)) return null;
      const tolerance = typeof entry.tolerance === 'number' && Number.isFinite(entry.tolerance) && entry.tolerance > 0
        ? entry.tolerance
        : 0.2;
      return {
        kind: 'hat',
        index: entry.index,
        direction: 'positive',
        value: entry.value,
        tolerance,
      };
    }
    return {
      kind: entry.kind,
      index: entry.index,
      direction: entry.direction === 'negative' ? 'negative' : 'positive',
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
    if (entry.kind === 'hat') {
      return this._isHatDirectionActive(gamepad, entry) ? 1 : 0;
    }

    if (entry.kind === 'button') {
      const btn = gamepad.buttons?.[entry.index];
      if (!btn) return 0;
      const value = typeof btn.value === 'number' ? btn.value : (btn.pressed ? 1 : 0);
      return Math.max(0, value);
    }

    const raw = gamepad.axes?.[entry.index] ?? 0;
    if (entry.direction === 'negative') return Math.max(0, -raw);
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
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return false;
    const tolerance = typeof entry.tolerance === 'number' ? entry.tolerance : 0.2;
    return Math.abs(raw - entry.value) <= tolerance;
  }

  /**
   * Resolve the code to bound actions and fire digital events.
   * Respects action.playerIndex (null = any controller).
   * @private
   */
  _dispatch(gamepadIndex, code, type, value) {
    const actionIds = this._store.getActionsByCode(code, 'gamepad');
    for (const actionId of actionIds) {
      const action = this._registry.get(actionId);
      if (!action) continue;
      if (action.playerIndex !== null && action.playerIndex !== gamepadIndex) continue;
      const event = { type, actionId, code, value, device: 'gamepad', gamepadIndex };
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
    const seenActions = new Set();
    for (const code of codes) {
      for (const actionId of this._store.getActionsByCode(code, 'gamepad')) {
        if (seenActions.has(actionId)) continue;
        seenActions.add(actionId);
        const action = this._registry.get(actionId);
        if (!action || !action.analog) continue;
        if (action.playerIndex !== null && action.playerIndex !== gamepadIndex) continue;
        const event = { type: 'analog', actionId, axisIndex, value, device: 'gamepad', gamepadIndex };
        this._fire(actionId, event);
      }
    }
  }

  /** @private */
  _fire(actionId, event) {
    for (const fn of (this._listeners.get(actionId) ?? [])) {
      try { fn(event); } catch (err) {
        console.error('[BindManager] GamepadRuntime listener threw:', err);
      }
    }
    for (const fn of this._anyListeners) {
      try { fn(event); } catch (err) {
        console.error('[BindManager] GamepadRuntime anyListener threw:', err);
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
      if (typeof gamepad.vibrationActuator?.playEffect === 'function') {
        gamepad.vibrationActuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: 80,
          weakMagnitude: 0.3,
          strongMagnitude: 0.3,
        }).catch(() => {}); // user-gesture restrictions may block this
      }
    } catch { /* haptics are best-effort */ }
  }
}

/**
 * @typedef {object} GamepadActionEvent
 * @property {'pressed' | 'held' | 'released' | 'analog'} type
 * @property {string} actionId
 * @property {string} [code]       — for digital events
 * @property {number} [axisIndex]  — for analog events
 * @property {number} value        — button value or axis value
 * @property {'gamepad'} device
 * @property {number} gamepadIndex
 */

/**
 * @typedef {object} CompiledInputMappingEntry
 * @property {'button' | 'axis' | 'hat'} kind
 * @property {number} index
 * @property {'negative' | 'positive'} direction
 * @property {number} [value]
 * @property {number} [tolerance]
 */

/**
 * @typedef {object} CompiledControllerMapping
 * @property {(CompiledInputMappingEntry | null)[]} buttons
 * @property {(CompiledInputMappingEntry | null)[]} axesNeg
 * @property {(CompiledInputMappingEntry | null)[]} axesPos
 */
