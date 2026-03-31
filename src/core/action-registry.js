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
   * @param {number} [def.slots]      - Max bindings per action (defaults to 2)
   * @param {string[]} [def.defaultBindings] - KeyboardEvent.code values for each slot
   * @returns {ActionDefinition}
   */
  register(def) {
    if (!def || typeof def.id !== 'string' || def.id.trim() === '') {
      throw new Error('Action registration requires a non-empty string id');
    }
    if (this._actions.has(def.id)) {
      throw new Error(`Action "${def.id}" is already registered`);
    }

    /** @type {ActionDefinition} */
    const action = {
      id: def.id,
      label: typeof def.label === 'string' ? def.label : def.id,
      description: typeof def.description === 'string' ? def.description : '',
      group: typeof def.group === 'string' && def.group.trim() !== '' ? def.group : 'General',
      // Keyboard slots / defaults
      slots: typeof def.slots === 'number' && def.slots >= 1 ? Math.floor(def.slots) : 2,
      defaultBindings: Array.isArray(def.defaultBindings) ? def.defaultBindings.slice() : [],
      // Gamepad slots / defaults
      gamepadSlots: typeof def.gamepadSlots === 'number' && def.gamepadSlots >= 1
        ? Math.floor(def.gamepadSlots) : 1,
      defaultGamepadBindings: Array.isArray(def.defaultGamepadBindings)
        ? def.defaultGamepadBindings.slice() : [],
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
