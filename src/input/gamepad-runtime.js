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
import { GP_AXIS_COUNT, GP_BUTTON_COUNT, isGamepadCode } from './gamepad-codes.js';
import { parseGamepadId } from './gamepad-profiles.js';
import {
  getAvailableGamepadProfileOptions,
  getGamepadIdentityKey,
  getGamepadIdentityKeys,
  getResolvedGamepadLabel,
  normaliseGamepadProfileOverride,
  resolveGamepadProfile,
} from './gamepad-profile-resolver.js';

// A hat switch reported as one axis: eight positions 2/7 apart, clockwise from
// up at -1 (up, up-right, right, down-right, down, down-left, left, up-left);
// neutral is outside the range (9/7 in Firefox on Windows).
const HAT_STEP = 2 / 7;
/** A raw value further than this from every grid position is neutral. */
const HAT_GRID_TOLERANCE = HAT_STEP / 4;
/** An entry value this close to a grid position counts as on the grid. */
const HAT_GRID_EPSILON = 1e-3;
const HAT_SECTOR_DIRECTIONS = [
  ['up'], ['up', 'right'], ['right'], ['down', 'right'],
  ['down'], ['down', 'left'], ['left'], ['up', 'left'],
];

/** @returns {number} sector 0-7 when raw is within `tolerance` of a grid position, else -1 */
function hatSector(raw, tolerance = HAT_GRID_TOLERANCE) {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return -1;
  const sector = Math.round((raw + 1) / HAT_STEP);
  if (sector < 0 || sector > 7) return -1;
  return Math.abs(raw - (-1 + sector * HAT_STEP)) <= tolerance ? sector : -1;
}

/**
 * Decode a hat-switch axis value into D-pad directions. A diagonal sets both
 * of its directions; neutral, or any value not within a quarter step of one
 * of the eight positions, sets none.
 * @param {number} raw - the raw axis value
 * @returns {{ up: boolean, right: boolean, down: boolean, left: boolean }}
 */
export function decodeHatValue(raw) {
  const directions = HAT_SECTOR_DIRECTIONS[hatSector(raw)] ?? [];
  return {
    up: directions.includes('up'),
    right: directions.includes('right'),
    down: directions.includes('down'),
    left: directions.includes('left'),
  };
}

const hatGridCache = new WeakMap();

/**
 * True when the hat entries of `mapping` on `axisIndex` are the generator's
 * layout: exactly four, each on a different cardinal position of the 2/7 grid.
 * @param {Record<string, any> | null | undefined} mapping
 * @param {number} axisIndex
 * @returns {boolean}
 */
export function isHatGridLayout(mapping, axisIndex) {
  if (!mapping || typeof mapping !== 'object') return false;
  let perAxis = hatGridCache.get(mapping);
  if (!perAxis) {
    perAxis = new Map();
    hatGridCache.set(mapping, perAxis);
  }
  if (perAxis.has(axisIndex)) return perAxis.get(axisIndex);
  const sectors = new Set();
  let count = 0;
  for (const entry of Object.values(mapping)) {
    if (!entry || entry.kind !== 'hat' || entry.index !== axisIndex) continue;
    count += 1;
    const sector = hatSector(entry.value, HAT_GRID_EPSILON);
    if (sector >= 0 && sector % 2 === 0) sectors.add(sector);
  }
  const grid = count === 4 && sectors.size === 4;
  perAxis.set(axisIndex, grid);
  return grid;
}

/**
 * True when a `kind: 'hat'` mapping entry is active for a raw axis value.
 *
 * On a grid layout (see isHatGridLayout; pass the entry's `mapping`, or an
 * entry flagged `grid: true`) a cardinal entry is also active on both
 * neighbouring diagonals, and a raw value off the eight positions is neutral.
 * Otherwise the entry is active when `|raw - value| <= tolerance` (default 0.2).
 * @param {number} raw - the raw axis value at `entry.index`
 * @param {{ index?: number, value: number, tolerance?: number, grid?: boolean }} entry
 * @param {Record<string, any> | null} [mapping=null] - the profile mapping the entry belongs to
 * @returns {boolean}
 */
