/** Profile override values for the profile select. */

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
