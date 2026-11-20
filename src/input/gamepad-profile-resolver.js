import {
  findControllerProfileByGamepadId,
  getControllerProfile,
  getControllerProfiles,
} from './controller_definitions/index.js';
import {
  detectGamepadProfile,
  GAMEPAD_FAMILIES,
  GAMEPAD_PROFILES,
  getGamepadFamilyName,
  getGamepadLabel,
  getGamepadLabelVariant,
  parseGamepadId,
} from './gamepad-profiles.js';

function normaliseFamily(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

/**
 * Stable key for a controller model: `vendor-product` when the id carries
 * vendor/product numbers (Chrome or Firefox form), else `id:<lowercase id>`.
 * @param {string | null | undefined} gamepadId
 * @returns {string | null}
 */
export function getGamepadIdentityKey(gamepadId) {
  return getGamepadIdentityKeys(gamepadId)[0] ?? null;
}

/**
 * All identity keys a stored override may use for this id, preferred first.
 * Before Chrome-form ids were parsed, their key was `id:<lowercase id>`; that
 * legacy key is kept as a fallback so persisted overrides still apply.
 * @param {string | null | undefined} gamepadId
 * @returns {string[]}
 */
export function getGamepadIdentityKeys(gamepadId) {
  if (typeof gamepadId !== 'string') return [];
  const trimmed = gamepadId.trim();
  if (!trimmed) return [];
  const legacy = `id:${trimmed.toLowerCase()}`;
  const { key } = parseGamepadId(trimmed);
  return key ? [key, legacy] : [legacy];
}

export function normaliseGamepadProfileOverride(override) {
  if (!override || typeof override !== 'object') return null;

  if (override.type === 'profile' && typeof override.key === 'string' && override.key.trim()) {
    return {
      type: 'profile',
      key: override.key.trim().toLowerCase(),
    };
  }

  if (override.type === 'family') {
    const family = normaliseFamily(override.family);
    if (!family) return null;
    return {
      type: 'family',
      family,
    };
  }

  return null;
}

export function getControllerFamily(profile, gamepadId = null) {
  return (
    normaliseFamily(profile?.family)
    ?? normaliseFamily(profile?.profileHint)
    ?? detectGamepadProfile(gamepadId)
    ?? 'generic'
  );
}

/**
 * True when an exact profile may be applied to a connected pad: the browser
 * did not remap it (`mapping !== 'standard'`) and the raw button/axis counts
 * equal the profile's captured `sourceButtons` / `sourceAxes`. A pad whose
 * layout is unknown (only an id string is available) never qualifies.
 * @param {any} profile - generated controller definition
 * @param {{ mapping?: string, buttons?: ArrayLike<unknown>, axes?: ArrayLike<unknown> } | null | undefined} gamepad
 * @returns {boolean}
 */
export function isControllerProfileApplicable(profile, gamepad) {
  if (!profile || typeof profile !== 'object') return false;
  if (!gamepad || typeof gamepad !== 'object') return false;
  if (gamepad.mapping === 'standard') return false;
  if (!Number.isInteger(profile.sourceButtons) || !Number.isInteger(profile.sourceAxes)) return false;
  return gamepad.buttons?.length === profile.sourceButtons
    && gamepad.axes?.length === profile.sourceAxes;
}

/**
 * Accept a Gamepad (or gamepad-like object) or a bare id string.
 * @returns {{ gamepadId: string | null, gamepad: any | null }}
 */
function toGamepadInput(gamepadOrId, options = {}) {
  if (gamepadOrId && typeof gamepadOrId === 'object') {
    return {
      gamepadId: typeof gamepadOrId.id === 'string' ? gamepadOrId.id : null,
      gamepad: gamepadOrId,
    };
  }
  return {
    gamepadId: typeof gamepadOrId === 'string' ? gamepadOrId : null,
    gamepad: options.gamepad && typeof options.gamepad === 'object' ? options.gamepad : null,
  };
}

/**
 * Resolve how a controller is interpreted, in this order: manual exact
 * profile, manual family, exact profile, detected family, generic.
 *
 * Exact profiles (manual or automatic) apply only when
 * isControllerProfileApplicable() holds for the pad. A manual exact override
 * that does not apply resolves as if absent and is reported in
 * `ignoredOverride` (it is not deleted).
 *
 * @param {Gamepad | { id: string, mapping?: string, buttons?: ArrayLike<unknown>, axes?: ArrayLike<unknown> } | string | null} gamepadOrId
 *   Pass the Gamepad itself (or `options.gamepad`) so exact profiles can be
 *   checked; with a bare id string exact profiles never apply.
 * @param {{ override?: any, gamepad?: any }} [options]
 * @returns {ResolvedGamepadProfile}
 */
export function resolveGamepadProfile(gamepadOrId, options = {}) {
  const { gamepadId, gamepad } = toGamepadInput(gamepadOrId, options);
  const { vendorId, productId } = parseGamepadId(gamepadId);
  const resolved = resolveBase(gamepadId, gamepad, normaliseGamepadProfileOverride(options.override ?? null));
  return {
    ...resolved,
    displayName: resolved.definition?.sourceName || getGamepadFamilyName(resolved.family),
    vendorId,
    productId,
    labelVariant: getGamepadLabelVariant(resolved.family, vendorId, productId),
  };
}

function resolveBase(gamepadId, gamepad, override) {
  let ignoredOverride = null;

  if (override?.type === 'profile') {
    const definition = getControllerProfile(override.key);
    if (definition && isControllerProfileApplicable(definition, gamepad)) {
      const family = getControllerFamily(definition, gamepadId);
      return {
        source: 'manual',
        family,
        profileHint: definition.profileHint ?? family,
        profileKey: definition.key ?? null,
        definition,
        override,
        ignoredOverride,
        gamepadId,
      };
    }
    ignoredOverride = override;
  }

  if (override?.type === 'family') {
    return {
      source: 'manual',
      family: override.family,
      profileHint: override.family,
      profileKey: null,
      definition: null,
      override,
      ignoredOverride,
      gamepadId,
    };
  }

  if (gamepadId && gamepadId.trim()) {
    const definition = findControllerProfileByGamepadId(gamepadId);
    if (definition && isControllerProfileApplicable(definition, gamepad)) {
      const family = getControllerFamily(definition, gamepadId);
      return {
        source: 'exact',
        family,
        profileHint: definition.profileHint ?? family,
        profileKey: definition.key ?? null,
        definition,
        override: null,
        ignoredOverride,
        gamepadId,
      };
    }

    const family = detectGamepadProfile(gamepadId);
    if (family !== 'generic') {
      return {
        source: 'family',
        family,
        profileHint: family,
        profileKey: null,
        definition: null,
        override: null,
        ignoredOverride,
        gamepadId,
      };
    }
  }

  return {
    source: 'generic',
    family: 'generic',
    profileHint: 'generic',
    profileKey: null,
    definition: null,
    override: null,
    ignoredOverride,
    gamepadId,
  };
}

/**
 * Profile override options for a connected pad. Exact profiles are offered
 * only when isControllerProfileApplicable() holds for the pad, so pass the
 * Gamepad itself; with a bare id string no exact profile is offered.
 * @param {Gamepad | string | null} gamepadOrId
 */
export function getAvailableGamepadProfileOptions(gamepadOrId) {
  const { gamepadId, gamepad } = toGamepadInput(gamepadOrId);
  const allProfiles = Object.values(getControllerProfiles());
  const autoResolved = resolveGamepadProfile(gamepad ?? gamepadId);
  const exactProfiles = allProfiles
    .filter((profile) => isControllerProfileApplicable(profile, gamepad))
    .map((profile) => ({
      type: 'profile',
      key: profile.key,
      label: profile.sourceName ?? profile.key,
      family: getControllerFamily(profile, gamepadId),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const familySet = new Set(GAMEPAD_FAMILIES);
  for (const profile of allProfiles) {
    const family = getControllerFamily(profile, gamepadId);
    if (family) familySet.add(family);
  }

  const families = [...familySet]
    .filter((family) => family !== 'generic')
    .map((family) => ({
      type: 'family',
      family,
      label: getGamepadFamilyName(family),
    }));

  return {
    exactProfiles,
    families,
    autoResolved,
  };
}

export function getResolvedGamepadLabel(code, resolvedProfile) {
  if (!code) return '—';

  const exactLabel = resolvedProfile?.definition?.labels?.[code];
  if (typeof exactLabel === 'string' && exactLabel.trim()) {
    return exactLabel;
  }

  const family = normaliseFamily(resolvedProfile?.family) ?? 'generic';
  const fallbackFamily = GAMEPAD_PROFILES[family] ? family : 'generic';
  return getGamepadLabel(code, fallbackFamily, resolvedProfile?.labelVariant ?? null);
}

/**
 * @typedef {object} ResolvedGamepadProfile
 * @property {'manual' | 'exact' | 'family' | 'generic' | 'memory-edit'} source
 * @property {string} family            - label family key, e.g. 'dualsense'
 * @property {string} profileHint
 * @property {string | null} profileKey - exact profile key when one applies
 * @property {any | null} definition    - exact profile definition when one applies
 * @property {any | null} override      - the manual override in effect
 * @property {any | null} ignoredOverride - stored manual exact override that does not apply to this pad
 * @property {string | null} gamepadId
 * @property {string} displayName       - profile sourceName, else family name ('DualSense', 'Xbox', …)
 * @property {string | null} vendorId
 * @property {string | null} productId
 * @property {string | null} labelVariant - e.g. 'xbox-elite'
 */
