/**
 * Texts the bindings modal and the built-in tools show for a connected pad:
 * the device's own name and the profile chip. One place, so both read alike.
 */
import { parseGamepadId, getGamepadFamilyName } from '../input/gamepad-profiles.js';

/**
 * The device's own name from a Gamepad.id: without the browser's mapping tag
 * and without vendor/product numbers ("Xbox Wireless Controller"). The raw id
 * belongs in the element's title.
 * @param {string | null | undefined} gamepadId
 * @returns {string}
 */
export function gamepadDeviceName(gamepadId) {
  const { name } = parseGamepadId(gamepadId);
  if (name) return name;
  return typeof gamepadId === 'string' && gamepadId.trim() ? gamepadId.trim() : 'Unknown controller';
}

/**
 * Chip for a resolved profile: the source, with the family for sources that
 * have one ("Family · Xbox", "Exact · DualSense", "Manual · Stadia",
 * "Generic", "Edited"); the title is the family's display name.
 * @param {{ source?: string, family?: string } | null | undefined} resolved
 * @returns {{ text: string, title: string, source: string }}
 */
export function profileChip(resolved) {
  const source = typeof resolved?.source === 'string' ? resolved.source : 'none';
  const family = getGamepadFamilyName(resolved?.family);
  const text = {
    exact: `Exact · ${family}`,
    family: `Family · ${family}`,
    manual: `Manual · ${family}`,
    generic: 'Generic',
    'memory-edit': 'Edited',
  }[source] ?? '—';
  return { text, title: source === 'none' ? 'No controller' : family, source };
}

/** Note shown next to the profile select when a saved exact profile does not apply to the pad. */
export const IGNORED_OVERRIDE_NOTE = "saved profile does not fit this controller's layout";