export function isHatEntryActive(raw, entry, mapping = null) {
  if (!entry || typeof entry.value !== 'number' || !Number.isFinite(entry.value)) return false;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return false;
  const grid = entry.grid === true || isHatGridLayout(mapping, entry.index);
  if (!grid) {
    const tolerance = typeof entry.tolerance === 'number' && entry.tolerance > 0 ? entry.tolerance : 0.2;
    return Math.abs(raw - entry.value) <= tolerance;
  }
  const target = hatSector(entry.value, HAT_GRID_EPSILON);
  const current = hatSector(raw);
  if (target < 0 || current < 0) return false;
  if (target % 2 === 1) return current === target;
  return HAT_SECTOR_DIRECTIONS[current].includes(HAT_SECTOR_DIRECTIONS[target][0]);
}

/**
 * Activation magnitude [0, 1] of one controller-definition mapping entry on a
 * raw gamepad: the button value, the axis value in the entry's direction, or
 * 1 / 0 for a hat entry (see isHatEntryActive).
 * @param {{ buttons?: ArrayLike<{ pressed?: boolean, value?: number }>, axes?: ArrayLike<number> }} gamepad
 * @param {{ kind: 'button' | 'axis' | 'hat', index: number, direction?: 'negative' | 'positive', value?: number, tolerance?: number } | null} entry
 * @param {Record<string, any> | null} [mapping=null] - the profile mapping, for hat entries
 * @returns {number}
 */
export function readMappingEntryMagnitude(gamepad, entry, mapping = null) {
  if (!entry || typeof entry !== 'object' || !Number.isInteger(entry.index)) return 0;
  if (entry.kind === 'hat') {
    return isHatEntryActive(gamepad?.axes?.[entry.index], entry, mapping) ? 1 : 0;
  }
  if (entry.kind === 'button') {
    const btn = gamepad?.buttons?.[entry.index];
    if (!btn) return 0;
    const value = typeof btn.value === 'number' ? btn.value : (btn.pressed ? 1 : 0);
    return Math.max(0, value);
  }
  if (entry.kind === 'axis') {
    const raw = gamepad?.axes?.[entry.index] ?? 0;
    return entry.direction === 'negative' ? Math.max(0, -raw) : Math.max(0, raw);
  }
  return 0;
}

function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/**
 * Build the override map from persisted data, applying the same
 * normalisation as setProfileOverride(); invalid entries are dropped.
 * @param {unknown} stored
 * @returns {Map<string, { type: 'profile', key: string } | { type: 'family', family: string }>}
 */
