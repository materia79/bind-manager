import {
  findControllerProfileByGamepadId,
  findControllerProfilesByFamily,
  getControllerProfile,
  getControllerProfiles,
} from './controller_definitions/index.js';
import { detectGamepadProfile, GAMEPAD_PROFILES, getGamepadLabel } from './gamepad-profiles.js';

function normaliseFamily(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

export function getGamepadIdentityKey(gamepadId) {
  if (typeof gamepadId !== 'string') return null;
  const trimmed = gamepadId.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-/);
  if (match) {
    return `${match[1].toLowerCase()}-${match[2].toLowerCase()}`;
  }
  return `id:${trimmed.toLowerCase()}`;
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

export function resolveGamepadProfile(gamepadId, options = {}) {
  const override = normaliseGamepadProfileOverride(options.override ?? null);
  if (override?.type === 'profile') {
    const definition = getControllerProfile(override.key);
    if (definition) {
      const family = getControllerFamily(definition, gamepadId);
      return {
        source: 'manual',
        family,
        profileHint: definition.profileHint ?? family,
        profileKey: definition.key ?? null,
        definition,
        override,
        gamepadId: typeof gamepadId === 'string' ? gamepadId : null,
      };
    }
  }

  if (override?.type === 'family') {
    return {
      source: 'manual',
      family: override.family,
      profileHint: override.family,
      profileKey: null,
      definition: null,
      override,
      gamepadId: typeof gamepadId === 'string' ? gamepadId : null,
    };
  }

  if (typeof gamepadId === 'string' && gamepadId.trim()) {
    const definition = findControllerProfileByGamepadId(gamepadId);
    if (definition) {
      const family = getControllerFamily(definition, gamepadId);
      return {
        source: 'exact',
        family,
        profileHint: definition.profileHint ?? family,
        profileKey: definition.key ?? null,
        definition,
        override: null,
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
    gamepadId: typeof gamepadId === 'string' ? gamepadId : null,
  };
}

export function getAvailableGamepadProfileOptions(gamepadId) {
  const allProfiles = Object.values(getControllerProfiles());
  const autoResolved = resolveGamepadProfile(gamepadId);
  const detectedFamily = autoResolved.family !== 'generic' ? autoResolved.family : null;
  const familyProfiles = detectedFamily
    ? findControllerProfilesByFamily(detectedFamily)
    : [];
  const exactProfiles = (familyProfiles.length > 0 ? familyProfiles : allProfiles)
    .map((profile) => ({
      type: 'profile',
      key: profile.key,
      label: profile.sourceName ?? profile.key,
      family: getControllerFamily(profile, gamepadId),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const familySet = new Set(['generic', ...Object.keys(GAMEPAD_PROFILES)]);
  for (const profile of allProfiles) {
    const family = getControllerFamily(profile, gamepadId);
    if (family) familySet.add(family);
  }

  const families = [...familySet]
    .filter((family) => family !== 'generic')
    .sort((a, b) => a.localeCompare(b))
    .map((family) => ({
      type: 'family',
      family,
      label: family,
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
  return getGamepadLabel(code, fallbackFamily);
}
