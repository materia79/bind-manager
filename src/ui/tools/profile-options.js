/** Profile override values for the profile select, and the profile header texts. */

export function serialiseProfileOverrideValue(override) {
  if (!override || typeof override !== 'object') return '__auto__';
  if (override.type === 'profile') return `profile:${override.key}`;
  if (override.type === 'family') return `family:${override.family}`;
  return '__auto__';
}

export function parseProfileOverrideValue(value) {
  if (typeof value !== 'string') return null;
  if (value.startsWith('profile:')) return { type: 'profile', key: value.slice('profile:'.length) };
  if (value.startsWith('family:')) return { type: 'family', family: value.slice('family:'.length) };
  return null;
}

const SOURCE_CHIPS = { exact: 'Exact', family: 'Family', generic: 'Generic', manual: 'Manual', 'memory-edit': 'Edited' };
const SOURCE_SUMMARIES = { manual: 'Manual override', exact: 'Exact match', family: 'Family fallback', generic: 'Generic fallback', 'memory-edit': 'Edited in memory' };

/** Short chip text for a resolved profile source. */
export function profileSourceChip(source) {
  return SOURCE_CHIPS[source] ?? (source ? String(source) : '—');
}

/** "Profile: Family fallback (dualsense)" */
export function formatProfileSummary(resolved) {
  const sourceLabel = SOURCE_SUMMARIES[resolved?.source] ?? resolved?.source;
  const profileName = resolved?.definition?.sourceName ?? resolved?.family;
  return `Profile: ${sourceLabel} (${profileName})`;
}

/** Cheap identity of a resolved profile; changes when labels or layout may change. */
export function profileSignature(resolved) {
  if (!resolved) return '';
  return `${resolved.source}|${resolved.family}|${resolved.labelVariant ?? ''}|${resolved.profileKey ?? ''}|${serialiseProfileOverrideValue(resolved.override)}`;
}

/**
 * Readable controller name from a Gamepad.id: drops Chromium's
 * "(STANDARD GAMEPAD Vendor: ...)" suffix and Firefox's "054c-0ce6-" prefix.
 */
export function controllerDisplayName(id) {
  if (!id || typeof id !== 'string') return 'Unknown controller';
  const name = id
    .replace(/^[0-9a-f]{1,4}-[0-9a-f]{1,4}-/i, '')
    .replace(/\s*\([^()]*\)\s*$/, '')
    .trim();
  return name || id.trim();
}
