const STORAGE_VERSION = 1;
const PROFILE_OVERRIDE_STORAGE_VERSION = 1;
const COLLAPSED_GROUPS_STORAGE_VERSION = 2;

/**
 * Default persistence adapter backed by window.localStorage.
 * Implements the storage adapter contract:
 *   load()  → plain bindings object or null
 *   save(bindings) → boolean (false when the data could not be stored)
 *   clear() → void
 * and the optional extras: gamepad profile overrides and the folded groups of
 * the bindings list, each in its own key.
 */
export class LocalStorageAdapter {
  /** @param {string} namespace - used as part of the storage key */
  constructor(namespace) {
    this._key = `bind-manager:${namespace}`;
    this._profileOverrideKey = `bind-manager:${namespace}:gamepad-profile-overrides`;
    this._collapsedGroupsKey = `bind-manager:${namespace}:collapsed-groups`;
    /** @type {unknown} error of the last failed save(), null after a successful one */
    this.lastSaveError = null;
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
   * Never throws, so games never crash on save: a storage error (quota
   * exceeded, storage unavailable) returns false and is kept in lastSaveError.
   * @param {Record<string, (string|null)[]>} bindings
   * @returns {boolean} true when stored
   */
  save(bindings) {
    try {
      window.localStorage.setItem(
        this._key,
        JSON.stringify({ version: STORAGE_VERSION, bindings })
      );
      this.lastSaveError = null;
      return true;
    } catch (err) {
      // Quota exceeded or storage unavailable (private browsing, etc.)
      this.lastSaveError = err;
      return false;
    }
  }

  /** Remove all saved bindings for this namespace. */
  clear() {
    try {
      window.localStorage.removeItem(this._key);
      window.localStorage.removeItem(this._profileOverrideKey);
      window.localStorage.removeItem(this._collapsedGroupsKey);
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

  /**
   * Load the player's fold choices of the bindings list, oldest first, as
   * `[groupName, folded]` pairs (true folded, false opened by the player).
   * Reads `{ version: 2, groups: [[name, folded], ...] }`, and the object form
   * `{ version: 1, groups: { name: folded } }` in its stored order; anything
   * else reads as none, and malformed entries are dropped. Never throws.
   * @returns {[string, boolean][]}
   */
  loadCollapsedGroups() {
    try {
      const raw = window.localStorage.getItem(this._collapsedGroupsKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const groups = parsed?.groups;
      let entries = [];
      if (parsed?.version === COLLAPSED_GROUPS_STORAGE_VERSION && Array.isArray(groups)) entries = groups;
      else if (parsed?.version === 1 && groups && typeof groups === 'object' && !Array.isArray(groups)) entries = Object.entries(groups);
      return entries.filter((entry) => Array.isArray(entry) && entry.length === 2
        && typeof entry[0] === 'string' && typeof entry[1] === 'boolean')
        .map(([name, folded]) => [name, folded]);
    } catch {
      return [];
    }
  }

  /**
   * Persist the player's fold choices as `{ version: 2, groups: [[name, folded], ...] }`,
   * oldest first (an array keeps the order; object keys like "7" would not). Never throws.
   * @param {[string, boolean][]} groups
   * @returns {boolean} true when stored
   */
  saveCollapsedGroups(groups) {
    try {
      window.localStorage.setItem(
        this._collapsedGroupsKey,
        JSON.stringify({ version: COLLAPSED_GROUPS_STORAGE_VERSION, groups })
      );
      return true;
    } catch {
      return false;
    }
  }
}
