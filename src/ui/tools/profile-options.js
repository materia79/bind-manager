/** Profile override values for the profile select, and label abbreviation. */

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

export function abbreviateTesterLabel(label) {
  if (!label) return '—';
  if (label.length <= 8) return label;
  const initials = label.split(/\s+/).map((part) => part[0]).join('');
  return initials.length >= 2 ? initials.toUpperCase() : label.slice(0, 8);
}
