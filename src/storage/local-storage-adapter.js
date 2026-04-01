const STORAGE_VERSION = 1;
const PROFILE_OVERRIDE_STORAGE_VERSION = 1;

/**
 * Default persistence adapter backed by window.localStorage.
 * Implements the storage adapter contract:
 *   load()  → plain bindings object or null
 *   save(bindings) → void
 *   clear() → void
 */
export class LocalStorageAdapter {
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
      // Quota exceeded or storage unavailable (private browsing, etc.)
    }
  }

  /** Remove all saved bindings for this namespace. */
  clear() {
    try {
      window.localStorage.removeItem(this._key);
      window.localStorage.removeItem(this._profileOverrideKey);
    } catch {
      // Storage unavailable
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
      if (!parsed || parsed.version !== PROFILE_OVERRIDE_STORAGE_VERSION || typeof parsed.overrides !== 'object') {
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
      // Storage unavailable
    }
  }
}
