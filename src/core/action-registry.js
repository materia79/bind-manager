/**
 * Manages the registry of all declared actions.
 * Actions are immutable once registered; binding state lives in BindingStore.
 */
export class ActionRegistry {
  constructor() {
    /** @type {Map<string, ActionDefinition>} */
    this._actions = new Map();
  }

  /**
   * Register a new action. Throws if the id is already taken.
   * @param {object} def
   * @param {string} def.id           - Unique stable identifier
   * @param {string} [def.label]      - Display name (defaults to id)
   * @param {string} [def.description]
   * @param {string} [def.group]      - Group name, e.g. "Movement" (defaults to "General")
   * @param {number} [def.slots]      - Max bindings per action (defaults to 2); positive integer
   * @param {string[]} [def.defaultBindings] - KeyboardEvent.code values for each slot
   *   (entries beyond `slots` are dropped with a console warning)
   * @param {number} [def.gamepadSlots] - Max gamepad bindings (defaults to 1); positive integer
   * @param {string[]} [def.defaultGamepadBindings] - GP_* codes for each gamepad slot
   * @returns {ActionDefinition}
   * @throws {Error} when the id is missing or taken, or a slot count is not a positive integer
   */
  register(def) {
    if (!def || typeof def.id !== 'string' || def.id.trim() === '') {
      throw new Error('Action registration requires a non-empty string id');
    }
    if (this._actions.has(def.id)) {
      throw new Error(`Action "${def.id}" is already registered`);
    }

    const slots = _slotCount(def.id, 'slots', def.slots, 2);
    const gamepadSlots = _slotCount(def.id, 'gamepadSlots', def.gamepadSlots, 1);

    /** @type {ActionDefinition} */
    const action = {
      id: def.id,
      label: typeof def.label === 'string' ? def.label : def.id,
      description: typeof def.description === 'string' ? def.description : '',
      group: typeof def.group === 'string' && def.group.trim() !== '' ? def.group : 'General',
      // Keyboard slots / defaults
      slots,
      defaultBindings: _defaults(def.id, 'defaultBindings', def.defaultBindings, slots),
      // Gamepad slots / defaults
      gamepadSlots,
      defaultGamepadBindings: _defaults(def.id, 'defaultGamepadBindings', def.defaultGamepadBindings, gamepadSlots),
      // Whether this action accepts continuous analog float events (e.g. move speed from a stick)
      analog: def.analog === true,
      // null = fires for any connected controller; integer = only fires for that gamepad.index
      playerIndex: Number.isInteger(def.playerIndex) ? def.playerIndex : null,
    };

    this._actions.set(action.id, action);
    return action;
  }

  /** @param {string} id @returns {ActionDefinition | null} */
  get(id) {
    return this._actions.get(id) ?? null;
  }

  /** @param {string} id @returns {boolean} */
  has(id) {
    return this._actions.has(id);
  }

  /** @returns {ActionDefinition[]} */
  getAll() {
    return [...this._actions.values()];
  }

  /**
   * Returns actions grouped by their group name, preserving registration order.
   * @returns {Map<string, ActionDefinition[]>}
   */
  getGroups() {
    const groups = new Map();
    for (const action of this._actions.values()) {
      if (!groups.has(action.group)) groups.set(action.group, []);
      groups.get(action.group).push(action);
    }
    return groups;
  }
}

/**
 * Validate a slot count: omitted (undefined/null) uses the fallback, anything
 * else must be a positive integer (NaN, Infinity, 1.5, '2' are rejected).
 * @returns {number}
 */
function _slotCount(actionId, field, value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Action "${actionId}": ${field} must be a positive integer, got ${String(value)}`);
  }
  return value;
}

/**
 * Copy default bindings, dropping (with a warning) entries that have no slot.
 * @returns {string[]}
 */
function _defaults(actionId, field, value, slotCount) {
  if (!Array.isArray(value)) return [];
  if (value.length > slotCount) {
    console.warn(
      `[BindManager] Action "${actionId}": ${field} has ${value.length} entries but only ${slotCount} slot(s); `
      + `ignoring ${JSON.stringify(value.slice(slotCount))}`,
    );
  }
  return value.slice(0, slotCount);
}

/**
 * @typedef {object} ActionDefinition
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {string} group
 * @property {number} slots
 * @property {number} gamepadSlots
 * @property {string[]} defaultGamepadBindings
 * @property {boolean} analog
 * @property {number | null} playerIndex
 * @property {string[]} defaultBindings
 */
