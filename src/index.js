/**
 * Bind Manager — public package entry point
 *
 * Usage:
 *   import { createBindManager } from 'bind-manager';
 *   import { getKeyLabel, isKnownCode } from 'bind-manager/key-names';
 */
export { createBindManager } from './core/bind-manager.js';
export { getKeyLabel, isKnownCode, KEY_DISPLAY_NAMES } from './input/key-names.js';
