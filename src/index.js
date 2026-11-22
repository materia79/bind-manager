/**
 * Bind Manager — public package entry point
 *
 * Usage:
 *   import { createBindManager, getKeyLabel, isKnownCode } from 'bind-manager';
 *
 * Everything public is exported from this one entry ("exports": { ".": … } in
 * package.json); there are no sub-path imports.
 */
export { createBindManager } from './core/bind-manager.js';
export {
	DEFAULT_BLOCKED_SHORTCUTS,
	DEFAULT_KEYBOARD_LOCK_KEYS,
	FULLSCREEN_ONLY_SHORTCUTS,
	parseShortcutPattern,
	matchesShortcutPattern,
} from './input/browser-shortcut-guard.js';
export { WheelNotchCounter, DEFAULT_WHEEL_PIXEL_THRESHOLD } from './input/wheel-notches.js';
export { getKeyLabel, isKnownCode, KEY_DISPLAY_NAMES, MODIFIER_ORDER, MODIFIER_CODES, buildComboCode, buildChordCode, isModifierChord, normalizeChordCode } from './input/key-names.js';
export { getReservedInfo, isReservedCode } from './input/reserved-codes.js';
export {
	GP_CODES,
	GP_B0, GP_B1, GP_B2, GP_B3, GP_B4, GP_B5, GP_B6, GP_B7,
	GP_B8, GP_B9, GP_B10, GP_B11, GP_B12, GP_B13, GP_B14, GP_B15, GP_B16,
	GP_B17, GP_B18, GP_B19, GP_B20, GP_B21, GP_B22, GP_B23,
	GP_A0N, GP_A0P, GP_A1N, GP_A1P, GP_A2N, GP_A2P, GP_A3N, GP_A3P,
	GP_BUTTON_COUNT,
	GP_AXIS_COUNT,
	isGamepadCode,
	getGamepadCodeType,
} from './input/gamepad-codes.js';
export {
	GAMEPAD_PROFILES,
	GAMEPAD_FAMILIES,
	GAMEPAD_FAMILY_NAMES,
	GAMEPAD_DEVICE_FAMILIES,
	GAMEPAD_LABEL_VARIANTS,
	GAMEPAD_UNVERIFIED_LABELS,
	detectGamepadProfile,
	getGamepadLabel,
	getGamepadFamilyName,
	getGamepadLabelVariant,
	isGamepadLabelUnverified,
	parseGamepadId,
} from './input/gamepad-profiles.js';
export {
	getControllerFamily,
	getResolvedGamepadLabel,
	isControllerProfileApplicable,
	resolveGamepadProfile,
} from './input/gamepad-profile-resolver.js';
export {
	decodeHatValue,
	isHatEntryActive,
	isHatGridLayout,
	readMappingEntryMagnitude,
} from './input/gamepad-runtime.js';