function loadProfileOverrides(stored) {
  const overrides = new Map();
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return overrides;
  for (const [identityKey, override] of Object.entries(stored)) {
    if (!identityKey.trim()) continue;
    const normalised = normaliseGamepadProfileOverride(override);
    if (normalised) overrides.set(identityKey, normalised);
  }
  return overrides;
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
    /** @type {Map<number, Set<string>>} captured codes per gamepad, silent until released */
    this._latched = new Map();
    /** @type {Map<number, Set<string>>} codes that fired 'pressed' and not yet 'released', per gamepad */
    this._pressedCodes = new Map();
    /** @type {Map<number, Set<number>>} axes whose last analog event was non-zero, per gamepad */
    this._analogActive = new Map();
    /** @type {Map<number, any>} */
    this._resolvedProfileByGamepadIndex = new Map();
    /** @type {Map<string, { type: 'profile', key: string } | { type: 'family', family: string }>} */
    this._profileOverrides = loadProfileOverrides(options.profileOverrides);
    /** @type {Map<string, any>} */
    this._profileDefinitionOverrides = new Map();
    /** @type {WeakMap<object, CompiledControllerMapping>} compiled mapping per definition object */
    this._compiledProfileCache = new WeakMap();

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
   *
   * Suppressing fires 'released' (and a final analog 0) for every input that
   * is active, so no action stays pressed while the modal is open. Inputs
   * still held when gameplay resumes stay silent until released and pressed
   * anew.
   * @param {boolean} suppressed
   */
  setGameplaySuppressed(suppressed) {
    suppressed = !!suppressed;
    if (suppressed === this._gameplaySuppressed) return;
    this._gameplaySuppressed = suppressed;
    for (const gamepadIndex of [...this._curState.keys()]) {
      if (suppressed) this._releaseActiveInputs(gamepadIndex);
      this._latchActiveInputs(gamepadIndex);
    }
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
   * @param {number | null} [gamepadIndex=null] - only consider this gamepad (null = any)
   * @returns {boolean}
   */
  isPressed(code, gamepadIndex = null) {
    if (!code || !isGamepadCode(code)) return false;
    if (code.startsWith('GP_B')) {
      const idx = parseInt(code.slice(4), 10);
      for (const [index, state] of this._curState) {
        if (gamepadIndex !== null && index !== gamepadIndex) continue;
        if (state.buttons[idx] === true) return true;
      }
    } else {
      const match = code.match(/^GP_A(\d)(N|P)$/);
      if (!match) return false;
      const axisIdx = parseInt(match[1], 10);
      const neg     = match[2] === 'N';
      for (const [index, state] of this._curState) {
        if (gamepadIndex !== null && index !== gamepadIndex) continue;
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
   * Get the resolved family key ('xbox', 'xbox360', 'dualshock4', 'dualsense',
   * 'switch-pro', 'steam', 'stadia' or 'generic') for a gamepad.
   * @param {number} [gamepadIndex=0]
   * @returns {string}
   */
  getActiveProfile(gamepadIndex = 0) {
    return this.getResolvedProfile(gamepadIndex).family;
  }

  /**
   * Get the resolved profile state for a connected gamepad.
   * @param {number} [gamepadIndex=0]
   * @returns {import('./gamepad-profile-resolver.js').ResolvedGamepadProfile}
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
   * @param {number | null} [gamepadIndex=null] - null = the first connected gamepad
   * @returns {string}
   */
  getLabelForCode(code, gamepadIndex = null) {
    const index = gamepadIndex ?? this._firstConnectedGamepadIndex();
    if (index == null) return getResolvedGamepadLabel(code, resolveGamepadProfile(null));
    return getResolvedGamepadLabel(code, this.getResolvedProfile(index));
  }

  /**
   * @returns {number | null} index of the first connected gamepad, or null
   * @private
   */
  _firstConnectedGamepadIndex() {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
    const first = [...navigator.getGamepads()].find((g) => g && g.connected !== false);
    return first ? first.index : null;
  }

  /**
   * Get available profile override options for the connected gamepad.
   * @param {number} [gamepadIndex=0]
   * @returns {{ exactProfiles: Array<{ type: string, key: string, label: string, family: string }>, families: Array<{ type: string, family: string, label: string }>, autoResolved: any }}
   */
  getAvailableProfileOptions(gamepadIndex = 0) {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return getAvailableGamepadProfileOptions(null);
    const gp = [...navigator.getGamepads()].find(g => g && g.index === gamepadIndex);
    return getAvailableGamepadProfileOptions(gp ?? null);
  }

  /**
   * @param {number} [gamepadIndex=0]
   * @returns {{ type: 'profile', key: string } | { type: 'family', family: string } | null}
   */
  getProfileOverride(gamepadIndex = 0) {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
    const gp = [...navigator.getGamepads()].find(g => g && g.index === gamepadIndex);
    return this._getOverrideForGamepadId(gp?.id ?? null);
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

    for (const legacyKey of getGamepadIdentityKeys(gp.id).slice(1)) this._profileOverrides.delete(legacyKey);
    this._profileOverrides.set(identityKey, normalised);
    this._resolvedProfileByGamepadIndex.delete(gp.index);
    this._emitProfileChange(gp);
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

    let deleted = false;
    for (const key of getGamepadIdentityKeys(gp.id)) deleted = this._profileOverrides.delete(key) || deleted;
    this._resolvedProfileByGamepadIndex.delete(gp.index);
    this._emitProfileChange(gp);
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
    this._emitProfileChange(gp);
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
    // Resolve through the override- and edit-aware path, so in-memory mapping
    // edits keep applying after a reconnect.
    this._resolvedProfileByGamepadIndex.delete(e.gamepad.index);
    this._getResolvedProfileForGamepad(e.gamepad);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bm-gamepad-connected', { detail: e.gamepad }));
    }
  }

  _handleDisconnect(e) {
    this._releaseActiveInputs(e.gamepad.index);
    this._curState.delete(e.gamepad.index);
    this._latched.delete(e.gamepad.index);
    this._pressedCodes.delete(e.gamepad.index);
    this._analogActive.delete(e.gamepad.index);
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
    const hasPrev = this._curState.has(gamepad.index);
    const prev = this._curState.get(gamepad.index) ?? {
      buttons: new Array(GP_BUTTON_COUNT).fill(false),
      axes:    new Array(GP_AXIS_COUNT).fill(0),
    };

    // Snapshot current state as canonical logical GP buttons/axes.
    const cur = this._snapshotLogicalState(gamepad);

    this._curState.set(gamepad.index, cur);

    // ── Capture mode ─────────────────────────────────────────────────────────
    if (this._captureCallback) {
      // Without a previous frame there is no edge to detect: anything active now
      // was already held when capture started, so this frame is only a baseline.
      if (!hasPrev) return;
      const detected = this._detectCapture(gamepad, prev, cur);
      if (detected != null) {
        const cb = this._captureCallback;
        this._captureCallback = null;
        this._triggerHaptic(gamepad);
        // The captured input is still held: keep it silent (no gameplay events,
        // no re-capture) until it is released.
        if (!this._latched.has(gamepad.index)) this._latched.set(gamepad.index, new Set());
        this._latched.get(gamepad.index).add(detected);
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
      if (this._isLatched(gamepad.index, code, isNowPressed)) continue;
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

      // Continuous analog event (above deadband, direction-agnostic), and one
      // final 0 when the axis comes back into the deadband.
      if (Math.abs(curVal) > this._deadband) {
        this._dispatchAnalog(gamepad.index, a, curVal);
      } else if (this._analogActive.get(gamepad.index)?.has(a)) {
        this._dispatchAnalog(gamepad.index, a, 0);
      }

      // Negative direction (e.g. stick left or stick up)
      const codeN  = `GP_A${a}N`;
      const prevN  = prevVal < -thr;
      const curN   = curVal  < -thr;
      if (this._isLatched(gamepad.index, codeN, curN)) {
        // latched: no digital events for this direction until released
      } else if (!prevN && curN)  this._dispatch(gamepad.index, codeN, 'pressed',  Math.abs(curVal));
      else if ( prevN && curN)  this._dispatch(gamepad.index, codeN, 'held',     Math.abs(curVal));
      else if ( prevN && !curN) this._dispatch(gamepad.index, codeN, 'released', 0);

      // Positive direction (e.g. stick right or stick down)
      const codeP  = `GP_A${a}P`;
      const prevP  = prevVal > thr;
      const curP   = curVal  > thr;
      if (this._isLatched(gamepad.index, codeP, curP)) {
        // latched: no digital events for this direction until released
      } else if (!prevP && curP)  this._dispatch(gamepad.index, codeP, 'pressed',  curVal);
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
      const code = `GP_B${i}`;
      if (this._isLatched(gamepad.index, code, cur.buttons[i])) continue;
      if (!prev.buttons[i] && cur.buttons[i]) return code;
    }
    const axisLen = Math.min(cur.axes.length, GP_AXIS_COUNT);
    for (let a = 0; a < axisLen; a++) {
      const val = cur.axes[a];
      const latchedN = this._isLatched(gamepad.index, `GP_A${a}N`, val < -this._analogThreshold);
      const latchedP = this._isLatched(gamepad.index, `GP_A${a}P`, val > this._analogThreshold);
      if (Math.abs(val) > this._analogThreshold) {
        const code = val < 0 ? `GP_A${a}N` : `GP_A${a}P`;
        if (val < 0 ? latchedN : latchedP) continue;
        // Only trigger if it crossed the threshold this frame
        if (Math.abs(prev.axes[a] ?? 0) <= this._analogThreshold) {
          return code;
        }
      }
    }
    return null;
  }

  /**
   * Codes active in a logical state snapshot (buttons down, axis directions
   * past the analog threshold).
   * @param {{ buttons: boolean[], axes: number[] }} state
   * @returns {string[]}
   * @private
   */
  _activeCodes(state) {
    const codes = [];
    const btnLen = Math.min(state.buttons.length, GP_BUTTON_COUNT);
    for (let i = 0; i < btnLen; i++) {
      if (state.buttons[i]) codes.push(`GP_B${i}`);
    }
    const axisLen = Math.min(state.axes.length, GP_AXIS_COUNT);
    for (let a = 0; a < axisLen; a++) {
      const val = state.axes[a] ?? 0;
      if (val < -this._analogThreshold) codes.push(`GP_A${a}N`);
      if (val > this._analogThreshold) codes.push(`GP_A${a}P`);
    }
    return codes;
  }

  /**
   * Fire 'released' for every code of this gamepad that fired 'pressed', and a
   * final analog 0 for every axis whose last analog event was non-zero.
   * @private
   */
  _releaseActiveInputs(gamepadIndex) {
    const pressed = this._pressedCodes.get(gamepadIndex);
    if (pressed) {
      for (const code of [...pressed]) this._dispatch(gamepadIndex, code, 'released', 0);
    }
    const analog = this._analogActive.get(gamepadIndex);
    if (analog) {
      for (const axisIndex of [...analog]) this._dispatchAnalog(gamepadIndex, axisIndex, 0);
    }
  }

  /**
   * Latch every input active on this gamepad, so it fires nothing until it
   * has been released.
   * @private
   */
  _latchActiveInputs(gamepadIndex) {
    const state = this._curState.get(gamepadIndex);
    if (!state) return;
    const codes = this._activeCodes(state);
    if (codes.length === 0) return;
    if (!this._latched.has(gamepadIndex)) this._latched.set(gamepadIndex, new Set());
    const latched = this._latched.get(gamepadIndex);
    for (const code of codes) latched.add(code);
  }

  /**
   * True while `code` is latched (captured and not yet released) on this
   * gamepad; un-latches it once it is seen inactive.
   * @private
   */
  _isLatched(gamepadIndex, code, active) {
    const latched = this._latched.get(gamepadIndex);
    if (!latched || !latched.has(code)) return false;
    if (!active) latched.delete(code);
    return true;
  }

  /**
   * Build a canonical logical state (GP_B0..GP_B23 + GP_A0..GP_A3) from raw
   * physical gamepad hardware state, using a vendor/product mapping when known.
   * The resolver only hands out an exact definition when it applies to this
   * pad (non-standard mapping, matching button/axis counts), or a definition
   * the user edited in memory.
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
    const resolved = this._resolveForGamepad(gamepad);
    this._resolvedProfileByGamepadIndex.set(gamepad.index, resolved);
    return resolved;
  }

  /**
   * Resolve a gamepad with its manual override and any in-memory edited
   * definition layered on top (uncached).
   * @param {Gamepad} gamepad
   * @returns {any}
   * @private
   */
  _resolveForGamepad(gamepad) {
    const resolved = resolveGamepadProfile(gamepad, {
      override: this._getOverrideForGamepadId(gamepad.id),
    });
    const identityKey = getGamepadIdentityKey(gamepad.id);
    const editedDefinition = identityKey ? this._profileDefinitionOverrides.get(identityKey) : null;
    if (!editedDefinition) return resolved;
    return {
      ...resolved,
      source: 'memory-edit',
      definition: deepClone(editedDefinition),
      profileKey: editedDefinition.key ?? resolved.profileKey ?? null,
      profileHint: editedDefinition.profileHint ?? resolved.profileHint,
      family: editedDefinition.family ?? resolved.family,
      displayName: editedDefinition.sourceName || resolved.displayName,
    };
  }

  _getOverrideForGamepadId(gamepadId) {
    for (const key of getGamepadIdentityKeys(gamepadId)) {
      const override = this._profileOverrides.get(key);
      if (override) return override;
    }
    return null;
  }

  _emitProfileChange(gamepad) {
    const gamepadIndex = gamepad.index;
    const gamepadId = gamepad.id;
    const payload = Object.fromEntries(this._profileOverrides);
    this._onProfileOverridesChange?.(payload);
    if (typeof window !== 'undefined') {
      const resolvedProfile = this._resolveForGamepad(gamepad);
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
    const { vendorId, productId } = parseGamepadId(gamepad?.id ?? null);

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
   * Runs every polled frame, so the result is cached on the definition object
   * itself (no per-frame serialisation). Definitions are never mutated in
   * place: edits produce a new cloned definition and so a fresh compile.
   * @param {any | null} profile
   * @returns {CompiledControllerMapping | null}
   * @private
   */
  _compileControllerMapping(profile) {
    if (!profile || typeof profile !== 'object' || !profile.mapping) return null;
    const cached = this._compiledProfileCache.get(profile);
    if (cached) return cached;

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

    // Grid decoding (diagonals, neutral band) only for the generator's hat layout.
    for (const entry of [...compiled.buttons, ...compiled.axesNeg, ...compiled.axesPos]) {
      if (entry?.kind === 'hat') entry.grid = isHatGridLayout(profile.mapping, entry.index);
    }

    this._compiledProfileCache.set(profile, compiled);
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
    return readMappingEntryMagnitude(gamepad, entry);
  }

  /**
   * @param {Gamepad} gamepad
   * @param {CompiledInputMappingEntry} entry
   * @returns {boolean}
   * @private
   */
  _isHatDirectionActive(gamepad, entry) {
    return isHatEntryActive(gamepad.axes?.[entry.index], entry);
  }

  /**
   * Resolve the code to bound actions and fire digital events.
   * Respects action.playerIndex (null = any controller).
   * @private
   */
  _dispatch(gamepadIndex, code, type, value) {
    if (type === 'pressed') {
      if (!this._pressedCodes.has(gamepadIndex)) this._pressedCodes.set(gamepadIndex, new Set());
      this._pressedCodes.get(gamepadIndex).add(code);
    } else if (type === 'released') {
      this._pressedCodes.get(gamepadIndex)?.delete(code);
    }
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
   * Only fires if action.analog is true. Tracks which axes are non-zero so a
   * final 0 can be sent when they return into the deadband.
   * @private
   */
  _dispatchAnalog(gamepadIndex, axisIndex, value) {
    if (value !== 0) {
      if (!this._analogActive.has(gamepadIndex)) this._analogActive.set(gamepadIndex, new Set());
      this._analogActive.get(gamepadIndex).add(axisIndex);
    } else {
      this._analogActive.get(gamepadIndex)?.delete(axisIndex);
    }
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
 * @property {boolean} [grid] - hat entry of a grid layout (see isHatGridLayout)
 */

/**
 * @typedef {object} CompiledControllerMapping
 * @property {(CompiledInputMappingEntry | null)[]} buttons
 * @property {(CompiledInputMappingEntry | null)[]} axesNeg
 * @property {(CompiledInputMappingEntry | null)[]} axesPos
 */
