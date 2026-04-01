/**
 * Bind Manager — public package entry point
 *
 * Usage:
 *   import { createBindManager } from 'bind-manager';
 *   import { getKeyLabel, isKnownCode } from 'bind-manager/key-names';
 */
export { createBindManager } from './core/bind-manager.js';
export { getKeyLabel, isKnownCode, KEY_DISPLAY_NAMES } from './input/key-names.js';
export {
	GP_CODES,
	GP_B0, GP_B1, GP_B2, GP_B3, GP_B4, GP_B5, GP_B6, GP_B7,
	GP_B8, GP_B9, GP_B10, GP_B11, GP_B12, GP_B13, GP_B14, GP_B15, GP_B16,
	GP_A0N, GP_A0P, GP_A1N, GP_A1P, GP_A2N, GP_A2P, GP_A3N, GP_A3P,
	isGamepadCode,
	getGamepadCodeType,
} from './input/gamepad-codes.js';
export {
	GAMEPAD_PROFILES,
	detectGamepadProfile,
	getGamepadLabel,
} from './input/gamepad-profiles.js';
export {
	getControllerFamily,
	getResolvedGamepadLabel,
	resolveGamepadProfile,
} from './input/gamepad-profile-resolver.js';
